import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedVariant {
  optionName: string;
  optionValue: string;
  sku: string;
  price: string;
  cost: number;
  packSize: number;
  minOrderQty: number;
  leadTimeDays?: number;
  safetyStockDays?: number;
  initialStock: number;
  dailySalesAvg: number; // Used to seed 30 days of realistic sales
}

interface SeedProduct {
  title: string;
  vendor: string;
  productType: string;
  optionName: string;
  variants: SeedVariant[];
}

const PRODUCTS_TO_SEED: SeedProduct[] = [
  {
    title: "Heavyweight Boxy Tee",
    vendor: "Apex Apparel Ltd.",
    productType: "Apparel",
    optionName: "Size",
    variants: [
      {
        optionName: "Size",
        optionValue: "M",
        sku: "TEE-BLK-M",
        price: "34.00",
        cost: 12.0,
        packSize: 12,
        minOrderQty: 24,
        leadTimeDays: 14,
        safetyStockDays: 7,
        initialStock: 8, // Critically low -> Reorder Now!
        dailySalesAvg: 4.2,
      },
      {
        optionName: "Size",
        optionValue: "L",
        sku: "TEE-WHT-L",
        price: "34.00",
        cost: 12.0,
        packSize: 12,
        minOrderQty: 24,
        leadTimeDays: 14,
        safetyStockDays: 7,
        initialStock: 85, // Healthy -> Stock OK
        dailySalesAvg: 2.8,
      },
    ],
  },
  {
    title: "French Terry Pullover Hoodie",
    vendor: "Apex Apparel Ltd.",
    productType: "Apparel",
    optionName: "Size",
    variants: [
      {
        optionName: "Size",
        optionValue: "M",
        sku: "HOD-HGR-M",
        price: "68.00",
        cost: 24.0,
        packSize: 6,
        minOrderQty: 12,
        leadTimeDays: 14,
        safetyStockDays: 7,
        initialStock: 4, // Critically low -> Reorder Now!
        dailySalesAvg: 2.1,
      },
      {
        optionName: "Size",
        optionValue: "L",
        sku: "HOD-GRN-L",
        price: "68.00",
        cost: 24.0,
        packSize: 6,
        minOrderQty: 12,
        leadTimeDays: 14,
        safetyStockDays: 7,
        initialStock: 140, // Runway ~280 days -> Overstocked!
        dailySalesAvg: 0.5,
      },
    ],
  },
  {
    title: "Relaxed Fit Cargo Pant",
    vendor: "Summit Goods Co.",
    productType: "Apparel",
    optionName: "Waist",
    variants: [
      {
        optionName: "Waist",
        optionValue: "32",
        sku: "CRG-OLV-32",
        price: "78.00",
        cost: 28.0,
        packSize: 10,
        minOrderQty: 20,
        leadTimeDays: 21,
        safetyStockDays: 7,
        initialStock: 60, // Healthy -> Stock OK
        dailySalesAvg: 1.8,
      },
      {
        optionName: "Waist",
        optionValue: "34",
        sku: "CRG-KHK-34",
        price: "78.00",
        cost: 28.0,
        packSize: 10,
        minOrderQty: 20,
        leadTimeDays: 21,
        safetyStockDays: 7,
        initialStock: 110, // Runway ~275 days -> Overstocked!
        dailySalesAvg: 0.4,
      },
    ],
  },
];

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

