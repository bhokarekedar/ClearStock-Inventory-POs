import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError, useLoaderData } from "react-router";
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
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
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

const MOCK_POS: POListingItem[] = [
  {
    id: "po-1001",
    poNumber: "PO-1001",
    supplier: "Apex Apparel Ltd.",
    status: "Ordered",
    badgeTone: "info",
    itemsCount: 1,
    totalUnits: 50,
    totalCost: 700.0,
    expectedArrival: "In 3 days",
    createdAt: "Today",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch Purchase Orders from PostgreSQL
  const posDb = await prisma.purchaseOrder.findMany({
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
    orders: orders.length > 0 ? orders : MOCK_POS,
  };
};

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<typeof loader>();
  const orders = loaderData?.orders || MOCK_POS;

  return (
    <Page
      title="Purchase Orders"
      subtitle="Track purchase order lifecycles and receive physical stock into Shopify."
      primaryAction={{
        content: "Create Purchase Order",
        icon: PlusIcon,
        onAction: () => navigate("/app/purchase-orders/new"),
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
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {po.poNumber}
                      </Text>
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
                    <div style={{ minWidth: "140px", textAlign: "right" }}>
                      <InlineStack gap="100" align="end">
                        {po.status === "Draft" ? (
                          <Button size="slim" onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}>
                            View / Edit
                          </Button>
                        ) : po.status === "Ordered" || po.status === "Partially Received" ? (
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => navigate(`/app/purchase-orders/${po.poNumber}`)}
                          >
                            Receive Stock
                          </Button>
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
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
