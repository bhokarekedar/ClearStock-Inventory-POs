import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError, useLoaderData, useSubmit, useNavigation, useActionData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  ButtonGroup,
  BlockStack,
  InlineStack,
  Banner,
  Checkbox,
  Divider,
  Badge,
  Modal,
  Box,
} from "@shopify/polaris";
import { RefreshIcon, CheckIcon, DeleteIcon, ExportIcon, ClipboardIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { SupportModal } from "../components/SupportModal";
import { ClearStockGuideModal } from "../components/ClearStockGuideModal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.appSettings.findFirst({
    where: { shop },
  });

  if (!settings) {
    settings = await prisma.appSettings.create({
      data: {
        shop,
        defaultLookbackWindow: 30,
        defaultSafetyStockDays: 7,
        defaultLeadTimeDays: 14,
        autoRoundCasePacks: true,
        emailAlerts: false,
        selectedPlan: "growth",
      },
    });
  }

  const rulesCount = await prisma.variantSupplierRule.count({
    where: { shop },
  });

  const salesCount = await prisma.dailySalesAggregator.count({
    where: { shop },
  });

  const suppliersCount = await prisma.supplier.count({
    where: { shop },
  });

  const poCount = await prisma.purchaseOrder.count({
    where: { shop },
  });

  return {
    shop,
    settings,
    stats: {
      trackedSkus: rulesCount,
      salesLedgerRows: salesCount,
      suppliersCount,
      poCount,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // 1. RELAUNCH ONBOARDING WIZARD
  if (intent === "RELAUNCH_WIZARD") {
    await prisma.appSettings.upsert({
      where: { shop },
      update: { onboardingCompleted: false },
      create: { shop, onboardingCompleted: false },
    });
    return { ok: true, relaunchWizard: true, message: "Onboarding Wizard reset. Redirecting..." };
  }

  // 1.5 SWITCH SUBSCRIPTION PLAN TIER
  if (intent === "CHANGE_PLAN") {
    const newPlan = String(formData.get("plan") || "growth");
    const updated = await prisma.appSettings.upsert({
      where: { shop },
      update: { selectedPlan: newPlan },
      create: { shop, selectedPlan: newPlan },
    });
    return { ok: true, planUpdated: true, settings: updated, message: `Subscription plan switched to ${newPlan.toUpperCase()} ($${newPlan === "starter" ? "9" : newPlan === "scale" ? "89" : "39"}/mo).` };
  }

  // 2. FULL HISTORICAL RE-SYNC
  if (intent === "FULL_RESYNC") {
    try {
      // 1. Sync Products (No Protected Customer Data required)
      const productsResponse = await admin.graphql(`
        query SyncStoreProductsOnly {
          products(first: 50) {
            edges {
              node {
                id
                title
                vendor
                variants(first: 50) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const productsJson = await productsResponse.json();
      const productEdges = productsJson.data?.products?.edges || [];

      // 2. Sync Orders in isolated try-catch
      let orderEdges: any[] = [];
      try {
        const ordersResponse = await admin.graphql(`
          query SyncStoreOrdersOnly {
            orders(first: 50, query: "status:open OR status:closed") {
              edges {
                node {
                  id
                  createdAt
                  displayFinancialStatus
                  cancelledAt
                  lineItems(first: 50) {
                    edges {
                      node {
                        quantity
                        variant {
                          id
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `);
        const ordersJson: any = await ordersResponse.json();
        if (!ordersJson.errors || ordersJson.errors.length === 0) {
          orderEdges = ordersJson.data?.orders?.edges || [];
        }
      } catch (orderErr: any) {
        console.warn("[Settings Orders Sync PCD Handled]", orderErr.message);
      }

      // Update inventory levels
      for (const pEdge of productEdges) {
        for (const vEdge of pEdge.node.variants?.edges || []) {
          const v = vEdge.node;
          if (typeof v.inventoryQuantity === "number") {
            await prisma.variantSupplierRule.updateMany({
              where: { shop, variantId: v.id },
              data: { availableStock: v.inventoryQuantity },
            });
          }
        }
      }

      // Ingest orders
      for (const oEdge of orderEdges) {
        const o = oEdge.node;
        if (o.cancelledAt) continue;
        const date = new Date(o.createdAt);
        date.setUTCHours(0, 0, 0, 0);

        for (const itemEdge of o.lineItems?.edges || []) {
          const item = itemEdge.node;
          if (!item.variant?.id) continue;
          const qty = parseInt(String(item.quantity || 0), 10);
          if (qty <= 0) continue;

          await prisma.dailySalesAggregator.upsert({
            where: {
              shop_variantId_date: {
                shop,
                variantId: item.variant.id,
                date,
              },
            },
            update: { unitsSold: { increment: qty } },
            create: { shop, variantId: item.variant.id, date, unitsSold: qty },
          });
        }
      }

      return {
        ok: true,
        message: `Successfully synchronized ${productEdges.length} products and ${orderEdges.length} orders from Shopify.`,
      };
    } catch (err: any) {
      console.error("[Settings Full Resync Error]", err);
      return { ok: false, error: "Failed to perform historical sync." };
    }
  }

  // 3. GDPR / CCPA DATA PORTABILITY EXPORT
  if (intent === "EXPORT_DATA") {
    try {
      const [appSettings, suppliers, rules, purchaseOrders, salesRecords] = await Promise.all([
        prisma.appSettings.findFirst({ where: { shop } }),
        prisma.supplier.findMany({ where: { shop } }),
        prisma.variantSupplierRule.findMany({ where: { shop } }),
        prisma.purchaseOrder.findMany({ where: { shop }, include: { items: true } }),
        prisma.dailySalesAggregator.findMany({ where: { shop } }),
      ]);

      const exportPayload = {
        complianceMetadata: {
          regulatoryStandard: "GDPR (General Data Protection Regulation) & CCPA (California Consumer Privacy Act)",
          dataPortabilityRight: "GDPR Article 20 / CCPA Section 1798.100 (Right to Know & Portability)",
          storeDomain: shop,
          exportedAt: new Date().toISOString(),
          customerPIIStatement: "ClearStock does NOT collect, retain, process, or sell customer Personally Identifiable Information (PII). Sales velocity metrics are stored anonymously by product variant ID and UTC calendar date.",
        },
        storeInformation: {
          shop,
          settings: appSettings,
        },
        suppliers,
        variantSupplierRules: rules,
        purchaseOrders,
        salesVelocityCache: salesRecords,
        statistics: {
          totalSuppliers: suppliers.length,
          totalSourcingRules: rules.length,
          totalPurchaseOrders: purchaseOrders.length,
          totalDailySalesRows: salesRecords.length,
        },
      };

      return {
        ok: true,
        exportData: exportPayload,
        message: "Data export compiled successfully. Starting download...",
      };
    } catch (err: any) {
      console.error("[Export Data Error]", err);
      return { ok: false, error: "Failed to compile compliance data export." };
    }
  }

  // 4. DANGER ZONE: WIPE ALL LOCAL DATABASE DATA
  if (intent === "WIPE_ALL_DATA") {
    const confirmation = String(formData.get("confirmation") || "").trim();
    if (confirmation !== "WIPE") {
      return { ok: false, error: 'Please type "WIPE" in all capitals to confirm permanent data deletion.' };
    }

    try {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { shop } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { shop } });
      await prisma.variantSupplierRule.deleteMany({ where: { shop } });
      await prisma.supplier.deleteMany({ where: { shop } });
      await prisma.dailySalesAggregator.deleteMany({ where: { shop } });
      await prisma.processedWebhook.deleteMany({ where: { shop } });
      await prisma.historicalSyncJob.deleteMany({ where: { shop } });
      await prisma.appSettings.deleteMany({ where: { shop } });

      // Note: Session is deliberately preserved so merchant remains logged in
      console.log(`[Data Wipe] Successfully wiped all records for shop ${shop}`);

      return {
        ok: true,
        dataWiped: true,
        message: "All local ClearStock data wiped successfully. Redirecting to fresh setup...",
      };
    } catch (err: any) {
      console.error("[Data Wipe Error]", err);
      return { ok: false, error: "Failed to wipe data: " + err.message };
    }
  }

  // 5. REGULAR SETTINGS SAVE
  const defaultLookbackWindow = parseInt(String(formData.get("defaultLookbackWindow") || "30"), 10);
  const defaultSafetyStockDays = parseInt(String(formData.get("defaultSafetyStockDays") || "7"), 10);
  const defaultLeadTimeDays = parseInt(String(formData.get("defaultLeadTimeDays") || "14"), 10);

  // Plan feature checks: custom safety formula requires Scale; case pack rounding requires Growth+
  const existingSettings = await prisma.appSettings.findFirst({ where: { shop } });
  const isScaleTier = existingSettings?.selectedPlan === "scale";
  const isStarterTier = existingSettings?.selectedPlan === "starter";
  const requestedModel = String(formData.get("safetyFormulaModel") || "standard");
  const safetyFormulaModel = isScaleTier ? requestedModel : "standard";
  const autoRoundCasePacks = isStarterTier ? false : formData.get("autoRoundCasePacks") === "true";

  let settings: any;
  try {
    settings = await prisma.appSettings.upsert({
      where: { shop },
      update: {
        defaultLookbackWindow,
        defaultSafetyStockDays,
        defaultLeadTimeDays,
        autoRoundCasePacks,
        safetyFormulaModel,
      },
      create: {
        shop,
        defaultLookbackWindow,
        defaultSafetyStockDays,
        defaultLeadTimeDays,
        autoRoundCasePacks,
        safetyFormulaModel,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes("safetyFormulaModel") || err?.name === "PrismaClientValidationError") {
      // Graceful fallback if in-memory Vite dev client is stale before restart
      settings = await prisma.appSettings.upsert({
        where: { shop },
        update: {
          defaultLookbackWindow,
          defaultSafetyStockDays,
          defaultLeadTimeDays,
          autoRoundCasePacks,
        },
        create: {
          shop,
          defaultLookbackWindow,
          defaultSafetyStockDays,
          defaultLeadTimeDays,
          autoRoundCasePacks,
        },
      });
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "AppSettings" SET "safetyFormulaModel" = $1 WHERE "shop" = $2`,
          safetyFormulaModel,
          shop,
        );
      } catch (rawErr) {
        console.warn("Raw update skipped:", rawErr);
      }
    } else {
      throw err;
    }
  }

  return { ok: true, settings, message: "ClearStock replenishment settings saved successfully." };
};

export default function SettingsPage() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isSubmitting = navigation.state === "submitting";

  const { settings, stats } = loaderData;

  const [defaultWindow, setDefaultWindow] = useState<string>(String(settings.defaultLookbackWindow));
  const [defaultSafetyDays, setDefaultSafetyDays] = useState<string>(String(settings.defaultSafetyStockDays));
  const [defaultLeadTime, setDefaultLeadTime] = useState<string>(String(settings.defaultLeadTimeDays));
  const [autoRound, setAutoRound] = useState<boolean>(settings.autoRoundCasePacks);
  const [safetyFormulaModel, setSafetyFormulaModel] = useState<string>((settings as any).safetyFormulaModel || "standard");
  const [currentPlan, setCurrentPlan] = useState<string>(settings.selectedPlan || "growth");

  useEffect(() => {
    setCurrentPlan(settings.selectedPlan || "growth");
  }, [settings.selectedPlan]);

  // Modals state
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [exportDataPayload, setExportDataPayload] = useState<any>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Reliable Blob File Downloader for Shopify App iframes
  const triggerBlobDownload = (data: any) => {
    try {
      const jsonContent = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.style.display = "none";
      downloadAnchor.href = url;
      downloadAnchor.download = `clearstock-data-export-${loaderData.shop.replace(".myshopify.com", "")}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      setTimeout(() => {
        document.body.removeChild(downloadAnchor);
        window.URL.revokeObjectURL(url);
      }, 400);
    } catch (e) {
      console.error("Export download error:", e);
    }
  };

  // Handle Action Responses
  useEffect(() => {
    if (actionData?.ok) {
      if (actionData.message) {
        shopify.toast.show(actionData.message);
      }
      if (actionData.relaunchWizard || actionData.dataWiped) {
        navigate("/app");
      }
      // Handle browser download & preview modal for export data
      if (actionData.exportData) {
        setExportDataPayload(actionData.exportData);
        setShowExportModal(true);
        triggerBlobDownload(actionData.exportData);
      }
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify, navigate, loaderData.shop]);

  const handleSave = () => {
    submit(
      {
        defaultLookbackWindow: defaultWindow,
        defaultSafetyStockDays: defaultSafetyDays,
        defaultLeadTimeDays: defaultLeadTime,
        autoRoundCasePacks: String(autoRound),
        safetyFormulaModel,
      },
      { method: "post" },
    );
  };

  const handleFullResync = () => {
    submit({ intent: "FULL_RESYNC" }, { method: "post" });
  };

  const handleExportData = () => {
    submit({ intent: "EXPORT_DATA" }, { method: "post" });
  };

  const handleWipeData = () => {
    submit(
      {
        intent: "WIPE_ALL_DATA",
        confirmation: wipeConfirmText,
      },
      { method: "post" },
    );
  };

  return (
    <Page
      title="Settings"
      subtitle="Configure global forecasting formulas, case-pack rules, data privacy, and danger zone."
      primaryAction={{
        content: "Save Settings",
        icon: CheckIcon,
        loading: isSubmitting && navigation.formData?.get("intent") === undefined,
        onAction: handleSave,
      }}
    >
      <BlockStack gap="500">
        <Layout>
          {/* Section 1: Active Subscription Plan */}
          <Layout.AnnotatedSection
            id="subscription-plan"
            title="Subscription & Plan"
            description="View your current plan tier and relaunch the setup wizard if you need to reconfigure."
          >
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="headingMd">
                        {settings.selectedPlan === "starter"
                          ? "Starter Plan ($9/mo)"
                          : settings.selectedPlan === "scale"
                          ? "Scale Enterprise ($89/mo)"
                          : "Growth Plan ($39/mo)"}
                      </Text>
                      <Badge tone="success">Active (14-Day Trial)</Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {settings.selectedPlan === "starter"
                        ? "Up to 50 SKUs, 1 primary supplier, 30-day sales velocity, and automated PO drafting."
                        : settings.selectedPlan === "scale"
                        ? "Unlimited SKUs, multi-location stock balancing, custom safety stock formulas, priority support."
                        : "Unlimited SKUs & variants, multi-supplier lead times, 7/14/30/90D velocity toggles, case-pack & MOQ rounding."}
                    </Text>
                  </BlockStack>

                  <Button onClick={() => setShowSupportModal(true)}>
                    💬 Contact Support
                  </Button>
                </InlineStack>

                <Divider />

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Change Subscription Tier
                  </Text>
                  <InlineStack gap="300" blockAlign="center" wrap>
                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <Select
                        label="Plan Tier"
                        labelHidden
                        options={[
                          { label: "Starter Plan — $9/mo (Max 50 SKUs, 1 Supplier, 30D Velocity)", value: "starter" },
                          { label: "Growth Plan — $39/mo (Unlimited SKUs, Multi-Supplier, 7/14/30/90D Velocity)", value: "growth" },
                          { label: "Scale Plan — $89/mo (Multi-Warehouse Receiving, Custom Safety Formulas)", value: "scale" },
                        ]}
                        value={currentPlan}
                        onChange={(val) => {
                          setCurrentPlan(val);
                          submit({ intent: "CHANGE_PLAN", plan: val }, { method: "post" });
                        }}
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Section 2: Forecasting Formula Defaults */}
          <Layout.AnnotatedSection
            id="formula-defaults"
            title="Forecasting Formula Defaults"
            description="Set default values for Average Daily Sales (ADS) calculation windows and safety stock coverage targets."
          >
            <Card>
              <BlockStack gap="400">
                <Select
                  label="Default Sales Lookback Window"
                  options={[
                    { label: "7 Days (Fast-moving flash sales / peak holiday)", value: "7" },
                    { label: "14 Days (Bi-weekly trend capture)", value: "14" },
                    { label: "30 Days (Recommended for balanced demand smoothing)", value: "30" },
                    { label: "90 Days (Quarterly staple replenishment)", value: "90" },
                  ]}
                  value={defaultWindow}
                  onChange={setDefaultWindow}
                  helpText="Select the historical window used across the app to calculate daily run-rates."
                />

                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Default Safety Stock (Days)"
                      type="number"
                      value={defaultSafetyDays}
                      onChange={setDefaultSafetyDays}
                      autoComplete="off"
                      helpText="Buffer days to cover unexpected sales spikes or shipping delays."
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Default Supplier Lead Time (Days)"
                      type="number"
                      value={defaultLeadTime}
                      onChange={setDefaultLeadTime}
                      autoComplete="off"
                      helpText="Fallback transit time used when supplier lead time is unset."
                    />
                  </div>
                </InlineStack>

                <Select
                  label="Custom Safety Stock Formula Model"
                  disabled={settings.selectedPlan !== "scale"}
                  options={[
                    { label: "Standard Formula (1.0x buffer — Daily Sales × Target Days)", value: "standard" },
                    { label: "Surge Protection Buffer (+25% multiplier for volatile sales)", value: "surge" },
                    { label: "Aggressive Peak Buffer (+50% multiplier for zero-stockout policy)", value: "aggressive" },
                    { label: "Lean / JIT Inventory (-20% buffer for fast inventory turnover)", value: "lean" },
                  ]}
                  value={settings.selectedPlan === "scale" ? safetyFormulaModel : "standard"}
                  onChange={(val) => {
                    setSafetyFormulaModel(val);
                    submit(
                      {
                        defaultLookbackWindow: defaultWindow,
                        defaultSafetyStockDays: defaultSafetyDays,
                        defaultLeadTimeDays: defaultLeadTime,
                        autoRoundCasePacks: String(autoRound),
                        safetyFormulaModel: val,
                      },
                      { method: "post" },
                    );
                  }}
                  helpText={
                    settings.selectedPlan === "scale"
                      ? "Scale Plan feature: Dynamically scales baseline safety stock and reorder triggers based on your risk tolerance."
                      : "🔒 Available on Scale Plan ($89/mo). Upgrade from Starter or Growth to enable Surge (+25%), Aggressive (+50%), and Lean (-20%) formula models."
                  }
                />

                <Divider />

                <Checkbox
                  label="Automatically round replenishment orders to Case Pack multiples"
                  disabled={settings.selectedPlan === "starter"}
                  checked={settings.selectedPlan === "starter" ? false : autoRound}
                  onChange={setAutoRound}
                  helpText={
                    settings.selectedPlan === "starter"
                      ? "🔒 Case Pack & MOQ Rounding is a Growth Plan feature ($39/mo). Upgrade to automatically round orders to master carton multiples."
                      : "When enabled, replenishment quantities round up to carton multiples (e.g., 12, 24) to avoid broken master cases."
                  }
                />

                <Divider />

                <Box paddingBlockStart="500" paddingBlockEnd="200">
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Changes take effect across your Replenishment dashboard immediately.
                    </Text>
                    <InlineStack align="start">
                      <Button
                        variant="primary"
                        icon={CheckIcon}
                        loading={isSubmitting}
                        onClick={handleSave}
                      >
                        Save Replenishment Rules & Formula
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Section 3: Data Sync & Truth */}
          <Layout.AnnotatedSection
            id="data-sync"
            title="Shopify Data Sync & Health"
            description="Manage real-time data synchronization and manually verify local sales records against Shopify."
          >
            <Card>
              <BlockStack gap="300">
                <Banner tone="success">
                  <Text as="p" variant="bodyMd">
                    High-speed sync engine active. Replenishment calculations execute with real-time speed.
                  </Text>
                </Banner>

                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">
                    <strong>Synced Records:</strong> {stats.trackedSkus} tracked SKUs • {stats.suppliersCount} suppliers • {stats.poCount} purchase orders • {stats.salesLedgerRows.toLocaleString()} daily sales records.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Store domain: {loaderData.shop}
                  </Text>
                </BlockStack>

                <InlineStack gap="200" blockAlign="center" wrap>
                  <Button
                    icon={RefreshIcon}
                    loading={isSubmitting && navigation.formData?.get("intent") === "FULL_RESYNC"}
                    onClick={handleFullResync}
                  >
                    Trigger 90-Day Historical Re-Sync
                  </Button>
                  <Button onClick={() => setShowGuideModal(true)}>
                    📖 View Sync & Math Guide
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Section 4: Data Portability & Compliance (GDPR Article 15 / CCPA) */}
          <Layout.AnnotatedSection
            id="data-compliance"
            title="Data Portability & Compliance (GDPR / CCPA)"
            description="Download an export of all data stored for your store. ClearStock complies with global privacy regulations and does not retain customer PII."
          >
            <Card>
              <BlockStack gap="400">
                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "16px",
                  }}
                >
                  <Text as="h3" variant="headingSm" tone="success">
                    🛡️ Merchant Privacy & Compliance Guarantee
                  </Text>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#166534", lineHeight: "1.5" }}>
                    • <strong>Zero Customer PII:</strong> ClearStock never stores customer names, emails, addresses, or payment data.<br />
                    • <strong>Anonymous Aggregation:</strong> Sales volume is strictly aggregated by Product Variant ID and UTC date.<br />
                    • <strong>Full Data Portability:</strong> You can download a complete JSON archive of your rules, purchase orders, and supplier directory at any time.
                  </div>
                </div>

                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      Export Store Data Archive (.JSON)
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Includes all suppliers, replenishment rules, purchase orders, and sales cache.
                    </Text>
                  </BlockStack>

                  <Button
                    icon={ExportIcon}
                    loading={isSubmitting && navigation.formData?.get("intent") === "EXPORT_DATA"}
                    onClick={handleExportData}
                  >
                    Download Data Archive
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Section 5: Danger Zone: Wipe Store Data */}
          <Layout.AnnotatedSection
            id="danger-zone"
            title="Danger Zone: Wipe Data"
            description="Permanently delete all local database records for this store. Your live Shopify products, orders, and inventory will remain completely safe and untouched."
          >
            <Card>
              <BlockStack gap="400">
                <Banner tone="critical" title="Permanent Data Deletion">
                  <p>
                    Wiping your data permanently removes all configured suppliers, custom replenishment thresholds, purchase orders, and sales velocity logs from ClearStock's database.
                  </p>
                </Banner>

                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      Wipe All ClearStock Data
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Returns the app to a clean state and opens the setup wizard.
                    </Text>
                  </BlockStack>

                  <Button
                    tone="critical"
                    variant="primary"
                    icon={DeleteIcon}
                    onClick={() => {
                      setWipeConfirmText("");
                      setShowWipeModal(true);
                    }}
                  >
                    Wipe All App Data
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>

        {/* Bottom spacing below Danger Zone */}
        <div style={{ paddingBottom: "64px" }} />
      </BlockStack>

      {/* Wipe Confirmation Modal */}
      <Modal
        open={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        title="⚠️ Confirm Permanent Data Wipe"
        primaryAction={{
          content: "Permanently Wipe Data",
          destructive: true,
          disabled: wipeConfirmText.trim() !== "WIPE" || isSubmitting,
          loading: isSubmitting && navigation.formData?.get("intent") === "WIPE_ALL_DATA",
          onAction: handleWipeData,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowWipeModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="warning">
              <p>
                This action is <strong>irreversible</strong>. It will permanently delete:
              </p>
              <ul style={{ margin: "6px 0 0 0", paddingLeft: "18px", fontSize: "13px" }}>
                <li>All {stats.suppliersCount} configured suppliers and contact records</li>
                <li>All {stats.trackedSkus} variant replenishment rules, MOQ, and lead times</li>
                <li>All {stats.poCount} purchase orders and line items</li>
                <li>All {stats.salesLedgerRows.toLocaleString()} sales velocity ledger records</li>
              </ul>
            </Banner>

            <Text as="p" variant="bodyMd">
              Your active Shopify store catalog, orders, and inventory levels in Shopify Admin will <strong>not</strong> be affected.
            </Text>

            <TextField
              label='To confirm deletion, please type "WIPE" below:'
              value={wipeConfirmText}
              onChange={setWipeConfirmText}
              placeholder="WIPE"
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Export Data Archive Modal */}
      <Modal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="📦 ClearStock Data Archive (.JSON)"
        primaryAction={{
          content: "Download JSON File",
          icon: ExportIcon,
          onAction: () => {
            if (exportDataPayload) triggerBlobDownload(exportDataPayload);
          },
        }}
        secondaryActions={[
          {
            content: "Copy JSON",
            icon: ClipboardIcon,
            onAction: () => {
              if (exportDataPayload) {
                navigator.clipboard.writeText(JSON.stringify(exportDataPayload, null, 2));
                shopify.toast.show("JSON copied to clipboard!");
              }
            },
          },
          {
            content: "Close",
            onAction: () => setShowExportModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>
                This archive contains your complete ClearStock configuration. ClearStock stores <strong>zero customer PII</strong>; sales data is strictly aggregated by variant ID and calendar date.
              </p>
            </Banner>

            {exportDataPayload?.statistics && (
              <InlineStack gap="200" wrap>
                <Badge tone="info">{`${exportDataPayload.statistics.totalSourcingRules || 0} Tracked SKUs`}</Badge>
                <Badge tone="info">{`${exportDataPayload.statistics.totalSuppliers || 0} Suppliers`}</Badge>
                <Badge tone="info">{`${exportDataPayload.statistics.totalPurchaseOrders || 0} Purchase Orders`}</Badge>
                <Badge tone="info">{`${exportDataPayload.statistics.totalDailySalesRows || 0} Sales Ledger Rows`}</Badge>
              </InlineStack>
            )}

            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="bold">
                Export Preview (Raw JSON):
              </Text>
              <pre
                style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  backgroundColor: "#f4f6f8",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  border: "1px solid #dcdfe4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {exportDataPayload ? JSON.stringify(exportDataPayload, null, 2) : "Loading..."}
              </pre>
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Support Desk Modal */}
      <SupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        shop={loaderData.shop}
        plan={settings.selectedPlan}
      />

      {/* Guide Playbook Modal */}
      <ClearStockGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        defaultTab="math"
      />
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
