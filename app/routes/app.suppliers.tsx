import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const MOCK_SUPPLIERS = [
  {
    id: "sup-apex",
    name: "Apex Apparel Ltd.",
    contact: "sales@apexapparel.com",
    defaultLeadTime: 14,
    activeSkus: 28,
    currency: "USD",
  },
  {
    id: "sup-nordic",
    name: "Nordic Craft Co.",
    contact: "orders@nordiccraft.no",
    defaultLeadTime: 21,
    activeSkus: 14,
    currency: "USD",
  },
  {
    id: "sup-summit",
    name: "Summit Goods",
    contact: "wholesale@summitgoods.com",
    defaultLeadTime: 28,
    activeSkus: 8,
    currency: "USD",
  },
];

export default function SuppliersPage() {
  return (
    <Page
      title="Suppliers"
      subtitle="Configure default lead times and physical supplier contact profiles."
      primaryAction={{
        content: "Add Supplier",
        icon: PlusIcon,
        onAction: () => {},
      }}
    >
      <BlockStack gap="400">
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "supplier", plural: "suppliers" }}
            itemCount={MOCK_SUPPLIERS.length}
            selectable={false}
            headings={[
              { title: "Supplier Name" },
              { title: "Contact Email" },
              { title: "Default Lead Time" },
              { title: "Assigned SKUs" },
              { title: "Currency" },
              { title: "Actions", alignment: "end" },
            ]}
          >
            {MOCK_SUPPLIERS.map((sup, index) => (
              <IndexTable.Row id={sup.id} key={sup.id} position={index}>
                <IndexTable.Cell>
                  <div style={{ minWidth: "180px" }}>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {sup.name}
                    </Text>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <div style={{ minWidth: "220px" }}>
                    <Text as="span" variant="bodySm">
                      {sup.contact}
                    </Text>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <div style={{ minWidth: "140px" }}>
                    <Badge tone="info">{`${sup.defaultLeadTime} days`}</Badge>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <div style={{ minWidth: "140px" }}>
                    <Text as="span" variant="bodySm">
                      {`${sup.activeSkus} variants`}
                    </Text>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <div style={{ minWidth: "100px" }}>
                    <Text as="span" variant="bodySm">
                      {sup.currency}
                    </Text>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <div style={{ minWidth: "120px", textAlign: "right" }}>
                    <Button size="slim">Edit Rules</Button>
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

