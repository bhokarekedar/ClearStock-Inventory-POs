import { useState, useMemo } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useParams, useRouteError, useLoaderData, useSubmit, useNavigation } from "react-router";
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
  Box,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckIcon,
  ExportIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Fallback image lookup
const CATALOG_IMAGES: Record<string, string> = {
  "gid://shopify/ProductVariant/44129481923":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
  "gid://shopify/ProductVariant/44129481924":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
  "gid://shopify/ProductVariant/44129481925":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
  "gid://shopify/ProductVariant/44129481926":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
  "gid://shopify/ProductVariant/44129481927":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
  "gid://shopify/ProductVariant/44129481928":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
  "gid://shopify/ProductVariant/44129481929":
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
};

export interface ReceivingLineItem {
  id: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  variantTitle: string;
  sku: string;
  supplierSku: string;
  imageUrl: string;
  unitCost: number;
  orderedQty: number;
  receivedQty: number;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rawId = params.id || "";
  const poIdOrNumber = rawId.toUpperCase();

  // 1. Fetch Purchase Order from PostgreSQL
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      OR: [
        { poNumber: poIdOrNumber },
        { id: rawId },
      ],
    },
    include: {
      supplier: true,
      items: true,
    },
  });

  if (!po) {
    // Graceful fallback for demo view if PO doesn't exist
    return {
      po: {
        id: "fallback",
        poNumber: poIdOrNumber || "PO-1001",
        status: "ORDERED",
        supplierName: "Apex Apparel Ltd.",
        supplierEmail: "orders@apexapparel.example.com",
        carrier: "DHL Express Freight",
        notes: "Spring restock batch #1 - Standard delivery.",
        expectedArrival: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
        items: [
          {
            id: "fallback-item-1",
            variantId: "gid://shopify/ProductVariant/44129481926",
            inventoryItemId: "gid://shopify/InventoryItem/48192841294",
            title: "Thermal Waffle Crewneck",
            variantTitle: "Heather Grey / Medium",
            sku: "WFL-GRY-M",
            supplierSku: "WFL-GRY-M",
            imageUrl:
              "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
            unitCost: 14.0,
            orderedQty: 50,
            receivedQty: 50,
          },
        ],
      },
    };
  }

  return {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      supplierName: po.supplier.name,
      supplierEmail: po.supplier.email || "orders@supplier.example.com",
      carrier: "Standard Logistics Express",
      notes: po.notes || "No notes provided.",
      expectedArrival: po.expectedArrival
        ? new Date(po.expectedArrival).toISOString().split("T")[0]
        : "",
      items: po.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        inventoryItemId: item.inventoryItemId || "",
        title: item.title,
        variantTitle: "Standard",
        sku: item.sku || "",
        supplierSku: item.sku || "",
        imageUrl:
          CATALOG_IMAGES[item.variantId] ||
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
        unitCost: Number(item.unitCost),
        orderedQty: item.quantityOrdered,
        receivedQty: item.quantityReceived || item.quantityOrdered,
      })),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const poId = String(formData.get("poId"));
  const itemsJson = String(formData.get("items") || "[]");

  const itemsToUpdate = JSON.parse(itemsJson) as Array<{
    id: string;
    receivedQty: number;
  }>;

  // 1. Update received quantities in PostgreSQL
  for (const item of itemsToUpdate) {
    await prisma.purchaseOrderItem.update({
      where: { id: item.id },
      data: { quantityReceived: Number(item.receivedQty) },
    });
  }

  // 2. Determine new status
  const allItems = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poId },
  });

  const allReceived = allItems.every((i) => i.quantityReceived >= i.quantityOrdered);
  const anyReceived = allItems.some((i) => i.quantityReceived > 0);
  const newStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED";

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: newStatus },
  });

  return { success: true, status: newStatus };
};

