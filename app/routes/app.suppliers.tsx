import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError, useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Modal,
  TextField,
  Select,
  Banner,
  EmptyState,
  Divider,
  Box,
  Combobox,
  Listbox,
  Icon,
  Checkbox,
  Tag,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, LinkIcon, SearchIcon, ProductIcon, RefreshIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ingestShopifyProduct } from "../webhook-handler.server";

export interface SupplierItem {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  defaultLeadTime: number;
  currency: string;
  notes: string;
  assignedRulesCount: number;
  activeOrdersCount: number;
  createdAt: string;
}

export interface RuleItem {
  id: string;
  variantId: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  title: string;
  variantTitle: string;
  sku: string;
  unitCost: number;
  packSize: number;
  minOrderQty: number;
  leadTimeDays: number | null;
  safetyStockMinimum: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all suppliers for this shop
  let suppliersDb = await prisma.supplier.findMany({
    where: { shop },
    include: {
      rules: true,
      purchaseOrders: true,
    },
    orderBy: { name: "asc" },
  });

  // Fetch all rules
  const rulesDb = await prisma.variantSupplierRule.findMany({
    where: { shop },
    include: { supplier: true },
    orderBy: { variantId: "asc" },
  });

  const suppliers: SupplierItem[] = suppliersDb.map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName || "",
    email: s.email || "",
    phone: s.phone || "",
    defaultLeadTime: s.defaultLeadTime || 14,
    currency: s.currency || "USD",
    notes: s.notes || "",
    assignedRulesCount: s.rules.length,
    activeOrdersCount: s.purchaseOrders.filter((po) => po.status === "ORDERED" || po.status === "DRAFT").length,
    createdAt: new Date(s.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }));

  const rules: RuleItem[] = rulesDb.map((r) => {
    return {
      id: r.id,
      variantId: r.variantId,
      productId: r.productId || "",
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      title: r.title || "Untitled Product",
      variantTitle: r.variantTitle || "",
      sku: r.supplierSku || "",
      unitCost: Number(r.unitCost),
      packSize: r.packSize,
      minOrderQty: r.minOrderQty,
      leadTimeDays: r.leadTimeDays,
      safetyStockMinimum: r.safetyStockMinimum ?? 0,
    };
  });

  const appSettings = await prisma.appSettings.findFirst({ where: { shop } });
  const selectedPlan = appSettings?.selectedPlan || "growth";

  return { suppliers, rules, selectedPlan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "CREATE_SUPPLIER") {
    const appSettings = await prisma.appSettings.findFirst({ where: { shop } });
    const selectedPlan = appSettings?.selectedPlan || "growth";
    if (selectedPlan === "starter") {
      const existingCount = await prisma.supplier.count({ where: { shop } });
      if (existingCount >= 1) {
        return {
          ok: false,
          error: "Starter Plan ($9/mo) includes 1 primary supplier. Upgrade to Growth ($39/mo) to connect unlimited suppliers and lead times.",
        };
      }
    }

    const name = String(formData.get("name") || "").trim();
    const contactName = String(formData.get("contactName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const defaultLeadTime = Math.max(1, parseInt(String(formData.get("defaultLeadTime") || "14"), 10));
    const currency = String(formData.get("currency") || "USD").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!name) {
      return { ok: false, error: "Supplier name is required." };
    }

    const created = await prisma.supplier.create({
      data: {
        shop,
        name,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        defaultLeadTime,
        currency,
        notes: notes || null,
      },
    });

    return { ok: true, action: "created", supplier: created };
  }

  if (intent === "UPDATE_SUPPLIER") {
    const id = String(formData.get("id"));
    const name = String(formData.get("name") || "").trim();
    const contactName = String(formData.get("contactName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const defaultLeadTime = Math.max(1, parseInt(String(formData.get("defaultLeadTime") || "14"), 10));
    const currency = String(formData.get("currency") || "USD").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!name) {
      return { ok: false, error: "Supplier name is required." };
    }

    const existing = await prisma.supplier.findFirst({
      where: { id, shop },
    });
    if (!existing) {
      return { ok: false, error: "Supplier not found or does not belong to this store." };
    }

    const updated = await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        defaultLeadTime,
        currency,
        notes: notes || null,
      },
    });

    return { ok: true, action: "updated", supplier: updated };
  }

  // ASSIGN or REASSIGN SKU to a Supplier (Supports Single & Multi-Select)
  if (intent === "ASSIGN_SKU") {
    const variantIdsJson = formData.get("variantIds");
    const parsedVariantIds = variantIdsJson ? (JSON.parse(String(variantIdsJson)) as string[]) : [];
    const singleVariantId = String(formData.get("variantId") || "");
    const variantIds = parsedVariantIds.length > 0 ? parsedVariantIds : singleVariantId ? [singleVariantId] : [];

    const supplierId = String(formData.get("supplierId"));
    const applyToAllVariants = formData.get("applyToAllVariants") === "true";
    const unitCostStr = formData.get("unitCost");
    const hasUnitCostOverride = Boolean(unitCostStr && String(unitCostStr).trim() !== "" && parseFloat(String(unitCostStr)) > 0);
    const unitCost = hasUnitCostOverride ? parseFloat(String(unitCostStr)) : 0;
    const packSize = Math.max(1, parseInt(String(formData.get("packSize") || "1"), 10));
    const minOrderQty = Math.max(1, parseInt(String(formData.get("minOrderQty") || "1"), 10));
    const safetyStockMinimumStr = formData.get("safetyStockMinimum");
    const safetyStockMinimum =
      safetyStockMinimumStr !== null && String(safetyStockMinimumStr).trim() !== ""
        ? Math.max(0, parseInt(String(safetyStockMinimumStr), 10))
        : 0;
    const leadTimeStr = formData.get("leadTimeDays");
    const leadTimeDays = leadTimeStr ? parseInt(String(leadTimeStr), 10) : null;
    const syncVendor = formData.get("syncToShopifyVendor") === "true";
    const syncCost = formData.get("syncToShopifyCost") === "true";

    if (variantIds.length === 0) {
      return { ok: false, error: "No products or variants selected." };
    }

    const sup = await prisma.supplier.findFirst({
      where: { id: supplierId, shop },
    });
    if (!sup) {
      return { ok: false, error: "Supplier not found or does not belong to this store." };
    }

    // Find all directly selected rules
    const directlySelectedRules = await prisma.variantSupplierRule.findMany({
      where: {
        shop,
        variantId: { in: variantIds },
      },
    });

    if (directlySelectedRules.length === 0) {
      return { ok: false, error: "Selected variants not found in sourcing rules." };
    }

    // If applyToAllVariants is active, expand to include all variants sharing the same productIds
    let targetRules = directlySelectedRules;
    if (applyToAllVariants) {
      const productIds = Array.from(new Set(directlySelectedRules.map((r) => r.productId).filter(Boolean))) as string[];
      if (productIds.length > 0) {
        targetRules = await prisma.variantSupplierRule.findMany({
          where: {
            shop,
            productId: { in: productIds },
          },
        });
      }
    }

    const targetRuleIds = targetRules.map((r) => r.id);
    const updateData: any = {
      supplierId: sup.id,
      packSize,
      minOrderQty,
      safetyStockMinimum,
      ...(leadTimeDays !== null ? { leadTimeDays } : {}),
    };
    if (hasUnitCostOverride) {
      updateData.unitCost = unitCost;
    }

    // 1. Update rules in ClearStock PostgreSQL scoped to shop
    await prisma.variantSupplierRule.updateMany({
      where: { id: { in: targetRuleIds }, shop },
      data: updateData,
    });

    // 2. Optional Two-Way Live Sync of Vendor to Shopify (Product Level)
    if (syncVendor && sup) {
      const distinctProductIds = Array.from(
        new Set(targetRules.map((r) => r.productId).filter((id): id is string => Boolean(id && id.startsWith("gid://shopify/Product/")))),
      );
      for (const prodId of distinctProductIds) {
        try {
          await admin.graphql(
            `#graphql
            mutation updateProductVendor($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  vendor
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                input: {
                  id: prodId,
                  vendor: sup.name,
                },
              },
            },
          );
        } catch (e) {
          console.warn("Two-way Shopify vendor sync skipped:", e);
        }
      }
    }

    // 3. Optional Two-Way Live Sync of Unit Cost to Shopify COGS (Variant Level)
    if (syncCost && hasUnitCostOverride) {
      for (const rule of targetRules) {
        if (rule.inventoryItemId?.startsWith("gid://shopify/InventoryItem/")) {
          try {
            await admin.graphql(
              `#graphql
              mutation updateInventoryCost($id: ID!, $input: InventoryItemInput!) {
                inventoryItemUpdate(id: $id, input: $input) {
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  id: rule.inventoryItemId,
                  input: {
                    cost: unitCost,
                  },
                },
              },
            );
          } catch (e) {
            console.warn("Two-way Shopify COGS sync skipped:", e);
          }
        }
      }
    }

    return {
      ok: true,
      action: "sku_assigned",
      count: targetRules.length,
      supplierName: sup?.name || "supplier",
    };
  }

  // Manual Live Store Catalog Ingestion from Shopify
  if (intent === "SYNC_FROM_SHOPIFY") {
    try {
      const response = await admin.graphql(`
        #graphql
        query GetAllStoreProductsForSync {
          products(first: 50) {
            edges {
              node {
                id
                title
                vendor
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryItem {
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
      const resJson = await response.json();
      const productEdges = resJson.data?.products?.edges || [];
      let importedProducts = 0;

      for (const edge of productEdges) {
        const prod = edge.node;
        await ingestShopifyProduct(
          {
            id: prod.id,
            title: prod.title,
            vendor: prod.vendor,
            variants: prod.variants?.edges?.map((ve: any) => ({
              id: ve.node.id,
              title: ve.node.title,
              sku: ve.node.sku,
              price: ve.node.price,
              inventory_item_id: ve.node.inventoryItem?.id,
            })),
          },
          shop
        );
        importedProducts++;
      }

      return {
        ok: true,
        action: "synced",
        message: `Synced ${importedProducts} live product(s) from Shopify store.`,
      };
    } catch (e: any) {
      console.error("[Live Store Sync Error]", e);
      return { ok: false, error: "Failed to query Shopify Admin GraphQL API." };
    }
  }

  return { ok: false, error: "Unknown action intent." };
};

export default function SuppliersPage() {
  const shopify = useAppBridge();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const suppliers = loaderData?.suppliers || [];
  const rules = loaderData?.rules || [];
  const selectedPlan = (loaderData as any)?.selectedPlan || "growth";
  const isSubmitting = navigation.state === "submitting";

  const [showStarterSupplierModal, setShowStarterSupplierModal] = useState(false);

  // Supplier Profile Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);

  // Manage SKUs Modal
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [activeSupplierForSkus, setActiveSupplierForSkus] = useState<SupplierItem | null>(null);

  // Form Fields for Supplier
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [defaultLeadTime, setDefaultLeadTime] = useState("14");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Helper to format consistent variant label
  const getVariantLabel = (item?: { title: string; variantTitle: string; sku: string }) =>
    item ? `${item.title}${item.variantTitle ? ` • ${item.variantTitle}` : ""} (${item.sku || "No SKU"})` : "";

  // Multi-Select SKU state for supplier connection
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [skuInputValue, setSkuInputValue] = useState("");
  const [visibleSkuCount, setVisibleSkuCount] = useState(50);
  const [assignCost, setAssignCost] = useState("");
  const [assignPackSize, setAssignPackSize] = useState("12");
  const [assignMoq, setAssignMoq] = useState("24");
  const [assignSafetyFloor, setAssignSafetyFloor] = useState("0");
  const [syncToShopifyVendor, setSyncToShopifyVendor] = useState(true);
  const [syncToShopifyCost, setSyncToShopifyCost] = useState(true);
  const [applyToAllVariants, setApplyToAllVariants] = useState(true);

  // Selected rules objects
  const selectedRules = useMemo(() => {
    return rules.filter((r) => selectedVariantIds.includes(r.variantId));
  }, [selectedVariantIds, rules]);

  // Selected distinct products count
  const selectedProductCount = useMemo(() => {
    return new Set(selectedRules.map((r) => r.productId || r.title)).size;
  }, [selectedRules]);

  // Filter variants by query string
  const filteredVariants = useMemo(() => {
    const query = skuInputValue.trim().toLowerCase();
    if (!query) return rules;

    const searchTerms = query.split(/\s+/).filter(Boolean);
    return rules.filter((v) => {
      const haystack = `${v.title} ${v.variantTitle} ${v.sku}`.toLowerCase();
      return searchTerms.every((term) => haystack.includes(term));
    });
  }, [skuInputValue, rules]);

  const displayedVariants = useMemo(() => {
    return filteredVariants.slice(0, visibleSkuCount);
  }, [filteredVariants, visibleSkuCount]);

  const hasMoreVariants = filteredVariants.length > visibleSkuCount;

  // Toggle selection for a variant (and optionally its sibling variants)
  const handleToggleVariant = (variantId: string) => {
    const item = rules.find((r) => r.variantId === variantId);
    const idsToToggle = applyToAllVariants && item?.productId
      ? rules.filter((r) => r.productId === item.productId).map((r) => r.variantId)
      : [variantId];

    setSelectedVariantIds((prev) => {
      const allSelected = idsToToggle.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !idsToToggle.includes(id));
      } else {
        return Array.from(new Set([...prev, ...idsToToggle]));
      }
    });

    if (item && selectedVariantIds.length === 0 && !assignCost) {
      setAssignCost(String(item.unitCost ?? "0.00"));
      setAssignPackSize(String(item.packSize ?? "12"));
      setAssignMoq(String(item.minOrderQty ?? "24"));
      setAssignSafetyFloor(String(item.safetyStockMinimum ?? "0"));
    }
  };

  const handleSelectAllFiltered = () => {
    let idsToAdd = filteredVariants.map((v) => v.variantId);
    if (applyToAllVariants) {
      const productIds = Array.from(new Set(filteredVariants.map((v) => v.productId).filter(Boolean)));
      idsToAdd = rules.filter((r) => productIds.includes(r.productId)).map((r) => r.variantId);
    }
    setSelectedVariantIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleClearSelection = () => {
    setSelectedVariantIds([]);
    setAssignCost("");
  };

  // Notify on action response
  useEffect(() => {
    if (actionData?.ok) {
      if (actionData.action === "created") {
        shopify.toast.show("Supplier successfully created.");
        setModalOpen(false);
      } else if (actionData.action === "updated") {
        shopify.toast.show("Supplier details updated.");
        setModalOpen(false);
      } else if (actionData.action === "sku_assigned") {
        const count = (actionData as any).count || 1;
        shopify.toast.show(
          `Successfully connected ${count} SKU${count === 1 ? "" : "s"} to ${(actionData as any).supplierName || "supplier"}!`,
        );
      }
    } else if (actionData?.error) {
      setFormError(actionData.error);
    }
  }, [actionData, shopify]);

  const handleOpenCreateModal = () => {
    if (selectedPlan === "starter" && suppliers.length >= 1) {
      setShowStarterSupplierModal(true);
      return;
    }
    setEditingSupplier(null);
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setDefaultLeadTime("14");
    setCurrency("USD");
    setNotes("");
    setFormError("");
    setModalOpen(true);
  };

  const handleOpenEditModal = (sup: SupplierItem) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setContactName(sup.contactName);
    setEmail(sup.email);
    setPhone(sup.phone);
    setDefaultLeadTime(String(sup.defaultLeadTime));
    setCurrency(sup.currency);
    setNotes(sup.notes);
    setFormError("");
    setModalOpen(true);
  };

  const handleOpenSkuModal = (sup: SupplierItem) => {
    setActiveSupplierForSkus(sup);
    setSelectedVariantIds([]);
    setSkuInputValue("");
    setAssignCost("");
    setVisibleSkuCount(50);
    setAssignPackSize("12");
    setAssignMoq("24");
    setSkuModalOpen(true);
  };

  const handleSaveSupplier = () => {
    if (!name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }

    const payload: Record<string, string> = {
      intent: editingSupplier ? "UPDATE_SUPPLIER" : "CREATE_SUPPLIER",
      name: name.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      defaultLeadTime: defaultLeadTime || "14",
      currency,
      notes: notes.trim(),
    };

    if (editingSupplier) {
      payload.id = editingSupplier.id;
    }

    submit(payload, { method: "post" });
  };

  const handleAssignSkuToSupplier = () => {
    if (!activeSupplierForSkus || selectedVariantIds.length === 0) return;

    submit(
      {
        intent: "ASSIGN_SKU",
        supplierId: activeSupplierForSkus.id,
        variantIds: JSON.stringify(selectedVariantIds),
        applyToAllVariants: String(applyToAllVariants),
        unitCost: assignCost || "",
        packSize: assignPackSize || "1",
        minOrderQty: assignMoq || "1",
        safetyStockMinimum: assignSafetyFloor || "0",
        syncToShopifyVendor: String(syncToShopifyVendor),
        syncToShopifyCost: String(syncToShopifyCost),
      },
      { method: "post" },
    );
  };

  // High-level metrics
  const totalVariantsManaged = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.assignedRulesCount, 0),
    [suppliers],
  );
  const avgLeadTime = useMemo(() => {
    if (suppliers.length === 0) return 0;
    const total = suppliers.reduce((sum, s) => sum + s.defaultLeadTime, 0);
    return Math.round(total / suppliers.length);
  }, [suppliers]);
  const totalActiveOrders = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.activeOrdersCount, 0),
    [suppliers],
  );

  const currencyOptions = [
    { label: "USD ($) - US Dollar", value: "USD" },
    { label: "CAD ($) - Canadian Dollar", value: "CAD" },
    { label: "EUR (€) - Euro", value: "EUR" },
    { label: "GBP (£) - British Pound", value: "GBP" },
    { label: "AUD ($) - Australian Dollar", value: "AUD" },
  ];

  // Filter rules belonging to the active supplier in the SKU modal
  const activeSupplierRules = useMemo(() => {
    if (!activeSupplierForSkus) return [];
    return rules.filter((r) => r.supplierId === activeSupplierForSkus.id);
  }, [rules, activeSupplierForSkus]);

  const handleSyncStoreProducts = () => {
    shopify.toast.show("Querying products from live Shopify store...");
    submit({ intent: "SYNC_FROM_SHOPIFY" }, { method: "post" });
  };

  return (
    <Page
      title="Suppliers"
      subtitle="Manage vendor profiles, default production lead times, and sourcing currencies."
      primaryAction={{
        content: "Add Supplier",
        icon: PlusIcon,
        onAction: handleOpenCreateModal,
      }}
      secondaryActions={[
        {
          content: "Sync Store Products",
          icon: RefreshIcon,
          loading: isSubmitting,
          onAction: handleSyncStoreProducts,
        },
      ]}
    >
      <BlockStack gap="400">
        {selectedPlan === "starter" && suppliers.length >= 1 && (
          <Banner
            tone="warning"
            title="Starter Plan: 1 Primary Supplier Included"
            action={{
              content: "Upgrade to Growth ($39/mo)",
              url: "/app/settings#subscription-plan",
            }}
          >
            <Text as="p" variant="bodySm">
              You are currently utilizing your 1 primary vendor on the Starter Plan. Upgrade to the Growth Plan to unlock unlimited suppliers, customized lead times, and case-pack rounding.
            </Text>
          </Banner>
        )}

        {/* Executive KPI Metric Strip */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {/* Card 1: Active Vendors */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Active Suppliers
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {suppliers.length}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    vendors
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="info">Direct Master</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Registered manufacturing partners
              </Text>
            </BlockStack>
          </Card>

          {/* Card 2: Linked SKUs */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Linked Sourcing Rules
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {totalVariantsManaged}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    SKUs
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="success">Active Terms</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Variants with unit costs & pack sizes
              </Text>
            </BlockStack>
          </Card>

          {/* Card 3: Avg Lead Time */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Average Lead Time
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {avgLeadTime}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    days
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="attention">Transit Buffer</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Base production & delivery cycle
              </Text>
            </BlockStack>
          </Card>

          {/* Card 4: Open Purchase Orders */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Open Purchase Orders
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {totalActiveOrders}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    orders
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone={totalActiveOrders > 0 ? "attention" : "info"}>
                    {totalActiveOrders > 0 ? "In-Flight" : "Dock Ready"}
                  </Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Drafts and vendor in-transit batches
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Clean Contextual Guidance */}
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Default lead times dictate replenishment reorder points. Click <strong>"Manage SKUs"</strong> on any vendor row below to map products, set purchase unit costs, and enforce container pack sizes.
          </Text>
        </Banner>

        {/* Suppliers IndexTable with Pinned Actions Column */}
        <div className="clearstock-po-table">
          <Card padding="0">
            {suppliers.length === 0 ? (
              <EmptyState
                heading="No suppliers registered"
                action={{
                  content: "Add First Supplier",
                  onAction: handleOpenCreateModal,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Register your suppliers and their default delivery lead times to power replenishment formulas.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "supplier", plural: "suppliers" }}
                itemCount={suppliers.length}
                selectable={false}
                headings={[
                  { title: "Supplier Name" },
                  { title: "Contact Person" },
                  { title: "Contact Email & Phone" },
                  { title: "Default Lead Time" },
                  { title: "Assigned SKUs" },
                  { title: "Active Orders" },
                  { title: "Currency" },
                  { title: "Actions", alignment: "end" },
                ]}
              >
                {suppliers.map((sup, index) => (
                  <IndexTable.Row id={sup.id} key={sup.id} position={index}>
                    {/* Supplier Name (Pinned Column 1) */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "160px" }}>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {sup.name}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Contact Person */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "140px" }}>
                        <Text as="span" variant="bodySm">
                          {sup.contactName || "—"}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Contact Email & Phone */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "190px" }}>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodySm">
                            {sup.email || "No email"}
                          </Text>
                          {sup.phone && (
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {sup.phone}
                            </Text>
                          )}
                        </BlockStack>
                      </div>
                    </IndexTable.Cell>

                    {/* Default Lead Time */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "130px" }}>
                        <Badge tone="info">{`${sup.defaultLeadTime} days`}</Badge>
                      </div>
                    </IndexTable.Cell>

                    {/* Assigned SKUs */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "130px" }}>
                        <Badge tone={sup.assignedRulesCount > 0 ? "success" : "attention"}>
                          {`${sup.assignedRulesCount} variants`}
                        </Badge>
                      </div>
                    </IndexTable.Cell>

                    {/* Active Orders */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "120px" }}>
                        {sup.activeOrdersCount > 0 ? (
                          <Badge tone="attention">{`${sup.activeOrdersCount} in-flight`}</Badge>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            None
                          </Text>
                        )}
                      </div>
                    </IndexTable.Cell>

                    {/* Currency */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "90px" }}>
                        <Text as="span" variant="bodySm" fontWeight="medium">
                          {sup.currency}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Actions (Pinned Column to Right) */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "210px", textAlign: "right" }}>
                        <InlineStack gap="150" align="end">
                          <Button
                            size="slim"
                            icon={LinkIcon}
                            onClick={() => handleOpenSkuModal(sup)}
                          >
                            Manage SKUs
                          </Button>
                          <Button
                            size="slim"
                            icon={EditIcon}
                            onClick={() => handleOpenEditModal(sup)}
                          >
                            Edit
                          </Button>
                        </InlineStack>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </div>

        {/* Modal 1: Create / Edit Supplier Profile */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : "Add New Supplier"}
          primaryAction={{
            content: isSubmitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Create Supplier",
            loading: isSubmitting,
            onAction: handleSaveSupplier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {formError && (
                <Banner tone="critical">
                  <p>{formError}</p>
                </Banner>
              )}

              <TextField
                label="Supplier Name"
                value={name}
                onChange={setName}
                autoComplete="off"
                placeholder="e.g. Apex Apparel Ltd."
                requiredIndicator
              />

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Contact Person Name"
                    value={contactName}
                    onChange={setContactName}
                    autoComplete="off"
                    placeholder="e.g. Sarah Jenkins"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="e.g. orders@supplier.com"
                  />
                </div>
              </InlineStack>

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Phone Number"
                    value={phone}
                    onChange={setPhone}
                    autoComplete="tel"
                    placeholder="e.g. +1 (555) 019-2834"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Default Lead Time (Days)"
                    type="number"
                    value={defaultLeadTime}
                    onChange={setDefaultLeadTime}
                    autoComplete="off"
                    helpText="Default days between placing PO and receipt at dock"
                  />
                </div>
              </InlineStack>

              <Select
                label="Billing Currency"
                options={currencyOptions}
                value={currency}
                onChange={setCurrency}
              />

              <TextField
                label="Internal Vendor Notes"
                value={notes}
                onChange={setNotes}
                multiline={3}
                autoComplete="off"
                placeholder="Payment terms (e.g. Net 30), shipping port, or direct account rep info."
              />
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Modal 2: Manage Linked SKUs for Supplier */}
        <Modal
          open={skuModalOpen}
          onClose={() => setSkuModalOpen(false)}
          title={`Manage SKUs • ${activeSupplierForSkus?.name || ""}`}
          primaryAction={{
            content: "Done",
            onAction: () => setSkuModalOpen(false),
          }}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Connect product variants to <strong>{activeSupplierForSkus?.name}</strong>. Define the purchase cost, master case pack size, and supplier minimum order quantities (MOQ).
              </Text>

              {/* Form to Assign a SKU */}
              <Card background="bg-surface-secondary">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Connect a Product Variant / SKU
                  </Text>

                  <Combobox
                    activator={
                      <Combobox.TextField
                        prefix={<Icon source={SearchIcon} />}
                        onChange={(val) => {
                          setSkuInputValue(val);
                          setVisibleSkuCount(50);
                        }}
                        label="Search & Select Product Variants"
                        value={skuInputValue}
                        placeholder="Search by product name, color, or SKU..."
                        clearButton={Boolean(skuInputValue)}
                        onClearButtonClick={() => {
                          setSkuInputValue("");
                          setVisibleSkuCount(50);
                        }}
                        autoComplete="off"
                        helpText={
                          selectedVariantIds.length > 0
                            ? `${selectedVariantIds.length} SKU${selectedVariantIds.length === 1 ? "" : "s"} selected across ${selectedProductCount} product${selectedProductCount === 1 ? "" : "s"}`
                            : "Search and click products below to select multiple items to connect to this supplier"
                        }
                      />
                    }
                  >
                    <div className="clearstock-combobox-container">
                      <div className="clearstock-combobox-header">
                        <span className="clearstock-combobox-header-title">
                          {skuInputValue
                            ? `Matching Products (${filteredVariants.length})`
                            : `Catalog Products (${filteredVariants.length} items)`}
                        </span>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <Button
                            variant="plain"
                            size="micro"
                            onClick={handleSelectAllFiltered}
                          >
                            {`Select All (${filteredVariants.length})`}
                          </Button>
                          {selectedVariantIds.length > 0 && (
                            <Button
                              variant="plain"
                              size="micro"
                              tone="critical"
                              onClick={handleClearSelection}
                            >
                              {`Clear (${selectedVariantIds.length})`}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="clearstock-combobox-scroll">
                        {displayedVariants.length > 0 ? (
                          <Listbox
                            onSelect={(val) => {
                              handleToggleVariant(val);
                            }}
                          >
                            {displayedVariants.map((item) => {
                              const isSelected = selectedVariantIds.includes(item.variantId);
                              const isAlreadyLinked = activeSupplierRules.some(
                                (r) => r.variantId === item.variantId,
                              );
                              return (
                                <Listbox.Option
                                  key={item.variantId}
                                  value={item.variantId}
                                  selected={isSelected}
                                  accessibilityLabel={`${item.title} ${item.variantTitle} ${item.sku}`}
                                >
                                  <div
                                    className={`clearstock-sku-option-row ${isSelected ? "selected" : ""} ${isAlreadyLinked ? "linked" : ""}`}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", paddingRight: 4 }}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#008060" }}
                                      />
                                    </div>

                                    <div className="clearstock-sku-thumb">
                                      <Icon source={ProductIcon} tone="base" />
                                    </div>

                                    <div className="clearstock-sku-info">
                                      <div className="clearstock-sku-title">
                                        {item.title}
                                      </div>
                                      <div className="clearstock-sku-meta">
                                        <span className="clearstock-sku-variant">{item.variantTitle}</span>
                                        <span className="clearstock-sku-dot">•</span>
                                        <span className="clearstock-sku-code">SKU: {item.sku}</span>
                                      </div>
                                    </div>

                                    <div className="clearstock-sku-badges">
                                      <span className="clearstock-sku-cost">
                                        ${item.unitCost.toFixed(2)}
                                      </span>
                                      {isAlreadyLinked && (
                                        <span className="clearstock-sku-tag-linked">Linked</span>
                                      )}
                                      {isSelected && (
                                        <span className="clearstock-sku-tag-selected">Selected</span>
                                      )}
                                    </div>
                                  </div>
                                </Listbox.Option>
                              );
                            })}

                            {hasMoreVariants && (
                              <Box padding="300">
                                <Button
                                  variant="plain"
                                  fullWidth
                                  onClick={() => setVisibleSkuCount((prev) => prev + 30)}
                                >
                                  Load more matching variants...
                                </Button>
                              </Box>
                            )}
                          </Listbox>
                        ) : (
                          <div className="clearstock-combobox-empty">
                            <p>No product variants match "{skuInputValue}"</p>
                            <span className="subdued">Try typing a product name, color, or SKU code</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Combobox>

                  {selectedRules.length > 0 && (
                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack gap="200" align="start" blockAlign="center" wrap>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Selected ({selectedVariantIds.length} SKUs across {selectedProductCount} products):
                        </Text>
                        {selectedRules.slice(0, 8).map((r) => (
                          <Tag key={r.variantId} onRemove={() => handleToggleVariant(r.variantId)}>
                            {r.title} • {r.variantTitle || r.sku}
                          </Tag>
                        ))}
                        {selectedRules.length > 8 && (
                          <Text as="span" variant="bodySm" tone="subdued">
                            +{selectedRules.length - 8} more
                          </Text>
                        )}
                      </InlineStack>
                    </Box>
                  )}

                  <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                    <div>
                      <TextField
                        label="Purchase Unit Cost ($)"
                        type="number"
                        step={0.01}
                        value={assignCost}
                        onChange={setAssignCost}
                        autoComplete="off"
                        placeholder="Keep variant costs or override"
                        helpText="Blank preserves variant cost"
                      />
                    </div>
                    <div>
                      <TextField
                        label="Case Pack Size"
                        type="number"
                        value={assignPackSize}
                        onChange={setAssignPackSize}
                        autoComplete="off"
                        helpText="Units per box multiple"
                      />
                    </div>
                    <div>
                      <TextField
                        label="Min Order Qty (MOQ)"
                        type="number"
                        value={assignMoq}
                        onChange={setAssignMoq}
                        autoComplete="off"
                        helpText="Supplier minimum order"
                      />
                    </div>
                    <div>
                      <TextField
                        label="Safety Floor Min"
                        type="number"
                        value={assignSafetyFloor}
                        onChange={setAssignSafetyFloor}
                        autoComplete="off"
                        helpText="Hard safety floor (units)"
                      />
                    </div>
                  </InlineGrid>

                  <Divider />

                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      <strong>Product Sourcing:</strong> Selecting any product automatically links all its variant sizes to <strong>{activeSupplierForSkus?.name}</strong> when "Apply to all variants" is checked. This ensures consistent vendor assignment across Shopify so variants can be reordered together on the same PO.
                    </Text>
                  </Banner>

                  <InlineStack align="space-between" blockAlign="center" gap="400">
                    <BlockStack gap="200">
                      <Checkbox
                        label="Apply supplier to all variants of selected products (Recommended)"
                        checked={applyToAllVariants}
                        onChange={setApplyToAllVariants}
                        helpText="Shopify manages vendors at the product level. Ensures all sizes/colors of selected products share this supplier."
                      />
                      <Checkbox
                        label={`Update Shopify Product Vendor to "${activeSupplierForSkus?.name || ""}"`}
                        checked={syncToShopifyVendor}
                        onChange={setSyncToShopifyVendor}
                        helpText="Keeps Shopify storefront vendor field synchronized to prevent sync conflicts"
                      />
                      <Checkbox
                        label={
                          assignCost && parseFloat(assignCost) > 0
                            ? `Sync Override Cost ($${parseFloat(assignCost).toFixed(2)}) to Shopify Cost per item (COGS)`
                            : "Sync Unit Cost to Shopify Cost per item (COGS) for selected items"
                        }
                        checked={syncToShopifyCost}
                        onChange={setSyncToShopifyCost}
                        helpText="Internal accounting only. Updates Shopify profit reports — will NEVER change the customer retail selling price."
                      />
                    </BlockStack>

                    <Button
                      variant="primary"
                      size="large"
                      loading={isSubmitting}
                      disabled={selectedVariantIds.length === 0}
                      onClick={handleAssignSkuToSupplier}
                    >
                      {selectedVariantIds.length === 0
                        ? "Select Products to Connect"
                        : `Connect ${selectedVariantIds.length} Selected SKU${selectedVariantIds.length === 1 ? "" : "s"} to ${activeSupplierForSkus?.name || "Supplier"}`}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Divider />

              {/* Currently Linked SKUs */}
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Currently Linked SKUs ({activeSupplierRules.length})
                </Text>

                {activeSupplierRules.length === 0 ? (
                  <Box padding="300">
                    <Text as="p" variant="bodySm" tone="subdued">
                      No SKUs linked to this supplier yet. Select a product variant above to connect your first SKU!
                    </Text>
                  </Box>
                ) : (
                  <Card padding="0">
                    <IndexTable
                      resourceName={{ singular: "SKU", plural: "SKUs" }}
                      itemCount={activeSupplierRules.length}
                      selectable={false}
                      headings={[
                        { title: "Product / Variant" },
                        { title: "SKU" },
                        { title: "Unit Cost" },
                        { title: "Case Pack" },
                        { title: "MOQ" },
                        { title: "Safety Floor" },
                      ]}
                    >
                      {activeSupplierRules.map((r, idx) => (
                        <IndexTable.Row id={r.id} key={r.id} position={idx}>
                          <IndexTable.Cell>
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {r.title}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {r.variantTitle}
                              </Text>
                            </BlockStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm">
                              {r.sku}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              ${r.unitCost.toFixed(2)}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Badge tone="info">{`${r.packSize} units/case`}</Badge>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm">
                              {`${r.minOrderQty} units`}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Badge tone={r.safetyStockMinimum > 0 ? "attention" : undefined}>
                              {`${r.safetyStockMinimum} units`}
                            </Badge>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  </Card>
                )}
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Starter Plan Supplier Limit Upgrade Modal */}
        <Modal
          open={showStarterSupplierModal}
          onClose={() => setShowStarterSupplierModal(false)}
          title="Upgrade to Growth for Multi-Supplier Management"
          primaryAction={{
            content: "Upgrade to Growth ($39/mo)",
            url: "/app/settings#subscription-plan",
          }}
          secondaryActions={[
            {
              content: "Close",
              onAction: () => setShowStarterSupplierModal(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Your store is currently on the <strong>Starter Plan ($9/month)</strong>, which includes 1 primary supplier.
              </Text>
              <Text as="p" variant="bodyMd">
                To add additional vendors, manage separate lead times and currencies per manufacturer, and issue purchase orders to multiple suppliers, please upgrade to the <strong>Growth Plan ($39/month)</strong>.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
