import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function shopifyGql(shop: string, token: string, query: string, variables?: any) {
  const res = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL Error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Helper to pause between calls if needed
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("🛒 Starting Realistic Shopify Historical Orders Seeder...");

  // 1. Get active session
  const session = await prisma.session.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!session || !session.accessToken) {
    console.error("❌ No active Shopify session found.");
    process.exit(1);
  }

  const { shop, accessToken } = session;
  console.log(`📦 Connected to Store: ${shop}`);

  // 2. Fetch all variant supplier rules in the store to get active variants
  const rules = await prisma.variantSupplierRule.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });

  if (rules.length === 0) {
    console.error("❌ No variants found in ClearStock database. Run `npm run seed:store` first.");
    process.exit(1);
  }

  console.log(`✅ Found ${rules.length} catalog variants in ClearStock:`);
  rules.forEach((r) => {
    console.log(`   • ${r.title} (${r.variantTitle}) - SKU: ${r.supplierSku} -> ${r.variantId}`);
  });

  // Map SKU to variant details
  const skuMap = new Map(rules.map((r) => [r.supplierSku, r]));

  // Find variants by SKU
  const teeBlkM = skuMap.get("TEE-BLK-M"); // Fast seller (4/day) -> Reorder Now (Stock = 8)
  const teeWhtL = skuMap.get("TEE-WHT-L"); // Moderate steady (2.5/day) -> Stock OK (Stock = 85)
  const hodHgrM = skuMap.get("HOD-HGR-M"); // Viral spike in 7d (5/day) -> Reorder Now (Stock = 4)
  const hodGrnL = skuMap.get("HOD-GRN-L"); // Very slow seller (0.3/day) -> Overstocked (Stock = 140)
  const crgOlv32 = skuMap.get("CRG-OLV-32"); // Moderate steady (1.5/day) -> Stock OK (Stock = 60)
  const crgKhk34 = skuMap.get("CRG-KHK-34"); // Very slow seller (0.2/day) -> Overstocked (Stock = 110)

  // 3. Define structured historical orders across 7d, 14d, 30d, and 90d lookback windows
  // Each order has a target historical date (daysAgo), customer info, and line items.
  const now = new Date();

  interface OrderPlan {
    daysAgo: number;
    customerEmail: string;
    items: Array<{ variantId: string; quantity: number; price: string }>;
  }

  const orderPlans: OrderPlan[] = [
    // ─── RECENT 7 DAYS (Days 1 to 6) ───
    // Fast sellers & spikes are concentrated here
    {
      daysAgo: 1,
      customerEmail: "alex.turner@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 4, price: "34.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 5, price: "68.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 2, price: "34.00" }] : []),
      ],
    },
    {
      daysAgo: 2,
      customerEmail: "brenda.smith@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 5, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 2, price: "78.00" }] : []),
      ],
    },
    {
      daysAgo: 4,
      customerEmail: "claire.daniels@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 4, price: "34.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 4, price: "68.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 3, price: "34.00" }] : []),
      ],
    },
    {
      daysAgo: 6,
      customerEmail: "david.miller@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 5, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 2, price: "78.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 3, price: "68.00" }] : []),
      ],
    },

    // ─── 8 TO 14 DAYS AGO ───
    {
      daysAgo: 8,
      customerEmail: "emma.watson@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 4, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 3, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 2, price: "78.00" }] : []),
      ],
    },
    {
      daysAgo: 11,
      customerEmail: "frank.castle@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 3, price: "34.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 2, price: "68.00" }] : []),
        ...(hodGrnL ? [{ variantId: hodGrnL.variantId, quantity: 1, price: "68.00" }] : []),
      ],
    },
    {
      daysAgo: 13,
      customerEmail: "grace.hopper@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 4, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 2, price: "34.00" }] : []),
        ...(crgKhk34 ? [{ variantId: crgKhk34.variantId, quantity: 1, price: "78.00" }] : []),
      ],
    },

    // ─── 15 TO 30 DAYS AGO ───
    {
      daysAgo: 18,
      customerEmail: "henry.cavill@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 6, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 4, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 3, price: "78.00" }] : []),
      ],
    },
    {
      daysAgo: 22,
      customerEmail: "isabel.lucas@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 5, price: "34.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 2, price: "68.00" }] : []),
        ...(hodGrnL ? [{ variantId: hodGrnL.variantId, quantity: 1, price: "68.00" }] : []),
      ],
    },
    {
      daysAgo: 27,
      customerEmail: "jack.reacher@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 5, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 3, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 2, price: "78.00" }] : []),
      ],
    },

    // ─── 31 TO 90 DAYS AGO ───
    {
      daysAgo: 40,
      customerEmail: "karen.page@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 8, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 6, price: "34.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 4, price: "68.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 4, price: "78.00" }] : []),
      ],
    },
    {
      daysAgo: 60,
      customerEmail: "leo.fitz@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 10, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 8, price: "34.00" }] : []),
        ...(hodGrnL ? [{ variantId: hodGrnL.variantId, quantity: 2, price: "68.00" }] : []),
        ...(crgKhk34 ? [{ variantId: crgKhk34.variantId, quantity: 1, price: "78.00" }] : []),
      ],
    },
    {
      daysAgo: 80,
      customerEmail: "mona.vanderwaal@example.com",
      items: [
        ...(teeBlkM ? [{ variantId: teeBlkM.variantId, quantity: 12, price: "34.00" }] : []),
        ...(teeWhtL ? [{ variantId: teeWhtL.variantId, quantity: 10, price: "34.00" }] : []),
        ...(crgOlv32 ? [{ variantId: crgOlv32.variantId, quantity: 5, price: "78.00" }] : []),
        ...(hodHgrM ? [{ variantId: hodHgrM.variantId, quantity: 3, price: "68.00" }] : []),
      ],
    },
  ];

  console.log(`\n📦 Placing ${orderPlans.length} backdated orders into Shopify...`);

  const orderCreateMutation = `
    mutation CreateBackdatedOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order {
          id
          name
          processedAt
          createdAt
          displayFinancialStatus
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  let createdOrdersCount = 0;

  for (let i = 0; i < orderPlans.length; i++) {
    const plan = orderPlans[i];
    const orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - plan.daysAgo);
    orderDate.setUTCHours(14, 30, 0, 0); // 2:30 PM UTC
    const processedAtIso = orderDate.toISOString();

    const totalAmount = plan.items
      .reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0)
      .toFixed(2);

    const lineItemsInput = plan.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    const orderInput = {
      email: plan.customerEmail,
      processedAt: processedAtIso,
      financialStatus: "PAID",
      lineItems: lineItemsInput,
    };

    let created = false;
    let attempts = 0;

    while (!created && attempts < 6) {
      attempts++;
      try {
        console.log(
          `[${i + 1}/${orderPlans.length}] Creating Order for ${plan.daysAgo} days ago (${processedAtIso.slice(0, 10)}) - $${totalAmount} (Attempt ${attempts})...`
        );

        const res = await shopifyGql(shop, accessToken, orderCreateMutation, {
          order: orderInput,
          options: {
            inventoryBehaviour: "BYPASS", // Keeps our realistic inventory on-hand numbers untouched!
            sendReceipt: false,
          },
        });

        const userErrors = res.orderCreate?.userErrors || [];
        const isRateLimited = userErrors.some((e: any) =>
          String(e.message || "").toLowerCase().includes("too many attempts")
        );

        if (isRateLimited) {
          console.log(`  ⏳ Shopify Dev Store Rate Limit (5 orders/min). Waiting 15s before retry...`);
          await sleep(15000);
          continue;
        }

        if (userErrors.length > 0) {
          console.warn(`  ⚠️ UserErrors:`, userErrors);
          break;
        }

        const o = res.orderCreate.order;
        console.log(`  ✅ Created Order ${o.name} (${o.id}) -> processedAt: ${o.processedAt}`);
        createdOrdersCount++;
        created = true;
      } catch (err: any) {
        if (err.message.includes("429") || err.message.toLowerCase().includes("too many attempts")) {
          console.log(`  ⏳ Network throttled. Waiting 15s...`);
          await sleep(15000);
        } else {
          console.error(`  ❌ Failed to create order:`, err.message);
          break;
        }
      }
    }

    // Shopify dev stores limit orderCreate to 5 orders/minute (1 every 12s)
    if (i < orderPlans.length - 1) {
      console.log("  ⏱️ Pausing 13s to stay within Shopify dev store orderCreate rate limits...");
      await sleep(13000);
    }
  }

  console.log(`\n🎉 Created ${createdOrdersCount} real backdated orders directly in Shopify!`);
  console.log("🔄 Now healing/syncing Shopify orders into ClearStock local database...");

  // 4. Now sync these real Shopify orders into ClearStock DailySalesAggregator
  const ordersQuery = `
    query FetchAllShopifyOrders {
      orders(first: 250, query: "status:open OR status:closed") {
        edges {
          node {
            id
            createdAt
            processedAt
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
  `;

  const syncData = await shopifyGql(shop, accessToken, ordersQuery);
  const edges = syncData?.orders?.edges || [];

  // Reset local sales table for clean sync
  await prisma.dailySalesAggregator.deleteMany({
    where: { shop },
  });

  let syncedLineItems = 0;
  for (const edge of edges) {
    const o = edge.node;
    if (
      o.cancelledAt ||
      (o.displayFinancialStatus &&
        o.displayFinancialStatus !== "PAID" &&
        o.displayFinancialStatus !== "PARTIALLY_PAID")
    ) {
      continue;
    }

    const orderDateStr = o.processedAt || o.createdAt;
    const date = new Date(orderDateStr);
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
        update: {
          unitsSold: { increment: qty },
        },
        create: {
          shop,
          variantId: item.variant.id,
          date,
        },
      });
      syncedLineItems++;
    }
  }

  const salesCount = await prisma.dailySalesAggregator.count({ where: { shop } });
  console.log(`✨ Local database fully populated from Shopify API: ${salesCount} sales records.`);
  console.log("🏁 All 7D, 14D, 30D, and 90D replenishment metrics and test cases are active!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
