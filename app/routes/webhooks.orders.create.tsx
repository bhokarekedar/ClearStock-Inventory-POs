import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isWebhookDuplicate, ingestShopifyOrder } from "../webhook-handler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop} (ID: ${webhookId})`);

  // Idempotency: verify this order event hasn't already been counted
  const isDuplicate = await isWebhookDuplicate(webhookId, shop, topic, payload?.id);
  if (isDuplicate) {
    return new Response();
  }

  await ingestShopifyOrder(payload, shop);

  return new Response();
};
