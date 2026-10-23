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

interface SkuConfig {
  sku: string;
  stock: number;
  dailyAvg: number;
  spikeDays7d?: number; // extra sales in recent 7 days
  leadTime: number;
  packSize: number;
  minOrderQty: number;
  expectedStatus: string;
}

const TARGET_CONFIGS: SkuConfig[] = [
  // 1. Reorder Now Items (Low stock, high velocity)
  {
    sku: "TEE-BLK-M",
    stock: 8,
    dailyAvg: 4.2,
    spikeDays7d: 5.5,
    leadTime: 14,
    packSize: 12,
    minOrderQty: 24,
    expectedStatus: "Reorder Now",
  },
  {
    sku: "HOD-HGR-M",
    stock: 4,
    dailyAvg: 2.8,
    spikeDays7d: 4.0,
    leadTime: 14,
    packSize: 6,
    minOrderQty: 12,
    expectedStatus: "Reorder Now",
  },

  // 2. Stock OK Items (Balanced healthy stock)
  {
    sku: "TEE-WHT-L",
    stock: 45,
    dailyAvg: 2.4,
    spikeDays7d: 2.5,
    leadTime: 14,
    packSize: 12,
    minOrderQty: 24,
    expectedStatus: "Stock OK",
  },
  {
    sku: "CRG-OLV-32",
    stock: 38,
    dailyAvg: 1.8,
    spikeDays7d: 2.0,
    leadTime: 21,
    packSize: 6,
    minOrderQty: 12,
    expectedStatus: "Stock OK",
  },

  // 3. Overstocked Items (Huge stock, low velocity)
  {
    sku: "HOD-GRN-L",
    stock: 140,
    dailyAvg: 0.4,
    spikeDays7d: 0.3,
    leadTime: 14,
    packSize: 6,
    minOrderQty: 12,
    expectedStatus: "Overstocked",
  },
  {
    sku: "CRG-KHK-34",
    stock: 110,
    dailyAvg: 0.3,
    spikeDays7d: 0.2,
    leadTime: 21,
    packSize: 6,
    minOrderQty: 12,
    expectedStatus: "Overstocked",
  },
];

async function main() {
  console.log("🔄 Resetting Stock & Historical Orders to Realistic Distribution...");

  const session = await prisma.session.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!session || !session.accessToken) {
    console.error("❌ No active session found.");
    process.exit(1);
  }

  const { shop, accessToken } = session;
  console.log(`📦 Target Shopify Store: ${shop}`);

  // Query primary location
  const locData = await shopifyGql(
    shop,
    accessToken,
    `query {
      locations(first: 5) {
        edges {
          node {
            id
            name
            isActive
          }
        }
      }
    }`
  );
  const locNode = locData.locations.edges.find((e: any) => e.node.isActive) || locData.locations.edges[0];
  const primaryLocationId = locNode.node.id;
  console.log(`📍 Using Location: ${locNode.node.name} (${primaryLocationId})`);

  // Clear existing DailySalesAggregator for fresh rebuild
  await prisma.dailySalesAggregator.deleteMany({
    where: { shop },
  });
  console.log("🧹 Cleared old DailySalesAggregator cache.");

  // Iterate over each SKU config
  for (const cfg of TARGET_CONFIGS) {
    console.log(`\n⚙️ Configuring SKU ${cfg.sku} (Target: ${cfg.expectedStatus}, Stock: ${cfg.stock})...`);

    const rule = await prisma.variantSupplierRule.findFirst({
      where: {
        shop,
        supplierSku: cfg.sku,
      },
    });

    if (!rule) {
      console.warn(`  ⚠️ Rule not found for SKU ${cfg.sku}`);
      continue;
    }

    // 1. Update ClearStock rule
    await prisma.variantSupplierRule.update({
      where: { id: rule.id },
      data: {
        availableStock: cfg.stock,
        leadTimeDays: cfg.leadTime,
        packSize: cfg.packSize,
        minOrderQty: cfg.minOrderQty,
      },
    });

    // 2. Set Shopify Inventory via GraphQL
    if (rule.inventoryItemId) {
      try {
        // Ensure tracked is true
        await shopifyGql(
          shop,
          accessToken,
          `mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
            inventoryItemUpdate(id: $id, input: $input) {
              inventoryItem { id tracked }
              userErrors { field message }
            }
          }`,
          { id: rule.inventoryItemId, input: { tracked: true } }
        );

        // Set available quantity
        await shopifyGql(
          shop,
          accessToken,
          `mutation SetInventory($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors { field message }
            }
          }`,
          {
            input: {
              name: "available",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: [
                {
                  inventoryItemId: rule.inventoryItemId,
                  locationId: primaryLocationId,
                  quantity: cfg.stock,
                },
              ],
            },
          }
        );
        console.log(`  ✅ Shopify stock set to ${cfg.stock} units for ${cfg.sku}`);
      } catch (err: any) {
        console.warn(`  ⚠️ Could not set Shopify inventory for ${cfg.sku}:`, err.message);
      }
    }

    // 3. Seed Realistic Daily Sales for the past 90 days
    const now = new Date();
    for (let dayOffset = 1; dayOffset <= 90; dayOffset++) {
      const orderDate = new Date(now);
      orderDate.setDate(orderDate.getDate() - dayOffset);
      orderDate.setUTCHours(0, 0, 0, 0);

      const isRecent7d = dayOffset <= 7;
      const baseAvg = isRecent7d && cfg.spikeDays7d ? cfg.spikeDays7d : cfg.dailyAvg;

      // Realistic Poisson-like variation
      const randomFactor = 0.7 + (Math.sin(dayOffset * 1.5) + 1) * 0.35;
      const units = Math.max(0, Math.round(baseAvg * randomFactor));

      if (units > 0) {
        await prisma.dailySalesAggregator.create({
          data: {
            shop,
            variantId: rule.variantId,
            date: orderDate,
            unitsSold: units,
          },
        });
      }
    }
    console.log(`  📊 Seeded 90 days of sales history for ${rule.title} (${cfg.sku})`);
  }

  console.log("\n========================================================");
  console.log("✅ STORE RESET COMPLETE! All test statuses are now active:");
  console.log("   • Reorder Now:  Heavyweight Boxy Tee (M) & French Terry Pullover (M)");
  console.log("   • Stock OK:     Heavyweight Boxy Tee (L) & Cargo Pant (32)");
  console.log("   • Overstocked:  French Terry Pullover (L) & Cargo Pant (34)");
  console.log("========================================================");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
