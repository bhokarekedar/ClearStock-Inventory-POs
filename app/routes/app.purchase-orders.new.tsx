import { useState, useMemo } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError, useLoaderData, useSubmit, useNavigation, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  Thumbnail,
  Divider,
  Banner,
  Select,
  Modal,
  Box,
  Icon,
} from "@shopify/polaris";
import {
  ArrowLeftIcon,
  ExportIcon,
  CheckIcon,
  DeleteIcon,
  PlusIcon,
  SearchIcon,
  AlertCircleIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export interface DraftPOItem {
  id: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  variantTitle: string;
  sku: string;
  supplierSku: string;
  imageUrl: string;
  packSize: number;
  calculatedDeficit: number;
  orderQuantity: number;
  unitCost: number;
}

export interface AvailableRuleItem {
  ruleId: string;
  variantId: string;
  inventoryItemId: string;
  supplierId: string;
  supplierName: string;
  title: string;
  variantTitle: string;
  sku: string;
  supplierSku: string;
  imageUrl: string;
  packSize: number;
  unitCost: number;
  minOrderQty: number;
  recommendedQty: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const itemsParam = url.searchParams.get("items");
  const supplierParam = url.searchParams.get("supplierId");
  const selectedRuleIds = itemsParam ? itemsParam.split(",").filter(Boolean) : [];

  // 1. Fetch all suppliers for selection
  const suppliersDb = await prisma.supplier.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });

  // 2. Fetch all rules for the shop with supplier and catalog details
  const allRulesDb = await prisma.variantSupplierRule.findMany({
    where: { shop },
    include: { supplier: true },
    orderBy: { variantId: "asc" },
  });

  // 2.5 Fetch 30-day sales, open incoming POs, and dock receipts for true mathematical replenishment
  const now = new Date();
  const date30dAgo = new Date(now);
  date30dAgo.setDate(date30dAgo.getDate() - 30);

  const salesDb = await prisma.dailySalesAggregator.findMany({
    where: {
      shop,
      date: { gte: date30dAgo },
    },
  });

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

  function getRuleRecommendedQty(r: (typeof allRulesDb)[0]): { recommendedQty: number; deficit: number } {
    const variantSales = salesDb.filter((s) => s.variantId === r.variantId);
    const unitsSold30d = variantSales.reduce((sum: number, s) => sum + s.unitsSold, 0);
    const ads = Number((unitsSold30d / 30).toFixed(1));
    const leadTime = r.leadTimeDays ?? r.supplier.defaultLeadTime;
    const leadTimeDemand = ads * leadTime;
    const safetyStock = Math.max(Math.round(ads * r.safetyStockDays), r.safetyStockMinimum);
    const reorderPoint = Math.round(leadTimeDemand + safetyStock);

    const stockOnOrder = openPoItems
      .filter((p) => p.variantId === r.variantId)
      .reduce((sum: number, p) => sum + (p.quantityOrdered - p.quantityReceived), 0);
    const stockOnHand = r.availableStock || 0;

    const rawDeficit = Math.max(0, reorderPoint - stockOnHand - stockOnOrder);
    if (rawDeficit > 0) {
      const minUnitsNeeded = Math.max(rawDeficit, r.minOrderQty);
      const casesCount = Math.ceil(minUnitsNeeded / r.packSize);
      return {
        recommendedQty: casesCount * r.packSize,
        deficit: rawDeficit,
      };
    }

    const minCases = Math.ceil(Math.max(r.minOrderQty, r.packSize) / r.packSize);
    return {
      recommendedQty: minCases * r.packSize,
      deficit: r.minOrderQty,
    };
  }

  const availableRules: AvailableRuleItem[] = allRulesDb.map((r) => {
    const { recommendedQty } = getRuleRecommendedQty(r);
    return {
      ruleId: r.id,
      variantId: r.variantId,
      inventoryItemId: r.inventoryItemId || "",
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      title: r.title || "Untitled Product",
      variantTitle: r.variantTitle || "",
      sku: r.supplierSku || "",
      supplierSku: r.supplierSku || "",
      imageUrl: r.imageUrl || "",
      packSize: r.packSize,
      unitCost: Number(r.unitCost),
      minOrderQty: r.minOrderQty,
      recommendedQty,
    };
  });

  // 3. Determine next sequential PO number
  const poCount = await prisma.purchaseOrder.count();
  const nextPoNumber = `PO-${1002 + poCount}`;

  // 4. Fetch rules for selected items (from Replenishment page)
  const selectedRules =
    selectedRuleIds.length > 0
      ? allRulesDb.filter((r) => selectedRuleIds.includes(r.id))
      : [];

  // Determine primary supplier
  let primarySupplier =
    (supplierParam ? suppliersDb.find((s) => s.id === supplierParam) : null) ||
    suppliersDb[0] || {
      id: "",
      name: "Select Supplier",
      defaultLeadTime: 14,
    };

  let initialRules: typeof allRulesDb = [];
  if (selectedRules.length > 0) {
    // Pick the supplier of the first selected item as the primary supplier
    primarySupplier = selectedRules[0].supplier;
    // Filter initial rules so they strictly belong to the primary supplier
    initialRules = selectedRules.filter((r) => r.supplierId === primarySupplier.id);
  }

  // 5. Pre-calculate true recommended case-pack quantities
  const draftItems: DraftPOItem[] = initialRules.map((r) => {
    const { recommendedQty, deficit } = getRuleRecommendedQty(r);

    return {
      id: r.id,
      variantId: r.variantId,
      inventoryItemId: r.inventoryItemId || "",
      title: r.title || "Untitled Product",
      variantTitle: r.variantTitle || "",
      sku: r.supplierSku || "",
      supplierSku: r.supplierSku || "",
      imageUrl: r.imageUrl || "",
      packSize: r.packSize,
      calculatedDeficit: deficit,
      orderQuantity: recommendedQty,
      unitCost: Number(r.unitCost),
    };
  });

  return {
    poNumber: nextPoNumber,
    suppliers: suppliersDb.map((s) => ({
      label: s.name,
      value: s.id,
      leadTime: s.defaultLeadTime || 14,
    })),
    defaultSupplierId: primarySupplier.id,
    defaultSupplierName: primarySupplier.name,
    defaultLeadTime: primarySupplier.defaultLeadTime || 14,
    items: draftItems,
    availableRules,
    skippedCrossSupplierCount: selectedRules.length - initialRules.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const poNumber = String(formData.get("poNumber"));
  const supplierId = String(formData.get("supplierId"));
  const expectedArrivalStr = formData.get("expectedArrival");
  const notes = String(formData.get("notes") || "");
  const itemsJson = String(formData.get("items") || "[]");

  const itemsData = JSON.parse(itemsJson) as Array<{
    variantId: string;
    inventoryItemId?: string;
    sku?: string;
    title: string;
    quantityOrdered: number;
    unitCost: number;
  }>;

  const expectedArrival = expectedArrivalStr ? new Date(String(expectedArrivalStr)) : null;
  const statusParam = String(formData.get("status") || "DRAFT");
  const poStatus = statusParam === "ORDERED" ? "ORDERED" : "DRAFT";

  // Persist Purchase Order into PostgreSQL
  const po = await prisma.purchaseOrder.create({
    data: {
      shop,
      poNumber,
      supplierId,
      status: poStatus,
      expectedArrival,
      notes,
      items: {
        create: itemsData.map((item) => ({
          variantId: item.variantId,
          inventoryItemId: item.inventoryItemId || null,
          sku: item.sku || null,
          title: item.title,
          quantityOrdered: Number(item.quantityOrdered),
          unitCost: item.unitCost,
        })),
      },
    },
  });

  return redirect(`/app/purchase-orders?${poStatus === "ORDERED" ? "issued" : "draft"}=${po.poNumber}`);
};

