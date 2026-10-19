import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError } from "react-router";
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
} from "@shopify/polaris";
import {
  ArrowLeftIcon,
  ExportIcon,
  CheckIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface DraftPOItem {
  id: string;
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

const INITIAL_PO_ITEMS: DraftPOItem[] = [
  {
    id: "po-item-1",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Large",
    sku: "HDY-BLK-L",
    supplierSku: "APX-HDY-01-L",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    packSize: 24,
    calculatedDeficit: 147,
    orderQuantity: 168, // 7 cases of 24
    unitCost: 18.5,
  },
  {
    id: "po-item-2",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Heather Grey / Medium",
    sku: "WFL-GRY-M",
    supplierSku: "APX-WFL-03-M",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    packSize: 12,
    calculatedDeficit: 25,
    orderQuantity: 36, // 3 cases of 12
    unitCost: 14.0,
  },
  {
    id: "po-item-3",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Medium",
    sku: "HDY-BLK-M",
    supplierSku: "APX-HDY-01-M",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    packSize: 24,
    calculatedDeficit: 40,
    orderQuantity: 48, // 2 cases of 24
    unitCost: 18.5,
  },
];

export default function PurchaseOrderDraftEditor() {
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [poNumber] = useState<string>("PO-1042");
  const [supplierName] = useState<string>("Apex Apparel Ltd.");
  const [expectedArrival, setExpectedArrival] = useState<string>(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState<string>(
    "Standard sea freight. Ship in master cartons of 24 with barcode labels on outer box.",
  );
  const [items, setItems] = useState<DraftPOItem[]>(INITIAL_PO_ITEMS);

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

  const handleSaveDraft = () => {
    shopify.toast.show(`${poNumber} saved as draft.`);
  };

  const handleExportPDF = () => {
    shopify.toast.show(`Generating supplier-ready PDF for ${poNumber}...`);
  };

  const handleExportCSV = () => {
    shopify.toast.show(`Exporting ${poNumber} line items to CSV.`);
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
        content: "Save Draft PO",
        onAction: handleSaveDraft,
      }}
      secondaryActions={[
        {
          content: "Export PDF",
          icon: ExportIcon,
          onAction: handleExportPDF,
        },
        {
          content: "Export CSV",
          onAction: handleExportCSV,
        },
      ]}
    >
      <BlockStack gap="400">
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Quantities are pre-filled based on your replenishment deficit and supplier pack sizes.
            You can manually override any quantity directly in the table below.
          </Text>
        </Banner>

        <Layout>
          {/* Main PO Items Spreadsheet Table */}
          <Layout.Section>
            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Purchase Order Line Items ({items.length})
                  </Text>
                  <Badge tone="attention">Draft - Not Yet Sent</Badge>
                </InlineStack>

                <Divider />

                {/* Items List / Spreadsheet Row */}
                <BlockStack gap="300">
                  {items.map((item) => {
                    const cases = Math.ceil(item.orderQuantity / item.packSize);
                    const isMultiple = item.orderQuantity % item.packSize === 0;
                    const lineTotal = item.orderQuantity * item.unitCost;

                    return (
                      <Card key={item.id} background="bg-surface-secondary" padding="300">
                        <InlineStack align="space-between" blockAlign="center" gap="300">
                          {/* Product Info */}
                          <InlineStack gap="300" blockAlign="center">
                            <Thumbnail source={item.imageUrl} alt={item.title} size="small" />
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {item.title}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {item.variantTitle} • SKU: {item.sku} (Supplier SKU: {item.supplierSku})
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                Pack Size: {item.packSize} units/case • Deficit: {item.calculatedDeficit} units
                              </Text>
                            </BlockStack>
                          </InlineStack>

                          {/* Editable Quantity & Cost Controls */}
                          <InlineStack gap="300" blockAlign="center">
                            <div style={{ width: "120px" }}>
                              <TextField
                                label="Order Qty"
                                type="number"
                                value={item.orderQuantity.toString()}
                                onChange={(val) => handleQuantityChange(item.id, val)}
                                autoComplete="off"
                                helpText={
                                  isMultiple
                                    ? `${cases} cases (${item.packSize}/cs)`
                                    : `⚠️ Not a multiple of ${item.packSize}`
                                }
                              />
                            </div>

                            <div style={{ width: "90px", textAlign: "right" }}>
                              <Text as="p" variant="bodyXs" tone="subdued">
                                Unit Cost
                              </Text>
                              <Text as="p" variant="bodyMd" fontWeight="medium">
                                ${item.unitCost.toFixed(2)}
                              </Text>
                            </div>

                            <div style={{ width: "110px", textAlign: "right" }}>
                              <Text as="p" variant="bodyXs" tone="subdued">
                                Line Total
                              </Text>
                              <Text as="p" variant="bodyMd" fontWeight="bold">
                                ${lineTotal.toFixed(2)}
                              </Text>
                            </div>

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

                  <TextField
                    label="Expected Delivery Date"
                    type="date"
                    value={expectedArrival}
                    onChange={setExpectedArrival}
                    autoComplete="off"
                    helpText="Default 14-day lead time applied"
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

