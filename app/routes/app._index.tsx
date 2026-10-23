import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError, useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  InlineGrid,
  Card,
  IndexTable,
  IndexFilters,
  useSetIndexFiltersMode,
  ChoiceList,
  Modal,
  TextField,
  Select,
  Button,
  ButtonGroup,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Thumbnail,
  Divider,
  Box,
  Banner,
  Tooltip,
  ProgressBar,
  Icon,
  Tag,
  useIndexResourceState,
  type FilterInterface,
  type AppliedFilterInterface,
} from "@shopify/polaris";
import {
  SearchIcon,
  RefreshIcon,
  PlusIcon,
  AlertCircleIcon,
  CheckIcon,
  InfoIcon,
  AlertTriangleIcon,
  DeliveryIcon,
  ProductIcon,
  CashDollarIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ClearStockGuideModal } from "../components/ClearStockGuideModal";
import { SupportModal } from "../components/SupportModal";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // 1. FULL CATALOG & HISTORICAL ORDERS SYNC FROM SHOPIFY
  if (intent === "SYNC_SHOPIFY_CATALOG") {
    try {
      // 1. Sync Products & Variants (Does NOT require Protected Customer Data approval)
      const productsResponse = await admin.graphql(`
        query SyncStoreProducts {
          products(first: 50) {
            edges {
              node {
                id
                title
                vendor
                productType
                featuredImage {
                  url
                }
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryQuantity
                      image {
                        url
                      }
                      inventoryItem {
                        id
                        unitCost {
                          amount
                        }
                        inventoryLevels(first: 10) {
                          nodes {
                            location {
                              isActive
                            }
                            quantities(names: ["available"]) {
                              name
                              quantity
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const productsJson = await productsResponse.json();
      const productEdges = productsJson.data?.products?.edges || [];

      // 2. Query Orders for sales velocity in an isolated try-catch (Gracefully handles Protected Customer Data restriction)
      let orderEdges: any[] = [];
      let pcdNotice: string | null = null;

      try {
        const ordersResponse = await admin.graphql(`
          query SyncStoreOrdersVelocity {
            orders(first: 250, query: "status:open OR status:closed") {
              edges {
                node {
                  id
                  createdAt
                  processedAt
                  displayFinancialStatus
                  cancelledAt
                  lineItems(first: 50) {
                    edges {
                      node {
                        quantity
                        variant {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `);

        const ordersJson: any = await ordersResponse.json();
        if (ordersJson.errors && ordersJson.errors.length > 0) {
          const isPcdError = ordersJson.errors.some((e: any) =>
            String(e.message || "").toLowerCase().includes("protected") ||
            String(e.message || "").toLowerCase().includes("not approved to access the order")
          );
          if (isPcdError) {
            pcdNotice =
              "Historical orders require Protected Customer Data access in your Shopify Partner Dashboard. Live incoming orders will track via webhooks.";
            console.warn("[Orders Sync Notice]", pcdNotice);
          } else {
            console.warn("[Orders Sync Non-Fatal Warning]", ordersJson.errors);
          }
        } else {
          orderEdges = ordersJson.data?.orders?.edges || [];
        }
      } catch (orderErr: any) {
        console.warn("[Orders Query Exception Handled]", orderErr.message);
        pcdNotice = "Orders access requires Protected Customer Data approval.";
      }

      // 1. Detect all unique vendors from products
      const rawVendors = new Set<string>();
      for (const pEdge of productEdges) {
        const vName = pEdge.node.vendor?.trim();
        if (vName) rawVendors.add(vName);
      }
      const detectedVendors = Array.from(rawVendors);

      // 2. Ensure supplier exists for each detected vendor or create default
      const vendorSupplierMap = new Map<string, string>();
      for (const vName of detectedVendors) {
        let supplier = await prisma.supplier.findFirst({
          where: { shop: session.shop, name: vName },
        });
        if (!supplier) {
          supplier = await prisma.supplier.create({
            data: {
              shop: session.shop,
              name: vName,
              defaultLeadTime: 14,
              currency: "USD",
              notes: `Auto-detected vendor from Shopify catalog: ${vName}`,
            },
          });
        }
        vendorSupplierMap.set(vName, supplier.id);
      }

      // Default fallback supplier if none exists
      let defaultSupplier = await prisma.supplier.findFirst({
        where: { shop: session.shop },
        orderBy: { createdAt: "asc" },
      });
      if (!defaultSupplier) {
        defaultSupplier = await prisma.supplier.create({
          data: {
            shop: session.shop,
            name: detectedVendors[0] || "Primary Supplier",
            defaultLeadTime: 14,
            currency: "USD",
            notes: "Auto-created during catalog onboarding sync",
          },
        });
      }

      let variantsCount = 0;
      // 3. Upsert VariantSupplierRules for each variant
      for (const pEdge of productEdges) {
        const p = pEdge.node;
        const assignedSupplierId =
          (p.vendor && vendorSupplierMap.get(p.vendor.trim())) || defaultSupplier.id;

        for (const vEdge of p.variants?.edges || []) {
          const v = vEdge.node;
          variantsCount++;

          let totalAvailable =
            typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null;
          if (totalAvailable === null) {
            totalAvailable = (v.inventoryItem?.inventoryLevels?.nodes || []).reduce(
              (sum: number, lvl: any) => {
                if (lvl.location?.isActive) {
                  const avail =
                    lvl.quantities?.find(
                      (q: any) => !q.name || q.name === "available",
                    )?.quantity ||
                    lvl.quantities?.[0]?.quantity ||
                    0;
                  return sum + avail;
                }
                return sum;
              },
              0,
            );
          }

          const sku = v.sku || `SKU-${v.id.split("/").pop()}`;
          const shopifyUnitCost =
            parseFloat(v.inventoryItem?.unitCost?.amount || "0") || 0;
          const imageUrl = v.image?.url || p.featuredImage?.url || null;

          const updateData: any = {
            productId: p.id,
            inventoryItemId: v.inventoryItem?.id || null,
            title: p.title || "Untitled Product",
            variantTitle: v.title || "",
            imageUrl,
            availableStock: totalAvailable ?? 0,
            supplierSku: sku,
          };
          if (shopifyUnitCost > 0) {
            updateData.unitCost = shopifyUnitCost;
          }

          await prisma.variantSupplierRule.upsert({
            where: {
              shop_variantId: {
                shop: session.shop,
                variantId: v.id,
              },
            },
            update: updateData,
            create: {
              shop: session.shop,
              variantId: v.id,
              productId: p.id,
              inventoryItemId: v.inventoryItem?.id || null,
              title: p.title || "Untitled Product",
              variantTitle: v.title || "",
              imageUrl,
              availableStock: totalAvailable ?? 0,
              unitCost: shopifyUnitCost > 0 ? shopifyUnitCost : 0,
              supplierSku: sku,
              supplierId: assignedSupplierId,
              leadTimeDays: 14,
              minOrderQty: 1,
              packSize: 1,
              safetyStockDays: 7,
              safetyStockMinimum: 0,
            },
          });
        }
      }

      // 4. Ingest Orders into DailySalesAggregator
      let ordersCount = 0;
      for (const oEdge of orderEdges) {
        const o = oEdge.node;
        if (
          o.cancelledAt ||
          (o.displayFinancialStatus &&
            o.displayFinancialStatus !== "PAID" &&
            o.displayFinancialStatus !== "PARTIALLY_PAID")
        ) {
          continue;
        }
        ordersCount++;

        const orderDateStr = o.processedAt || o.createdAt;
        const date = new Date(orderDateStr);
        date.setUTCHours(0, 0, 0, 0);

        for (const itemEdge of o.lineItems?.edges || []) {
          const item = itemEdge.node;
          if (!item.variant?.id) continue;
          const qty = parseInt(String(item.quantity || 0), 10);
          if (qty <= 0) continue;

          await prisma.dailySalesAggregator.upsert({
            where: {
              shop_variantId_date: {
                shop: session.shop,
                variantId: item.variant.id,
                date,
              },
            },
            update: {
              unitsSold: { increment: qty },
            },
            create: {
              shop: session.shop,
              variantId: item.variant.id,
              date,
              unitsSold: qty,
            },
          });
        }
      }

      // 5. Update AppSettings
      await prisma.appSettings.upsert({
        where: { shop: session.shop },
        update: {},
        create: {
          shop: session.shop,
          defaultLookbackWindow: 30,
          defaultSafetyStockDays: 7,
          defaultLeadTimeDays: 14,
        },
      });

      return {
        ok: true,
        syncSuccess: true,
        productsCount: productEdges.length,
        variantsCount,
        detectedVendors,
        ordersCount,
        pcdNotice,
      };
    } catch (err: any) {
      console.error("[Sync Catalog Error]", err);
      return { ok: false, error: err.message || "Failed to sync Shopify catalog" };
    }
  }

  // 2. SAVE PLAN SELECTION (Step 2)
  if (intent === "SAVE_PLAN") {
    const plan = String(formData.get("plan") || "growth");
    await prisma.appSettings.upsert({
      where: { shop: session.shop },
      update: { selectedPlan: plan },
      create: {
        shop: session.shop,
        selectedPlan: plan,
      },
    });
    return { ok: true, planSaved: true, selectedPlan: plan };
  }

  // 3. ADD / CONFIGURE SUPPLIER (Step 3)
  if (intent === "ADD_SUPPLIER") {
    const appSettings = await prisma.appSettings.findFirst({ where: { shop: session.shop } });
    if (appSettings?.selectedPlan === "starter") {
      const existingCount = await prisma.supplier.count({ where: { shop: session.shop } });
      if (existingCount >= 1) {
        return {
          ok: false,
          error: "Starter Plan ($9/mo) includes 1 primary supplier. Upgrade to Growth ($39/mo) to add unlimited suppliers.",
        };
      }
    }

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const defaultLeadTime = parseInt(String(formData.get("defaultLeadTime") || "14"), 10);
    const currency = String(formData.get("currency") || "USD");
    const notes = String(formData.get("notes") || "").trim();

    if (!name) return { ok: false, error: "Supplier name is required" };

    const supplier = await prisma.supplier.create({
      data: {
        shop: session.shop,
        name,
        email: email || null,
        defaultLeadTime: isNaN(defaultLeadTime) ? 14 : defaultLeadTime,
        currency,
        notes: notes || null,
      },
    });

    // Auto-link any matching variants
    await prisma.variantSupplierRule.updateMany({
      where: {
        shop: session.shop,
        supplier: {
          name: { equals: name, mode: "insensitive" },
        },
      },
      data: {
        supplierId: supplier.id,
        leadTimeDays: supplier.defaultLeadTime,
      },
    });

    return {
      ok: true,
      supplierCreated: true,
      supplierName: supplier.name,
      supplierId: supplier.id,
    };
  }

  // 4. COMPLETE ONBOARDING
  if (intent === "COMPLETE_ONBOARDING") {
    await prisma.appSettings.upsert({
      where: { shop: session.shop },
      update: { onboardingCompleted: true },
      create: {
        shop: session.shop,
        onboardingCompleted: true,
      },
    });
    return { ok: true, onboardingCompleted: true };
  }

  // 5. RESET ONBOARDING (to enter wizard anytime)
  if (intent === "RESET_ONBOARDING") {
    await prisma.appSettings.upsert({
      where: { shop: session.shop },
      update: { onboardingCompleted: false },
      create: {
        shop: session.shop,
        onboardingCompleted: false,
      },
    });
    return { ok: true, onboardingReset: true };
  }

  // 6. HEAL DATA / LIVE RE-SYNC
  if (intent === "HEAL_DATA") {
    try {
      const response = await admin.graphql(`
        query SyncAllInventory {
          productVariants(first: 50) {
            edges {
              node {
                id
                sku
                title
                inventoryQuantity
                inventoryItem {
                  id
                  inventoryLevels(first: 20) {
                    nodes {
                      location {
                        isActive
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const json = await response.json();
      const variants = json.data?.productVariants?.edges || [];

      for (const edge of variants) {
        const v = edge.node;
        let totalAvailable =
          typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null;

        if (totalAvailable === null) {
          totalAvailable = (
            v.inventoryItem?.inventoryLevels?.nodes || []
          ).reduce((sum: number, lvl: any) => {
            if (lvl.location?.isActive) {
              const avail =
                lvl.quantities?.find(
                  (q: any) => !q.name || q.name === "available",
                )?.quantity ||
                lvl.quantities?.[0]?.quantity ||
                0;
              return sum + avail;
            }
            return sum;
          }, 0);
        }

        await prisma.variantSupplierRule.updateMany({
          where: {
            shop: session.shop,
            variantId: v.id,
          },
          data: {
            availableStock: totalAvailable ?? 0,
          },
        });
      }

      // Also heal/sync orders and sales velocity from Shopify
      try {
        const ordersResponse = await admin.graphql(`
          query HealStoreOrdersVelocity {
            orders(first: 250, query: "status:open OR status:closed") {
              edges {
                node {
                  id
                  createdAt
                  processedAt
                  displayFinancialStatus
                  cancelledAt
                  lineItems(first: 50) {
                    edges {
                      node {
                        quantity
                        variant {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `);
        const ordersJson: any = await ordersResponse.json();
        const orderEdges = ordersJson.data?.orders?.edges || [];

        // Clear existing sales aggregator cache for fresh heal
        await prisma.dailySalesAggregator.deleteMany({
          where: { shop: session.shop },
        });

        for (const oEdge of orderEdges) {
          const o = oEdge.node;
          if (
            o.cancelledAt ||
            (o.displayFinancialStatus &&
              o.displayFinancialStatus !== "PAID" &&
              o.displayFinancialStatus !== "PARTIALLY_PAID")
          ) {
            continue;
          }

          const orderDateStr = o.processedAt || o.createdAt;
          const date = new Date(orderDateStr);
          date.setUTCHours(0, 0, 0, 0);

          for (const itemEdge of o.lineItems?.edges || []) {
            const item = itemEdge.node;
            if (!item.variant?.id) continue;
            const qty = parseInt(String(item.quantity || 0), 10);
            if (qty <= 0) continue;

            await prisma.dailySalesAggregator.upsert({
              where: {
                shop_variantId_date: {
                  shop: session.shop,
                  variantId: item.variant.id,
                  date,
                },
              },
              update: {
                unitsSold: { increment: qty },
              },
              create: {
                shop: session.shop,
                variantId: item.variant.id,
                date,
              },
            });
          }
        }
      } catch (orderHealErr: any) {
        console.warn("[Heal Orders Sync Warning]", orderHealErr.message);
      }

      return { ok: true, healSuccess: true, syncedCount: variants.length };
    } catch (err: any) {
      console.error("[Heal Data Error]", err);
      return { ok: false, error: err.message };
    }
  }

  return { ok: false };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch Suppliers
  const suppliersDb = await prisma.supplier.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });

  // 2. Fetch Sourcing Rules strictly for the current shop
  const rulesDb = await prisma.variantSupplierRule.findMany({
    where: { shop },
    include: { supplier: true },
    orderBy: { createdAt: "asc" },
  });

  // 3. Date window boundaries for ADS calculations
  const now = new Date();
  const date90dAgo = new Date(now);
  date90dAgo.setDate(date90dAgo.getDate() - 90);
  const date30dAgo = new Date(now);
  date30dAgo.setDate(date30dAgo.getDate() - 30);
  const date14dAgo = new Date(now);
  date14dAgo.setDate(date14dAgo.getDate() - 14);
  const date7dAgo = new Date(now);
  date7dAgo.setDate(date7dAgo.getDate() - 7);

  // 4. Fetch 90 days of daily sales records from PostgreSQL for current shop
  const salesDb = await prisma.dailySalesAggregator.findMany({
    where: {
      shop,
      date: { gte: date90dAgo },
    },
  });

  // 5. Fetch active incoming PO line items to prevent double-ordering
  const openPurchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      shop,
      status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] },
    },
    include: {
      items: true,
    },
  });
  const openPoItems = openPurchaseOrders.flatMap((po) => po.items);

  // 6. Map PostgreSQL records to ReplenishmentItem entities
  const items: ReplenishmentItem[] = rulesDb.map((rule) => {
    const variantSales = salesDb.filter((s) => s.variantId === rule.variantId);
    const unitsSold7d = variantSales
      .filter((s) => new Date(s.date) >= date7dAgo)
      .reduce((sum: number, s) => sum + s.unitsSold, 0);
    const unitsSold14d = variantSales
      .filter((s) => new Date(s.date) >= date14dAgo)
      .reduce((sum: number, s) => sum + s.unitsSold, 0);
    const unitsSold30d = variantSales
      .filter((s) => new Date(s.date) >= date30dAgo)
      .reduce((sum: number, s) => sum + s.unitsSold, 0);
    const unitsSold90d = variantSales
      .filter((s) => new Date(s.date) >= date90dAgo)
      .reduce((sum: number, s) => sum + s.unitsSold, 0);

    // High-precision float ADS to prevent early rounding error across lead-time and cycle multiplications
    const ads7d = unitsSold7d > 0 ? unitsSold7d / 7 : 0;
    const ads14d = unitsSold14d > 0 ? unitsSold14d / 14 : 0;
    const ads30d = unitsSold30d > 0 ? unitsSold30d / 30 : 0;
    const ads90d = unitsSold90d > 0 ? unitsSold90d / 90 : 0;

    // Incoming stock on open Purchase Orders
    const stockOnOrder = openPoItems
      .filter((p) => p.variantId === rule.variantId)
      .reduce((sum: number, p) => sum + (p.quantityOrdered - p.quantityReceived), 0);

    // Live stock-on-hand from Shopify
    const stockOnHand = rule.availableStock || 0;

    return {
      id: rule.id,
      variantId: rule.variantId,
      inventoryItemId: rule.inventoryItemId || "",
      title: rule.title || "Untitled Product",
      variantTitle: rule.variantTitle || "",
      sku: rule.supplierSku || "",
      imageUrl: rule.imageUrl || "",
      supplierId: rule.supplierId,
      supplierName: rule.supplier.name,
      stockOnHand,
      stockOnOrder,
      ads7d,
      ads14d,
      ads30d,
      ads90d,
      unitsSold7d,
      unitsSold14d,
      unitsSold30d,
      unitsSold90d,
      leadTimeDays: rule.leadTimeDays ?? rule.supplier.defaultLeadTime,
      safetyStockDays: rule.safetyStockDays,
      safetyStockMinimum: rule.safetyStockMinimum,
      minOrderQty: rule.minOrderQty,
      packSize: rule.packSize,
      unitCost: Number(rule.unitCost),
      lastSyncDate: "Synced with Shopify",
    };
  });

  const appSettings = await prisma.appSettings.findFirst({
    where: { shop },
  });

  const defaultLookbackWindow = appSettings?.defaultLookbackWindow
    ? String(appSettings.defaultLookbackWindow)
    : "30";

  // Unique detected vendors
  const rawVendors = new Set<string>();
  suppliersDb.forEach((s) => rawVendors.add(s.name));
  rulesDb.forEach((r) => {
    if (r.supplier?.name) rawVendors.add(r.supplier.name);
  });

  const ordersCount = await prisma.dailySalesAggregator.count({
    where: { shop },
  });

  return {
    items,
    suppliers: suppliersDb.map((s) => ({
      id: s.id,
      name: s.name,
      defaultLeadTime: s.defaultLeadTime,
      email: s.email || "",
      currency: s.currency || "USD",
    })),
    defaultLookbackWindow: (defaultLookbackWindow === "7" ||
    defaultLookbackWindow === "14" ||
    defaultLookbackWindow === "90"
      ? defaultLookbackWindow
      : "30") as "7" | "14" | "30" | "90",
    shop,
    onboardingCompleted: Boolean(appSettings?.onboardingCompleted),
    selectedPlan: appSettings?.selectedPlan || "growth",
    safetyFormulaModel: (appSettings as any)?.safetyFormulaModel || "standard",
    detectedVendors: Array.from(rawVendors),
    ordersCount,
  };
};

export interface ReplenishmentItem {
  id: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  variantTitle: string;
  sku: string;
  imageUrl: string;
  supplierId: string;
  supplierName: string;
  stockOnHand: number;
  stockOnOrder: number;
  ads7d: number;
  ads14d: number;
  ads30d: number;
  ads90d: number;
  unitsSold7d: number;
  unitsSold14d: number;
  unitsSold30d: number;
  unitsSold90d: number;
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStockMinimum: number;
  minOrderQty: number; // MOQ
  packSize: number; // Case/box multiple
  unitCost: number;
  lastSyncDate: string;
}

export function computeReplenishmentMath(
  item: ReplenishmentItem,
  windowDays: 7 | 14 | 30 | 90 = 30,
  reorderFrequencyDays: number = 30,
  safetyFormulaModel: string = "standard",
) {
  const adsMap = {
    7: item.ads7d,
    14: item.ads14d,
    30: item.ads30d,
    90: item.ads90d,
  };
  const ads = adsMap[windowDays];

  // Multiplier from Custom Safety Stock Formula Model (Scale Plan Feature)
  const formulaMultiplier =
    safetyFormulaModel === "surge"
      ? 1.25
      : safetyFormulaModel === "aggressive"
      ? 1.50
      : safetyFormulaModel === "lean"
      ? 0.80
      : 1.0;

  // 1. Lead time demand (units sold while waiting for supplier delivery)
  // High-precision float is maintained throughout intermediate calculations
  const leadTimeDemand = ads * item.leadTimeDays;

  // 2. Safety stock (buffer for spikes & shipping delays)
  // Scaled by custom safety formula multiplier
  // Floor Min (item.safetyStockMinimum) prevents slow-moving items from having zero buffer
  const safetyStockFromDays = ads * item.safetyStockDays * formulaMultiplier;
  const safetyStock = Math.max(
    Math.round(safetyStockFromDays),
    item.safetyStockMinimum,
  );

  // 3. Reorder Point (ROP) - The floor threshold that triggers an order
  const reorderPoint = Math.round(leadTimeDemand + safetyStock);

  // 4. Cycle Stock (how much stock is sold between PO cycles)
  const cycleStock = Math.round(ads * reorderFrequencyDays);

  // 5. Target Stock Level (Order-Up-To Level = ROP floor + Cycle Stock)
  const targetStockLevel = Math.round(reorderPoint + cycleStock);

  // 6. Current Stock Position (OnHand + Inbound on POs)
  const effectiveStock = item.stockOnHand + item.stockOnOrder;

  // 7. Strict ROP Gate:
  // Recommended PO is strictly 0 unless (OnHand + OnOrder) <= ROP.
  // Prevents premature replenishment when stock is between ROP and Target.
  const isBelowReorderPoint = effectiveStock <= reorderPoint;
  let rawDeficit = 0;
  let recommendedUnits = 0;
  let casesCount = 0;

  if (isBelowReorderPoint) {
    rawDeficit = Math.max(0, targetStockLevel - effectiveStock);
    if (rawDeficit > 0) {
      const minUnitsNeeded = Math.max(rawDeficit, item.minOrderQty);
      casesCount = Math.ceil(minUnitsNeeded / item.packSize);
      recommendedUnits = casesCount * item.packSize;
    }
  }

  // Days of current stock on hand
  const daysOfCoverageOnHand =
    item.stockOnHand <= 0 ? 0 : ads > 0 ? Math.floor(item.stockOnHand / ads) : 0;

  // 8. Overstock Threshold (Ceiling): Target Stock Level + 15% buffer
  const overstockThreshold = Math.round(targetStockLevel * 1.15);
  const isOverstocked = ads > 0 && item.stockOnHand > overstockThreshold;
  // Dead capital is calculated on all units held above your optimal Target Stock Level
  const deadCashValue = isOverstocked
    ? Math.max(0, item.stockOnHand - targetStockLevel) * item.unitCost
    : 0;

  // 9. Status Determination:
  // - Reorder Now: OnHand + OnOrder <= ROP
  // - Incoming: OnHand <= ROP but OnOrder brings total > ROP
  // - Overstocked: OnHand > Target Stock Level + 15%
  // - Stock OK: In healthy zone between ROP and Target Ceiling
  let statusTone: "critical" | "warning" | "info" | "success" = "success";
  let statusLabel: "Reorder Now" | "Overstocked" | "Incoming" | "Stock OK" = "Stock OK";

  if (effectiveStock <= reorderPoint) {
    statusTone = "critical";
    statusLabel = "Reorder Now";
  } else if (item.stockOnHand <= reorderPoint && item.stockOnOrder > 0) {
    statusTone = "info";
    statusLabel = "Incoming";
  } else if (isOverstocked) {
    statusTone = "warning";
    statusLabel = "Overstocked";
  } else {
    statusTone = "success";
    statusLabel = "Stock OK";
  }

  return {
    ads,
    windowDays,
    leadTimeDemand: Math.round(leadTimeDemand),
    safetyStock,
    reorderPoint,
    cycleStock,
    reorderFrequencyDays,
    targetStockLevel,
    overstockThreshold,
    stockOnHand: item.stockOnHand,
    stockOnOrder: item.stockOnOrder,
    effectiveStock,
    rawDeficit,
    minOrderQty: item.minOrderQty,
    packSize: item.packSize,
    casesCount,
    recommendedUnits,
    estimatedCost: recommendedUnits * item.unitCost,
    daysOfCoverageOnHand,
    statusTone,
    statusLabel,
    isOverstocked,
    deadCashValue,
    isBelowReorderPoint,
    formulaMultiplier,
    safetyFormulaModel,
  };
}

export default function ReplenishmentDashboard() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const loaderData = useLoaderData<typeof loader>();

  const items = loaderData?.items || [];
  const suppliers = loaderData?.suppliers || [];
  const shop = loaderData?.shop || "";

  // View Mode: default to dashboard ONLY if setup is fully completed and items exist
  const isFullySetup = Boolean(loaderData?.onboardingCompleted && items.length > 0);
  const [viewMode, setViewMode] = useState<"dashboard" | "wizard">(
    isFullySetup ? "dashboard" : "wizard",
  );

  // Wizard Stepper State (Steps 1 to 4)
  const [wizardStep, setWizardStep] = useState<number>(() => {
    if (items.length === 0) return 1;
    if (suppliers.length === 0) return 3;
    return 2;
  });

  // Selected Plan state for Step 2
  const [chosenPlan, setChosenPlan] = useState<"starter" | "growth" | "scale">(
    (loaderData?.selectedPlan as any) || "growth",
  );

  // Enforce Wizard progression: Never allow skipping ahead to incomplete steps
  useEffect(() => {
    if (viewMode === "wizard") {
      if (items.length === 0 && wizardStep > 1) {
        setWizardStep(1);
      } else if (suppliers.length === 0 && wizardStep === 4) {
        setWizardStep(3);
      }
    }
  }, [items.length, suppliers.length, wizardStep, viewMode]);

  // Modals state
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [guideDefaultTab, setGuideDefaultTab] = useState<"math" | "pos" | "sync" | "faqs">("math");
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);

  // New Supplier Form State
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierLeadTime, setNewSupplierLeadTime] = useState("14");
  const [newSupplierCurrency, setNewSupplierCurrency] = useState("USD");
  const [newSupplierNotes, setNewSupplierNotes] = useState("");

  // Dashboard Filters & Controls
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [rollingWindow, setRollingWindow] = useState<"7" | "14" | "30" | "90">(() => {
    if (loaderData?.selectedPlan === "starter") return "30";
    return loaderData?.defaultLookbackWindow || "30";
  });
  const [filterStatus, setFilterStatus] = useState<
    "all" | "Reorder Now" | "Overstocked" | "Incoming" | "Stock OK"
  >("all");

  const isSyncingCatalog =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SYNC_SHOPIFY_CATALOG";
  const isHealing =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "HEAL_DATA";
  const isSavingPlan =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "SAVE_PLAN";
  const isAddingSupplier =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "ADD_SUPPLIER";

  // Action feedback toasts
  useEffect(() => {
    if (actionData?.syncSuccess) {
      shopify.toast.show(
        `Synced ${actionData.variantsCount} variants, ${actionData.ordersCount} orders, and detected ${actionData.detectedVendors.length} vendors!`,
      );
      setWizardStep(2);
    } else if (actionData?.planSaved) {
      shopify.toast.show(`Plan updated to ${actionData.selectedPlan.toUpperCase()}!`);
      setWizardStep(3);
    } else if (actionData?.supplierCreated) {
      shopify.toast.show(`Supplier "${actionData.supplierName}" added!`);
      setShowSupplierModal(false);
      setNewSupplierName("");
      setNewSupplierEmail("");
    } else if (actionData?.onboardingCompleted) {
      shopify.toast.show("🎉 Setup completed! Welcome to ClearStock.");
      setViewMode("dashboard");
    } else if (actionData?.healSuccess) {
      shopify.toast.show(
        `Data healed: Re-synced ${actionData.syncedCount} variants across all locations.`,
      );
    } else if (actionData?.error) {
      shopify.toast.show(`Error: ${actionData.error}`, { isError: true });
    }
  }, [actionData, shopify]);

  // Modal State for Math explanation
  const [activeMathItem, setActiveMathItem] = useState<ReplenishmentItem | null>(null);
  const [mathModalTab, setMathModalTab] = useState<"story" | "formula">("story");
  const windowDaysNum = parseInt(rollingWindow, 10) as 7 | 14 | 30 | 90;

  const selectedPlan = (loaderData?.selectedPlan as string) || "growth";
  const rawSafetyFormulaModel = (loaderData as any)?.safetyFormulaModel || "standard";
  // Scale Plan gate: custom safety formula models only apply to Scale tier
  const effectiveSafetyFormulaModel = selectedPlan === "scale" ? rawSafetyFormulaModel : "standard";
  const isStarter = selectedPlan === "starter";
  const isSkuLimitExceeded = isStarter && items.length > 50;

  // Starter Plan Gate: Prioritize top 50 revenue-generating SKUs by 30D sales
  const activeItems = useMemo(() => {
    if (!isStarter) return items;
    return [...items]
      .sort((a, b) => b.unitsSold30d - a.unitsSold30d || a.title.localeCompare(b.title))
      .slice(0, 50);
  }, [items, isStarter]);

  // Keep rollingWindow locked to 30D on Starter plan
  useEffect(() => {
    if (isStarter && rollingWindow !== "30") {
      setRollingWindow("30");
    }
  }, [isStarter, rollingWindow]);

  const handleWindowChange = (w: "7" | "14" | "30" | "90") => {
    if (isStarter && w !== "30") {
      shopify.toast.show(
        "7D, 14D, and 90D velocity smoothing requires the Growth Plan ($39/mo). Upgrade in Settings.",
      );
      return;
    }
    setRollingWindow(w);
  };

  // Process rows with calculations
  const calculatedRows = useMemo(() => {
    return activeItems.map((item) => ({
      ...item,
      calc: computeReplenishmentMath(item, windowDaysNum, 30, effectiveSafetyFormulaModel),
    }));
  }, [activeItems, windowDaysNum, effectiveSafetyFormulaModel]);

  // Filtered rows for Dashboard
  const filteredRows = useMemo(() => {
    return calculatedRows.filter((item) => {
      if (selectedSupplier !== "all" && item.supplierId !== selectedSupplier) {
        return false;
      }
      if (filterStatus !== "all" && item.calc.statusLabel !== filterStatus) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesSku = item.sku.toLowerCase().includes(query);
        const matchesVariant = item.variantTitle.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSku && !matchesVariant) {
          return false;
        }
      }
      return true;
    });
  }, [calculatedRows, selectedSupplier, filterStatus, searchQuery]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSupplier, filterStatus, searchQuery, pageSize]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = totalItems > 0 ? (safeCurrentPage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedRows = useMemo(() => {
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, startIndex, endIndex]);

  const resourceIDResolver = (item: (typeof filteredRows)[0]) => item.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(filteredRows, {
      resourceIDResolver,
    });

  const summaryMetrics = useMemo(() => {
    const itemsNeedingReorder = calculatedRows.filter(
      (r) => r.calc.statusLabel === "Reorder Now",
    );
    const totalUnitsToOrder = itemsNeedingReorder.reduce(
      (sum, r) => sum + r.calc.recommendedUnits,
      0,
    );
    const totalEstimatedSpend = itemsNeedingReorder.reduce(
      (sum, r) => sum + r.calc.estimatedCost,
      0,
    );
    const totalInboundOnPOs = calculatedRows.reduce(
      (sum, r) => sum + r.stockOnOrder,
      0,
    );
    const overstockedItems = calculatedRows.filter((r) => r.calc.isOverstocked);
    const totalDeadCash = overstockedItems.reduce(
      (sum, r) => sum + r.calc.deadCashValue,
      0,
    );

    return {
      needingReorderCount: itemsNeedingReorder.length,
      totalUnitsToOrder,
      totalEstimatedSpend,
      totalInboundOnPOs,
      activeSkusCount: items.length,
      overstockedCount: overstockedItems.length,
      totalDeadCash,
    };
  }, [calculatedRows, items.length]);

  const supplierOptions = useMemo(() => {
    const list = [{ label: "All Suppliers", value: "all" }];
    suppliers.forEach((s) => {
      list.push({ label: s.name, value: s.id });
    });
    return list;
  }, [suppliers]);

  const tabStatuses: Array<"all" | "Reorder Now" | "Incoming" | "Overstocked" | "Stock OK"> = [
    "all",
    "Reorder Now",
    "Incoming",
    "Overstocked",
    "Stock OK",
  ];

  const selectedTab = tabStatuses.indexOf(filterStatus) !== -1
    ? tabStatuses.indexOf(filterStatus)
    : 0;

  const countByStatus = useMemo(() => {
    const counts = {
      all: calculatedRows.length,
      "Reorder Now": 0,
      Incoming: 0,
      Overstocked: 0,
      "Stock OK": 0,
    };
    calculatedRows.forEach((r) => {
      counts[r.calc.statusLabel]++;
    });
    return counts;
  }, [calculatedRows]);

  const tabs = [
    { content: "All Items", id: "tab-all", badge: String(countByStatus.all) },
    { content: "Reorder Now", id: "tab-reorder", badge: String(countByStatus["Reorder Now"]) },
    { content: "Incoming", id: "tab-incoming", badge: String(countByStatus.Incoming) },
    { content: "Overstocked", id: "tab-overstocked", badge: String(countByStatus.Overstocked) },
    { content: "Stock OK", id: "tab-ok", badge: String(countByStatus["Stock OK"]) },
  ];

  const { mode, setMode } = useSetIndexFiltersMode();

  const handleClearAll = () => {
    setSelectedSupplier("all");
    setRollingWindow(loaderData?.defaultLookbackWindow || "30");
    setSearchQuery("");
    setFilterStatus("all");
    setCurrentPage(1);
  };

  const isLookbackChanged =
    rollingWindow !== (loaderData?.defaultLookbackWindow || "30");
  const hasActiveFilters =
    filterStatus !== "all" ||
    selectedSupplier !== "all" ||
    searchQuery.trim().length > 0 ||
    isLookbackChanged;

  const handleHealData = () => {
    submit({ intent: "HEAL_DATA" }, { method: "post" });
  };

  const handleSyncStoreData = () => {
    submit({ intent: "SYNC_SHOPIFY_CATALOG" }, { method: "post" });
  };

  const handleSavePlan = () => {
    submit({ intent: "SAVE_PLAN", plan: chosenPlan }, { method: "post" });
  };

  const handleCreateSupplier = (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newSupplierName.trim()) return;
    submit(
      {
        intent: "ADD_SUPPLIER",
        name: newSupplierName,
        email: newSupplierEmail,
        defaultLeadTime: newSupplierLeadTime,
        currency: newSupplierCurrency,
        notes: newSupplierNotes,
      },
      { method: "post" },
    );
  };

  const handleQuickAddVendor = (vendorName: string) => {
    if (isStarter && suppliers.length >= 1) {
      shopify.toast.show(
        "Starter Plan includes 1 primary supplier. Upgrade to Growth ($39/mo) to link multiple vendors.",
      );
      return;
    }
    submit(
      {
        intent: "ADD_SUPPLIER",
        name: vendorName,
        defaultLeadTime: "14",
        currency: "USD",
        notes: `Quick-added from Shopify product vendor "${vendorName}"`,
      },
      { method: "post" },
    );
  };

  const handleCompleteOnboarding = () => {
    submit({ intent: "COMPLETE_ONBOARDING" }, { method: "post" });
  };

  const handleCreatePOFromSelected = () => {
    if (selectedResources.length === 0) return;
    const selectedItems = items.filter((i) => selectedResources.includes(i.id));
    const distinctSuppliers = Array.from(
      new Set(selectedItems.map((i) => i.supplierName)),
    );

    if (distinctSuppliers.length > 1) {
      shopify.toast.show(
        `Selected items span multiple suppliers (${distinctSuppliers.join(", ")}). Please select items from a single supplier or filter by vendor.`,
        { isError: true },
      );
      return;
    }

    shopify.toast.show(
      `Creating Draft Purchase Order with ${selectedResources.length} items (${rollingWindow}D velocity)...`,
    );
    navigate(
      `/app/purchase-orders/new?items=${selectedResources.join(",")}&window=${rollingWindow}&returnTo=/app`,
    );
  };

  const activeMath = activeMathItem
    ? computeReplenishmentMath(activeMathItem, windowDaysNum, 30, effectiveSafetyFormulaModel)
    : null;

  return (
    <Page
      title={viewMode === "wizard" ? "ClearStock Onboarding & Setup" : "Replenishment"}
      subtitle={
        viewMode === "wizard"
          ? "Connect your live Shopify catalog, choose your plan, and configure supplier lead times."
          : "Simple, transparent buying recommendations. Always know what to buy and when to buy."
      }
      primaryAction={
        viewMode === "wizard"
          ? items.length > 0
            ? {
                content: "View Dashboard",
                onAction: () => setViewMode("dashboard"),
              }
            : undefined
          : {
              content: "Create Purchase Order",
              icon: PlusIcon,
              onAction: () => navigate("/app/purchase-orders/new?returnTo=/app"),
            }
      }
      secondaryActions={
        viewMode === "dashboard"
          ? [
              {
                content: "How Calculations Work",
                icon: InfoIcon,
                onAction: () => {
                  setGuideDefaultTab("math");
                  setShowGuideModal(true);
                },
              },
              {
                content: "Sync with Shopify",
                icon: RefreshIcon,
                loading: isSyncingCatalog,
                onAction: handleSyncStoreData,
                helpText:
                  "Pulls latest products, variant SKUs, and live inventory levels from your Shopify store.",
              },
            ]
          : undefined
      }
    >
      <style>{`
        /* Sticky Table Columns */
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--first,
        .clearstock-sticky-table .Polaris-IndexTable__TableCell:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableCell--first {
          position: sticky !important;
          left: 0 !important;
          z-index: 25 !important;
          background-color: var(--p-color-bg-surface, #ffffff) !important;
          width: 48px !important;
          min-width: 48px !important;
          max-width: 48px !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--first {
          z-index: 26 !important;
          background-color: var(--p-color-bg-surface-secondary, #f7f7f7) !important;
        }

        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--second,
        .clearstock-sticky-table .Polaris-IndexTable__TableCell:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell {
          position: sticky !important;
          left: 48px !important;
          z-index: 23 !important;
          background-color: var(--p-color-bg-surface, #ffffff) !important;
          box-shadow: 2px 0 4px -1px rgba(0, 0, 0, 0.08) !important;
          min-width: 220px !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--second {
          z-index: 24 !important;
          background-color: var(--p-color-bg-surface-secondary, #f7f7f7) !important;
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* VIEW 1: ONBOARDING SETUP WIZARD (High-Conversion UX)       */}
      {/* ════════════════════════════════════════════════════════════ */}
      {viewMode === "wizard" && (
        <BlockStack gap="500">
          {/* Top Quick-Return Bar if already setup */}
          {items.length > 0 && (
            <Card padding="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="300" blockAlign="center">
                  <Badge tone="success">Catalog Connected</Badge>
                  <Text as="span" variant="bodyMd" tone="subdued">
                    {items.length} active SKUs and {suppliers.length} suppliers configured.
                  </Text>
                </InlineStack>
                <Button size="slim" onClick={() => setViewMode("dashboard")}>
                  ← Back to Dashboard
                </Button>
              </InlineStack>
            </Card>
          )}

          {/* Stepper Header Bar */}
          <Card padding="500">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              {[
                { num: 1, label: "1. Sync Catalog" },
                { num: 2, label: "2. Choose Plan" },
                { num: 3, label: "3. Primary Supplier" },
                { num: 4, label: "4. Ready & Restock" },
              ].map((step, idx) => {
                const isStep1Done = items.length > 0;
                const isStep2Done = isStep1Done && wizardStep > 2;
                const isStep3Done = isStep1Done && suppliers.length > 0;

                const isStepComplete =
                  step.num === 1
                    ? isStep1Done
                    : step.num === 2
                    ? isStep2Done
                    : step.num === 3
                    ? isStep3Done
                    : false;

                const isDone = isStepComplete && wizardStep > step.num;
                const isCurrent = wizardStep === step.num;

                // Step accessibility rules:
                // Step 1: always accessible
                // Step 2 & 3: requires Step 1 (catalog synced)
                // Step 4: requires Step 1 (catalog synced) AND Step 3 (at least one supplier configured)
                const isAccessible =
                  step.num === 1
                    ? true
                    : step.num === 2 || step.num === 3
                    ? isStep1Done
                    : isStep1Done && isStep3Done;

                const handleStepClick = () => {
                  if (step.num === wizardStep) return;

                  if (!isStep1Done && step.num > 1) {
                    shopify.toast.show(
                      "Please connect and sync your Shopify catalog first.",
                      { isError: true },
                    );
                    return;
                  }

                  if (step.num === 4 && suppliers.length === 0) {
                    shopify.toast.show(
                      "Please configure at least one supplier and lead time first.",
                      { isError: true },
                    );
                    return;
                  }

                  if (isAccessible) {
                    setWizardStep(step.num);
                  }
                };

                return (
                  <div
                    key={step.num}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flex: idx < 3 ? 1 : undefined,
                    }}
                  >
                    <div
                      onClick={handleStepClick}
                      title={
                        isAccessible
                          ? `Go to ${step.label}`
                          : "Complete previous steps to unlock"
                      }
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        cursor: isAccessible ? "pointer" : "not-allowed",
                        opacity: isAccessible ? 1 : 0.45,
                        transition: "all 0.2s ease-in-out",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: "700",
                          backgroundColor: isDone
                            ? "#108043"
                            : isCurrent
                            ? "#008060"
                            : "#f6f6f7",
                          color: isDone || isCurrent ? "#ffffff" : "#6d7175",
                          border: isCurrent
                            ? "2px solid #008060"
                            : isDone
                            ? "1px solid #108043"
                            : "1px solid #d2d5d8",
                          boxShadow: isCurrent ? "0 0 0 3px rgba(0, 128, 96, 0.2)" : "none",
                          transition: "all 0.2s ease-in-out",
                        }}
                      >
                        {isDone ? "✓" : step.num}
                      </div>
                      <span
                        style={{
                          marginTop: "6px",
                          fontSize: "12px",
                          fontWeight: isCurrent ? "700" : "500",
                          color: isCurrent ? "#202223" : isAccessible ? "#6d7175" : "#8c9196",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {step.label}
                      </span>
                    </div>

                    {idx < 3 && (
                      <div
                        style={{
                          flex: 1,
                          height: "2px",
                          margin: "0 10px 18px 10px",
                          backgroundColor:
                            idx === 0
                              ? isStep1Done ? "#108043" : "#e1e3e5"
                              : idx === 1
                              ? isStep2Done ? "#108043" : "#e1e3e5"
                              : isStep3Done ? "#108043" : "#e1e3e5",
                          transition: "background-color 0.3s ease",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* STEP 1: SYNC PRODUCTS & ORDERS FROM SHOPIFY */}
          {wizardStep === 1 && (
            <Card padding="600">
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingLg">
                        Step 1: Connect & Sync Store Catalog
                      </Text>
                      <Badge tone="info">Live Store Sync</Badge>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      ClearStock connects to your live Shopify products, real-time inventory, and past 90-day sales history.
                    </Text>
                  </BlockStack>
                  <Button
                    onClick={() => {
                      setGuideDefaultTab("sync");
                      setShowGuideModal(true);
                    }}
                  >
                    📖 How Syncing Works
                  </Button>
                </InlineStack>

                <Divider />

                {/* 🎥 Onboarding Video Walkthrough (Replace src with your YouTube embed URL) */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #dfe3e8",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 18px",
                      backgroundColor: "#f9fafb",
                      borderBottom: "1px solid #e1e3e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px" }}>🎥</span>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#202223" }}>
                          Quickstart Tour: How ClearStock Works (2 Minutes)
                        </div>
                        <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "1px" }}>
                          See how automated reorder alerts, supplier purchase orders, and live inventory sync keep your store 100% stocked.
                        </div>
                      </div>
                    </div>
                    <Badge tone="success">Video Walkthrough</Badge>
                  </div>

                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "52%",
                      height: 0,
                      overflow: "hidden",
                      backgroundColor: "#000000",
                    }}
                  >
                    {/* 👇 REPLACE THIS URL WITH YOUR CUSTOM YOUTUBE VIDEO LINK 👇 */}
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="ClearStock App Walkthrough Tour"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        border: 0,
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    border: "1px solid #e1e3e5",
                    borderRadius: "12px",
                    padding: "20px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>📦</div>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      Products & Variants
                    </Text>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.4" }}>
                      Syncs titles, SKUs, product images, and live stock counts across all your store locations.
                    </p>
                  </div>
                  <div>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>📈</div>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      Historical Sales Pace
                    </Text>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.4" }}>
                      Calculates your 7, 14, 30, and 90-day daily sales pace from past orders to power smart forecasting.
                    </p>
                  </div>
                  <div>
                    <div style={{ fontSize: "20px", marginBottom: "4px" }}>🏭</div>
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      Auto-Vendor Discovery
                    </Text>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.4" }}>
                      Automatically identifies your brand suppliers from Shopify so you can set lead times with 1 click.
                    </p>
                  </div>
                </div>

                {items.length > 0 && (
                  <Banner tone="success" title="Store Data Ingested Successfully!">
                    <p>
                      Found <strong>{items.length} variants</strong> across{" "}
                      <strong>{suppliers.length} vendors</strong>. Historical sales velocity has been cached.
                    </p>
                  </Banner>
                )}

                <InlineStack align="end" gap="300">
                  <Button
                    variant="primary"
                    size="large"
                    loading={isSyncingCatalog}
                    onClick={handleSyncStoreData}
                  >
                    {isSyncingCatalog
                      ? "Querying Shopify GraphQL..."
                      : items.length > 0
                      ? "🔄 Re-Sync Store Data from Shopify"
                      : "⚡ Connect & Ingest Shopify Catalog"}
                  </Button>

                  {items.length > 0 && (
                    <Button variant="secondary" size="large" onClick={() => setWizardStep(2)}>
                      Continue to Plan Selection →
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* STEP 2: CHOOSE PLAN (High-Conversion SaaS Pricing Tiers) */}
          {wizardStep === 2 && (
            <Card padding="600">
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">
                    Step 2: Choose Your Plan
                  </Text>
                  <Text as="p" tone="subdued">
                    Select the replenishment tier that matches your catalog scale. Upgrade or change anytime.
                  </Text>
                </BlockStack>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "20px",
                  }}
                >
                  {/* Starter Tier */}
                  <div
                    onClick={() => setChosenPlan("starter")}
                    style={{
                      border:
                        chosenPlan === "starter"
                          ? "2px solid #008060"
                          : "1px solid #d2d5d8",
                      borderRadius: "14px",
                      padding: "24px",
                      backgroundColor: chosenPlan === "starter" ? "#f0fdf4" : "#ffffff",
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <Text as="h3" variant="headingMd">
                        Starter Plan
                      </Text>
                      {chosenPlan === "starter" && <Badge tone="success">Selected</Badge>}
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223", margin: "12px 0 6px 0" }}>
                      $9 <span style={{ fontSize: "14px", fontWeight: "500", color: "#6d7175" }}>/ month</span>
                    </div>
                    <Text as="p" tone="subdued">
                      Perfect for the serious boutique store testing inventory automation.
                    </Text>
                    <div style={{ marginTop: "16px", borderTop: "1px solid #e1e3e5", paddingTop: "14px" }}>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#5c5f62", lineHeight: "1.7" }}>
                        <li>Max 50 Active SKUs</li>
                        <li>1 Primary Supplier</li>
                        <li>30-Day Sales Velocity (ADS)</li>
                        <li>Automated PO Drafting</li>
                      </ul>
                    </div>
                  </div>

                  {/* Growth Tier (Recommended) */}
                  <div
                    onClick={() => setChosenPlan("growth")}
                    style={{
                      border:
                        chosenPlan === "growth"
                          ? "2px solid #008060"
                          : "1px solid #d2d5d8",
                      borderRadius: "14px",
                      padding: "24px",
                      backgroundColor: chosenPlan === "growth" ? "#f0fdf4" : "#ffffff",
                      cursor: "pointer",
                      position: "relative",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "-12px",
                        left: "24px",
                        backgroundColor: "#008060",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: "700",
                        padding: "3px 10px",
                        borderRadius: "12px",
                      }}
                    >
                      ★ MOST POPULAR (14-DAY TRIAL)
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", marginTop: "4px" }}>
                      <Text as="h3" variant="headingMd">
                        Growth Plan
                      </Text>
                      {chosenPlan === "growth" && <Badge tone="success">Selected</Badge>}
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223", margin: "12px 0 6px 0" }}>
                      $39 <span style={{ fontSize: "14px", fontWeight: "500", color: "#6d7175" }}>/ month</span>
                    </div>
                    <Text as="p" tone="subdued">
                      The sweet spot for the vast majority of growing mid-market merchants.
                    </Text>
                    <div style={{ marginTop: "16px", borderTop: "1px solid #e1e3e5", paddingTop: "14px" }}>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#202223", lineHeight: "1.7" }}>
                        <li><strong>Unlimited SKUs & Variants</strong></li>
                        <li><strong>Multi-Supplier & Custom Lead Times</strong></li>
                        <li>7, 14, 30, and 90D Velocity Toggles</li>
                        <li>Case Pack & MOQ Rounding</li>
                        <li>One-Click Inbound PO Receiving</li>
                      </ul>
                    </div>
                  </div>

                  {/* Scale Tier */}
                  <div
                    onClick={() => setChosenPlan("scale")}
                    style={{
                      border:
                        chosenPlan === "scale"
                          ? "2px solid #008060"
                          : "1px solid #d2d5d8",
                      borderRadius: "14px",
                      padding: "24px",
                      backgroundColor: chosenPlan === "scale" ? "#f0fdf4" : "#ffffff",
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <Text as="h3" variant="headingMd">
                        Scale / Enterprise
                      </Text>
                      {chosenPlan === "scale" && <Badge tone="success">Selected</Badge>}
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223", margin: "12px 0 6px 0" }}>
                      $89 <span style={{ fontSize: "14px", fontWeight: "500", color: "#6d7175" }}>/ month</span>
                    </div>
                    <Text as="p" tone="subdued">
                      For mature operations managing complex logistics and multi-locations.
                    </Text>
                    <div style={{ marginTop: "16px", borderTop: "1px solid #e1e3e5", paddingTop: "14px" }}>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#5c5f62", lineHeight: "1.7" }}>
                        <li>Everything in Growth</li>
                        <li>Multi-Location Stock Balancing</li>
                        <li>Custom Safety Stock Formulas</li>
                        <li>Priority Developer Support & SLAs</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <InlineStack align="space-between" blockAlign="center">
                  <Button onClick={() => setWizardStep(1)}>← Back</Button>
                  <Button
                    variant="primary"
                    size="large"
                    loading={isSavingPlan}
                    onClick={handleSavePlan}
                  >
                    Continue with {chosenPlan.toUpperCase()} Plan →
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* STEP 3: SETUP SUPPLIERS & DETECTED VENDORS */}
          {wizardStep === 3 && (
            <Card padding="600">
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">
                      Step 3: Setup Primary Supplier & Lead Times
                    </Text>
                    <Text as="p" tone="subdued">
                      Lead time is the number of days between placing an order and when units arrive at your warehouse.
                    </Text>
                  </BlockStack>
                  <Button
                    variant="primary"
                    icon={PlusIcon}
                    onClick={() => {
                      if (isStarter && suppliers.length >= 1) {
                        shopify.toast.show(
                          "Starter Plan includes 1 primary supplier. Upgrade to Growth ($39/mo) to add multiple vendors.",
                        );
                        return;
                      }
                      setShowSupplierModal(true);
                    }}
                  >
                    + Add Custom Supplier
                  </Button>
                </InlineStack>

                <Divider />

                {/* Detected Vendors from Shopify */}
                {loaderData?.detectedVendors && loaderData.detectedVendors.length > 0 && (
                  <Card padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          🏷️ Detected Vendors from Your Shopify Products:
                        </Text>
                        <Text as="span" variant="bodyXs" tone="subdued">
                          Click to link lead times instantly
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" wrap>
                        {loaderData.detectedVendors.map((vendorName) => {
                          const alreadyConfigured = suppliers.some(
                            (s) => s.name.toLowerCase() === vendorName.toLowerCase(),
                          );
                          return (
                            <div
                              key={vendorName}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                backgroundColor: alreadyConfigured ? "#f0fdf4" : "#f6f6f7",
                                border: alreadyConfigured
                                  ? "1px solid #bbf7d0"
                                  : "1px solid #d2d5d8",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                fontSize: "13px",
                              }}
                            >
                              <span style={{ fontWeight: "600", color: "#202223" }}>
                                {vendorName}
                              </span>
                              {alreadyConfigured ? (
                                <Badge tone="success">Connected</Badge>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleQuickAddVendor(vendorName)}
                                  style={{
                                    border: "none",
                                    background: "#008060",
                                    color: "#ffffff",
                                    borderRadius: "4px",
                                    padding: "2px 8px",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                  }}
                                >
                                  + Link (14d default)
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                )}

                {/* Configured Suppliers List */}
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Active Suppliers ({suppliers.length}):
                  </Text>

                  {suppliers.length === 0 ? (
                    <div
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        backgroundColor: "#fafbfc",
                        borderRadius: "10px",
                        border: "1px dashed #c9cccf",
                      }}
                    >
                      <Text as="p" tone="subdued">
                        No suppliers connected yet. Add your primary supplier above or link one of your detected vendors.
                      </Text>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {suppliers.map((sup) => (
                        <div
                          key={sup.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "14px 18px",
                            backgroundColor: "#ffffff",
                            border: "1px solid #e1e3e5",
                            borderRadius: "10px",
                          }}
                        >
                          <div>
                            <Text as="span" variant="bodyMd" fontWeight="bold">
                              {sup.name}
                            </Text>
                            <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
                              {sup.email ? `Email: ${sup.email} • ` : ""}
                              Currency: {sup.currency}
                            </div>
                          </div>
                          <Badge tone="info">{`${sup.defaultLeadTime} Days Lead Time`}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </BlockStack>

                <InlineStack align="space-between" blockAlign="center">
                  <Button onClick={() => setWizardStep(2)}>← Back</Button>
                  <Button
                    variant="primary"
                    size="large"
                    disabled={suppliers.length === 0}
                    onClick={() => setWizardStep(4)}
                  >
                    Continue to Restock Review →
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}

          {/* STEP 4: RESTOCK READY & LAUNCH DASHBOARD */}
          {wizardStep === 4 && (
            <Card padding="600">
              <BlockStack gap="500">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingLg">
                      🎉 Step 4: Your Replenishment Engine is Ready!
                    </Text>
                    <Badge tone="success">Setup Complete</Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    ClearStock has reconciled your live catalog against sales velocity and supplier lead times.
                  </Text>
                </BlockStack>

                <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
                  <Card padding="400">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Catalog Variants Tracked
                      </Text>
                      <Text as="p" variant="headingXl">
                        {items.length}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="success">
                        100% Synced with Shopify
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card padding="400">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Connected Suppliers
                      </Text>
                      <Text as="p" variant="headingXl">
                        {suppliers.length}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">
                        Lead times configured
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card padding="400">
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Items Below Reorder Point
                      </Text>
                      <Text
                        as="p"
                        variant="headingXl"
                        tone={summaryMetrics.needingReorderCount > 0 ? "critical" : "success"}
                      >
                        {summaryMetrics.needingReorderCount}
                      </Text>
                      <Text as="span" variant="bodyXs" tone="subdued">
                        {summaryMetrics.needingReorderCount > 0
                          ? "Attention required to prevent stockout"
                          : "Healthy inventory levels"}
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>

                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "700", color: "#166534" }}>
                      Ready to Automate Your Purchasing?
                    </h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#15803d" }}>
                      Your replenishment dashboard will recommend reorders, enforce master carton case packs, and send POs directly to your manufacturers.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="large"
                    onClick={handleCompleteOnboarding}
                  >
                    🚀 Launch Replenishment Dashboard
                  </Button>
                </div>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* VIEW 2: LIVE REPLENISHMENT DASHBOARD                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      {viewMode === "dashboard" && (
        <BlockStack gap="500">
          {isSkuLimitExceeded && (
            <Banner
              tone="warning"
              title="Starter Plan: 50 SKU Limit Active"
              action={{
                content: "Upgrade to Growth ($39/mo)",
                url: "/app/settings#subscription-plan",
              }}
            >
              <Text as="p" variant="bodySm">
                You are currently viewing the top 50 SKUs on the Starter Plan. Your store has {items.length} total active items. Upgrade to the Growth Plan for unlimited catalog monitoring, multi-supplier lead times, and automated PO drafting.
              </Text>
            </Banner>
          )}

          {/* Eye-Friendly Modern KPI Summary Cards (4 Actionable States in 1 Row) */}
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            {/* Card 1: Reorder Now (Urgent Action - Warm Rose Gradient) */}
            <div
              className={`clearstock-kpi-card clearstock-kpi-card--reorder ${filterStatus === "Reorder Now" ? "is-active" : ""}`}
              onClick={() => setFilterStatus(filterStatus === "Reorder Now" ? "all" : "Reorder Now")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFilterStatus(filterStatus === "Reorder Now" ? "all" : "Reorder Now");
                }
              }}
              aria-pressed={filterStatus === "Reorder Now"}
            >
              <div className="clearstock-kpi-header">
                <div className="clearstock-kpi-header-left">
                  <div className="clearstock-kpi-icon-badge">
                    <Icon source={AlertTriangleIcon} />
                  </div>
                  <span className="clearstock-kpi-title">Reorder Now</span>
                </div>
                <div className="clearstock-kpi-header-right" onClick={(e) => e.stopPropagation()}>
                  {filterStatus === "Reorder Now" ? (
                    <span className="clearstock-kpi-active-pill">Filtered ✓</span>
                  ) : (
                    <Tooltip content="Reorder trigger floor (ROP): Items where total stock (OnHand + Inbound on POs) has dropped to or below the safety floor. Suggested purchase orders bring stock up to your optimal Target Stock Level.">
                      <span style={{ cursor: "pointer", display: "inline-flex" }}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="clearstock-kpi-value">
                {summaryMetrics.needingReorderCount}
              </div>
              <div className="clearstock-kpi-footer">
                <span>
                  {summaryMetrics.needingReorderCount > 0
                    ? `Order ${summaryMetrics.totalUnitsToOrder.toLocaleString()} units (~$${summaryMetrics.totalEstimatedSpend.toFixed(0)})`
                    : "No stockout risks detected."}
                </span>
                <span className="clearstock-kpi-action-hint">
                  {filterStatus === "Reorder Now" ? "Showing only" : "View"} →
                </span>
              </div>
            </div>

            {/* Card 2: Incoming (Logistics / In Transit - Soft Sky Gradient) */}
            <div
              className={`clearstock-kpi-card clearstock-kpi-card--incoming ${filterStatus === "Incoming" ? "is-active" : ""}`}
              onClick={() => setFilterStatus(filterStatus === "Incoming" ? "all" : "Incoming")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFilterStatus(filterStatus === "Incoming" ? "all" : "Incoming");
                }
              }}
              aria-pressed={filterStatus === "Incoming"}
            >
              <div className="clearstock-kpi-header">
                <div className="clearstock-kpi-header-left">
                  <div className="clearstock-kpi-icon-badge">
                    <Icon source={DeliveryIcon} />
                  </div>
                  <span className="clearstock-kpi-title">Incoming</span>
                </div>
                <div className="clearstock-kpi-header-right" onClick={(e) => e.stopPropagation()}>
                  {filterStatus === "Incoming" ? (
                    <span className="clearstock-kpi-active-pill">Filtered ✓</span>
                  ) : (
                    <Tooltip content="Inbound stock: Total units across open purchase orders in transit. These count toward your inventory position to prevent double-ordering before delivery.">
                      <span style={{ cursor: "pointer", display: "inline-flex" }}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="clearstock-kpi-value">
                {summaryMetrics.totalInboundOnPOs.toLocaleString()}
              </div>
              <div className="clearstock-kpi-footer">
                <span>Units in transit on active POs</span>
                <span className="clearstock-kpi-action-hint">
                  {filterStatus === "Incoming" ? "Showing only" : "View"} →
                </span>
              </div>
            </div>

            {/* Card 3: Overstocked (Dead Capital Alert - Warm Honey Amber Gradient) */}
            <div
              className={`clearstock-kpi-card clearstock-kpi-card--overstocked ${filterStatus === "Overstocked" ? "is-active" : ""}`}
              onClick={() => setFilterStatus(filterStatus === "Overstocked" ? "all" : "Overstocked")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFilterStatus(filterStatus === "Overstocked" ? "all" : "Overstocked");
                }
              }}
              aria-pressed={filterStatus === "Overstocked"}
            >
              <div className="clearstock-kpi-header">
                <div className="clearstock-kpi-header-left">
                  <div className="clearstock-kpi-icon-badge">
                    <Icon source={CashDollarIcon} />
                  </div>
                  <span className="clearstock-kpi-title">Overstocked</span>
                </div>
                <div className="clearstock-kpi-header-right" onClick={(e) => e.stopPropagation()}>
                  {filterStatus === "Overstocked" ? (
                    <span className="clearstock-kpi-active-pill">Filtered ✓</span>
                  ) : (
                    <Tooltip content="Overstocked value: Cash tied up in products that exceed your Target Stock Level ceiling (+15% buffer). Dead capital is calculated on all units held above your optimal Target Stock Level.">
                      <span style={{ cursor: "pointer", display: "inline-flex" }}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="clearstock-kpi-value">
                ${summaryMetrics.totalDeadCash.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="clearstock-kpi-footer">
                <span>
                  {summaryMetrics.overstockedCount > 0
                    ? `${summaryMetrics.overstockedCount} SKUs overstocked`
                    : "Zero overstocked items"}
                </span>
                <span className="clearstock-kpi-action-hint">
                  {filterStatus === "Overstocked" ? "Showing only" : "View"} →
                </span>
              </div>
            </div>

            {/* Card 4: Stock OK (Healthy Inventory - Soft Emerald Gradient) */}
            <div
              className={`clearstock-kpi-card clearstock-kpi-card--ok ${filterStatus === "Stock OK" ? "is-active" : ""}`}
              onClick={() => setFilterStatus(filterStatus === "Stock OK" ? "all" : "Stock OK")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFilterStatus(filterStatus === "Stock OK" ? "all" : "Stock OK");
                }
              }}
              aria-pressed={filterStatus === "Stock OK"}
            >
              <div className="clearstock-kpi-header">
                <div className="clearstock-kpi-header-left">
                  <div className="clearstock-kpi-icon-badge">
                    <Icon source={CheckIcon} />
                  </div>
                  <span className="clearstock-kpi-title">Stock OK</span>
                </div>
                <div className="clearstock-kpi-header-right" onClick={(e) => e.stopPropagation()}>
                  {filterStatus === "Stock OK" ? (
                    <span className="clearstock-kpi-active-pill">Filtered ✓</span>
                  ) : (
                    <Tooltip content="Healthy inventory: Products operating safely between your Reorder Point floor and optimal Target Stock Level. No replenishment or markdowns needed.">
                      <span style={{ cursor: "pointer", display: "inline-flex" }}>
                        <Icon source={InfoIcon} tone="subdued" />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="clearstock-kpi-value">
                {countByStatus["Stock OK"]}
              </div>
              <div className="clearstock-kpi-footer">
                <span>Healthy stock levels</span>
                <span className="clearstock-kpi-action-hint">
                  {filterStatus === "Stock OK" ? "Showing only" : "View"} →
                </span>
              </div>
            </div>
          </InlineGrid>

          {/* Data Table Container */}
          <Card padding="0">
            {/* Unified Controls Toolbar (Search + Supplier + Active Filter Tags + Sales Window + Math Guide) */}
            <Box
              padding="300"
              background="bg-surface-secondary"
              borderBlockEndWidth="025"
              borderColor="border-secondary"
            >
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                  {/* Left Controls: Search + Supplier Filter */}
                  <InlineStack gap="300" blockAlign="center" wrap>
                    <div style={{ minWidth: "240px", maxWidth: "340px", flex: "1 1 240px" }}>
                      <TextField
                        label="Search products"
                        labelHidden
                        placeholder="Search product, variant, or SKU..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => setSearchQuery("")}
                        prefix={<Icon source={SearchIcon} />}
                        size="slim"
                      />
                    </div>

                    <div style={{ minWidth: "180px" }}>
                      <Select
                        label="Supplier"
                        labelInline
                        options={supplierOptions}
                        value={selectedSupplier}
                        onChange={(val) => setSelectedSupplier(val)}
                      />
                    </div>
                  </InlineStack>

                  {/* Right Controls: Sales Lookback Window */}
                  <InlineStack gap="150" blockAlign="center">
                    <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">
                      Sales Window:
                    </Text>
                    <ButtonGroup variant="segmented">
                      <Button
                        size="slim"
                        pressed={rollingWindow === "7"}
                        onClick={() => handleWindowChange("7")}
                      >
                        {isStarter ? "🔒 7D" : "7D"}
                      </Button>
                      <Button
                        size="slim"
                        pressed={rollingWindow === "14"}
                        onClick={() => handleWindowChange("14")}
                      >
                        {isStarter ? "🔒 14D" : "14D"}
                      </Button>
                      <Button
                        size="slim"
                        pressed={rollingWindow === "30"}
                        onClick={() => handleWindowChange("30")}
                      >
                        30D
                      </Button>
                      <Button
                        size="slim"
                        pressed={rollingWindow === "90"}
                        onClick={() => handleWindowChange("90")}
                      >
                        {isStarter ? "🔒 90D" : "90D"}
                      </Button>
                    </ButtonGroup>
                  </InlineStack>
                </InlineStack>

                {/* Active Filter Badges & Reset Filters Bar */}
                {hasActiveFilters && (
                  <Box paddingBlockStart="100">
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Text as="span" variant="bodySm" tone="subdued" fontWeight="semibold">
                        Active filters:
                      </Text>

                      {filterStatus !== "all" && (
                        <Tag onRemove={() => setFilterStatus("all")}>
                          Status: {filterStatus}
                        </Tag>
                      )}

                      {selectedSupplier !== "all" && (
                        <Tag onRemove={() => setSelectedSupplier("all")}>
                          Supplier:{" "}
                          {supplierOptions.find((s) => s.value === selectedSupplier)?.label ||
                            selectedSupplier}
                        </Tag>
                      )}

                      {searchQuery.trim().length > 0 && (
                        <Tag onRemove={() => setSearchQuery("")}>
                          Search: "{searchQuery}"
                        </Tag>
                      )}

                      {isLookbackChanged && (
                        <Tag
                          onRemove={() =>
                            setRollingWindow(loaderData?.defaultLookbackWindow || "30")
                          }
                        >
                          Window: {rollingWindow}D
                        </Tag>
                      )}

                      <Button
                        variant="plain"
                        tone="critical"
                        onClick={handleClearAll}
                      >
                        Reset filters
                      </Button>
                    </InlineStack>
                  </Box>
                )}
              </BlockStack>
            </Box>

            {/* IndexTable */}
            <div className="clearstock-sticky-table" style={{ overflowX: "auto" }}>
              <IndexTable
                resourceName={{ singular: "item", plural: "items" }}
                itemCount={totalItems}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                promotedBulkActions={[
                  {
                    content: `Create PO from Selected (${selectedResources.length})`,
                    onAction: handleCreatePOFromSelected,
                  },
                ]}
                headings={[
                  { title: "Product & SKU" },
                  { title: "Status" },
                  { title: "Recommended PO" },
                  { title: "Stock on Hand" },
                  { title: "On Order" },
                  { title: "Reorder Point" },
                  { title: `Velocity (${rollingWindow}d ADS)` },
                  { title: "Supplier" },
                  { title: "Details" },
                ]}
              >
                {paginatedRows.length === 0 ? (
                  <IndexTable.Row id="empty-row" position={0}>
                    <IndexTable.Cell colSpan={9}>
                      <div style={{ textAlign: "center", padding: "40px" }}>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {searchQuery || selectedSupplier !== "all" || filterStatus !== "all"
                            ? "No items match your filter criteria."
                            : "No replenishment items configured yet."}
                        </Text>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ) : (
                  paginatedRows.map((row, index) => {
                    const isSelected = selectedResources.includes(row.id);
                    const calc = row.calc;

                    return (
                      <IndexTable.Row
                        id={row.id}
                        key={row.id}
                        selected={isSelected}
                        position={index}
                      >
                        {/* 1. Product & SKU */}
                        <IndexTable.Cell>
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            {row.imageUrl ? (
                              <Thumbnail source={row.imageUrl} alt={row.title} size="small" />
                            ) : (
                              <div
                                style={{
                                  width: "40px",
                                  height: "40px",
                                  backgroundColor: "#f4f6f8",
                                  borderRadius: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "18px",
                                }}
                              >
                                📦
                              </div>
                            )}
                            <BlockStack gap="050">
                              <Text as="span" variant="bodySm" fontWeight="bold">
                                {row.title}
                              </Text>
                              {row.variantTitle && (
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  {row.variantTitle}
                                </Text>
                              )}
                              <InlineStack gap="100" blockAlign="center">
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  SKU: {row.sku || "N/A"}
                                </Text>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  •
                                </Text>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  {row.supplierName}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                        </IndexTable.Cell>

                        {/* 2. Status (Immediate visual priority) */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={
                              calc.statusLabel === "Reorder Now"
                                ? `⚠️ Reorder Now: Total stock (${calc.effectiveStock} = ${row.stockOnHand} on hand + ${row.stockOnOrder} on order) is at or below your order trigger floor (${calc.reorderPoint}). Order ${calc.recommendedUnits} units to restock up to your Target Stock Level (${calc.targetStockLevel}).`
                                : calc.statusLabel === "Incoming"
                                ? `🚚 Incoming: Shelf stock (${row.stockOnHand}) has hit the safety floor, but ${row.stockOnOrder} inbound units on open POs bring total stock to ${calc.effectiveStock}, covering lead-time demand.`
                                : calc.statusLabel === "Overstocked"
                                ? `📦 Overstocked: You have ${row.stockOnHand.toLocaleString()} units on hand, which exceeds your Target Stock Level ceiling of ${calc.targetStockLevel} units (+15% buffer = ${calc.overstockThreshold} units). Dead capital ($${calc.deadCashValue.toLocaleString()}) is calculated on all units held above your optimal Target Stock Level.`
                                : `✅ Stock OK: Total stock (${calc.effectiveStock}) is safely above your order trigger floor (${calc.reorderPoint}) and within your target ceiling (${calc.overstockThreshold} units). No reorder needed.`
                            }
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help", display: "inline-block" }}>
                              <Badge tone={calc.statusTone}>{calc.statusLabel}</Badge>
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 3. Recommended PO */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={
                              calc.recommendedUnits > 0
                                ? `Suggested replenishment: You need ${calc.rawDeficit} units to reach your Target Stock Level (${calc.targetStockLevel} units = ROP ${calc.reorderPoint} + ${calc.cycleStock} cycle stock). Adjusted to ${calc.recommendedUnits} units (${calc.casesCount} case${calc.casesCount === 1 ? "" : "s"}) to meet supplier MOQ (${row.minOrderQty}) and case pack multiple (${row.packSize}).`
                                : `No order needed: Total stock (${calc.effectiveStock} units) is above your order trigger floor (${calc.reorderPoint} units). Strict ROP Gate prevents premature top-ups.`
                            }
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help" }}>
                              {calc.recommendedUnits > 0 ? (
                                <BlockStack gap="050">
                                  <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">
                                    {calc.recommendedUnits} units
                                  </Text>
                                  <Text as="span" variant="bodyXs" tone="subdued">
                                    {calc.casesCount} cases (MOQ {row.minOrderQty})
                                  </Text>
                                </BlockStack>
                              ) : (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  0 units
                                </Text>
                              )}
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 4. Stock on Hand */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={`What's left: You have ${row.stockOnHand.toLocaleString()} units available. Selling ${calc.ads.toFixed(1)} per day, this will last roughly ${calc.daysOfCoverageOnHand} days before you run out.`}
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help" }}>
                              <Text as="span" variant="bodySm" fontWeight="bold">
                                {row.stockOnHand.toLocaleString()}
                              </Text>
                              <Text as="p" variant="bodyXs" tone="subdued">
                                {calc.daysOfCoverageOnHand > 0
                                  ? `${calc.daysOfCoverageOnHand}d runway`
                                  : "0d runway"}
                              </Text>
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 5. On Order */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={
                              row.stockOnOrder > 0
                                ? `Units already bought: You have ${row.stockOnOrder} units across active purchase orders. We count these so you don't accidentally order the same stock twice.`
                                : "No units on order: You don't have any pending purchase orders for this item."
                            }
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help", display: "inline-block" }}>
                              {row.stockOnOrder > 0 ? (
                                <Badge tone="info">{`+${row.stockOnOrder}`}</Badge>
                              ) : (
                                <Text as="span" variant="bodySm" tone="subdued">
                                  —
                                </Text>
                              )}
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 6. Reorder Point */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={`Order trigger floor (ROP): When total available stock drops to ${calc.reorderPoint} units, place an order. Covers sales during ${row.leadTimeDays}d delivery (${calc.leadTimeDemand} units) plus safety buffer (${calc.safetyStock} units${row.safetyStockMinimum > 0 && calc.safetyStock === row.safetyStockMinimum ? ` - enforced by ${row.safetyStockMinimum} unit floor` : ""}).`}
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help" }}>
                              <Text as="span" variant="bodySm" fontWeight="bold">
                                {calc.reorderPoint}
                              </Text>
                              <Text as="p" variant="bodyXs" tone="subdued">
                                Safety: {calc.safetyStock}
                              </Text>
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 7. Velocity (ADS) */}
                        <IndexTable.Cell>
                          {(() => {
                            const windowUnitsSold =
                              rollingWindow === "7"
                                ? row.unitsSold7d
                                : rollingWindow === "14"
                                ? row.unitsSold14d
                                : rollingWindow === "90"
                                ? row.unitsSold90d
                                : row.unitsSold30d;

                            return (
                              <Tooltip
                                content={`How fast it sells: You're selling about ${calc.ads.toFixed(1)} units a day, based on ${windowUnitsSold} total sales over the last ${rollingWindow} days.`}
                                dismissOnMouseOut
                              >
                                <div style={{ cursor: "help" }}>
                                  <Text as="span" variant="bodySm" fontWeight="bold">
                                    {calc.ads.toFixed(1)} units/d
                                  </Text>
                                  <Text as="p" variant="bodyXs" tone="subdued">
                                    {windowUnitsSold} sold in {rollingWindow}d
                                  </Text>
                                </div>
                              </Tooltip>
                            );
                          })()}
                        </IndexTable.Cell>

                        {/* 8. Supplier */}
                        <IndexTable.Cell>
                          <Tooltip
                            content={`Delivery speed: It takes about ${row.leadTimeDays} days from the day you order from ${row.supplierName} until items arrive at your door.`}
                            dismissOnMouseOut
                          >
                            <div style={{ cursor: "help" }}>
                              <Text as="span" variant="bodySm">
                                {row.supplierName}
                              </Text>
                              <Text as="p" variant="bodyXs" tone="subdued">
                                {row.leadTimeDays}d lead time
                              </Text>
                            </div>
                          </Tooltip>
                        </IndexTable.Cell>

                        {/* 9. Actions */}
                        <IndexTable.Cell>
                          <InlineStack gap="150" blockAlign="center">
                            {calc.recommendedUnits > 0 && (
                              <Button
                                size="slim"
                                variant="primary"
                                onClick={() => {
                                  navigate(
                                    `/app/purchase-orders/new?items=${row.id}&window=${rollingWindow}&returnTo=/app`,
                                  );
                                }}
                              >
                                Draft PO
                              </Button>
                            )}
                            <Button
                              size="slim"
                              onClick={() => {
                                setMathModalTab("story");
                                setActiveMathItem(row);
                              }}
                            >
                              Inspect
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })
                )}
              </IndexTable>
            </div>

            {/* Pagination footer */}
            <Box padding="400" borderBlockStartWidth="025" borderColor="border-secondary">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="span" variant="bodySm" tone="subdued">
                  Showing {totalItems > 0 ? startIndex + 1 : 0}–{endIndex} of {totalItems} items
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <Select
                    label="Per page"
                    labelInline
                    options={[
                      { label: "10", value: "10" },
                      { label: "25", value: "25" },
                      { label: "50", value: "50" },
                      { label: "100", value: "100" },
                    ]}
                    value={String(pageSize)}
                    onChange={(val) => setPageSize(parseInt(val, 10))}
                  />
                  <ButtonGroup>
                    <Button
                      size="slim"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="slim"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </ButtonGroup>
                </InlineStack>
              </InlineStack>
            </Box>
          </Card>
        </BlockStack>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MODALS & OVERLAYS                                            */}
      {/* ════════════════════════════════════════════════════════════ */}

      {/* 1. Add Supplier Modal (Step 3 or Header) */}
      <Modal
        open={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title="Add New Supplier"
        primaryAction={{
          content: isAddingSupplier ? "Saving..." : "Save Supplier",
          disabled: !newSupplierName.trim() || isAddingSupplier,
          onAction: handleCreateSupplier,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowSupplierModal(false),
          },
        ]}
      >
        <Modal.Section>
          <form onSubmit={handleCreateSupplier}>
            <BlockStack gap="400">
              <TextField
                label="Supplier Name"
                value={newSupplierName}
                onChange={setNewSupplierName}
                placeholder="e.g. Apex Apparel Ltd."
                autoComplete="off"
                requiredIndicator
              />
              <TextField
                label="Contact Email"
                type="email"
                value={newSupplierEmail}
                onChange={setNewSupplierEmail}
                placeholder="orders@apexapparel.com"
                autoComplete="off"
                helpText="Purchase order PDFs will be addressed to this email."
              />
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                <TextField
                  label="Default Lead Time (Days)"
                  type="number"
                  value={newSupplierLeadTime}
                  onChange={setNewSupplierLeadTime}
                  autoComplete="off"
                  helpText="Total calendar days from PO placement to delivery."
                />
                <Select
                  label="Currency"
                  options={[
                    { label: "USD ($)", value: "USD" },
                    { label: "CAD ($)", value: "CAD" },
                    { label: "EUR (€)", value: "EUR" },
                    { label: "GBP (£)", value: "GBP" },
                    { label: "AUD ($)", value: "AUD" },
                  ]}
                  value={newSupplierCurrency}
                  onChange={setNewSupplierCurrency}
                />
              </InlineGrid>
              <TextField
                label="Notes / Terms"
                value={newSupplierNotes}
                onChange={setNewSupplierNotes}
                multiline={2}
                placeholder="Payment terms: Net 30. Port of entry: Los Angeles."
                autoComplete="off"
              />
            </BlockStack>
          </form>
        </Modal.Section>
      </Modal>

      {/* 2. Math Inspection Modal (Dual-View: Plain English Story + 10-Step Formula) */}
      <Modal
        open={Boolean(activeMathItem)}
        onClose={() => setActiveMathItem(null)}
        title={`Replenishment Analysis: ${activeMathItem?.title}`}
        primaryAction={
          activeMath && activeMath.recommendedUnits > 0
            ? {
                content: `Draft PO (${activeMath.recommendedUnits} units)`,
                onAction: () => {
                  const itemId = activeMathItem?.id;
                  setActiveMathItem(null);
                  if (itemId) {
                    navigate(
                      `/app/purchase-orders/new?items=${itemId}&window=${rollingWindow}&returnTo=/app`,
                    );
                  }
                },
              }
            : undefined
        }
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setActiveMathItem(null),
          },
        ]}
      >
        <Modal.Section>
          {activeMath && activeMathItem && (
            <BlockStack gap="400">
              {/* Header Context & Dual-View Toggle */}
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <BlockStack gap="050">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      SKU: {activeMathItem.sku}
                    </Text>
                    <Badge tone={activeMath.statusTone}>{activeMath.statusLabel}</Badge>
                  </InlineStack>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Supplier: <strong>{activeMathItem.supplierName}</strong> • Unit Cost: <strong>${activeMathItem.unitCost.toFixed(2)}</strong>
                  </Text>
                </BlockStack>

                <ButtonGroup variant="segmented">
                  <Button
                    size="slim"
                    pressed={mathModalTab === "story"}
                    onClick={() => setMathModalTab("story")}
                  >
                    📖 Plain English Story
                  </Button>
                  <Button
                    size="slim"
                    pressed={mathModalTab === "formula"}
                    onClick={() => setMathModalTab("formula")}
                  >
                    🧮 10-Step Formula Audit
                  </Button>
                </ButtonGroup>
              </InlineStack>

              <Divider />

              {/* VIEW 1: PLAIN ENGLISH STORY (Non-Technical Merchant View) */}
              {mathModalTab === "story" &&
                (() => {
                  const windowUnitsSold =
                    rollingWindow === "7"
                      ? activeMathItem.unitsSold7d
                      : rollingWindow === "14"
                      ? activeMathItem.unitsSold14d
                      : rollingWindow === "90"
                      ? activeMathItem.unitsSold90d
                      : activeMathItem.unitsSold30d;

                  return (
                    <BlockStack gap="300">
                      {/* Step 1: Sales Speed */}
                      <div className="clearstock-story-card clearstock-story-card--slate">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm" fontWeight="bold">
                            1. ⚡ Sales Speed
                          </Text>
                          <span className="clearstock-story-badge">
                            {activeMath.ads.toFixed(1)} units / day
                          </span>
                        </InlineStack>
                        <Text as="p" variant="bodyMd">
                          You are currently selling <strong>{activeMath.ads.toFixed(1)} units/day</strong> based on <strong>{windowUnitsSold} units sold</strong> over the last <strong>{rollingWindow} days</strong>.
                        </Text>
                        <Text as="p" variant="bodyXs" tone="subdued">
                          {activeMath.ads > 0
                            ? `At this velocity, customers purchase 1 unit roughly every ${(1 / activeMath.ads).toFixed(1)} days.`
                            : "No recorded sales during this lookback window."}
                        </Text>
                      </div>

                      {/* Step 2: Safety Floor */}
                      <div className="clearstock-story-card clearstock-story-card--rose">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm" fontWeight="bold">
                            2. 🛡️ Your Safety Floor (When to order)
                          </Text>
                          <span className="clearstock-story-badge">
                            Reorder Point: {activeMath.reorderPoint} units
                          </span>
                        </InlineStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd">
                            • <strong>{activeMath.leadTimeDemand} units</strong> needed to cover customer sales while waiting <strong>{activeMathItem.leadTimeDays} days</strong> for delivery from {activeMathItem.supplierName}.
                          </Text>
                          <Text as="p" variant="bodyMd">
                            • <strong>+ {activeMath.safetyStock} units</strong> kept as a safety cushion ({activeMathItem.safetyStockDays} days of buffer{activeMath.formulaMultiplier !== 1.0 ? ` × ${activeMath.formulaMultiplier}x ${activeMath.safetyFormulaModel === "surge" ? "Surge Protection" : activeMath.safetyFormulaModel === "aggressive" ? "Aggressive Peak" : "Lean JIT"} model` : ""}{activeMathItem.safetyStockMinimum > 0 && activeMath.safetyStock === activeMathItem.safetyStockMinimum ? ` - enforced by your ${activeMathItem.safetyStockMinimum}-unit floor` : ""}).
                          </Text>
                          <Divider />
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            = <strong>{activeMath.reorderPoint} units (Reorder Point)</strong>. You should place an order the moment your total available stock reaches or falls below this floor.
                          </Text>
                        </BlockStack>
                      </div>

                      {/* Step 3: Target Ceiling */}
                      <div className="clearstock-story-card clearstock-story-card--sky">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm" fontWeight="bold">
                            3. 🎯 Your Target Ceiling (How much to hold)
                          </Text>
                          <span className="clearstock-story-badge">
                            Target Level: {activeMath.targetStockLevel} units
                          </span>
                        </InlineStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd">
                            • <strong>+ {activeMath.cycleStock} units</strong> needed to cover your standard <strong>{activeMath.reorderFrequencyDays}-day order cycle</strong> (preventing frequent small orders).
                          </Text>
                          <Divider />
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            = <strong>{activeMath.targetStockLevel} units (Target Stock Level)</strong>. This is your ideal total inventory immediately after a new delivery arrives.
                          </Text>
                        </BlockStack>
                      </div>

                      {/* Step 4: The Recommended Order */}
                      <div
                        className={`clearstock-story-card ${activeMath.isBelowReorderPoint ? "clearstock-story-card--action-needed" : "clearstock-story-card--emerald"}`}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm" fontWeight="bold">
                            4. 📦 The Recommended Order
                          </Text>
                          <Badge tone={activeMath.isBelowReorderPoint ? "critical" : "success"}>
                            {activeMath.isBelowReorderPoint ? "Order Needed" : "Stock Healthy"}
                          </Badge>
                        </InlineStack>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodyMd">
                            You currently have <strong>{activeMath.stockOnHand} units on hand</strong>
                            {activeMath.stockOnOrder > 0
                              ? ` + ${activeMath.stockOnOrder} units in transit on open POs = ${activeMath.effectiveStock} total units available.`
                              : "."}
                          </Text>

                          {activeMath.isBelowReorderPoint ? (
                            <BlockStack gap="150">
                              <Text as="p" variant="bodyMd">
                                Because available stock ({activeMath.effectiveStock}) is at or below your <strong>{activeMath.reorderPoint}-unit floor</strong>, you are short by <strong>{activeMath.rawDeficit} units</strong> to reach your {activeMath.targetStockLevel}-unit target.
                              </Text>
                              <div className="clearstock-recommendation-box">
                                <Text as="p" variant="bodyMd" fontWeight="bold">
                                  👉 Recommendation: Order {activeMath.recommendedUnits} units ({activeMath.casesCount} cases) (~${(activeMath.recommendedUnits * activeMathItem.unitCost).toFixed(2)})
                                </Text>
                                <Text as="p" variant="bodyXs" tone="subdued">
                                  Respects {activeMathItem.supplierName}'s minimum order of {activeMathItem.minOrderQty} units and case pack of {activeMathItem.packSize} units/box.
                                </Text>
                              </div>
                            </BlockStack>
                          ) : (
                            <div className="clearstock-recommendation-box clearstock-recommendation-box--ok">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                👉 No order needed today.
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Your stock ({activeMath.effectiveStock} units) is safely above your {activeMath.reorderPoint}-unit Reorder Point. ClearStock will automatically recommend an order when stock drops to {activeMath.reorderPoint}.
                              </Text>
                            </div>
                          )}
                        </BlockStack>
                      </div>

                      {/* Step 5: Health Check */}
                      <div
                        className={`clearstock-story-card ${activeMath.isOverstocked ? "clearstock-story-card--amber" : "clearstock-story-card--emerald"}`}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm" fontWeight="bold">
                            5. 🩺 Inventory Health & Capital Check
                          </Text>
                          <span className="clearstock-story-badge">
                            Ceiling: {activeMath.overstockThreshold} units
                          </span>
                        </InlineStack>
                        {activeMath.isOverstocked ? (
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd">
                              🟡 <strong>Overstocked:</strong> You have {activeMath.stockOnHand} units on hand, which exceeds your {activeMath.overstockThreshold}-unit overstock ceiling (Target + 15% tolerance).
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              💰 <strong>${activeMath.deadCashValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> in dead capital is tied up in {activeMath.stockOnHand - activeMath.targetStockLevel} excess units above your optimal target.
                            </Text>
                            <Text as="p" variant="bodyXs" tone="subdued">
                              Tip: Consider a seasonal promotion, bundle, or discount to free up this working capital.
                            </Text>
                          </BlockStack>
                        ) : (
                          <Text as="p" variant="bodyMd">
                            🟢 <strong>Stock is Healthy:</strong> You are safely within your target boundaries and well below your overstock threshold of {activeMath.overstockThreshold} units. Zero dead capital detected.
                          </Text>
                        )}
                      </div>
                    </BlockStack>
                  );
                })()}

              {/* VIEW 2: 10-STEP FORMULA AUDIT (Raw Engineering / Accounting View) */}
              {mathModalTab === "formula" && (
                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "1px solid #e1e3e5",
                    fontSize: "13px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div>
                    <strong>1. Average Daily Sales (ADS):</strong>{" "}
                    <code>{activeMath.ads.toFixed(1)} units/day</code> ({rollingWindow}-day window, exact: <code>{activeMath.ads.toFixed(4)}</code>)
                  </div>
                  <div>
                    <strong>2. Lead Time Demand:</strong>{" "}
                    <code>{activeMath.ads.toFixed(4)} × {activeMathItem.leadTimeDays}d = {activeMath.leadTimeDemand} units</code>
                  </div>
                  <div>
                    <strong>3. Safety Stock Buffer:</strong>{" "}
                    <code>{activeMath.safetyStock} units</code> (Formula: {activeMathItem.safetyStockDays}d coverage{activeMath.formulaMultiplier !== 1.0 ? ` × ${activeMath.formulaMultiplier}x model` : ""}: {Math.round(activeMath.ads * activeMathItem.safetyStockDays * activeMath.formulaMultiplier)} units, Floor Min: {activeMathItem.safetyStockMinimum} units)
                  </div>
                  <div>
                    <strong>4. Reorder Point (ROP Floor):</strong>{" "}
                    <code>{activeMath.leadTimeDemand} + {activeMath.safetyStock} = {activeMath.reorderPoint} units</code>
                  </div>
                  <div>
                    <strong>5. Cycle Stock (Order Cycle):</strong>{" "}
                    <code>{activeMath.ads.toFixed(4)} × {activeMath.reorderFrequencyDays}d = {activeMath.cycleStock} units</code>
                  </div>
                  <div>
                    <strong>6. Target Stock Level (Ceiling):</strong>{" "}
                    <code>ROP ({activeMath.reorderPoint}) + Cycle Stock ({activeMath.cycleStock}) = {activeMath.targetStockLevel} units</code>
                  </div>
                  <div>
                    <strong>7. Current Stock Position:</strong>{" "}
                    <code>OnHand ({activeMath.stockOnHand}) + Inbound ({activeMath.stockOnOrder}) = {activeMath.effectiveStock} units</code>
                  </div>
                  <div>
                    <strong>8. Purchase Quantity (Deficit):</strong>{" "}
                    <code>{activeMath.isBelowReorderPoint ? `Target (${activeMath.targetStockLevel}) - Effective (${activeMath.effectiveStock}) = ${activeMath.rawDeficit} units` : "0 units (Strict ROP Gate: Stock is above ROP floor - No order needed)"}</code>
                  </div>
                  <div>
                    <strong>9. Case Pack & MOQ Rounding:</strong>{" "}
                    <code>MOQ: {activeMathItem.minOrderQty}, Pack Size: {activeMathItem.packSize} → {activeMath.recommendedUnits} units ({activeMath.casesCount} cases)</code>
                  </div>
                  <div>
                    <strong>10. Overstock & Dead Capital:</strong>{" "}
                    <code>Target ({activeMath.targetStockLevel}) × 1.15 = {activeMath.overstockThreshold} units threshold. {activeMath.isOverstocked ? `Dead Capital: (${activeMath.stockOnHand} OnHand - ${activeMath.targetStockLevel} Target) × $${activeMathItem.unitCost.toFixed(2)} = $${activeMath.deadCashValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not overstocked"}. (Dead capital is calculated on all units held above your optimal Target Stock Level.)</code>
                  </div>
                </div>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      {/* 3. Setup Guide & Technical Playbook Modal */}
      <ClearStockGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        defaultTab={guideDefaultTab}
      />

      {/* 4. Support & Help Desk Modal */}
      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        shop={shop}
        plan={selectedPlan}
      />

      {/* 5. Sticky Floating PO Creation Bar (Eliminates scrolling to top after selecting products) */}
      {viewMode === "dashboard" && selectedResources.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "28px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 999,
            backgroundColor: "#202223",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "30px",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>📦</span>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>
              {selectedResources.length} {selectedResources.length === 1 ? "item" : "items"} selected
            </span>
          </div>

          <div
            style={{
              width: "1px",
              height: "20px",
              backgroundColor: "rgba(255, 255, 255, 0.2)",
            }}
          />

          <button
            type="button"
            onClick={handleCreatePOFromSelected}
            style={{
              backgroundColor: "#008060",
              color: "#ffffff",
              border: "none",
              borderRadius: "20px",
              padding: "7px 18px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            <span>Create Purchase Order</span>
            <span style={{ fontSize: "14px" }}>→</span>
          </button>

          <button
            type="button"
            onClick={clearSelection}
            style={{
              backgroundColor: "transparent",
              color: "#b4b7ba",
              border: "none",
              fontSize: "12px",
              fontWeight: "500",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
