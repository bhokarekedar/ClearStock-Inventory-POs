import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useParams, useRouteError } from "react-router";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface ReceivingLineItem {
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
  receivedQty: number; // Editable by user
}

const INITIAL_RECEIVING_ITEMS: ReceivingLineItem[] = [
  {
    id: "rec-item-1",
    variantId: "gid://shopify/ProductVariant/44129481925",
    inventoryItemId: "gid://shopify/InventoryItem/48192841293",
    title: "Canvas Chore Jacket",
    variantTitle: "Caramel Tan / XL",
    sku: "JKT-CRM-XL",
    supplierSku: "SMT-JKT-09-XL",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    unitCost: 34.0,
    orderedQty: 1000,
    receivedQty: 950, // Short-shipped by 50 units!
  },
  {
    id: "rec-item-2",
    variantId: "gid://shopify/ProductVariant/44129481923",
    inventoryItemId: "gid://shopify/InventoryItem/48192841291",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Large",
    sku: "HDY-BLK-L",
    supplierSku: "SMT-HDY-01-L",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    unitCost: 18.5,
    orderedQty: 500,
    receivedQty: 500, // Exact match
  },
  {
    id: "rec-item-3",
    variantId: "gid://shopify/ProductVariant/44129481924",
    inventoryItemId: "gid://shopify/InventoryItem/48192841292",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Olive Green / One Size",
    sku: "BN-OLV-OS",
    supplierSku: "SMT-BN-02-OS",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    unitCost: 6.2,
    orderedQty: 200,
    receivedQty: 200, // Exact match
  },
];

