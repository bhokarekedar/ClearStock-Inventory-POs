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
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

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
        let totalAvailable = typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null;

        if (totalAvailable === null) {
          totalAvailable = (v.inventoryItem?.inventoryLevels?.nodes || []).reduce(
            (sum: number, lvl: any) => {
              if (lvl.location?.isActive) {
                const avail = lvl.quantities?.find((q: any) => !q.name || q.name === "available")?.quantity || lvl.quantities?.[0]?.quantity || 0;
                return sum + avail;
              }
              return sum;
            },
            0,
          );
        }

        await prisma.variantSupplierRule.updateMany({
          where: {
            shop: session.shop,
            variantId: v.id,
          },
          data: {
            availableStock: totalAvailable,
          },
        });
      }

      return { ok: true, syncedCount: variants.length };
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

    const ads7d = Number((unitsSold7d / 7).toFixed(1));
    const ads14d = Number((unitsSold14d / 14).toFixed(1));
    const ads30d = Number((unitsSold30d / 30).toFixed(1));
    const ads90d = Number((unitsSold90d / 90).toFixed(1));

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
      unitsSold30d,
      leadTimeDays: rule.leadTimeDays ?? rule.supplier.defaultLeadTime,
      safetyStockDays: rule.safetyStockDays,
      safetyStockMinimum: rule.safetyStockMinimum,
      minOrderQty: rule.minOrderQty,
      packSize: rule.packSize,
      unitCost: Number(rule.unitCost),
      lastSyncDate: "Synced with Shopify",
    };
  });

  const appSettings = await (prisma as any).appSettings.findFirst({
    where: { shop },
  });

  const defaultLookbackWindow = appSettings?.defaultLookbackWindow ? String(appSettings.defaultLookbackWindow) : "30";

  return {
    items,
    suppliers: suppliersDb.map((s) => ({ id: s.id, name: s.name })),
    defaultLookbackWindow: (defaultLookbackWindow === "7" || defaultLookbackWindow === "14" || defaultLookbackWindow === "90" ? defaultLookbackWindow : "30") as "7" | "14" | "30" | "90",
  };
};

// ---------------------------------------------------------------------------
// Replenishment Data Types & Interfaces
// ---------------------------------------------------------------------------
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
  unitsSold30d: number;
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStockMinimum: number;
  minOrderQty: number; // MOQ
  packSize: number; // Case/box multiple
  unitCost: number;
  lastSyncDate: string;
}


