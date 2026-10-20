import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isWebhookDuplicate, toGid } from "../webhook-handler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop} (ID: ${webhookId})`);

  const isDuplicate = await isWebhookDuplicate(webhookId, shop, topic);
  if (isDuplicate) {
    return new Response();
  }

  // Inventory level updates from Shopify (e.g., POS sales, manual stock adjustments)
  const inventoryItemId = payload.inventory_item_id ? toGid("InventoryItem", payload.inventory_item_id) : null;
  const available = payload.available;

  console.log(`[Inventory Webhook] Level updated for item ${inventoryItemId}: available=${available}`);

  return new Response();
};
