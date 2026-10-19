import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError } from "react-router";
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
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const MOCK_POS = [
  {
    id: "po-1042",
    poNumber: "PO-1042",
    supplier: "Apex Apparel Ltd.",
    status: "Draft",
    badgeTone: "attention" as const,
    itemsCount: 3,
    totalUnits: 252,
    totalCost: 4620.0,
    expectedArrival: "In 14 days",
    createdAt: "Today",
  },
  {
    id: "po-1041",
    poNumber: "PO-1041",
    supplier: "Nordic Craft Co.",
    status: "Ordered",
    badgeTone: "info" as const,
    itemsCount: 2,
    totalUnits: 120,
    totalCost: 1240.0,
    expectedArrival: "Nov 2, 2026",
    createdAt: "3 days ago",
  },
  {
    id: "po-1040",
    poNumber: "PO-1040",
    supplier: "Summit Goods",
    status: "Partially Received",
    badgeTone: "warning" as const,
    itemsCount: 4,
    totalUnits: 460,
    totalCost: 15640.0,
    expectedArrival: "Oct 25, 2026",
    createdAt: "Oct 12, 2026",
  },
  {
    id: "po-1039",
    poNumber: "PO-1039",
    supplier: "Apex Apparel Ltd.",
    status: "Received",
    badgeTone: "success" as const,
    itemsCount: 5,
    totalUnits: 600,
    totalCost: 9800.0,
    expectedArrival: "Oct 10, 2026",
    createdAt: "Sep 28, 2026",
  },
];

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();

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
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "purchase order", plural: "purchase orders" }}
            itemCount={MOCK_POS.length}
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
            {MOCK_POS.map((po, index) => (
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
                        <Button size="slim" onClick={() => navigate("/app/purchase-orders/new")}>
                          Edit Draft
                        </Button>
                      ) : po.status === "Ordered" || po.status === "Partially Received" ? (
                        <Button
                          variant="primary"
                          size="slim"
                          onClick={() => navigate(`/app/purchase-orders/${po.id}`)}
                        >
                          Receive Stock
                        </Button>
                      ) : (
                        <Button
                          variant="plain"
                          size="slim"
                          onClick={() => navigate(`/app/purchase-orders/${po.id}`)}
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
