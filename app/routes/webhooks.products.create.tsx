import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isWebhookDuplicate, ingestShopifyProduct } from "../webhook-handler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop} (ID: ${webhookId})`);

  // Idempotency check: prevent duplicate execution
  const isDuplicate = await isWebhookDuplicate(webhookId, shop, topic);
  if (isDuplicate) {
    return new Response();
  }

  await ingestShopifyProduct(payload, shop);

  return new Response();
};
