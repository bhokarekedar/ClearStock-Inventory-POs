import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
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
  const available = typeof payload.available === "number" ? payload.available : null;

  if (inventoryItemId && available !== null) {
    await prisma.variantSupplierRule.updateMany({
      where: {
        shop,
        inventoryItemId,
      },
      data: {
        availableStock: available,
      },
    });
    console.log(`[Inventory Webhook] Persisted available=${available} for ${inventoryItemId} on ${shop}`);
  }

  return new Response();
};
