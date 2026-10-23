import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError, useLoaderData, useSearchParams, useSubmit, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  EmptyState,
  Modal,
  Tooltip,
  Select,
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export interface POListingItem {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  badgeTone: "attention" | "info" | "warning" | "success" | "critical";
  itemsCount: number;
  totalUnits: number;
  totalCost: number;
  expectedArrival: string;
  createdAt: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const poId = String(formData.get("poId"));

  if (intent === "DELETE_DRAFT") {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
    });
    if (po && po.status === "DRAFT") {
      await prisma.purchaseOrder.delete({
        where: { id: poId },
      });
      return { ok: true, deletedPo: po.poNumber };
    }
    return { ok: false, error: "Only draft purchase orders can be deleted." };
  }

  return { ok: false };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch Suppliers for the shop
  const suppliersDb = await prisma.supplier.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });

  const suppliers = suppliersDb.map((s) => ({ label: s.name, value: s.id }));

  // 2. Fetch Purchase Orders from PostgreSQL
  const posDb = await prisma.purchaseOrder.findMany({
    where: { shop },
    include: {
      supplier: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const orders: POListingItem[] = posDb.map((po) => {
    const totalUnits = po.items.reduce((sum: number, item) => sum + item.quantityOrdered, 0);
    const totalCost = po.items.reduce(
      (sum: number, item) => sum + item.quantityOrdered * Number(item.unitCost),
      0,
    );

    let badgeTone: "attention" | "info" | "warning" | "success" | "critical" = "attention";
    let statusDisplay = "Draft";

    switch (po.status) {
      case "ORDERED":
        badgeTone = "info";
        statusDisplay = "Ordered";
        break;
      case "PARTIALLY_RECEIVED":
        badgeTone = "warning";
        statusDisplay = "Partially Received";
        break;
      case "RECEIVED":
        badgeTone = "success";
        statusDisplay = "Received";
        break;
      case "CANCELLED":
        badgeTone = "critical";
        statusDisplay = "Cancelled";
        break;
      default:
        badgeTone = "attention";
        statusDisplay = "Draft";
    }

    const expectedArrivalStr = po.expectedArrival
      ? new Date(po.expectedArrival).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Not specified";

    const createdAtStr = new Date(po.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return {
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier.name,
      status: statusDisplay,
      badgeTone,
      itemsCount: po.items.length,
      totalUnits,
      totalCost,
      expectedArrival: expectedArrivalStr,
      createdAt: createdAtStr,
    };
  });

  return {
    orders,
    suppliers,
  };
};

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();

  const orders = loaderData?.orders || [];
  const suppliers = loaderData?.suppliers || [];
  const issuedPo = searchParams.get("issued");
  const draftPo = searchParams.get("draft");
  const deletedParam = searchParams.get("deleted");
  const receivedParam = searchParams.get("received");
  const partialParam = searchParams.get("partial");

  const [pendingDeletePo, setPendingDeletePo] = useState<POListingItem | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [chosenSupplierId, setChosenSupplierId] = useState<string>(
    suppliers[0]?.value || "",
  );

  useEffect(() => {
    if (!chosenSupplierId && suppliers.length > 0) {
      setChosenSupplierId(suppliers[0].value);
    }
  }, [suppliers, chosenSupplierId]);

  useEffect(() => {
    let message = "";
    if (issuedPo) {
      message = `Purchase Order ${issuedPo} issued! Marked as Ordered (In-Transit).`;
    } else if (draftPo) {
      message = `Purchase Order ${draftPo} saved as Draft.`;
    } else if (deletedParam) {
      message = `Draft Purchase Order ${deletedParam} deleted.`;
    } else if (receivedParam) {
      message = `Stock received for ${receivedParam}! Committed to Shopify inventory.`;
    } else if (partialParam) {
      message = `Partial delivery received for ${partialParam}! Remaining units on order.`;
    }

    if (message) {
      shopify.toast.show(message);
      // Clean up query params from URL so it doesn't linger
      const next = new URLSearchParams(searchParams);
      next.delete("issued");
      next.delete("draft");
      next.delete("deleted");
      next.delete("received");
      next.delete("partial");
      setSearchParams(next, { replace: true });
    }
  }, [issuedPo, draftPo, deletedParam, receivedParam, partialParam, shopify, searchParams, setSearchParams]);

  useEffect(() => {
    if (actionData?.deletedPo) {
      shopify.toast.show(`Draft Purchase Order ${actionData.deletedPo} deleted.`);
    }
  }, [actionData, shopify]);

  return (
    <Page
      title="Purchase Orders"
      subtitle="Track purchase order lifecycles and receive physical stock into Shopify."
      primaryAction={{
        content: "Create Purchase Order",
        icon: PlusIcon,
        onAction: () => setIsCreateModalOpen(true),
      }}
    >
      <BlockStack gap="400">

        <div className="clearstock-po-table">
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "purchase order", plural: "purchase orders" }}
              itemCount={orders.length}
              selectable={false}
              headings={[
                { title: "PO Number" },
                { title: "Supplier" },
                { title: "Status" },
                { title: "Items / Units" },
                { title: "Total Value" },
                { title: "Expected Arrival" },
                { title: "Actions", alignment: "end" },
              ]}
            >
              {orders.map((po, index) => (
                <IndexTable.Row id={po.id} key={po.id} position={index}>
                  <IndexTable.Cell>
                    <div style={{ minWidth: "130px" }}>
                      <Button
                        variant="monochromePlain"
                        onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}
                      >
                        {po.poNumber}
                      </Button>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "170px" }}>
                      <Text as="span" variant="bodySm">
                        {po.supplier}
                      </Text>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "140px" }}>
                      <Badge tone={po.badgeTone}>{po.status}</Badge>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "160px" }}>
                      <Text as="span" variant="bodySm">
                        {po.itemsCount} SKUs ({po.totalUnits} units)
                      </Text>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "120px" }}>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        ${po.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "140px" }}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {po.expectedArrival}
                      </Text>
                    </div>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <div style={{ minWidth: "200px", textAlign: "right" }}>
                      <InlineStack gap="150" align="end" blockAlign="center">
                        {po.status === "Draft" ? (
                          <>
                            <Button size="slim" onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}>
                              View / Edit
                            </Button>
                            <Tooltip content="Delete Draft">
                              <Button
                                icon={DeleteIcon}
                                tone="critical"
                                variant="plain"
                                accessibilityLabel={`Delete draft ${po.poNumber}`}
                                onClick={() => setPendingDeletePo(po)}
                              />
                            </Tooltip>
                          </>
                        ) : po.status === "Ordered" || po.status === "Partially Received" ? (
                          <>
                            <Button
                              size="slim"
                              onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}
                            >
                              View
                            </Button>
                            <Button
                              variant="primary"
                              size="slim"
                              onClick={() => navigate(`/app/purchase-orders/${po.poNumber}?mode=receive`)}
                            >
                              Receive Stock
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}
                          >
                            View Details
                          </Button>
                        )}
                      </InlineStack>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </div>
      </BlockStack>

      {/* Delete Draft Confirmation Modal */}
      <Modal
        open={Boolean(pendingDeletePo)}
        onClose={() => setPendingDeletePo(null)}
        title={`Delete Draft ${pendingDeletePo?.poNumber}?`}
        primaryAction={{
          content: "Delete Draft",
          destructive: true,
          onAction: () => {
            if (!pendingDeletePo) return;
            submit(
              { intent: "DELETE_DRAFT", poId: pendingDeletePo.id },
              { method: "post" },
            );
            setPendingDeletePo(null);
          },
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setPendingDeletePo(null),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to permanently delete draft purchase order <strong>{pendingDeletePo?.poNumber}</strong> for <strong>{pendingDeletePo?.supplier}</strong>?
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This draft order was never sent to the vendor, and no inventory will be affected. This action cannot be undone.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Modal: Select Supplier to Create PO */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Purchase Order"
        primaryAction={{
          content: "Continue to Order Editor",
          onAction: () => {
            setIsCreateModalOpen(false);
            navigate(`/app/purchase-orders/new?supplierId=${chosenSupplierId}&returnTo=/app/purchase-orders`);
          },
          disabled: !chosenSupplierId,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsCreateModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd">
              Select which supplier you want to order from. Once selected, your new purchase order will open cleanly so you can select exactly which products to include from that supplier.
            </Text>
            <Select
              label="Select Supplier"
              options={suppliers}
              value={chosenSupplierId}
              onChange={setChosenSupplierId}
            />
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
