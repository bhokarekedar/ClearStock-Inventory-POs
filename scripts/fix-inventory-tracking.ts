import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function shopifyGql(shop: string, token: string, query: string, variables: any = {}) {
  const url = `https://${shop}/admin/api/2025-01/graphql.json`;
  const res = await fetch(url, {
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

async function fixTracking() {
  const session = await prisma.session.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!session || !session.accessToken) {
    console.log("No active session found in database.");
    return;
  }

  const { shop, accessToken } = session;
  console.log(`Connecting to ${shop}...`);

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
  if (!locNode) {
    console.log("No active location found.");
    return;
  }
  const primaryLocationId = locNode.node.id;
  console.log(`Primary Location: ${locNode.node.name} (${primaryLocationId})`);

  // Query all products and variants
  const prodsData = await shopifyGql(
    shop,
    accessToken,
    `query {
      products(first: 20) {
        edges {
          node {
            id
            title
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryItem {
                    id
                    tracked
                  }
                }
              }
            }
          }
        }
      }
    }`
  );

  for (const pEdge of prodsData.products.edges) {
    const prod = pEdge.node;
    console.log(`\nChecking "${prod.title}"...`);
    for (const vEdge of prod.variants.edges) {
      const v = vEdge.node;
      const invItemId = v.inventoryItem.id;
      console.log(`  Variant "${v.title}" (${v.sku}) - tracked=${v.inventoryItem.tracked}`);

      // 1. Enable tracking
      try {
        const updateRes = await shopifyGql(
          shop,
          accessToken,
          `mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
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
          }`,
          {
            id: invItemId,
            input: { tracked: true },
          }
        );
        console.log(`    ✅ Enabled tracking on ${invItemId}`);
      } catch (err: any) {
        console.warn(`    ⚠️ Failed to enable tracking:`, err.message);
      }

      // 2. Activate at location
      try {
        await shopifyGql(
          shop,
          accessToken,
          `mutation InventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
            inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
              inventoryLevel {
                id
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            inventoryItemId: invItemId,
            locationId: primaryLocationId,
          }
        );
      } catch (err: any) {
        // may already be active
      }

      // 3. Set a sample initial stock if 0
      try {
        // Check rule in DB
        const rule = await prisma.variantSupplierRule.findFirst({
          where: { shop, variantId: v.id },
        });
        const qtyToSet = rule?.availableStock && rule.availableStock > 0 ? rule.availableStock : 24;

        await shopifyGql(
          shop,
          accessToken,
          `mutation SetInventory($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors {
                field
                message
              }
            }
          }`,
          {
            input: {
              name: "available",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: [
                {
                  inventoryItemId: invItemId,
                  locationId: primaryLocationId,
                  quantity: qtyToSet,
                },
              ],
            },
          }
        );
        console.log(`    📊 Set available inventory = ${qtyToSet} units`);
      } catch (err: any) {
        console.warn(`    ⚠️ Failed to set inventory qty:`, err.message);
      }
    }
  }

  console.log("\n🎉 Finished enabling inventory tracking across all variants!");
}

fixTracking()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