export default function PurchaseOrderDraftEditor() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();

  const isSubmitting = navigation.state === "submitting";

  const [poNumber] = useState<string>(loaderData.poNumber);
  const [supplierId, setSupplierId] = useState<string>(loaderData.defaultSupplierId);
  const [supplierName, setSupplierName] = useState<string>(loaderData.defaultSupplierName);
  const [expectedArrival, setExpectedArrival] = useState<string>(
    new Date(Date.now() + loaderData.defaultLeadTime * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState<string>(
    "Standard sea freight. Ship in master cartons with barcode labels on outer boxes.",
  );
  const [items, setItems] = useState<DraftPOItem[]>(loaderData.items);

  // Line Item Picker Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");

  // Issue PO Confirmation Modal State
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  // Supplier Change Confirmation State
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);

  // Update item quantity
  const handleQuantityChange = (id: string, newQtyStr: string) => {
    const qty = parseInt(newQtyStr, 10);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, orderQuantity: isNaN(qty) ? 0 : qty } : item,
      ),
    );
  };

  // Remove line item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    shopify.toast.show("Line item removed from PO.");
  };

  // Safe Supplier Switch with Cross-Supplier Protection
  const handleSupplierChange = (newSupplierId: string) => {
    if (newSupplierId === supplierId) return;

    const newSupplierObj = loaderData.suppliers.find((s) => s.value === newSupplierId);
    const newLeadTime = newSupplierObj?.leadTime || 14;

    // Check if existing items belong to another supplier
    const conflictingItems = items.filter((item) => {
      const rule = loaderData.availableRules.find((r) => r.variantId === item.variantId);
      return rule && rule.supplierId !== newSupplierId;
    });

    if (conflictingItems.length > 0) {
      setPendingSupplierId(newSupplierId);
    } else {
      setSupplierId(newSupplierId);
      setSupplierName(newSupplierObj?.label || "");
      setExpectedArrival(
        new Date(Date.now() + newLeadTime * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      );
    }
  };

  // Confirm supplier switch & clear conflicting items
  const confirmSupplierSwitch = () => {
    if (!pendingSupplierId) return;
    const newSupplierObj = loaderData.suppliers.find((s) => s.value === pendingSupplierId);
    const newLeadTime = newSupplierObj?.leadTime || 14;

    const retainedItems = items.filter((item) => {
      const rule = loaderData.availableRules.find((r) => r.variantId === item.variantId);
      return rule && rule.supplierId === pendingSupplierId;
    });

    setItems(retainedItems);
    setSupplierId(pendingSupplierId);
    setSupplierName(newSupplierObj?.label || "");
    setExpectedArrival(
      new Date(Date.now() + newLeadTime * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    );
    setPendingSupplierId(null);

    shopify.toast.show(
      retainedItems.length > 0
        ? `Switched to ${newSupplierObj?.label}. Retained ${retainedItems.length} matching items.`
        : `Switched to ${newSupplierObj?.label}. Line items cleared to prevent supplier mixing.`,
    );
  };

  // Products available from the currently selected supplier
  const supplierAvailableRules = useMemo(() => {
    return loaderData.availableRules.filter((r) => r.supplierId === supplierId);
  }, [loaderData.availableRules, supplierId]);

  // Search filtered products in modal
  const filteredModalRules = useMemo(() => {
    if (!addSearchQuery.trim()) return supplierAvailableRules;
    const terms = addSearchQuery.toLowerCase().trim().split(/\s+/);
    return supplierAvailableRules.filter((item) => {
      const haystack = `${item.title} ${item.variantTitle} ${item.sku} ${item.supplierSku}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [supplierAvailableRules, addSearchQuery]);

  // Add Product to PO
  const handleAddProductToPO = (rule: AvailableRuleItem) => {
    const isAlreadyAdded = items.some((i) => i.variantId === rule.variantId);
    if (isAlreadyAdded) {
      shopify.toast.show(`${rule.title} is already on this Purchase Order.`);
      return;
    }

    const initialDeficit = rule.recommendedQty || Math.max(rule.minOrderQty, rule.packSize);
    const newItem: DraftPOItem = {
      id: rule.ruleId,
      variantId: rule.variantId,
      inventoryItemId: rule.inventoryItemId,
      title: rule.title,
      variantTitle: rule.variantTitle,
      sku: rule.sku,
      supplierSku: rule.supplierSku,
      imageUrl: rule.imageUrl,
      packSize: rule.packSize,
      calculatedDeficit: initialDeficit,
      orderQuantity: initialDeficit,
      unitCost: rule.unitCost,
    };

    setItems((prev) => [...prev, newItem]);
    shopify.toast.show(`Added ${rule.title} (${rule.sku}) to Purchase Order.`);
  };

  // Calculate totals
  const totals = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + item.orderQuantity, 0);
    const totalCost = items.reduce(
      (sum, item) => sum + item.orderQuantity * item.unitCost,
      0,
    );
    const totalCases = items.reduce(
      (sum, item) => sum + Math.ceil(item.orderQuantity / item.packSize),
      0,
    );
    return { totalUnits, totalCost, totalCases };
  }, [items]);

  const handleSaveDraft = (status: "DRAFT" | "ORDERED" = "DRAFT") => {
    if (items.length === 0) {
      shopify.toast.show("Cannot save an empty Purchase Order. Please add line items.");
      return;
    }

    const payload = items.map((i) => ({
      variantId: i.variantId,
      inventoryItemId: i.inventoryItemId,
      sku: i.sku,
      title: i.title,
      quantityOrdered: i.orderQuantity,
      unitCost: i.unitCost,
    }));

    submit(
      {
        poNumber,
        supplierId,
        expectedArrival,
        notes,
        status,
        items: JSON.stringify(payload),
      },
      { method: "post" },
    );
  };

  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      ["PO Number", poNumber],
      ["Supplier", supplierName],
      ["Expected Arrival", expectedArrival],
      ["Notes", notes],
      [],
      ["Product Title", "Variant", "SKU", "Supplier SKU", "Case Pack", "Order Quantity", "Unit Cost", "Subtotal"],
    ];

    items.forEach((item) => {
      rows.push([
        item.title,
        item.variantTitle,
        item.sku,
        item.supplierSku,
        item.packSize,
        item.orderQuantity,
        item.unitCost.toFixed(2),
        (item.orderQuantity * item.unitCost).toFixed(2),
      ]);
    });

    rows.push([]);
    rows.push(["Total Units", totals.totalUnits]);
    rows.push(["Total Cartons", totals.totalCases]);
    rows.push(["Estimated Total Cost", `$${totals.totalCost.toFixed(2)}`]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${poNumber}_${supplierName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    shopify.toast.show(`Exported ${poNumber} CSV file.`);
  };

  return (
    <Page
      backAction={{
        content: "Purchase Orders",
        onAction: () => navigate("/app/purchase-orders"),
      }}
      title={`Create Purchase Order (${poNumber})`}
      subtitle={`Supplier: ${supplierName} • Order status will be created as Draft`}
      primaryAction={{
        content: "Issue PO (Save & Mark Ordered)",
        icon: CheckIcon,
        loading: isSubmitting,
        onAction: () => {
          if (items.length === 0) {
            shopify.toast.show("Please add at least one line item before issuing the PO.", { isError: true });
            return;
          }
          setIsIssueModalOpen(true);
        },
      }}
      secondaryActions={[
        {
          content: "Save as Draft",
          loading: isSubmitting,
          onAction: () => handleSaveDraft("DRAFT"),
        },
        {
          content: "Export Supplier CSV",
          icon: ExportIcon,
          onAction: handleExportCSV,
        },
      ]}
    >
      <BlockStack gap="400">
        {loaderData.skippedCrossSupplierCount > 0 && (
          <Banner tone="warning" onDismiss={() => {}}>
            <Text as="p" variant="bodyMd">
              {loaderData.skippedCrossSupplierCount} selected item(s) belong to a different supplier and were excluded to prevent multi-supplier contamination. A single PO can only be addressed to one supplier.
            </Text>
          </Banner>
        )}

        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Quantities are pre-filled based on replenishment deficits and case-pack multiples. You can override quantities, add products, or remove line items before saving.
          </Text>
        </Banner>

        <Layout>
          {/* Main PO Items Spreadsheet Table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Order Line Items ({items.length})
                    </Text>
                    <Badge tone="info">{supplierName}</Badge>
                  </InlineStack>
                  <Button
                    icon={PlusIcon}
                    variant="primary"
                    onClick={() => setIsAddModalOpen(true)}
                  >
                    Add Product
                  </Button>
                </InlineStack>
              </Box>

              <IndexTable
                resourceName={{ singular: "line item", plural: "line items" }}
                itemCount={items.length}
                selectable={false}
                headings={[
                  { title: "Product & SKU" },
                  { title: "Unit Cost" },
                  { title: "Order Qty (Units)" },
                  { title: "Boxes & Total", alignment: "end" },
                  { title: "", alignment: "end" },
                ]}
              >
                {items.map((item, index) => {
                  const lineCases = Math.ceil(item.orderQuantity / item.packSize);
                  const lineSubtotal = item.orderQuantity * item.unitCost;

                  return (
                    <IndexTable.Row id={item.id} key={item.id} position={index}>
                      {/* Product Details */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "220px" }}>
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="small"
                            />
                            <BlockStack gap="025">
                              <Text as="span" variant="bodySm" fontWeight="semibold">
                                {item.title}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {item.variantTitle} · SKU: {item.sku}
                              </Text>
                              <InlineStack gap="100" blockAlign="center">
                                <Badge tone="info" size="small">{`Pack of ${item.packSize}`}</Badge>
                                {item.supplierSku && (
                                  <Text as="span" variant="bodyXs" tone="subdued">
                                    Vendor: {item.supplierSku}
                                  </Text>
                                )}
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                        </div>
                      </IndexTable.Cell>

                      {/* Unit Cost */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "80px" }}>
                          <Text as="span" variant="bodySm" fontWeight="medium">
                            ${item.unitCost.toFixed(2)}
                          </Text>
                        </div>
                      </IndexTable.Cell>

                      {/* Order Quantity Input */}
                      <IndexTable.Cell>
                        <div style={{ width: "120px" }}>
                          <TextField
                            label="Order Qty"
                            labelHidden
                            type="number"
                            suffix="units"
                            value={String(item.orderQuantity)}
                            onChange={(val) => handleQuantityChange(item.id, val)}
                            autoComplete="off"
                            autoSize
                            helpText={`${lineCases} ${lineCases === 1 ? "box" : "boxes"} (${item.packSize}/box)`}
                          />
                        </div>
                      </IndexTable.Cell>

                      {/* Cases & Line Total */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "120px", textAlign: "right" }}>
                          <BlockStack gap="025" inlineAlign="end">
                            <Text as="span" variant="bodySm" fontWeight="bold">
                              ${lineSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {lineCases} {lineCases === 1 ? "box" : "boxes"} ({item.orderQuantity} units)
                            </Text>
                          </BlockStack>
                        </div>
                      </IndexTable.Cell>

                      {/* Remove Line Action */}
                      <IndexTable.Cell>
                        <div style={{ textAlign: "right" }}>
                          <Button
                            icon={DeleteIcon}
                            tone="critical"
                            variant="plain"
                            accessibilityLabel="Remove item"
                            onClick={() => handleRemoveItem(item.id)}
                          />
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>

              {items.length === 0 && (
                <Box padding="600">
                  <BlockStack align="center" inlineAlign="center" gap="300">
                    <Text as="p" tone="subdued" alignment="center">
                      No line items on this Purchase Order.
                    </Text>
                    <Button
                      icon={PlusIcon}
                      variant="primary"
                      onClick={() => setIsAddModalOpen(true)}
                    >
                      Add Products from {supplierName}
                    </Button>
                  </BlockStack>
                </Box>
              )}
            </Card>
          </Layout.Section>

          {/* Sidebar Metadata & Order Summary */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Financial & Unit Summary */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    PO Order Summary
                  </Text>

                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Total Unique SKUs:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {items.length}
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Total Units Ordered:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {totals.totalUnits} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Total Master Cartons:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {totals.totalCases} cases
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        Estimated Total:
                      </Text>
                      <Text as="span" variant="headingMd" tone="success">
                        ${totals.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Supplier & Logistics Settings */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Logistics & Timeline
                  </Text>

                  <Select
                    label="Supplier"
                    options={loaderData.suppliers}
                    value={supplierId}
                    onChange={handleSupplierChange}
                    helpText="Changing supplier filters available products to avoid mixed vendor POs."
                  />

                  <TextField
                    label="Expected Delivery Date"
                    type="date"
                    value={expectedArrival}
                    onChange={setExpectedArrival}
                    autoComplete="off"
                    helpText={`Calculated from ${supplierName} lead time.`}
                  />

                  <TextField
                    label="Supplier Notes & Instructions"
                    value={notes}
                    onChange={setNotes}
                    multiline={3}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Modal: Add Product to Purchase Order */}
      <Modal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddSearchQuery("");
        }}
        title={`Add Product from ${supplierName}`}
        primaryAction={{
          content: "Done",
          onAction: () => {
            setIsAddModalOpen(false);
            setAddSearchQuery("");
          },
        }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Search products or SKU"
              value={addSearchQuery}
              onChange={setAddSearchQuery}
              prefix={<Icon source={SearchIcon} />}
              placeholder="Search by title, variant, or SKU..."
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setAddSearchQuery("")}
            />

            <Text as="p" variant="bodySm" tone="subdued">
              Showing {filteredModalRules.length} product(s) sourced from {supplierName}.
            </Text>

            <div style={{ maxHeight: "380px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "8px" }}>
              {filteredModalRules.map((rule) => {
                const isAlreadyInPo = items.some((i) => i.variantId === rule.variantId);

                return (
                  <div
                    key={rule.ruleId}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #f1f2f3",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <InlineStack gap="300" blockAlign="center">
                      <Thumbnail
                        source={rule.imageUrl}
                        alt={rule.title}
                        size="small"
                      />
                      <BlockStack gap="050">
                        <Text as="p" variant="bodySm" fontWeight="bold">
                          {rule.title}
                        </Text>
                        <Text as="p" variant="bodyXs" tone="subdued">
                          {rule.variantTitle} • SKU: {rule.sku}
                        </Text>
                        <InlineStack gap="150" blockAlign="center">
                          <Badge tone="info">{`Pack of ${rule.packSize}`}</Badge>
                          <Badge tone="new">{`MOQ: ${rule.minOrderQty}`}</Badge>
                          <Badge tone="attention">{`Reorder: ${rule.recommendedQty} units`}</Badge>
                          <Text as="span" variant="bodyXs" tone="subdued">
                            Unit Cost: ${rule.unitCost.toFixed(2)}
                          </Text>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>

                    <div>
                      {isAlreadyInPo ? (
                        <Badge tone="success">Added</Badge>
                      ) : (
                        <Button
                          icon={PlusIcon}
                          size="slim"
                          onClick={() => handleAddProductToPO(rule)}
                        >
                          Add
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredModalRules.length === 0 && (
                <Box padding="600">
                  <Text as="p" alignment="center" tone="subdued">
                    No products found matching &ldquo;{addSearchQuery}&rdquo; for {supplierName}.
                  </Text>
                </Box>
              )}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Confirmation Modal: Prevent Multi-Supplier Contamination */}
      <Modal
        open={Boolean(pendingSupplierId)}
        onClose={() => setPendingSupplierId(null)}
        title="Switch Supplier & Clear Items?"
        primaryAction={{
          content: "Switch Supplier & Clear Items",
          destructive: true,
          onAction: confirmSupplierSwitch,
        }}
        secondaryActions={[
          {
            content: "Keep Current Supplier",
            onAction: () => setPendingSupplierId(null),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="warning">
              <Text as="p" variant="bodyMd">
                A single Purchase Order can only be sent to one vendor. Your current draft order contains {items.length} line item(s) from <strong>{supplierName}</strong>.
              </Text>
            </Banner>
            <Text as="p" variant="bodyMd">
              Switching to <strong>{loaderData.suppliers.find((s) => s.value === pendingSupplierId)?.label}</strong> will remove conflicting line items from your draft. Would you like to proceed?
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Confirmation Modal: Issue PO and Mark Ordered */}
      <Modal
        open={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        title={`Issue Purchase Order (${poNumber})?`}
        primaryAction={{
          content: "Confirm & Issue PO",
          loading: isSubmitting,
          onAction: () => {
            setIsIssueModalOpen(false);
            handleSaveDraft("ORDERED");
          },
        }}
        secondaryActions={[
          {
            content: "Keep Editing",
            onAction: () => setIsIssueModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <Text as="p" variant="bodyMd">
                Issuing this purchase order officially marks it as <strong>Ordered (In-Transit)</strong> and counts <strong>+{totals.totalUnits} units</strong> as incoming stock on your Replenishment dashboard.
              </Text>
            </Banner>

            <Card padding="300" background="bg-surface-secondary">
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Supplier:</Text>
                  <Text as="span" variant="bodySm" fontWeight="bold">{supplierName}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Items to Order:</Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">{items.length} SKUs ({totals.totalUnits} units)</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Total Order Value:</Text>
                  <Text as="span" variant="bodySm" fontWeight="bold">
                    ${totals.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm" tone="subdued">Expected Delivery Date:</Text>
                  <Text as="span" variant="bodySm">{expectedArrival || "TBD"}</Text>
                </InlineStack>
              </BlockStack>
            </Card>

            <Text as="p" variant="bodySm" tone="subdued">
              After confirming, you will be taken to your <strong>Purchase Orders List</strong> where you can track this order. When goods physically arrive at your warehouse, click <strong>"Receive Stock"</strong> to verify delivery.
            </Text>
          </BlockStack>
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
