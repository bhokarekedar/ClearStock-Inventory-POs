import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SettingsPage() {
  const shopify = useAppBridge();

  const [defaultWindow, setDefaultWindow] = useState<string>("30");
  const [defaultSafetyDays, setDefaultSafetyDays] = useState<string>("7");
  const [defaultSafetyMin, setDefaultSafetyMin] = useState<string>("10");
  const [poPrefix, setPoPrefix] = useState<string>("PO-");

  const handleSave = () => {
    shopify.toast.show("Replenishment settings saved.");
  };

  const handleFullResync = () => {
    shopify.toast.show("Historical order re-sync triggered (Past 90 days).");
  };

  return (
    <Page
      title="Settings"
      subtitle="Configure global forecasting formulas and background sync intervals."
      primaryAction={{
        content: "Save Settings",
        onAction: handleSave,
      }}
    >
      <BlockStack gap="400">
        <Layout>
          <Layout.AnnotatedSection
            id="formula-defaults"
            title="Forecasting Formula Defaults"
            description="Set default values for Average Daily Sales (ADS) calculation windows and safety stock buffers."
          >
            <Card>
              <BlockStack gap="300">
                <Select
                  label="Default Sales Velocity Window"
                  options={[
                    { label: "7 Days (Recent momentum)", value: "7" },
                    { label: "14 Days (Balanced short-term)", value: "14" },
                    { label: "30 Days (Recommended default)", value: "30" },
                    { label: "90 Days (Long-term smoothing)", value: "90" },
                  ]}
                  value={defaultWindow}
                  onChange={setDefaultWindow}
                  helpText="Can be toggled dynamically at any time on the Replenishment table."
                />

                <InlineStack gap="300">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Default Safety Stock (Days)"
                      type="number"
                      value={defaultSafetyDays}
                      onChange={setDefaultSafetyDays}
                      autoComplete="off"
                      helpText="Days of buffer stock to maintain above lead time."
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Minimum Safety Unit Floor"
                      type="number"
                      value={defaultSafetyMin}
                      onChange={setDefaultSafetyMin}
                      autoComplete="off"
                      helpText="Hard unit minimum (prevents zero buffer on slow SKUs)."
                    />
                  </div>
                </InlineStack>

                <TextField
                  label="Purchase Order Prefix"
                  value={poPrefix}
                  onChange={setPoPrefix}
                  autoComplete="off"
                  helpText="Sequential PO number prefix (e.g. PO-1001)."
                />
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          <Layout.AnnotatedSection
            id="data-sync"
            title="Shopify Data Sync & Health"
            description="Manage background synchronization and manually heal local sales records."
          >
            <Card>
              <BlockStack gap="300">
                <Banner tone="success">
                  <Text as="p" variant="bodyMd">
                    Webhook listener active. Receiving delta updates for orders, inventory, and products.
                  </Text>
                </Banner>

                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">
                    <strong>Local Ledger:</strong> 5 tracked SKUs • Sub-second cached response times.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Last automatic webhook event processed: Today at 02:15 PM
                  </Text>
                </BlockStack>

                <div>
                  <Button icon={RefreshIcon} onClick={handleFullResync}>
                    Trigger 90-Day Historical Re-Sync
                  </Button>
                </div>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
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

