import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR Compliance] Received ${topic} webhook for ${shop}`);

  /**
   * Shopify Customers Data Request Webhook:
   * ClearStock is an inventory replenishment and purchase order automation tool.
   * We do not store or process merchant customer PII (personally identifiable information).
   * All sales data is aggregated anonymously by product variant ID and date.
   */
  return new Response(JSON.stringify({ status: "success", message: "Data request acknowledged. No customer PII retained." }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
