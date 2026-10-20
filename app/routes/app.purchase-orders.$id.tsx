import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useParams, useRouteError, useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
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
  PrintIcon,
  SendIcon,
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
    return {
      po: {
        id: "fallback",
        poNumber: poIdOrNumber || "PO-1001",
        status: "DRAFT",
        supplierName: "Apex Apparel Ltd.",
        supplierEmail: "orders@apexapparel.example.com",
        carrier: "DHL Express Freight",
        notes: "Spring restock batch #1 - Standard delivery.",
        expectedArrival: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
        createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
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
            receivedQty: 0,
          },
        ],
      },
      shopDomain: session.shop,
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
      createdAt: new Date(po.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
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
        receivedQty: item.quantityReceived ?? 0,
      })),
    },
    shopDomain: session.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "COMMIT_RECEIVED");
  const poId = String(formData.get("poId"));

  // 1. Issue PO to Supplier (DRAFT -> ORDERED)
  if (intent === "ISSUE_PO") {
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: "ORDERED" },
    });
    return { ok: true, status: "ORDERED", message: "Purchase order issued to supplier. Status is now ORDERED." };
  }

  // 2. Cancel Purchase Order
  if (intent === "CANCEL_PO") {
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: "CANCELLED" },
    });
    return { ok: true, status: "CANCELLED", message: "Purchase order has been cancelled." };
  }

  // 3. Commit Received Stock at Dock
  if (intent === "COMMIT_RECEIVED") {
    const itemsJson = String(formData.get("items") || "[]");
    const itemsToUpdate = JSON.parse(itemsJson) as Array<{
      id: string;
      receivedQty: number;
    }>;

    for (const item of itemsToUpdate) {
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: Math.max(0, Number(item.receivedQty)) },
      });
    }

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

    return { ok: true, status: newStatus, message: `Loading dock audit updated: ${newStatus}` };
  }

  return { ok: false, error: "Unknown action intent." };
};

