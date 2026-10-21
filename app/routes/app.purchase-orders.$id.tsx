import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useParams, useRouteError, useLoaderData, useSubmit, useNavigation, useActionData, redirect, useSearchParams } from "react-router";
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
  Modal,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckIcon,
  ExportIcon,
  PrintIcon,
  SendIcon,
  DeleteIcon,
} from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  // 1. Fetch Purchase Order from PostgreSQL strictly for this shop
  const po = await prisma.purchaseOrder.findFirst({
    where: {
      shop: session.shop,
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
    return redirect("/app/purchase-orders");
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
      items: po.items.map((item) => {
        return {
          id: item.id,
          variantId: item.variantId,
          inventoryItemId: item.inventoryItemId || "",
          title: item.title,
          variantTitle: "",
          sku: item.sku || "",
          supplierSku: item.sku || "",
          imageUrl: "",
          unitCost: Number(item.unitCost),
          orderedQty: item.quantityOrdered,
          receivedQty: item.quantityReceived ?? 0,
        };
      }),
    },
    shopDomain: session.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
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

  // 2. Cancel Purchase Order (for issued orders)
  if (intent === "CANCEL_PO") {
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: "CANCELLED" },
    });
    return { ok: true, status: "CANCELLED", message: "Purchase order has been cancelled." };
  }

  // 2.5 Delete Draft Purchase Order (permanently deletes unissued draft)
  if (intent === "DELETE_DRAFT") {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
    });
    if (po && po.status === "DRAFT") {
      await prisma.purchaseOrder.delete({
        where: { id: poId },
      });
      return redirect(`/app/purchase-orders?deleted=${po.poNumber}`);
    }
    return { ok: false, message: "Only draft purchase orders can be deleted." };
  }

  // 3. Commit Received Stock at Dock
  if (intent === "COMMIT_RECEIVED") {
    const itemsJson = String(formData.get("items") || "[]");
    const itemsToUpdate = JSON.parse(itemsJson) as Array<{
      id: string;
      receivedQty: number;
    }>;

    // Fetch previous state for incremental delta calculation
    const existingItems = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId },
    });

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

    const updatedPo = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: newStatus },
    });

    // Step 9: Two-Way Live Shopify Storefront Inventory Adjustment
    let liveSyncStatus = "";
    try {
      const locResponse = await admin.graphql(`
        #graphql
        query GetStorePrimaryLocation {
          locations(first: 10) {
            nodes {
              id
              name
              isPrimary
              isActive
            }
          }
        }
      `);
      const locData = await locResponse.json();
      const locationsList = locData.data?.locations?.nodes || [];
      const primaryLocation = locationsList.find((l: any) => l.isPrimary && l.isActive) || locationsList.find((l: any) => l.isActive);
      const primaryLocationId = primaryLocation?.id;

      if (primaryLocationId) {
        const changes: Array<{ inventoryItemId: string; locationId: string; delta: number }> = [];

        for (const update of itemsToUpdate) {
          const prevItem = existingItems.find((i) => i.id === update.id);
          const prevReceived = prevItem?.quantityReceived || 0;
          const delta = update.receivedQty - prevReceived;

          if (delta > 0 && prevItem?.inventoryItemId && prevItem.inventoryItemId.startsWith("gid://shopify/InventoryItem/")) {
            changes.push({
              inventoryItemId: prevItem.inventoryItemId,
              locationId: primaryLocationId,
              delta,
            });

            // Immediately update local DB so replenishment dashboard reflects new stock instantly
            if (prevItem.variantId) {
              await prisma.variantSupplierRule.updateMany({
                where: {
                  shop: session.shop,
                  variantId: prevItem.variantId,
                },
                data: {
                  availableStock: {
                    increment: delta,
                  },
                },
              });
            }
          }
        }

        if (changes.length > 0) {
          const adjResponse = await admin.graphql(
            `#graphql
            mutation AdjustInventoryQuantities($input: InventoryAdjustQuantitiesInput!) {
              inventoryAdjustQuantities(input: $input) {
                userErrors {
                  field
                  message
                }
                inventoryAdjustmentGroup {
                  createdAt
                  reason
                }
              }
            }`,
            {
              variables: {
                input: {
                  reason: "received",
                  name: "available",
                  changes,
                },
              },
            }
          );
          const adjData = await adjResponse.json();
          if (adjData.data?.inventoryAdjustQuantities?.userErrors?.length > 0) {
            console.error("[Shopify Inventory Sync Error]", adjData.data.inventoryAdjustQuantities.userErrors);
          } else {
            liveSyncStatus = " • Synced to Shopify available inventory";
            console.log(`[Shopify Live Sync] Successfully adjusted ${changes.length} items at primary location ${primaryLocation.name} (${primaryLocationId})`);
          }
        }
      }
    } catch (err: any) {
      console.error("[Shopify Live Sync Error]", err);
    }

    const paramKey = newStatus === "RECEIVED" ? "received" : "partial";
    return redirect(`/app/purchase-orders?${paramKey}=${updatedPo.poNumber}`);
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

  const [searchParams, setSearchParams] = useSearchParams();
  const [isReceivingMode, setIsReceivingMode] = useState<boolean>(searchParams.get("mode") === "receive");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("mode") === "receive") {
      setIsReceivingMode(true);
    }
  }, [searchParams]);

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

  // Delete Draft Confirmation Modal State
  const [isDeleteDraftModalOpen, setIsDeleteDraftModalOpen] = useState(false);

  const handleDeleteDraft = () => {
    setIsDeleteDraftModalOpen(false);
    submit(
      {
        intent: "DELETE_DRAFT",
        poId: po.id,
      },
      { method: "post" },
    );
  };

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
  const handleConfirmCancelPO = () => {
    setIsCancelModalOpen(false);
    submit(
      {
        intent: "CANCEL_PO",
        poId: po.id,
      },
      { method: "post" },
    );
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
          : isReceivingMode
          ? `Warehouse Receiving Dock • Inspect & Receive Stock • ${carrier}`
          : `In-Transit Order • Expected Arrival: ${po.expectedArrival || "TBD"} • ${carrier}`
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
          : isReceivingMode
          ? {
              content: isSubmitting ? "Committing..." : "Commit Received Stock",
              icon: CheckIcon,
              loading: isSubmitting,
              disabled: metrics.totalReceivedUnits === 0,
              onAction: () => setIsCommitModalOpen(true),
            }
          : {
              content: "Receive Stock",
              icon: CheckIcon,
              onAction: () => {
                setIsReceivingMode(true);
                setSearchParams({ mode: "receive" });
              },
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
                content: "Delete Draft PO",
                icon: DeleteIcon,
                destructive: true,
                onAction: () => setIsDeleteDraftModalOpen(true),
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
          : isReceivingMode
          ? [
              {
                content: "Print Receiving Slip",
                icon: PrintIcon,
                onAction: handlePrint,
              },
              {
                content: "Cancel Order",
                icon: DeleteIcon,
                destructive: true,
                onAction: () => setIsCancelModalOpen(true),
              },
            ]
          : [
              {
                content: "Cancel Order",
                icon: DeleteIcon,
                destructive: true,
                onAction: () => setIsCancelModalOpen(true),
              },
              {
                content: "Print Purchase Order",
                icon: PrintIcon,
                onAction: handlePrint,
              },
              {
                content: "Export CSV",
                icon: ExportIcon,
                onAction: handleExportCSV,
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

        {!isDraft && !isCancelled && !isReceived && !isReceivingMode && (
          <Banner title={`Order In-Transit • ${supplierName}`} tone="info">
            <Text as="p" variant="bodyMd">
              This purchase order was placed on <strong>{po.createdAt}</strong> and is currently in-transit with <strong>{supplierName}</strong>. Expected delivery:{" "}
              <strong>{po.expectedArrival || "TBD"}</strong> via <strong>{carrier}</strong>.
              When physical boxes arrive at your facility, click <strong>&ldquo;Receive Stock&rdquo;</strong> to inspect delivered quantities and update your Shopify inventory.
            </Text>
          </Banner>
        )}

        {/* When in Receiving Mode: Only show ONE status banner that reflects the current check-in state */}
        {!isDraft && !isCancelled && !isReceived && isReceivingMode && metrics.totalReceivedUnits === 0 && (
          <Banner title="Receiving Dock Intake" tone="info">
            <Text as="p" variant="bodyMd">
              Verify physical packages delivered from <strong>{supplierName}</strong>. Enter delivered quantities below or click <strong>&ldquo;Receive All In Full&rdquo;</strong> to match the order. When verified, click <strong>&ldquo;Commit Received Stock&rdquo;</strong> to sync stock into Shopify.
            </Text>
          </Banner>
        )}

        {isReceivingMode && metrics.totalReceivedUnits > 0 && metrics.discrepancyCount === 0 && (
          <Banner title="Clean Shipment • 100% In-Spec & Ready to Commit" tone="success">
            <Text as="p" variant="bodyMd">
              All <strong>{metrics.totalOrderedUnits} units</strong> match the purchase order with zero discrepancies. Click <strong>&ldquo;Commit Received Stock&rdquo;</strong> in the top-right to complete check-in and update Shopify inventory.
            </Text>
          </Banner>
        )}

        {isReceivingMode && metrics.totalReceivedUnits > 0 && metrics.hasShortage && (
          <Banner title="Partial Delivery / Shortage Detected" tone="warning">
            <Text as="p" variant="bodyMd">
              Received {metrics.totalReceivedUnits} of {metrics.totalOrderedUnits} units so far. The delivery is currently short by{" "}
              <strong>{Math.abs(metrics.netUnitDiscrepancy)} units</strong>{" "}
              (Shortfall value: <strong>${Math.abs(metrics.netValueDiscrepancy).toFixed(2)}</strong>).
              Unreceived units remain on order until fully delivered.
            </Text>
          </Banner>
        )}

        {isReceivingMode && metrics.totalReceivedUnits > 0 && metrics.hasOverage && (
          <Banner title="Shipment Overage Detected" tone="info">
            <Text as="p" variant="bodyMd">
              Received {metrics.totalReceivedUnits} of {metrics.totalOrderedUnits} units (+{metrics.netUnitDiscrepancy} extra units).
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
                        : isReceivingMode
                        ? "Enter delivered counts below or fill all at once"
                        : isReceived
                        ? "Final receipt record of delivered quantities"
                        : isCancelled
                        ? "Cancelled order item list"
                        : "Confirmed products and ordered quantities"}
                    </Text>
                  </BlockStack>

                  {isReceivingMode && (
                    <Button
                      size="slim"
                      icon={CheckIcon}
                      onClick={handleReceiveAllInFull}
                    >
                      Receive All In Full
                    </Button>
                  )}
                </InlineStack>
              </Box>

              <IndexTable
                resourceName={{ singular: "line item", plural: "line items" }}
                itemCount={items.length}
                selectable={false}
                headings={
                  !isReceivingMode && !isReceived
                    ? [
                        { title: "Product & Variant" },
                        { title: "Unit Cost" },
                        { title: "Quantity Ordered" },
                        { title: "Status" },
                        { title: "Line Total", alignment: "end" },
                      ]
                    : [
                        { title: "Product & Variant" },
                        { title: "Unit Cost" },
                        { title: "Ordered (Units)" },
                        { title: isReceived ? "Received (Units)" : "Actual Received (Units)" },
                        { title: "Variance" },
                        { title: "Subtotal", alignment: "end" },
                      ]
                }
              >
                {items.map((item, index) => {
                  const varianceUnits = item.receivedQty - item.orderedQty;
                  const varianceValue = varianceUnits * item.unitCost;
                  const isMatch = varianceUnits === 0;
                  const isShort = varianceUnits < 0;

                  // Overview Mode Row (Clean, Read-Only, No Input Boxes)
                  if (!isReceivingMode && !isReceived) {
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
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {item.orderedQty} units
                          </Text>
                        </IndexTable.Cell>

                        {/* Status */}
                        <IndexTable.Cell>
                          {isDraft ? (
                            <Badge tone="attention">Draft</Badge>
                          ) : isCancelled ? (
                            <Badge tone="critical">Cancelled</Badge>
                          ) : item.receivedQty > 0 ? (
                            <Badge tone="warning">{`${item.receivedQty} / ${item.orderedQty} rec'd`}</Badge>
                          ) : (
                            <Badge tone="info">Awaiting Delivery</Badge>
                          )}
                        </IndexTable.Cell>

                        {/* Line Total */}
                        <IndexTable.Cell>
                          <div style={{ textAlign: "right" }}>
                            <Text as="span" variant="bodyMd" fontWeight="bold">
                              ${(item.orderedQty * item.unitCost).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </Text>
                          </div>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  }

                  // Receiving Dock Audit Row (Input Boxes + Discrepancy Indicators)
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
                          <div style={{ width: "120px" }}>
                            <TextField
                              label="Received Qty"
                              labelHidden
                              type="number"
                              suffix="units"
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
                        ) : item.receivedQty === 0 ? (
                          <Text as="span" variant="bodySm" tone="subdued">
                            Not counted yet
                          </Text>
                        ) : isMatch ? (
                          <Badge tone="success">{`100% Full (${item.receivedQty}/${item.orderedQty})`}</Badge>
                        ) : isShort ? (
                          <Badge tone="warning">
                            {`Short: ${Math.abs(varianceUnits)} units`}
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
                    {isReceivingMode || isReceived ? "Dock Audit Summary" : "Order Valuation Summary"}
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

                    {(isReceivingMode || isReceived) && (
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

                    {(isReceivingMode || isReceived) && (
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

                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" variant="headingSm">
                            Receiving Status:
                          </Text>
                          {metrics.totalReceivedUnits === 0 ? (
                            <Badge tone="attention">Awaiting Count</Badge>
                          ) : metrics.discrepancyCount === 0 ? (
                            <Badge tone="success">100% In-Spec</Badge>
                          ) : (
                            <Text
                              as="span"
                              variant="headingSm"
                              tone={metrics.netValueDiscrepancy < 0 ? "critical" : "success"}
                            >
                              {metrics.netValueDiscrepancy < 0
                                ? `-$${Math.abs(metrics.netValueDiscrepancy).toFixed(2)}`
                                : `+$${metrics.netValueDiscrepancy.toFixed(2)}`}
                            </Text>
                          )}
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

      {/* Delete Draft Confirmation Modal */}
      <Modal
        open={isDeleteDraftModalOpen}
        onClose={() => setIsDeleteDraftModalOpen(false)}
        title={`Delete Draft ${poNumber}?`}
        primaryAction={{
          content: "Delete Draft",
          destructive: true,
          onAction: handleDeleteDraft,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsDeleteDraftModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to permanently delete draft purchase order <strong>{poNumber}</strong> for <strong>{supplierName}</strong>?
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This draft order was never sent to the vendor, and no inventory will be affected. This action cannot be undone.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Cancel Purchase Order Confirmation Modal */}
      <Modal
        open={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title={`Cancel Purchase Order ${poNumber}?`}
        primaryAction={{
          content: "Cancel Purchase Order",
          destructive: true,
          onAction: handleConfirmCancelPO,
        }}
        secondaryActions={[
          {
            content: "Keep Order Active",
            onAction: () => setIsCancelModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to cancel purchase order <strong>{poNumber}</strong> with <strong>{supplierName}</strong>?
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This will void the purchase order and remove all incoming inventory expectations from your replenishment calculations. No physical stock will be committed to Shopify.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Smart Commit Received Stock Modal */}
      <Modal
        open={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        title={
          metrics.discrepancyCount === 0
            ? `Commit ${metrics.totalReceivedUnits} Units to Shopify?`
            : metrics.hasShortage
            ? `Commit Partial Delivery (${metrics.totalReceivedUnits} of ${metrics.totalOrderedUnits} Units)?`
            : `Commit Delivery (${metrics.totalReceivedUnits} Units)?`
        }
        primaryAction={{
          content: isSubmitting ? "Committing..." : "Confirm & Update Inventory",
          loading: isSubmitting,
          onAction: () => {
            setIsCommitModalOpen(false);
            handleCommitToShopify();
          },
        }}
        secondaryActions={[
          {
            content: "Review Counts",
            onAction: () => setIsCommitModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {metrics.discrepancyCount === 0 ? (
              <Banner tone="success" title="Clean 100% Match">
                <Text as="p" variant="bodySm">
                  All delivered counts match your purchase order with zero discrepancies.
                </Text>
              </Banner>
            ) : metrics.hasShortage ? (
              <Banner tone="warning" title="Partial Delivery Detected">
                <Text as="p" variant="bodySm">
                  You are receiving {metrics.totalReceivedUnits} of {metrics.totalOrderedUnits} units. The missing {Math.abs(metrics.netUnitDiscrepancy)} units will stay on order awaiting the next delivery.
                </Text>
              </Banner>
            ) : null}

            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                What will happen next:
              </Text>
              <Text as="p" variant="bodySm">
                • <strong>+{metrics.totalReceivedUnits} units</strong> (${metrics.totalReceivedValue.toFixed(2)} total valuation) will be immediately added to your Shopify available store stock.
              </Text>
              <Text as="p" variant="bodySm">
                • Purchase Order <strong>{poNumber}</strong> status will update to{" "}
                <strong>
                  {metrics.discrepancyCount === 0 ? "Completed & Closed (Received)" : "Partially Received"}
                </strong>.
              </Text>
              <Text as="p" variant="bodySm">
                • Incoming stock counts on your Replenishment dashboard will be updated accordingly.
              </Text>
            </BlockStack>
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
