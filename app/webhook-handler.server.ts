import prisma from "./db.server";

export function toGid(type: "Product" | "ProductVariant" | "InventoryItem" | "Order", id: string | number): string {
  const strId = String(id);
  if (strId.startsWith("gid://shopify/")) return strId;
  return `gid://shopify/${type}/${strId}`;
}

/**
 * Webhook Idempotency Guard
 * Returns true if this webhook was already processed, preventing double-counting.
 */
export async function isWebhookDuplicate(webhookId: string | undefined | null, shop: string, topic: string, orderId?: string): Promise<boolean> {
  if (!webhookId) return false;

  const existing = await prisma.processedWebhook.findUnique({
    where: { id: webhookId },
  });

  if (existing) {
    console.log(`[Webhook Idempotency] Skipping duplicate webhook ${webhookId} (${topic}) for ${shop}`);
    return true;
  }

  await prisma.processedWebhook.create({
    data: {
      id: webhookId,
      shop,
      topic,
      orderId: orderId ? String(orderId) : null,
    },
  });

  return false;
}

/**
 * Ingest or Update a Shopify Product & its Variants
 * Updates product metadata, links inventoryItemId for mutations, and syncs vendor.
 */
export async function ingestShopifyProduct(payload: any, shop: string): Promise<void> {
  try {
    const rawProductId = payload.id;
    const rawVendor = payload.vendor?.trim() || "";
    const rawTitle = payload.title || "Untitled Product";
    const variants = payload.variants || [];

    if (!rawProductId) return;

    const productId = toGid("Product", rawProductId);

    // 1. Resolve Supplier if vendor is present
    let supplierId: string | null = null;
    if (rawVendor) {
      let supplier = await prisma.supplier.findFirst({
        where: { shop, name: rawVendor },
      });

      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            shop,
            name: rawVendor,
            defaultLeadTime: 14,
            currency: "USD",
            notes: `Auto-created from Shopify product vendor "${rawVendor}".`,
          },
        });
      }
      supplierId = supplier.id;
    }

    // Fallback supplier if none exists
    if (!supplierId) {
      const defaultSupplier = await prisma.supplier.findFirst({
        where: { shop },
        orderBy: { createdAt: "asc" },
      });
      supplierId = defaultSupplier?.id || null;
    }

    if (!supplierId) {
      console.warn(`[Product Ingestion] No supplier found for ${shop}. Creating default supplier.`);
      const defaultSupplier = await prisma.supplier.create({
        data: {
          shop,
          name: "General Supplier",
          defaultLeadTime: 14,
          currency: "USD",
        },
      });
      supplierId = defaultSupplier.id;
    }

    // 2. Synchronize all product variants into VariantSupplierRule
    for (const v of variants) {
      const variantId = toGid("ProductVariant", v.id);
      const inventoryItemId = v.inventory_item_id ? toGid("InventoryItem", v.inventory_item_id) : null;
      const sku = v.sku || `SKU-${v.id}`;
      const price = parseFloat(v.price) || 0;
      const defaultUnitCost = Math.max(1.0, Number((price * 0.4).toFixed(2))); // Sensible default 40% COGS

      await prisma.variantSupplierRule.upsert({
        where: {
          shop_variantId: {
            shop,
            variantId,
          },
        },
        update: {
          productId,
          inventoryItemId,
          supplierSku: sku,
          ...(supplierId ? { supplierId } : {}),
        },
        create: {
          shop,
          variantId,
          productId,
          inventoryItemId,
          supplierId,
          supplierSku: sku,
          unitCost: defaultUnitCost,
          leadTimeDays: 14,
          minOrderQty: 12,
          packSize: 12,
          safetyStockDays: 7,
          safetyStockMinimum: 10,
        },
      });
    }

    console.log(`[Product Ingestion] Successfully synced ${rawTitle} (${variants.length} variants) for ${shop}`);
  } catch (error) {
    console.error("[Product Ingestion] Failed to ingest product webhook:", error);
  }
}

/**
 * Remove variants when product is deleted in Shopify
 */
export async function deleteShopifyProduct(payload: any, shop: string): Promise<void> {
  try {
    const rawProductId = payload.id;
    if (!rawProductId) return;
    const productId = toGid("Product", rawProductId);

    await prisma.variantSupplierRule.deleteMany({
      where: {
        shop,
        productId,
      },
    });
    console.log(`[Product Deletion] Removed rules for product ${productId} on ${shop}`);
  } catch (error) {
    console.error("[Product Deletion] Failed to delete product rules:", error);
  }
}

/**
 * Ingest Order & Update Sub-Second DailySalesAggregator
 * Filters out unpaid or fraudulent orders and aggregates daily units sold.
 */
export async function ingestShopifyOrder(payload: any, shop: string): Promise<void> {
  try {
    const financialStatus = payload.financial_status;
    const isCancelled = Boolean(payload.cancelled_at);

    // Only count paid, active orders towards sales velocity
    if (isCancelled || (financialStatus !== "paid" && financialStatus !== "partially_paid")) {
      console.log(`[Order Ingestion] Skipping order ${payload.id}: financial_status=${financialStatus}, cancelled=${isCancelled}`);
      return;
    }

    const createdAtStr = payload.created_at || payload.processed_at || new Date().toISOString();
    const orderDate = new Date(createdAtStr);
    orderDate.setUTCHours(0, 0, 0, 0); // Normalize to UTC midnight

    const lineItems = payload.line_items || [];

    for (const item of lineItems) {
      if (!item.variant_id) continue;
      const variantId = toGid("ProductVariant", item.variant_id);
      const quantity = parseInt(String(item.quantity || 0), 10);

      if (quantity <= 0) continue;

      await prisma.dailySalesAggregator.upsert({
        where: {
          shop_variantId_date: {
            shop,
            variantId,
            date: orderDate,
          },
        },
        update: {
          unitsSold: {
            increment: quantity,
          },
        },
        create: {
          shop,
          variantId,
          date: orderDate,
          unitsSold: quantity,
        },
      });
    }

    console.log(`[Order Ingestion] Successfully recorded sales for order ${payload.id} (${lineItems.length} items) on ${shop}`);
  } catch (error) {
    console.error("[Order Ingestion] Failed to ingest order sales:", error);
  }
}