export default function PurchaseOrderDetailsAndReceiving() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isSubmitting = navigation.state === "submitting";

  const { po, shopDomain } = loaderData;
  const poNumber = po.poNumber;
  const supplierName = po.supplierName;
  const carrier = po.carrier;

  const [items, setItems] = useState<ReceivingLineItem[]>(po.items);

  // Synchronize items if loader reloads data
  useEffect(() => {
    setItems(po.items);
  }, [po.items]);

  // App Bridge toast on action complete
  useEffect(() => {
    if (actionData?.ok && actionData.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

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
    shopify.toast.show("All items marked as 100% received in audit table.");
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

  // 1. Issue PO Action (DRAFT -> ORDERED)
  const handleIssuePO = () => {
    submit(
      {
        intent: "ISSUE_PO",
        poId: po.id,
      },
      { method: "post" },
    );
  };

  // 2. Commit Action (Dock Receiving)
  const handleCommitToShopify = () => {
    submit(
      {
        intent: "COMMIT_RECEIVED",
        poId: po.id,
        items: JSON.stringify(
          items.map((i) => ({ id: i.id, receivedQty: i.receivedQty })),
        ),
      },
      { method: "post" },
    );
  };

  // 3. Cancel PO Action
  const handleCancelPO = () => {
    if (confirm(`Are you sure you want to cancel purchase order ${poNumber}?`)) {
      submit(
        {
          intent: "CANCEL_PO",
          poId: po.id,
        },
        { method: "post" },
      );
    }
  };

  // 4. Real CSV Export
  const handleExportCSV = () => {
    const rows: (string | number)[][] = [
      [
        "PO Number",
        "Supplier",
        "Order Status",
        "Expected Arrival",
        "SKU",
        "Supplier SKU",
        "Item Title",
        "Unit Cost ($)",
        "Quantity Ordered",
        "Quantity Received",
        "Subtotal ($)",
      ],
      ...items.map((i) => [
        poNumber,
        supplierName,
        po.status,
        po.expectedArrival || "TBD",
        i.sku,
        i.supplierSku,
        i.title,
        i.unitCost.toFixed(2),
        i.orderedQty,
        i.receivedQty,
        (i.orderedQty * i.unitCost).toFixed(2),
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows
        .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${poNumber}_${supplierName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    shopify.toast.show(`Exported ${poNumber} to CSV.`);
  };

  // 5. Native Print / PDF Trigger
  const handlePrint = () => {
    window.print();
  };

  // Determine UI based on Status
  let statusBadgeTone: "attention" | "info" | "warning" | "success" | "critical" = "info";
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
  } else if (po.status === "CANCELLED") {
    statusBadgeTone = "critical";
    statusBadgeText = "Cancelled";
  }

  const isDraft = po.status === "DRAFT";
  const isReceived = po.status === "RECEIVED";
  const isCancelled = po.status === "CANCELLED";

  return (
    <Page
      backAction={{
        content: "Back to Purchase Orders",
        onAction: () => navigate("/app/purchase-orders"),
      }}
      title={`${poNumber} • ${supplierName}`}
      subtitle={
        isDraft
          ? "Draft Purchase Order • Pending Vendor Issue"
          : isReceived
          ? "Completed Purchase Order • Stock Received"
          : isCancelled
          ? "Cancelled Order • Voided"
          : `In-Transit Shipment • Receiving Dock Audit • ${carrier}`
      }
      titleMetadata={<Badge tone={statusBadgeTone}>{statusBadgeText}</Badge>}
      primaryAction={
        isDraft
          ? {
              content: isSubmitting ? "Issuing..." : "Issue PO to Supplier (Mark as Ordered)",
              icon: SendIcon,
              loading: isSubmitting,
              onAction: handleIssuePO,
            }
          : isReceived
          ? {
              content: "Export Closed PO (CSV)",
              icon: ExportIcon,
              onAction: handleExportCSV,
            }
          : isCancelled
          ? undefined
          : {
              content: isSubmitting ? "Committing..." : "Commit Received Stock",
              icon: CheckIcon,
              loading: isSubmitting,
              onAction: handleCommitToShopify,
            }
      }
      secondaryActions={[
        ...(isDraft
          ? [
              {
                content: "Export Supplier CSV",
                icon: ExportIcon,
                onAction: handleExportCSV,
              },
              {
                content: "Print Purchase Order",
                icon: PrintIcon,
                onAction: handlePrint,
              },
              {
                content: "Cancel Order",
                destructive: true,
                onAction: handleCancelPO,
              },
            ]
          : isReceived
          ? [
              {
                content: "Print Final PO / Slip",
                icon: PrintIcon,
                onAction: handlePrint,
              },
            ]
          : isCancelled
          ? [
              {
                content: "Print Order Record",
                icon: PrintIcon,
                onAction: handlePrint,
              },
            ]
          : [
              {
                content: "Receive All In Full",
                onAction: handleReceiveAllInFull,
              },
              {
                content: "Export Slip (CSV)",
                icon: ExportIcon,
                onAction: handleExportCSV,
              },
              {
                content: "Print PO / Slip",
                icon: PrintIcon,
                onAction: handlePrint,
              },
              {
                content: "Cancel Order",
                destructive: true,
                onAction: handleCancelPO,
              },
            ]),
      ]}
    >
      <style>{`
        /* Print Stylesheet for Commercial Purchase Order Document */
        @media print {
          body * {
            visibility: hidden !important;
          }
          #clearstock-printable-po, #clearstock-printable-po * {
            visibility: visible !important;
          }
          #clearstock-printable-po {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 24px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          }
        }
        @media screen {
          #clearstock-printable-po {
            display: none;
          }
        }
      `}</style>

      {/* Hidden Printable PO Document (Appears only during window.print()) */}
      <div id="clearstock-printable-po">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "16px", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "24px", margin: "0 0 4px 0", fontWeight: "bold" }}>PURCHASE ORDER</h1>
            <p style={{ margin: 0, color: "#555" }}>ClearStock Inventory Management • {shopDomain}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: "20px", margin: "0 0 4px 0" }}>{poNumber}</h2>
            <p style={{ margin: 0, color: "#555" }}>Status: <strong>{po.status}</strong></p>
            <p style={{ margin: 0, color: "#555" }}>Date: {po.createdAt}</p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "28px" }}>
          <div style={{ width: "48%" }}>
            <h3 style={{ fontSize: "14px", textTransform: "uppercase", color: "#666", marginBottom: "6px" }}>Vendor / Supplier:</h3>
            <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 4px 0" }}>{supplierName}</p>
            <p style={{ margin: "0 0 2px 0" }}>Email: {po.supplierEmail}</p>
            <p style={{ margin: 0 }}>Expected Delivery: {po.expectedArrival || "TBD"}</p>
          </div>
          <div style={{ width: "48%", textAlign: "right" }}>
            <h3 style={{ fontSize: "14px", textTransform: "uppercase", color: "#666", marginBottom: "6px" }}>Ship To / Destination:</h3>
            <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 4px 0" }}>Main Warehouse Receiving Dock</p>
            <p style={{ margin: "0 0 2px 0" }}>Store: {shopDomain}</p>
            <p style={{ margin: 0 }}>Carrier: {carrier}</p>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "28px" }}>
          <thead>
            <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>SKU</th>
              <th style={{ padding: "10px 12px" }}>Item Description</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Qty Ordered</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Qty Received</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Unit Cost</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "10px 12px", fontWeight: "bold" }}>{item.sku}</td>
                <td style={{ padding: "10px 12px" }}>{item.title} ({item.variantTitle})</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{item.orderedQty}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{item.receivedQty}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>${item.unitCost.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "bold" }}>${(item.orderedQty * item.unitCost).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #000" }}>
              <td colSpan={2} style={{ padding: "12px", fontWeight: "bold" }}>Grand Total</td>
              <td style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>{metrics.totalOrderedUnits} units</td>
              <td style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>{metrics.totalReceivedUnits} units</td>
              <td></td>
              <td style={{ padding: "12px", textAlign: "right", fontSize: "16px", fontWeight: "bold" }}>
                ${metrics.totalOrderedValue.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div style={{ marginBottom: "32px", background: "#fafafa", padding: "12px", border: "1px solid #eee" }}>
            <strong>Special Instructions / Notes:</strong> {po.notes}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "48px", paddingTop: "16px", borderTop: "1px solid #ccc" }}>
          <div>Authorized Signature: _____________________________________</div>
          <div>Date: ________________________</div>
        </div>
      </div>

      <BlockStack gap="400">
        {/* Status Alerts */}
        {isDraft && (
          <Banner title="Draft Purchase Order" tone="info">
            <Text as="p" variant="bodyMd">
              This purchase order is currently in <strong>Draft</strong> state. Review the order quantities below. When ready, click <strong>"Issue PO to Supplier (Mark as Ordered)"</strong> to place the order with {supplierName} and start counting incoming stock on your Replenishment dashboard.
            </Text>
          </Banner>
        )}

        {isCancelled && (
          <Banner title="Purchase Order Cancelled" tone="critical">
            <Text as="p" variant="bodyMd">
              This purchase order has been cancelled and voided. No incoming inventory will be tracked or committed.
            </Text>
          </Banner>
        )}

        {isReceived && (
          <Banner title="Purchase Order Completed & Closed" tone="success">
            <Text as="p" variant="bodyMd">
              All <strong>{metrics.totalOrderedUnits} units</strong> have been received at the loading dock and committed to stock. This order is officially closed.
            </Text>
          </Banner>
        )}

        {!isDraft && !isCancelled && !isReceived && metrics.hasShortage && (
          <Banner title="Shipment Shortage Detected" tone="warning">
            <Text as="p" variant="bodyMd">
              The physical delivery is short by <strong>{Math.abs(metrics.netUnitDiscrepancy)} units</strong>{" "}
              (Shortfall value: <strong>${Math.abs(metrics.netValueDiscrepancy).toFixed(2)}</strong>).
              Unreceived units remain on order until fully delivered.
            </Text>
          </Banner>
        )}

        {!isDraft && !isCancelled && !isReceived && metrics.discrepancyCount === 0 && (
          <Banner title="Clean Shipment - 100% In-Spec" tone="success">
            <Text as="p" variant="bodyMd">
              All physical delivered counts match the purchase order exactly. Ready to commit stock additions to inventory.
            </Text>
          </Banner>
        )}

        <Layout>
          {/* Main Line Items Table */}
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Line Items ({items.length})
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {isDraft
                        ? "Items and quantities scheduled for restock"
                        : "Verify physical quantities delivered at loading dock"}
                    </Text>
                  </BlockStack>

                  {!isDraft && !isReceived && !isCancelled && (
                    <Button size="slim" onClick={handleReceiveAllInFull}>
                      Receive All In Full
                    </Button>
                  )}
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
                  { title: isDraft ? "Expected" : "Actual Received" },
                  { title: isDraft ? "Total Cost" : "Variance" },
                  { title: "Subtotal", alignment: "end" },
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

                      {/* Received Qty Input or Draft display */}
                      <IndexTable.Cell>
                        {isDraft || isReceived || isCancelled ? (
                          <Text as="span" variant="bodyMd">
                            {isDraft ? `${item.orderedQty} units` : `${item.receivedQty} units`}
                          </Text>
                        ) : (
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
                        )}
                      </IndexTable.Cell>

                      {/* Variance Indicator or Draft Cost */}
                      <IndexTable.Cell>
                        {isDraft ? (
                          <Badge tone="info">Pending Issue</Badge>
                        ) : isMatch ? (
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
                            ${(isDraft
                              ? item.orderedQty * item.unitCost
                              : item.receivedQty * item.unitCost
                            ).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Text>
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </Layout.Section>

          {/* Right Summary Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Financial & Unit Totals */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {isDraft ? "Order Valuation Summary" : "Dock Audit Summary"}
                  </Text>

                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Total Ordered Units:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {metrics.totalOrderedUnits} units
                      </Text>
                    </InlineStack>

                    {!isDraft && (
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Confirmed Received:
                        </Text>
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {metrics.totalReceivedUnits} units
                        </Text>
                      </InlineStack>
                    )}

                    <Divider />

                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Total Order Valuation:
                      </Text>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        ${metrics.totalOrderedValue.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </InlineStack>

                    {!isDraft && (
                      <>
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm" tone="subdued">
                            Received Stock Value:
                          </Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            ${metrics.totalReceivedValue.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Text>
                        </InlineStack>

                        <Divider />

                        <InlineStack align="space-between">
                          <Text as="span" variant="headingSm">
                            Receiving Discrepancy:
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
                      </>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Vendor & Delivery Metadata */}
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