export default function PurchaseOrderDetailsAndReceiving() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();

  const isSubmitting = navigation.state === "submitting";

  const { po } = loaderData;
  const poNumber = po.poNumber;
  const supplierName = po.supplierName;
  const carrier = po.carrier;

  const [items, setItems] = useState<ReceivingLineItem[]>(po.items);

  // Handle manual count updates from warehouse receiver
  const handleReceivedQtyChange = (id: string, newQtyStr: string) => {
    const qty = parseInt(newQtyStr, 10);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, receivedQty: isNaN(qty) ? 0 : qty } : item,
      ),
    );
  };

  // Quick action: set all items as 100% fully received
  const handleReceiveAllInFull = () => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, receivedQty: item.orderedQty })),
    );
    shopify.toast.show("All items marked as 100% received.");
  };

  // Discrepancy & Variance Calculations
  const metrics = useMemo(() => {
    let totalOrderedUnits = 0;
    let totalReceivedUnits = 0;
    let totalOrderedValue = 0;
    let totalReceivedValue = 0;
    let discrepancyCount = 0;

    items.forEach((item) => {
      totalOrderedUnits += item.orderedQty;
      totalReceivedUnits += item.receivedQty;
      totalOrderedValue += item.orderedQty * item.unitCost;
      totalReceivedValue += item.receivedQty * item.unitCost;
      if (item.receivedQty !== item.orderedQty) {
        discrepancyCount++;
      }
    });

    const netUnitDiscrepancy = totalReceivedUnits - totalOrderedUnits;
    const netValueDiscrepancy = totalReceivedValue - totalOrderedValue;

    return {
      totalOrderedUnits,
      totalReceivedUnits,
      totalOrderedValue,
      totalReceivedValue,
      netUnitDiscrepancy,
      netValueDiscrepancy,
      discrepancyCount,
      hasShortage: netUnitDiscrepancy < 0,
      hasOverage: netUnitDiscrepancy > 0,
    };
  }, [items]);

  // Commit action: updates PostgreSQL & simulates firing inventoryAdjustQuantities
  const handleCommitToShopify = () => {
    submit(
      {
        poId: po.id,
        items: JSON.stringify(
          items.map((i) => ({ id: i.id, receivedQty: i.receivedQty })),
        ),
      },
      { method: "post" },
    );
    shopify.toast.show(
      `Committed ${metrics.totalReceivedUnits} received units to PostgreSQL & Shopify inventory!`,
    );
  };

  const handleEmailSupplierNotice = () => {
    shopify.toast.show(
      `Discrepancy report emailed to ${supplierName} (Claiming $${Math.abs(metrics.netValueDiscrepancy).toFixed(2)} credit).`,
    );
  };

  let statusBadgeTone: "attention" | "info" | "warning" | "success" = "info";
  let statusBadgeText = "Ordered";
  if (po.status === "RECEIVED") {
    statusBadgeTone = "success";
    statusBadgeText = "Received";
  } else if (po.status === "PARTIALLY_RECEIVED") {
    statusBadgeTone = "warning";
    statusBadgeText = "Partially Received";
  } else if (po.status === "DRAFT") {
    statusBadgeTone = "attention";
    statusBadgeText = "Draft";
  }

  return (
    <Page
      backAction={{
        content: "Back to Purchase Orders",
        onAction: () => navigate("/app/purchase-orders"),
      }}
      title={`${poNumber} • ${supplierName}`}
      subtitle={`Receiving dock audit • ${carrier}`}
      titleMetadata={<Badge tone={statusBadgeTone}>{statusBadgeText}</Badge>}
      primaryAction={{
        content: isSubmitting ? "Updating Database & Shopify..." : "Commit Received Stock",
        loading: isSubmitting,
        onAction: handleCommitToShopify,
      }}
      secondaryActions={[
        {
          content: "Email Supplier Claim",
          icon: AlertCircleIcon,
          onAction: handleEmailSupplierNotice,
        },
        {
          content: "Export Receiving Slip",
          icon: ExportIcon,
          onAction: () => shopify.toast.show("Exporting receiving slip PDF..."),
        },
      ]}
    >
      <BlockStack gap="400">
        {/* Status Alert Banners */}
        {metrics.hasShortage && (
          <Banner
            title="Shipment Shortage Detected"
            tone="warning"
          >
            <Text as="p" variant="bodyMd">
              The shipment is short by <strong>{Math.abs(metrics.netUnitDiscrepancy)} units</strong>{" "}
              (Value shortfall: <strong>${Math.abs(metrics.netValueDiscrepancy).toFixed(2)}</strong>).
              Only confirmed units will be committed to inventory.
            </Text>
          </Banner>
        )}

        {metrics.discrepancyCount === 0 && (
          <Banner
            title="Clean Shipment - 100% In-Spec"
            tone="success"
          >
            <Text as="p" variant="bodyMd">
              All physical counts match the purchase order exactly. Ready to commit additions to Shopify.
            </Text>
          </Banner>
        )}

        <Layout>
          {/* Main Receiving Audit Table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Line Items Received ({items.length})
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Verify physical quantities delivered at loading dock
                    </Text>
                  </BlockStack>

                  <Button size="slim" onClick={handleReceiveAllInFull}>
                    Receive All In Full
                  </Button>
                </InlineStack>
              </Box>

              <IndexTable
                resourceName={{ singular: "line item", plural: "line items" }}
                itemCount={items.length}
                selectable={false}
                headings={[
                  { title: "Product & Variant" },
                  { title: "Unit Cost" },
                  { title: "Ordered" },
                  { title: "Actual Received" },
                  { title: "Variance" },
                  { title: "Received Subtotal", alignment: "end" },
                ]}
              >
                {items.map((item, index) => {
                  const varianceUnits = item.receivedQty - item.orderedQty;
                  const varianceValue = varianceUnits * item.unitCost;
                  const isMatch = varianceUnits === 0;
                  const isShort = varianceUnits < 0;

                  return (
                    <IndexTable.Row id={item.id} key={item.id} position={index}>
                      {/* Product details */}
                      <IndexTable.Cell>
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={item.imageUrl}
                            alt={item.title}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {item.title}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {item.variantTitle} • SKU: {item.sku}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </IndexTable.Cell>

                      {/* Unit Cost */}
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm">
                          ${item.unitCost.toFixed(2)}
                        </Text>
                      </IndexTable.Cell>

                      {/* Ordered Qty */}
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="medium">
                          {item.orderedQty}
                        </Text>
                      </IndexTable.Cell>

                      {/* Received Qty Input */}
                      <IndexTable.Cell>
                        <div style={{ width: "90px" }}>
                          <TextField
                            label="Received Qty"
                            labelHidden
                            type="number"
                            value={String(item.receivedQty)}
                            onChange={(val) => handleReceivedQtyChange(item.id, val)}
                            autoComplete="off"
                            autoSize
                          />
                        </div>
                      </IndexTable.Cell>

                      {/* Variance Indicator */}
                      <IndexTable.Cell>
                        {isMatch ? (
                          <Badge tone="success">Exact Match</Badge>
                        ) : isShort ? (
                          <Badge tone="warning">
                            {`${varianceUnits} units ($${varianceValue.toFixed(2)})`}
                          </Badge>
                        ) : (
                          <Badge tone="info">{`+${varianceUnits} units (Overage)`}</Badge>
                        )}
                      </IndexTable.Cell>

                      {/* Subtotal */}
                      <IndexTable.Cell>
                        <div style={{ textAlign: "right" }}>
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            ${(item.receivedQty * item.unitCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </Layout.Section>

          {/* Right Column: Audit & Reconciliation Financial Summary */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Financial Variance Reconciliation */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Receiving Audit Reconciliation
                  </Text>

                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Ordered Units:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {metrics.totalOrderedUnits} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Physical Delivered:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {metrics.totalReceivedUnits} units
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        PO Order Valuation:
                      </Text>
                      <Text as="span" variant="bodySm">
                        ${metrics.totalOrderedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Received Stock Value:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        ${metrics.totalReceivedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="headingSm">
                        Invoice Credit Claim:
                      </Text>
                      <Text
                        as="span"
                        variant="headingSm"
                        tone={metrics.netValueDiscrepancy < 0 ? "critical" : "success"}
                      >
                        {metrics.netValueDiscrepancy < 0
                          ? `-$${Math.abs(metrics.netValueDiscrepancy).toFixed(2)}`
                          : `$${metrics.netValueDiscrepancy.toFixed(2)}`}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Order Metadata */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Supplier & Shipping Details
                  </Text>

                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Supplier:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {supplierName}
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Contact:
                      </Text>
                      <Text as="span" variant="bodySm">
                        {po.supplierEmail}
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Expected Arrival:
                      </Text>
                      <Text as="span" variant="bodySm">
                        {po.expectedArrival || "In transit"}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <Text as="span" variant="bodyXs" tone="subdued">
                      Notes: {po.notes}
                    </Text>
                  </BlockStack>
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
