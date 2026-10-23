import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isWebhookDuplicate, toGid } from "../webhook-handler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, webhookId, admin } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop} (ID: ${webhookId})`);

  const isDuplicate = await isWebhookDuplicate(webhookId, shop, topic);
  if (isDuplicate) {
    return new Response();
  }

  // Inventory level updates from Shopify (e.g., POS sales, manual stock adjustments)
  const inventoryItemId = payload.inventory_item_id ? toGid("InventoryItem", payload.inventory_item_id) : null;

  if (inventoryItemId) {
    let totalAvailable: number | null = null;

    // Sum inventory across ALL active locations via Shopify GraphQL
    if (admin) {
      try {
        const res = await admin.graphql(
          `
          query GetItemInventory($id: ID!) {
            inventoryItem(id: $id) {
              inventoryLevels(first: 20) {
                nodes {
                  location {
                    isActive
                  }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        `,
          {
            variables: { id: inventoryItemId },
          },
        );
        const json = await res.json();
        const levels = json.data?.inventoryItem?.inventoryLevels?.nodes || [];
        totalAvailable = levels.reduce((sum: number, lvl: any) => {
          if (lvl.location?.isActive) {
            const qty = lvl.quantities?.find((q: any) => !q.name || q.name === "available")?.quantity || lvl.quantities?.[0]?.quantity || 0;
            return sum + qty;
          }
          return sum;
        }, 0);
      } catch (err) {
        console.warn(`[Inventory Webhook] Failed to query multi-location inventory:`, err);
      }
    }

    // Fallback if admin query wasn't possible
    if (totalAvailable === null && typeof payload.available === "number") {
      totalAvailable = payload.available;
    }

    if (totalAvailable !== null) {
      // Synchronize live warehouse / POS stock count into VariantSupplierRule
      await prisma.variantSupplierRule.updateMany({
        where: {
          shop,
          inventoryItemId,
        },
        data: {
          availableStock: totalAvailable,
        },
      });
      console.log(`[Inventory Webhook] Persisted aggregated available=${totalAvailable} for ${inventoryItemId} on ${shop}`);
    }
  }

  return new Response();
};
