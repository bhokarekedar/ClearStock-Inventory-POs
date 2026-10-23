import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[GDPR Compliance] Received ${topic} webhook for ${shop}`);

  /**
   * Shopify Customers Redact Webhook:
   * ClearStock does not store individual customer records, emails, or personal data.
   * All inventory velocity data is aggregated at the variant level without customer references.
   */
  return new Response(JSON.stringify({ status: "success", message: "Customer redact acknowledged." }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