// ---------------------------------------------------------------------------
// Pure Deterministic Replenishment Math Helper
// ---------------------------------------------------------------------------
export function computeReplenishmentMath(
  item: ReplenishmentItem,
  windowDays: 7 | 14 | 30 | 90 = 30,
) {
  const adsMap = {
    7: item.ads7d,
    14: item.ads14d,
    30: item.ads30d,
    90: item.ads90d,
  };
  const ads = adsMap[windowDays];

  // 1. Lead time demand
  const leadTimeDemand = ads * item.leadTimeDays;

  // 2. Safety stock (use days coverage, or unit floor if higher)
  const safetyStockFromDays = ads * item.safetyStockDays;
  const safetyStock = Math.max(
    Math.round(safetyStockFromDays),
    item.safetyStockMinimum,
  );

  // 3. Reorder Point (ROP)
  const reorderPoint = Math.round(leadTimeDemand + safetyStock);

  // 4. Net Deficit - EXPLICITLY SUBTRACTS BOTH STOCK ON HAND & INCOMING ON POS
  const rawDeficit = Math.max(0, reorderPoint - item.stockOnHand - item.stockOnOrder);

  // 5. Apply MOQ & Pack Size multiple
  let recommendedUnits = 0;
  let casesCount = 0;

  if (rawDeficit > 0) {
    const minUnitsNeeded = Math.max(rawDeficit, item.minOrderQty);
    casesCount = Math.ceil(minUnitsNeeded / item.packSize);
    recommendedUnits = casesCount * item.packSize;
  }

  // Days of current stock on hand (Runway)
  // If no stock on hand, runway is 0. If no sales velocity (ads == 0), runway is not measurable (0 days, not overstocked).
  const daysOfCoverageOnHand =
    item.stockOnHand <= 0 ? 0 : ads > 0 ? Math.floor(item.stockOnHand / ads) : 0;
  const isOverstocked = ads > 0 && daysOfCoverageOnHand > 90;
  const deadCashValue = isOverstocked ? item.stockOnHand * item.unitCost : 0;

  // "When to buy" Status indicator (Critical, Warning, Info, Success)
  let statusTone: "critical" | "warning" | "info" | "success" = "success";
  let statusLabel: "Reorder Now" | "Overstocked" | "Incoming" | "Stock OK" = "Stock OK";

  if (recommendedUnits > 0 || (item.stockOnHand + item.stockOnOrder) < reorderPoint) {
    statusTone = "critical";
    statusLabel = "Reorder Now";
  } else if (item.stockOnOrder > 0 && item.stockOnHand < reorderPoint) {
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
    stockOnHand: item.stockOnHand,
    stockOnOrder: item.stockOnOrder,
    effectiveStock: item.stockOnHand + item.stockOnOrder,
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
    isBelowReorderPoint: (item.stockOnHand + item.stockOnOrder) < reorderPoint,
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

  // Filters & Controls
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [rollingWindow, setRollingWindow] = useState<"7" | "14" | "30" | "90">(
    loaderData?.defaultLookbackWindow || "30",
  );
  const [filterStatus, setFilterStatus] = useState<
    "all" | "Reorder Now" | "Overstocked" | "Incoming" | "Stock OK"
  >("all");
  const isHealing = navigation.state === "submitting" && navigation.formData?.get("intent") === "HEAL_DATA";

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show(`Data healed: Re-synced ${actionData.syncedCount} variants across all locations.`);
    } else if (actionData?.error) {
      shopify.toast.show(`Heal failed: ${actionData.error}`, { isError: true });
    }
  }, [actionData, shopify]);

  // Modal State
  const [activeMathItem, setActiveMathItem] = useState<ReplenishmentItem | null>(null);

  const windowDaysNum = parseInt(rollingWindow, 10) as 7 | 14 | 30 | 90;

  // Process rows with calculations
  const calculatedRows = useMemo(() => {
    return items.map((item) => ({
      ...item,
      calc: computeReplenishmentMath(item, windowDaysNum),
    }));
  }, [items, windowDaysNum]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return calculatedRows.filter((item) => {
      // Supplier filter
      if (selectedSupplier !== "all" && item.supplierId !== selectedSupplier) {
        return false;
      }
      // Status filter
      if (filterStatus !== "all" && item.calc.statusLabel !== filterStatus) {
        return false;
      }
      // Search filter
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

  // Auto-reset to first page when search, supplier, status tab, or page size changes
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

  // Index table selection via Polaris useIndexResourceState
  const resourceIDResolver = (item: (typeof filteredRows)[0]) => item.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filteredRows, {
      resourceIDResolver,
    });

  // Aggregated Summary Metrics (including Locked Capital / Overstock Dead Cash)
  const summaryMetrics = useMemo(() => {
    const itemsNeedingReorder = calculatedRows.filter((r) => r.calc.statusLabel === "Reorder Now");
    const totalUnitsToOrder = itemsNeedingReorder.reduce(
      (sum, r) => sum + r.calc.recommendedUnits,
      0,
    );
    const totalEstimatedSpend = itemsNeedingReorder.reduce(
      (sum, r) => sum + r.calc.estimatedCost,
      0,
    );
    // Locked Capital (Dead Cash) in items exceeding 90 days runway:
    const lockedCapital = calculatedRows
      .filter((r) => r.calc.isOverstocked)
      .reduce((sum, r) => sum + r.calc.deadCashValue, 0);

    return {
      reorderCount: itemsNeedingReorder.length,
      totalUnitsToOrder,
      totalEstimatedSpend,
      lockedCapital: lockedCapital || 0,
    };
  }, [calculatedRows]);

  // Supplier Dropdown Options (derived dynamically from database)
  const supplierOptions = useMemo(() => {
    const list = [{ label: "All Suppliers", value: "all" }];
    if (suppliers.length > 0) {
      suppliers.forEach((s) => list.push({ label: s.name, value: s.id }));
    }
    return list;
  }, [suppliers]);

  // IndexFilters mode
  const { mode, setMode } = useSetIndexFiltersMode();

  // Tab counts for quick status filtering
  const tabCounts = useMemo(() => {
    let reorder = 0;
    let overstocked = 0;
    let incoming = 0;
    let ok = 0;
    calculatedRows.forEach((item) => {
      if (item.calc.statusLabel === "Reorder Now") reorder++;
      else if (item.calc.statusLabel === "Overstocked") overstocked++;
      else if (item.calc.statusLabel === "Incoming") incoming++;
      else if (item.calc.statusLabel === "Stock OK") ok++;
    });
    return { all: calculatedRows.length, reorder, overstocked, incoming, ok };
  }, [calculatedRows]);

  const tabs = useMemo(
    () => [
      { id: "all", content: "All", badge: String(tabCounts.all), isLocked: true },
      { id: "reorder", content: "Reorder Now", badge: String(tabCounts.reorder), isLocked: true },
      { id: "overstocked", content: "Overstocked", badge: String(tabCounts.overstocked), isLocked: true },
      { id: "incoming", content: "Incoming", badge: String(tabCounts.incoming), isLocked: true },
      { id: "stock-ok", content: "Stock OK", badge: String(tabCounts.ok), isLocked: true },
    ],
    [tabCounts]
  );

  const tabStatuses = ["all", "Reorder Now", "Overstocked", "Incoming", "Stock OK"] as const;
  const selectedTab = Math.max(0, tabStatuses.indexOf(filterStatus));

  // Filters for IndexFilters component
  const filters: FilterInterface[] = [
    {
      key: "supplier",
      label: "Supplier",
      filter: (
        <ChoiceList
          title="Supplier"
          titleHidden
          choices={supplierOptions.map((s) => ({ label: s.label, value: s.value }))}
          selected={[selectedSupplier]}
          onChange={(val) => setSelectedSupplier(val[0] || "all")}
        />
      ),
      shortcut: true,
    },
    {
      key: "rollingWindow",
      label: "Sales Window",
      filter: (
        <ChoiceList
          title="Sales Window"
          titleHidden
          choices={[
            { label: "7-Day Sales (Recent)", value: "7" },
            { label: "14-Day Sales (Steady)", value: "14" },
            { label: "30-Day Sales (Standard)", value: "30" },
            { label: "90-Day Sales (Long-term)", value: "90" },
          ]}
          selected={[rollingWindow]}
          onChange={(val) => setRollingWindow((val[0] || "30") as any)}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters: AppliedFilterInterface[] = [];
  if (selectedSupplier !== "all") {
    const supName = supplierOptions.find((s) => s.value === selectedSupplier)?.label || selectedSupplier;
    appliedFilters.push({
      key: "supplier",
      label: `Supplier: ${supName}`,
      onRemove: () => setSelectedSupplier("all"),
    });
  }
  if (rollingWindow !== "30") {
    appliedFilters.push({
      key: "rollingWindow",
      label: `Sales: ${rollingWindow}d avg`,
      onRemove: () => setRollingWindow("30"),
    });
  }

  const handleClearAll = () => {
    setSelectedSupplier("all");
    setRollingWindow(loaderData?.defaultLookbackWindow || "30");
    setSearchQuery("");
    setFilterStatus("all");
    setCurrentPage(1);
  };

  // Self-Service Heal Action
  const handleHealData = () => {
    submit({ intent: "HEAL_DATA" }, { method: "post" });
  };

  // Create PO action tied directly to selected rows with multi-supplier guard
  const handleCreatePOFromSelected = () => {
    if (selectedResources.length === 0) return;

    const selectedItems = items.filter((i) => selectedResources.includes(i.id));
    const distinctSuppliers = Array.from(new Set(selectedItems.map((i) => i.supplierName)));

    if (distinctSuppliers.length > 1) {
      shopify.toast.show(
        `Selected items span multiple suppliers (${distinctSuppliers.join(", ")}). Please select items from a single supplier or filter by vendor.`,
        { isError: true },
      );
      return;
    }

    shopify.toast.show(`Creating Draft Purchase Order with ${selectedResources.length} selected items (${rollingWindow}D velocity)...`);
    navigate(`/app/purchase-orders/new?items=${selectedResources.join(",")}&window=${rollingWindow}`);
  };

  // Math details for active modal
  const activeMath = activeMathItem
    ? computeReplenishmentMath(activeMathItem, windowDaysNum)
    : null;

  return (
    <Page
      title="Replenishment"
      subtitle="Simple, transparent buying recommendations. Always know what to buy and when to buy."
      primaryAction={
        <InlineStack gap="200" align="center">
          <Tooltip content="Instantly re-syncs recent paid orders from Shopify to verify local sales counts.">
            <Button
              icon={RefreshIcon}
              loading={isHealing}
              onClick={handleHealData}
            >
              Heal Data
            </Button>
          </Tooltip>
          <Button
            variant="primary"
            onClick={handleCreatePOFromSelected}
            disabled={selectedResources.length === 0}
          >
            {`Create PO from Selected (${selectedResources.length})`}
          </Button>
        </InlineStack>
      }
    >
      <style>{`
        /* 1. Sticky Checkbox Column (Column 1) - Scoped to Replenishment table */
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

        /* 2. Sticky Product & SKU Column (Column 2) - Pinned to left next to checkbox */
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--second,
        .clearstock-sticky-table .Polaris-IndexTable__TableCell:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell {
          position: sticky !important;
          left: 48px !important;
          z-index: 23 !important;
          background-color: var(--p-color-bg-surface, #ffffff) !important;
          min-width: 220px !important;
          box-shadow: 3px 0 5px -2px rgba(0, 0, 0, 0.12) !important;
          border-right: 1px solid var(--p-color-border-subdued, #e1e3e5) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading--second {
          z-index: 24 !important;
          background-color: var(--p-color-bg-surface-secondary, #f7f7f7) !important;
        }

        /* 3. Solid backgrounds for pinned cells on hover and selection */
        .clearstock-sticky-table .Polaris-IndexTable__TableRow:hover .Polaris-IndexTable__TableCell:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableRow:hover .Polaris-IndexTable__TableCell:nth-child(2),
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--hovered .Polaris-IndexTable__TableCell:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--hovered .Polaris-IndexTable__TableCell:nth-child(2) {
          background-color: var(--p-color-bg-surface-hover, #f1f2f3) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected .Polaris-IndexTable__TableCell:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected .Polaris-IndexTable__TableCell:nth-child(2) {
          background-color: var(--p-color-bg-surface-selected, #f2f7fe) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected:hover .Polaris-IndexTable__TableCell:first-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected:hover .Polaris-IndexTable__TableCell:nth-child(2) {
          background-color: var(--p-color-bg-surface-brand-hover, #eaf2fd) !important;
        }

        /* 4. Pinned Actions / Audit Column (Pinned to Right) */
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:last-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableCell:last-child {
          position: sticky !important;
          right: 0 !important;
          z-index: 22 !important;
          background-color: var(--p-color-bg-surface, #ffffff) !important;
          box-shadow: -4px 0 8px -2px rgba(0, 0, 0, 0.08) !important;
          border-left: 1px solid var(--p-color-border-subdued, #e1e3e5) !important;
          text-align: right !important;
          min-width: 140px !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableHeading:last-child {
          z-index: 26 !important;
          background-color: var(--p-color-bg-surface-secondary, #f7f7f7) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableRow:hover .Polaris-IndexTable__TableCell:last-child,
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--hovered .Polaris-IndexTable__TableCell:last-child {
          background-color: var(--p-color-bg-surface-hover, #f1f2f3) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected .Polaris-IndexTable__TableCell:last-child {
          background-color: var(--p-color-bg-surface-selected, #f2f7fe) !important;
        }
        .clearstock-sticky-table .Polaris-IndexTable__TableRow--selected:hover .Polaris-IndexTable__TableCell:last-child {
          background-color: var(--p-color-bg-surface-brand-hover, #eaf2fd) !important;
        }

        /* 5. Hide Polaris ghost sticky header which causes duplicate overlapping titles */
        .Polaris-IndexTable__StickyTableHeader {
          display: none !important;
        }

        /* 5. Ensure the table maintains natural, well-spaced column proportions */
        .Polaris-IndexTable__Table {
          table-layout: auto !important;
          width: 100% !important;
        }
        .Polaris-IndexTable__TableHeading {
          white-space: nowrap !important;
          padding: 8px 12px !important;
          text-overflow: clip !important;
        }
        .Polaris-IndexTable__TableCell {
          white-space: nowrap !important;
          padding: 8px 12px !important;
          vertical-align: middle !important;
        }
        .Polaris-IndexTable__TableRow {
          border-bottom: 1px solid var(--p-color-border-subdued, #e1e3e5) !important;
        }
      `}</style>
      <BlockStack gap="400">
        {/* KPI Strip (4 Summary Cards including Dead Cash Calculator) */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {/* Card 1: Reorder Count */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Items Below Reorder Point
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {summaryMetrics.reorderCount}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    SKUs
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone={summaryMetrics.reorderCount > 0 ? "critical" : "success"}>
                    {summaryMetrics.reorderCount > 0 ? "Action Required" : "Stock OK"}
                  </Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Items needing restock based on recent sales
              </Text>
            </BlockStack>
          </Card>

          {/* Card 2: Total Shortage Units */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Total Shortage Units
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {summaryMetrics.totalUnitsToOrder.toLocaleString()}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    units
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="attention">Pack Rounded</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Auto-rounded to supplier pack & MOQ sizes
              </Text>
            </BlockStack>
          </Card>

          {/* Card 3: Estimated Order Cost */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Estimated Order Cost
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  ${summaryMetrics.totalEstimatedSpend.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="info">Pre-Tax</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Estimated total cost for required stock
              </Text>
            </BlockStack>
          </Card>

          {/* Card 4: Dead Cash Calculator (Cash Tied Up) */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Cash Tied Up (Overstock)
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  ${summaryMetrics.lockedCapital.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="warning">Overstocked</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Cash trapped in items exceeding 90-day runway.
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Data Table with Integrated Native Polaris IndexFilters & Visible Toolbar */}
        <Card padding="0">
          <IndexFilters
            sortOptions={[]}
            queryValue={searchQuery}
            queryPlaceholder="Search product, variant, or SKU..."
            onQueryChange={setSearchQuery}
            onQueryClear={() => setSearchQuery("")}
            onClearAll={handleClearAll}
            tabs={tabs}
            selected={selectedTab}
            onSelect={(index) => setFilterStatus(tabStatuses[index])}
            filters={[]}
            appliedFilters={[]}
            mode={mode}
            setMode={setMode}
            canCreateNewView={false}
          />

          {/* Always-visible Multi-filter Toolbar */}
          <Box padding="300" borderBlockStartWidth="025" borderColor="border-secondary" background="bg-surface-secondary">
            <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
              <InlineStack gap="400" blockAlign="center" wrap>
                {/* 1. Supplier Filter */}
                <div style={{ minWidth: "220px" }}>
                  <Select
                    label="Supplier"
                    labelInline
                    options={supplierOptions}
                    value={selectedSupplier}
                    onChange={(val) => setSelectedSupplier(val)}
                  />
                </div>

                {/* 2. Sales Lookback Window Segmented Buttons */}
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">
                    Sales Window:
                  </Text>
                  <ButtonGroup variant="segmented">
                    <Button
                      size="slim"
                      pressed={rollingWindow === "7"}
                      onClick={() => setRollingWindow("7")}
                    >
                      7D
                    </Button>
                    <Button
                      size="slim"
                      pressed={rollingWindow === "14"}
                      onClick={() => setRollingWindow("14")}
                    >
                      14D
                    </Button>
                    <Button
                      size="slim"
                      pressed={rollingWindow === "30"}
                      onClick={() => setRollingWindow("30")}
                    >
                      30D
                    </Button>
                    <Button
                      size="slim"
                      pressed={rollingWindow === "90"}
                      onClick={() => setRollingWindow("90")}
                    >
                      90D
                    </Button>
                  </ButtonGroup>
                </InlineStack>
              </InlineStack>

              <InlineStack gap="300" blockAlign="center" wrap>
                {/* Page Size Selector */}
                <InlineStack gap="150" blockAlign="center">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Rows:
                  </Text>
                  <div style={{ width: "115px" }}>
                    <Select
                      label="Rows per page"
                      labelHidden
                      options={[
                        { label: "25 / page", value: "25" },
                        { label: "50 / page", value: "50" },
                        { label: "100 / page", value: "100" },
                      ]}
                      value={String(pageSize)}
                      onChange={(val) => setPageSize(parseInt(val, 10))}
                    />
                  </div>
                </InlineStack>

                {/* Reset Action if any filter is active */}
                {(selectedSupplier !== "all" || rollingWindow !== (loaderData?.defaultLookbackWindow || "30") || searchQuery.trim() !== "") && (
                  <Button
                    variant="plain"
                    tone="critical"
                    size="slim"
                    onClick={handleClearAll}
                  >
                    Reset All Filters
                  </Button>
                )}
              </InlineStack>
            </InlineStack>
          </Box>

          <div className="clearstock-sticky-table">
            <IndexTable
              resourceName={{
                singular: "inventory item",
                plural: "inventory items",
              }}
              itemCount={filteredRows.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              pagination={{
                hasNext: safeCurrentPage < totalPages,
                hasPrevious: safeCurrentPage > 1,
                onNext: () => setCurrentPage((p) => Math.min(p + 1, totalPages)),
                onPrevious: () => setCurrentPage((p) => Math.max(p - 1, 1)),
                label: totalItems > 0 ? `${startIndex + 1}–${endIndex} of ${totalItems} items` : "0 items",
              }}
              headings={[
                { title: "Product & SKU" },
                { title: "Status" },
                { title: "Supplier" },
                { title: "Stock & Runway" },
                { title: "Daily Sales (Avg)" },
                { title: "Recommended Order", alignment: "end" },
              ]}
            >
              {paginatedRows.map((row, index) => {
                const { calc } = row;
                const isSelected = selectedResources.includes(row.id);

                return (
                  <IndexTable.Row
                    id={row.id}
                    key={row.id}
                    selected={isSelected}
                    position={startIndex + index}
                  >
                  {/* Product Details (Compact 2 lines) */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "210px" }}>
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Thumbnail
                          source={row.imageUrl}
                          alt={row.title}
                          size="small"
                        />
                        <BlockStack gap="025">
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {row.title}
                          </Text>
                          <Text as="span" variant="bodyXs" tone="subdued">
                            {row.sku} · {row.variantTitle}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </div>
                  </IndexTable.Cell>

                  {/* Status Column */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "100px" }}>
                      <Badge tone={calc.statusTone} size="small">{calc.statusLabel}</Badge>
                    </div>
                  </IndexTable.Cell>

                  {/* Supplier */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "120px" }}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {row.supplierName}
                      </Text>
                    </div>
                  </IndexTable.Cell>

                  {/* Stock & Runway (Clean 2 lines: Stock & Badge on Line 1, Incoming on Line 2) */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "130px" }}>
                      <BlockStack gap="050">
                        <InlineStack gap="150" blockAlign="center">
                          <Text
                            as="span"
                            variant="bodySm"
                            fontWeight="bold"
                            tone={
                              calc.statusLabel === "Reorder Now"
                                ? "critical"
                                : calc.statusLabel === "Overstocked"
                                ? "caution"
                                : "base"
                            }
                          >
                            {row.stockOnHand}
                          </Text>
                          {row.stockOnHand <= 0 ? (
                            <Badge tone="critical" size="small">
                              0d left
                            </Badge>
                          ) : calc.ads === 0 ? (
                            <Badge tone="info" size="small">
                              No sales
                            </Badge>
                          ) : calc.daysOfCoverageOnHand <= 7 ? (
                            <Badge tone="critical" size="small">
                              {`${calc.daysOfCoverageOnHand}d left`}
                            </Badge>
                          ) : calc.daysOfCoverageOnHand <= 14 ? (
                            <Badge tone="attention" size="small">
                              {`${calc.daysOfCoverageOnHand}d left`}
                            </Badge>
                          ) : calc.isOverstocked ? (
                            <Badge tone="warning" size="small">
                              {`${calc.daysOfCoverageOnHand > 365 ? "365+d" : calc.daysOfCoverageOnHand + "d"}`}
                            </Badge>
                          ) : (
                            <Badge tone="success" size="small">
                              {`${calc.daysOfCoverageOnHand > 60 ? "60+d" : calc.daysOfCoverageOnHand + "d"}`}
                            </Badge>
                          )}
                        </InlineStack>

                        {row.stockOnOrder > 0 ? (
                          <Text as="span" variant="bodyXs" tone="subdued">
                            ↳ +{row.stockOnOrder} incoming
                          </Text>
                        ) : (
                          <Text as="span" variant="bodyXs" tone="subdued">
                            0 incoming
                          </Text>
                        )}
                      </BlockStack>
                    </div>
                  </IndexTable.Cell>

                  {/* Daily Sales (Avg) */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "100px" }}>
                      <BlockStack gap="025">
                        <Text as="span" variant="bodySm" fontWeight="medium">
                          {`${calc.ads.toFixed(1)} /day`}
                        </Text>
                        <Text as="span" variant="bodyXs" tone="subdued">
                          {`${rollingWindow}d avg`}
                        </Text>
                      </BlockStack>
                    </div>
                  </IndexTable.Cell>

                  {/* Recommended Order & View Math Link */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: "140px", textAlign: "right" }}>
                      <BlockStack gap="025" inlineAlign="end">
                        {calc.recommendedUnits > 0 ? (
                          <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">
                            {`${calc.recommendedUnits.toLocaleString()} units`}
                          </Text>
                        ) : calc.isOverstocked ? (
                          <Text as="span" variant="bodySm" fontWeight="medium" tone="caution">
                            0 units (Overstock)
                          </Text>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            0 units
                          </Text>
                        )}
                        <Button
                          variant="plain"
                          size="micro"
                          onClick={() => setActiveMathItem(row)}
                        >
                          View math ⓘ
                        </Button>
                      </BlockStack>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              );
            })}
          </IndexTable>
          </div>

          {filteredRows.length === 0 && (
            <Box padding="600">
              <BlockStack align="center" inlineAlign="center" gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  No inventory items match the current filters.
                </Text>
                <Button
                  onClick={() => {
                    setSelectedSupplier("all");
                    setFilterStatus("all");
                    setSearchQuery("");
                  }}
                >
                  Clear all filters
                </Button>
              </BlockStack>
            </Box>
          )}
        </Card>
      </BlockStack>

      {/* --------------------------------------------------------------------- */}
      {/* "SHOW THE MATH" MODAL - COMPLETE TRANSPARENCY & ROI CALCULATIONS       */}
      {/* --------------------------------------------------------------------- */}
      <Modal
        open={Boolean(activeMathItem)}
        onClose={() => setActiveMathItem(null)}
        title={
          activeMathItem
            ? `Replenishment Math: ${activeMathItem.title}`
            : "Deterministic Math Breakdown"
        }
        primaryAction={{
          content: "Done",
          onAction: () => setActiveMathItem(null),
        }}
        secondaryActions={
          activeMath && activeMath.recommendedUnits > 0
            ? [
                {
                  content: "Add to Next Purchase Order",
                  icon: PlusIcon,
                  onAction: () => {
                    shopify.toast.show(
                      `Added ${activeMath?.recommendedUnits} units of ${activeMathItem?.sku} to draft PO.`,
                    );
                    setActiveMathItem(null);
                  },
                },
              ]
            : []
        }
      >
        <Modal.Section>
          {activeMathItem && activeMath && (
            <BlockStack gap="400">
              {/* Product and Supplier Summary Header */}
              <Banner
                tone={
                  activeMath.recommendedUnits > 0
                    ? "warning"
                    : activeMath.isOverstocked
                    ? "warning"
                    : "success"
                }
                icon={
                  activeMath.recommendedUnits > 0
                    ? AlertCircleIcon
                    : activeMath.isOverstocked
                    ? InfoIcon
                    : CheckIcon
                }
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="p" variant="headingSm">
                      {activeMathItem.variantTitle} — SKU: {activeMathItem.sku}
                    </Text>
                    <Text as="p" variant="bodySm">
                      Supplier: <strong>{activeMathItem.supplierName}</strong> • Unit Cost: ${activeMathItem.unitCost.toFixed(2)}
                    </Text>
                  </BlockStack>
                  <BlockStack inlineAlign="end">
                    <Text
                      as="p"
                      variant="headingLg"
                      tone={
                        activeMath.recommendedUnits > 0
                          ? "critical"
                          : activeMath.isOverstocked
                          ? "caution"
                          : "success"
                      }
                    >
                      {activeMath.recommendedUnits} units
                    </Text>
                    <Text as="p" variant="bodyXs" tone="subdued">
                      {activeMath.recommendedUnits > 0
                        ? `${activeMath.casesCount} case packs (${activeMathItem.packSize} per case)`
                        : activeMath.isOverstocked
                        ? `Overstocked (${activeMath.daysOfCoverageOnHand}d runway)`
                        : "Stock levels healthy"}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Banner>

              {/* Overstocked Alert Card if Runway exceeds 90 days */}
              {activeMath.isOverstocked && (
                <Card background="bg-surface-warning">
                  <BlockStack gap="150">
                    <InlineStack gap="150" blockAlign="center">
                      <Badge tone="warning">Locked Capital Alert</Badge>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Excess Inventory Warning
                      </Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm">
                      You currently hold <strong>{activeMathItem.stockOnHand} units</strong> on hand (~{activeMath.daysOfCoverageOnHand} days of runway).
                      This exceeds your 90-day healthy buffer threshold by over {activeMath.daysOfCoverageOnHand - 90} days,
                      trapping approximately <strong>${(activeMathItem.stockOnHand * activeMathItem.unitCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> in dead cash.
                    </Text>
                  </BlockStack>
                </Card>
              )}

              {/* Step 1: Deterministic Reorder Point Formula */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      Step 1: Reorder Point (ROP) Formula
                    </Text>
                    <Badge tone="info">Industry Standard</Badge>
                  </InlineStack>

                  <Box
                    padding="200"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ROP = (Daily Sales × Lead Time) + Safety Stock Buffer
                    </Text>
                  </Box>

                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Average Daily Sales ({windowDaysNum}-day velocity):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMath.ads.toFixed(2)} units/day ({activeMathItem.unitsSold30d} sold ÷ {windowDaysNum}d)
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Supplier Transit & Lead Time:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMathItem.leadTimeDays} days
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Base Lead-Time Demand (Sales × Lead Time):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMath.ads.toFixed(1)} × {activeMathItem.leadTimeDays}d = {activeMath.leadTimeDemand} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Safety Stock Buffer ({activeMathItem.safetyStockDays} days):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        +{activeMath.safetyStock} units (min floor: {activeMathItem.safetyStockMinimum})
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        Calculated Target Reorder Point (ROP):
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        {activeMath.reorderPoint} units
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Step 2: Net Deficit & Double-Ordering Prevention */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      Step 2: Prevent Double-Ordering (Incoming PO Deduction)
                    </Text>
                    {activeMath.stockOnOrder > 0 && (
                      <Badge tone="success">Double-Order Protected</Badge>
                    )}
                  </InlineStack>

                  <Box
                    padding="200"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Raw Shortage = Reorder Point ({activeMath.reorderPoint}) - Available Stock ({activeMath.stockOnHand}) - Incoming on POs ({activeMath.stockOnOrder})
                    </Text>
                  </Box>

                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Physical Stock On Hand:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMath.stockOnHand} units ({activeMath.daysOfCoverageOnHand} days runway)
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Incoming Stock on Open POs (Already on boat/truck):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="bold" tone={activeMath.stockOnOrder > 0 ? "success" : "base"}>
                        -{activeMath.stockOnOrder} units {activeMath.stockOnOrder > 0 ? "(Deducted to save cash)" : ""}
                      </Text>
                    </InlineStack>

                    {activeMath.stockOnOrder > 0 && (
                      <Banner tone="info">
                        <Text as="p" variant="bodyXs">
                          <strong>Double-Ordering Prevented:</strong> {activeMath.stockOnOrder} units are already in transit from supplier.
                          We deducted these units directly so you don't accidentally tie up extra capital.
                        </Text>
                      </Banner>
                    )}

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        Net Shortage:
                      </Text>
                      <Text
                        as="span"
                        variant="bodyMd"
                        fontWeight="bold"
                        tone={
                          activeMath.rawDeficit > 0
                            ? "critical"
                            : activeMath.isOverstocked
                            ? "caution"
                            : "success"
                        }
                      >
                        {activeMath.rawDeficit > 0
                          ? `${activeMath.rawDeficit} units shortage`
                          : `0 units (${activeMath.isOverstocked ? "Surplus: " + (activeMath.effectiveStock - activeMath.reorderPoint) + " units" : "No shortage"})`}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Step 3: Supplier Constraints & Case Pack Auto-Rounding */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      Step 3: Supplier MOQs & Case Pack Auto-Rounding
                    </Text>
                    <Badge tone="attention">Factory Compliant</Badge>
                  </InlineStack>

                  <Box
                    padding="200"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Raw Shortage: {activeMath.rawDeficit} units. Supplier MOQ: {activeMathItem.minOrderQty}. Pack Size: {activeMathItem.packSize}. Auto-rounded to nearest pack size: {activeMath.recommendedUnits} units ({activeMath.casesCount} cases).
                    </Text>
                  </Box>

                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Supplier Minimum Order Quantity (MOQ):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMathItem.minOrderQty} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Supplier Pack Size (Master Carton multiple):
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMathItem.packSize} units/case
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Rounding Logic:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {activeMath.recommendedUnits > 0
                          ? `${Math.max(activeMath.rawDeficit, activeMathItem.minOrderQty)} units rounded up to the next multiple of ${activeMathItem.packSize}`
                          : "No rounding needed (0 units required)"}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyLg" fontWeight="bold">
                        Final Recommended Purchase Order:
                      </Text>
                      <BlockStack inlineAlign="end">
                        <Text
                          as="span"
                          variant="bodyLg"
                          fontWeight="bold"
                          tone={activeMath.recommendedUnits > 0 ? "critical" : "success"}
                        >
                          {activeMath.recommendedUnits > 0
                            ? `${activeMath.recommendedUnits} units (${activeMath.casesCount} cases)`
                            : "0 units (No order required)"}
                        </Text>
                        <Text as="span" variant="bodyXs" tone="subdued">
                          {activeMath.recommendedUnits > 0
                            ? `Total Line Cost: $${activeMath.estimatedCost.toFixed(2)}`
                            : "Zero reorder capital required"}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
