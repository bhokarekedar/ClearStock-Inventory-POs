import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR Compliance] Received ${topic} webhook for ${shop}`);

  /**
   * Shopify Shop Redact Webhook:
   * Fired 48 hours after an app uninstallation.
   * Permanently purge all remaining database records associated with this shop.
   */
  try {
    if (shop) {
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
      await prisma.session.deleteMany({ where: { shop } });

      console.log(`[shop/redact] Permanently purged all store data for ${shop}`);
    }
  } catch (error) {
    console.error(`[shop/redact] Error purging records for ${shop}:`, error);
  }

  return new Response(null, { status: 200 });
};