async function main() {
  console.log("🚀 Starting Programmatic Shopify Store Seed...");

  // 1. Get active session
  const session = await prisma.session.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!session || !session.accessToken) {
    console.error("❌ No active Shopify session found in PostgreSQL.");
    process.exit(1);
  }

  const { shop, accessToken } = session;
  console.log(`📦 Target Shopify Store: ${shop}`);

  // 2. Fetch primary location
  console.log("📍 Querying Shopify Locations...");
  let primaryLocationId: string | null = null;
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
  if (locNode) {
    primaryLocationId = locNode.node.id;
    console.log(`✅ Using Location: ${locNode.node.name} (${primaryLocationId})`);
  } else {
    console.error("❌ No active location found in store.");
    process.exit(1);
  }

  // 3. Ensure Suppliers exist in ClearStock
  console.log("🏢 Initializing Suppliers in ClearStock...");
  const apexSupplier = await prisma.supplier.upsert({
    where: { id: "apex-apparel-supplier" },
    update: { shop, name: "Apex Apparel Ltd.", defaultLeadTime: 14 },
    create: {
      id: "apex-apparel-supplier",
      shop,
      name: "Apex Apparel Ltd.",
      contactName: "Sarah Jenkins",
      email: "orders@apexapparel.com",
      phone: "+1 (555) 392-8192",
      defaultLeadTime: 14,
      currency: "USD",
    },
  });

  const summitSupplier = await prisma.supplier.upsert({
    where: { id: "summit-goods-supplier" },
    update: { shop, name: "Summit Goods Co.", defaultLeadTime: 21 },
    create: {
      id: "summit-goods-supplier",
      shop,
      name: "Summit Goods Co.",
      contactName: "David Vance",
      email: "david@summitgoods.com",
      phone: "+1 (555) 829-1940",
      defaultLeadTime: 21,
      currency: "USD",
    },
  });

  const supplierMap: Record<string, string> = {
    "Apex Apparel Ltd.": apexSupplier.id,
    "Summit Goods Co.": summitSupplier.id,
  };

  // 4. Create Products in Shopify via productSet & Ingest into ClearStock
  for (const prod of PRODUCTS_TO_SEED) {
    console.log(`\n👕 Creating Shopify Product: "${prod.title}" via productSet...`);

    const productSetMutation = `
      mutation ProductSet($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            title
            variants(first: 10) {
              nodes {
                id
                title
                sku
                inventoryItem {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productSetInput = {
      title: prod.title,
      vendor: prod.vendor,
      productType: prod.productType,
      productOptions: [
        {
          name: prod.optionName,
          values: prod.variants.map((v) => ({ name: v.optionValue })),
        },
      ],
      variants: prod.variants.map((v) => ({
        optionValues: [
          {
            optionName: prod.optionName,
            name: v.optionValue,
          },
        ],
        sku: v.sku,
        price: v.price,
      })),
    };

    const res = await shopifyGql(shop, accessToken, productSetMutation, { input: productSetInput });
    if (res.productSet.userErrors?.length > 0) {
      console.error(`❌ Error in productSet for ${prod.title}:`, res.productSet.userErrors);
      continue;
    }

    const createdProduct = res.productSet.product;
    console.log(`  ✅ Product ID: ${createdProduct.id}`);

    const variantNodes = createdProduct.variants.nodes as Array<{
      id: string;
      title: string;
      sku: string;
      inventoryItem: { id: string };
    }>;

    for (const vSpec of prod.variants) {
      const vNode = variantNodes.find((vn) => vn.sku === vSpec.sku);
      if (!vNode) {
        console.warn(`  ⚠️ Could not find variant with SKU ${vSpec.sku}`);
        continue;
      }

      const variantId = vNode.id;
      const inventoryItemId = vNode.inventoryItem.id;
      console.log(`    🔹 Variant "${vSpec.optionValue}" (SKU: ${vSpec.sku}) -> ${variantId}`);

      // Enable inventory tracking on Shopify for this variant
      try {
        const invTrackMutation = `
          mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
            inventoryItemUpdate(id: $id, input: $input) {
              inventoryItem {
                id
                tracked
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        await shopifyGql(shop, accessToken, invTrackMutation, {
          id: inventoryItemId,
          input: { tracked: true },
        });
      } catch (trackErr: any) {
        console.warn(`      ⚠️ Could not enable tracking on ${inventoryItemId}:`, trackErr.message);
      }

      // Activate inventory item at location
      try {
        const invActivateMutation = `
          mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
            inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
              inventoryLevel {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        await shopifyGql(shop, accessToken, invActivateMutation, {
          inventoryItemId,
          locationId: primaryLocationId,
        });
      } catch (err: any) {
        // May already be active
      }

      // Set inventory level in Shopify
      try {
        const invSetMutation = `
          mutation SetInventory($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors {
                field
                message
              }
            }
          }
        `;
        await shopifyGql(shop, accessToken, invSetMutation, {
          input: {
            name: "available",
            reason: "correction",
            ignoreCompareQuantity: true,
            quantities: [
              {
                inventoryItemId,
                locationId: primaryLocationId,
                quantity: vSpec.initialStock,
              },
            ],
          },
        });
        console.log(`      📊 Set Shopify Inventory: ${vSpec.initialStock} units available`);
      } catch (invErr: any) {
        console.warn(`      ⚠️ Could not set Shopify inventory: ${invErr.message}`);
      }

      // Ingest into ClearStock VariantSupplierRule
      const supId = supplierMap[prod.vendor] || apexSupplier.id;
      await prisma.variantSupplierRule.upsert({
        where: {
          shop_variantId: {
            shop,
            variantId,
          },
        },
        update: {
          title: prod.title,
          variantTitle: vSpec.optionValue,
          supplierSku: vSpec.sku,
          unitCost: vSpec.cost,
          packSize: vSpec.packSize,
          minOrderQty: vSpec.minOrderQty,
          leadTimeDays: vSpec.leadTimeDays,
          safetyStockDays: vSpec.safetyStockDays || 7,
          availableStock: vSpec.initialStock,
          inventoryItemId,
          productId: createdProduct.id,
          supplierId: supId,
        },
        create: {
          shop,
          variantId,
          productId: createdProduct.id,
          inventoryItemId,
          title: prod.title,
          variantTitle: vSpec.optionValue,
          supplierSku: vSpec.sku,
          unitCost: vSpec.cost,
          packSize: vSpec.packSize,
          minOrderQty: vSpec.minOrderQty,
          leadTimeDays: vSpec.leadTimeDays,
          safetyStockDays: vSpec.safetyStockDays || 7,
          availableStock: vSpec.initialStock,
          supplierId: supId,
        },
      });

    }
  }

  console.log("\n🎉 SUCCESS! Real Shopify products and inventory are live in Shopify!");
  console.log("ℹ️ Sales history will populate naturally from real Shopify orders / sync.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal error during seeding:", e);
  process.exit(1);
});
