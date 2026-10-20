import { useState, useMemo } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError, useLoaderData, useSubmit, useNavigation, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
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
} from "@shopify/polaris";
import {
  ArrowLeftIcon,
  ExportIcon,
  CheckIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Fallback catalog details for product imagery and display
const CATALOG_DEFAULTS: Record<
  string,
  {
    title: string;
    variantTitle: string;
    sku: string;
    imageUrl: string;
  }
> = {
  "gid://shopify/ProductVariant/44129481923": {
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Large",
    sku: "HDY-BLK-L",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
  },
  "gid://shopify/ProductVariant/44129481924": {
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Olive Green / One Size",
    sku: "BN-OLV-OS",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
  },
  "gid://shopify/ProductVariant/44129481925": {
    title: "Canvas Chore Jacket",
    variantTitle: "Caramel Tan / XL",
    sku: "JKT-CRM-XL",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
  },
  "gid://shopify/ProductVariant/44129481926": {
    title: "Thermal Waffle Crewneck",
    variantTitle: "Heather Grey / Medium",
    sku: "WFL-GRY-M",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
  },
  "gid://shopify/ProductVariant/44129481927": {
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Off-White / Medium",
    sku: "HDY-WHT-M",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
  },
  "gid://shopify/ProductVariant/44129481928": {
    title: "French Terry Sweatpants",
    variantTitle: "Sage Green / Small",
    sku: "SWP-SGE-S",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
  },
  "gid://shopify/ProductVariant/44129481929": {
    title: "Chunky Knit Scarf",
    variantTitle: "Charcoal / One Size",
    sku: "SCF-CHR-OS",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
  },
};

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const itemsParam = url.searchParams.get("items");
  const selectedRuleIds = itemsParam ? itemsParam.split(",").filter(Boolean) : [];

  // 1. Fetch all suppliers for selection
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
  });

  // 2. Determine next sequential PO number
  const poCount = await prisma.purchaseOrder.count();
  const nextPoNumber = `PO-${1002 + poCount}`;

  // 3. Fetch rules for selected items or fallback to top rules
  const selectedRules =
    selectedRuleIds.length > 0
      ? await prisma.variantSupplierRule.findMany({
          where: { id: { in: selectedRuleIds } },
          include: { supplier: true },
        })
      : [];

  const rules =
    selectedRules.length > 0
      ? selectedRules
      : await prisma.variantSupplierRule.findMany({
          include: { supplier: true },
          take: 3,
        });

  // 4. Default to primary supplier
  const primarySupplier = rules[0]?.supplier || suppliers[0] || {
    id: "sup-apex",
    name: "Apex Apparel Ltd.",
    defaultLeadTime: 14,
  };

  // 5. Pre-calculate recommended case-pack quantities
  const draftItems: DraftPOItem[] = rules.map((r) => {
    const catalog = CATALOG_DEFAULTS[r.variantId] || {
      title: "Product " + (r.supplierSku || r.id),
      variantTitle: "Default Variant",
      sku: r.supplierSku || "SKU-" + r.id.slice(0, 6),
      imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    };

    const deficit = Math.max(r.minOrderQty, 24);
    const cases = Math.ceil(deficit / r.packSize);
    const recommendedQty = cases * r.packSize;

    return {
      id: r.id,
      variantId: r.variantId,
      inventoryItemId: r.inventoryItemId || "",
      title: catalog.title,
      variantTitle: catalog.variantTitle,
      sku: catalog.sku,
      supplierSku: r.supplierSku || catalog.sku,
      imageUrl: catalog.imageUrl,
      packSize: r.packSize,
      calculatedDeficit: deficit,
      orderQuantity: recommendedQty,
      unitCost: Number(r.unitCost),
    };
  });

  return {
    poNumber: nextPoNumber,
    suppliers: suppliers.map((s) => ({ label: s.name, value: s.id })),
    defaultSupplierId: primarySupplier.id,
    defaultSupplierName: primarySupplier.name,
    defaultLeadTime: primarySupplier.defaultLeadTime || 14,
    items: draftItems,
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

  return redirect(`/app/purchase-orders/${po.poNumber}`);
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
      ["PO Number", "Supplier", "Expected Arrival", "SKU", "Supplier SKU", "Title", "Variant", "Quantity Ordered", "Case Pack", "Unit Cost ($)", "Subtotal ($)"],
      ...items.map((i) => [
        poNumber,
        supplierName,
        expectedArrival || "TBD",
        i.sku,
        i.supplierSku,
        i.title,
        i.variantTitle,
        i.orderQuantity,
        i.packSize,
        i.unitCost.toFixed(2),
        (i.orderQuantity * i.unitCost).toFixed(2),
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${poNumber}_Draft_${supplierName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    shopify.toast.show(`Exported ${poNumber} to CSV.`);
  };

  return (
    <Page
      backAction={{
        content: "Back to Replenishment",
        onAction: () => navigate("/app"),
      }}
      title={`${poNumber} (Draft Purchase Order)`}
      subtitle={`Supplier: ${supplierName} • Created from replenishment recommendations`}
      primaryAction={{
        content: isSubmitting ? "Creating & Issuing..." : "Save & Issue PO (Mark Ordered)",
        loading: isSubmitting,
        onAction: () => handleSaveDraft("ORDERED"),
      }}
      secondaryActions={[
        {
          content: "Save as Draft Only",
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
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Quantities are pre-filled based on your replenishment deficit and supplier pack sizes.
            You can manually override any quantity directly in the table below before saving to PostgreSQL.
          </Text>
        </Banner>

        <Layout>
          {/* Main PO Items Spreadsheet Table */}
          <Layout.Section>
            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Order Line Items ({items.length})
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Rounded to Case Pack Multiples
                  </Text>
                </InlineStack>

                <BlockStack gap="200">
                  {items.map((item) => {
                    const lineCases = Math.ceil(item.orderQuantity / item.packSize);
                    const lineSubtotal = item.orderQuantity * item.unitCost;
                    const isCasePackAligned = item.orderQuantity % item.packSize === 0;

                    return (
                      <Card key={item.id} padding="300" background="bg-surface-secondary">
                        <InlineStack align="space-between" blockAlign="center" gap="400">
                          {/* Product Info */}
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="medium"
                            />
                            <BlockStack gap="050">
                              <Text as="p" variant="bodyMd" fontWeight="bold">
                                {item.title}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {item.variantTitle} • SKU: {item.sku}
                              </Text>
                              <InlineStack gap="150" blockAlign="center">
                                <Badge tone="info">{`Pack of ${item.packSize}`}</Badge>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  Vendor SKU: {item.supplierSku}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>

                          {/* Editable Quantity & Cost Inputs */}
                          <InlineStack gap="300" blockAlign="center">
                            <BlockStack gap="050" inlineAlign="end">
                              <Text as="span" variant="bodyXs" tone="subdued">
                                Unit Cost
                              </Text>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                ${item.unitCost.toFixed(2)}
                              </Text>
                            </BlockStack>

                            <div style={{ width: "100px" }}>
                              <TextField
                                label="Order Qty"
                                labelHidden
                                type="number"
                                value={String(item.orderQuantity)}
                                onChange={(val) => handleQuantityChange(item.id, val)}
                                autoComplete="off"
                                autoSize
                              />
                            </div>

                            <BlockStack gap="050" inlineAlign="end">
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {lineCases} cases
                              </Text>
                              <Text as="span" variant="bodyMd" fontWeight="bold">
                                ${lineSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </Text>
                            </BlockStack>

                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              variant="plain"
                              accessibilityLabel="Remove item"
                              onClick={() => handleRemoveItem(item.id)}
                            />
                          </InlineStack>
                        </InlineStack>
                      </Card>
                    );
                  })}

                  {items.length === 0 && (
                    <Text as="p" tone="subdued" alignment="center">
                      All line items removed. Return to replenishment to add items.
                    </Text>
                  )}
                </BlockStack>
              </BlockStack>
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

                    <InlineStack align="space-between">
                      <Text as="span" variant="headingMd">
                        Total PO Valuation:
                      </Text>
                      <Text as="span" variant="headingMd" tone="critical">
                        ${totals.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Delivery & Logistics */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Logistics & Timeline
                  </Text>

                  <Select
                    label="Supplier"
                    options={loaderData.suppliers}
                    value={supplierId}
                    onChange={(val) => {
                      setSupplierId(val);
                      const s = loaderData.suppliers.find((sup) => sup.value === val);
                      if (s) setSupplierName(s.label);
                    }}
                  />

                  <TextField
                    label="Expected Delivery Date"
                    type="date"
                    value={expectedArrival}
                    onChange={setExpectedArrival}
                    autoComplete="off"
                    helpText={`Lead time: ${loaderData.defaultLeadTime} days`}
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
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