export default function PurchaseOrderDetailsAndReceiving() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const params = useParams();

  const poNumber = params.id ? params.id.toUpperCase() : "PO-1040";
  const [supplierName] = useState<string>("Summit Goods");
  const [carrier] = useState<string>("DHL Express Freight (Tracking #940010920212)");
  const [items, setItems] = useState<ReceivingLineItem[]>(INITIAL_RECEIVING_ITEMS);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Handle manual count updates from warehouse receiver
  const handleReceivedQtyChange = (id: string, newQtyStr: string) => {
    const qty = parseInt(newQtyStr, 10);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, receivedQty: isNaN(qty) ? 0 : qty } : item,
      ),
    );
  };

  // Calculate totals and financial discrepancies
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

  // Commit action: simulates firing inventoryAdjustQuantities GraphQL mutation
  const handleCommitToShopify = () => {
    setIsCommitting(true);
    setTimeout(() => {
      setIsCommitting(false);
      shopify.toast.show(
        `Success! Committed ${metrics.totalReceivedUnits} received units to Shopify inventory via inventoryAdjustQuantities.`,
      );
    }, 1200);
  };

  const handleEmailSupplierNotice = () => {
    shopify.toast.show(
      `Discrepancy report emailed to ${supplierName} (Claiming $${Math.abs(metrics.netValueDiscrepancy).toFixed(2)} credit).`,
    );
  };

  return (
    <Page
      backAction={{
        content: "Back to Purchase Orders",
        onAction: () => navigate("/app/purchase-orders"),
      }}
      title={`${poNumber} • ${supplierName}`}
      subtitle={`Receiving dock audit • ${carrier}`}
      titleMetadata={<Badge tone="attention">Partially Received</Badge>}
      primaryAction={{
        content: isCommitting ? "Updating Shopify Inventory..." : "Commit Received Stock to Shopify",
        loading: isCommitting,
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
      <style>{`
        /* Fix Polaris IndexTable sticky column overlap bug */
        .Polaris-IndexTable__Table--sticky .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell,
        .Polaris-IndexTable__StickyTable .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell,
        .Polaris-IndexTable__Table--sticky .Polaris-IndexTable__TableHeading--second,
        .Polaris-IndexTable__StickyTable .Polaris-IndexTable__TableHeading--second,
        .Polaris-IndexTable__TableCell--first,
        .Polaris-IndexTable__TableHeading--first {
          position: static !important;
          left: auto !important;
          box-shadow: none !important;
        }
        .Polaris-IndexTable__StickyTableHeader {
          display: none !important;
        }
        .Polaris-IndexTable__Table {
          table-layout: auto !important;
          width: 100% !important;
        }
        .Polaris-IndexTable__TableHeading {
          white-space: nowrap !important;
          padding: 12px 16px !important;
        }
        .Polaris-IndexTable__TableCell {
          white-space: nowrap !important;
          padding: 12px 16px !important;
          vertical-align: middle !important;
        }
      `}</style>
      <BlockStack gap="400">
        {/* Discrepancy & Audit Alert Banner */}
        {metrics.hasShortage && (
          <Banner
            title={`Supplier Short-Shipment Detected: ${Math.abs(metrics.netUnitDiscrepancy)} Units Missing`}
            tone="warning"
          >
            <Text as="p" variant="bodyMd">
              The factory short-shipped this delivery by <strong>{Math.abs(metrics.netUnitDiscrepancy)} units</strong>.
              This represents an unreceived merchandise value of{" "}
              <strong>${Math.abs(metrics.netValueDiscrepancy).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.
              Commiting stock will update Shopify with only the actual physical units received, leaving open a supplier credit claim.
            </Text>
          </Banner>
        )}

        <Layout>
          {/* Main Receiving Table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Dock Check-in & Quantity Verification
                    </Text>
                    <Text as="p" variant="bodyXs" tone="subdued">
                      Count the physical contents in each master carton and input the verified count below.
                    </Text>
                  </BlockStack>
                  <Badge tone="info">Primary Warehouse Location</Badge>
                </InlineStack>
              </Box>

              <IndexTable
                resourceName={{ singular: "line item", plural: "line items" }}
                itemCount={items.length}
                selectable={false}
                headings={[
                  { title: "Product & SKU" },
                  { title: "Unit Cost" },
                  { title: "Ordered Qty" },
                  { title: "Received Qty (Counted)" },
                  { title: "Discrepancy", alignment: "end" },
                ]}
              >
                {items.map((item, index) => {
                  const discrepancy = item.receivedQty - item.orderedQty;
                  const isShort = discrepancy < 0;
                  const isOver = discrepancy > 0;

                  return (
                    <IndexTable.Row id={item.id} key={item.id} position={index}>
                      {/* Product Details */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "260px" }}>
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail source={item.imageUrl} alt={item.title} size="small" />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {item.title}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {item.variantTitle} • SKU: {item.sku}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                Supplier SKU: {item.supplierSku}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </div>
                      </IndexTable.Cell>

                      {/* Unit Cost */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "100px" }}>
                          <Text as="span" variant="bodySm">
                            ${item.unitCost.toFixed(2)}
                          </Text>
                        </div>
                      </IndexTable.Cell>

                      {/* Ordered Qty */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "120px" }}>
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {item.orderedQty.toLocaleString()} units
                          </Text>
                        </div>
                      </IndexTable.Cell>

                      {/* Received Qty (Editable input) */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "140px" }}>
                          <TextField
                            label="Received Qty"
                            labelHidden
                            type="number"
                            value={item.receivedQty.toString()}
                            onChange={(val) => handleReceivedQtyChange(item.id, val)}
                            autoComplete="off"
                          />
                        </div>
                      </IndexTable.Cell>

                      {/* Discrepancy Indicator */}
                      <IndexTable.Cell>
                        <div style={{ minWidth: "140px", textAlign: "right" }}>
                          {isShort ? (
                            <BlockStack inlineAlign="end" gap="050">
                              <Badge tone="critical">
                                {`${discrepancy} units`}
                              </Badge>
                              <Text as="span" variant="bodyXs" tone="critical">
                                -${Math.abs(discrepancy * item.unitCost).toFixed(2)} short
                              </Text>
                            </BlockStack>
                          ) : isOver ? (
                            <BlockStack inlineAlign="end" gap="050">
                              <Badge tone="attention">
                                {`+${discrepancy} units`}
                              </Badge>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                +${(discrepancy * item.unitCost).toFixed(2)} extra
                              </Text>
                            </BlockStack>
                          ) : (
                            <Badge tone="success">Exact Match</Badge>
                          )}
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </Layout.Section>

          {/* Reconciliation & Supplier Accountability Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Financial Variance Summary */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Receiving Reconciliation
                  </Text>

                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Ordered Units:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {metrics.totalOrderedUnits.toLocaleString()} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Counted On Dock:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {metrics.totalReceivedUnits.toLocaleString()} units
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Unit Discrepancy:
                      </Text>
                      <Text
                        as="span"
                        variant="bodySm"
                        fontWeight="bold"
                        tone={metrics.hasShortage ? "critical" : "success"}
                      >
                        {metrics.netUnitDiscrepancy === 0
                          ? "0 units"
                          : `${metrics.netUnitDiscrepancy > 0 ? "+" : ""}${metrics.netUnitDiscrepancy} units`}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Invoiced / PO Value:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        ${metrics.totalOrderedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Actual Received Value:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        ${metrics.totalReceivedValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="headingMd">
                        Supplier Credit Due:
                      </Text>
                      <Text
                        as="span"
                        variant="headingMd"
                        tone={metrics.hasShortage ? "critical" : "success"}
                      >
                        {metrics.netValueDiscrepancy < 0
                          ? `-$${Math.abs(metrics.netValueDiscrepancy).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "$0.00"}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Logistics & Shopify Mutation Status */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Shopify Stock Sync
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Clicking <strong>"Commit Received Stock to Shopify"</strong> fires an audited{" "}
                    <code>inventoryAdjustQuantities</code> GraphQL mutation for the primary location.
                  </Text>

                  <Button
                    variant="primary"
                    tone="critical"
                    loading={isCommitting}
                    onClick={handleCommitToShopify}
                  >
                    {`Commit Stock (${metrics.totalReceivedUnits} units)`}
                  </Button>
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

