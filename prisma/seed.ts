import { PrismaClient, PurchaseOrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting ClearStock database seeding...");

  // Determine shop domain: use existing session shop, or environment variable, or local fallback
  const session = await prisma.session.findFirst();
  const shop = session?.shop || process.env.SHOP_DOMAIN || "quickstart-demo.myshopify.com";
  console.log(`🏪 Seeding data for shop: ${shop}`);

  // ---------------------------------------------------------------------------
  // 1. Seed Suppliers (Vendors)
  // ---------------------------------------------------------------------------
  const suppliersData = [
    {
      id: "sup-apex",
      shop,
      name: "Apex Apparel Ltd.",
      contactName: "Marcus Vance",
      email: "orders@apexapparel.example.com",
      phone: "+1 (555) 019-2834",
      defaultLeadTime: 14,
      currency: "USD",
      notes: "Primary cut-and-sew supplier for heavy fleece and hoodies.",
    },
    {
      id: "sup-nordic",
      shop,
      name: "Nordic Craft Co.",
      contactName: "Astrid Lindholm",
      email: "supply@nordiccraft.example.com",
      phone: "+46 8 123 4567",
      defaultLeadTime: 21,
      currency: "USD",
      notes: "Knitwear and headwear artisan mill in Gothenburg.",
    },
    {
      id: "sup-summit",
      shop,
      name: "Summit Goods",
      contactName: "David Chen",
      email: "b2b@summitgoods.example.com",
      phone: "+1 (555) 749-2810",
      defaultLeadTime: 28,
      currency: "USD",
      notes: "Outerwear and waxed canvas jackets manufacturer.",
    },
  ];

  for (const s of suppliersData) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: { ...s },
      create: { ...s },
    });
  }
  console.log(`✅ Seeded ${suppliersData.length} Suppliers`);

  // ---------------------------------------------------------------------------
  // 2. Seed Sourcing Rules (VariantSupplierRule)
  // ---------------------------------------------------------------------------
  const rulesData = [
    {
      id: "rule-1",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481923",
      inventoryItemId: "gid://shopify/InventoryItem/48192841291",
      productId: "gid://shopify/Product/84920192810",
      supplierId: "sup-apex",
      supplierSku: "HDY-BLK-L",
      unitCost: 18.5,
      leadTimeDays: 14,
      minOrderQty: 50,
      packSize: 24,
      safetyStockDays: 7,
      safetyStockMinimum: 20,
    },
    {
      id: "rule-2",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481924",
      inventoryItemId: "gid://shopify/InventoryItem/48192841292",
      productId: "gid://shopify/Product/84920192811",
      supplierId: "sup-nordic",
      supplierSku: "BN-OLV-OS",
      unitCost: 6.2,
      leadTimeDays: 21,
      minOrderQty: 100,
      packSize: 20,
      safetyStockDays: 10,
      safetyStockMinimum: 15,
    },
    {
      id: "rule-3",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481925",
      inventoryItemId: "gid://shopify/InventoryItem/48192841293",
      productId: "gid://shopify/Product/84920192812",
      supplierId: "sup-summit",
      supplierSku: "JKT-CRM-XL",
      unitCost: 34.0,
      leadTimeDays: 28,
      minOrderQty: 50,
      packSize: 10,
      safetyStockDays: 14,
      safetyStockMinimum: 40,
    },
    {
      id: "rule-4",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481926",
      inventoryItemId: "gid://shopify/InventoryItem/48192841294",
      productId: "gid://shopify/Product/84920192813",
      supplierId: "sup-apex",
      supplierSku: "WFL-GRY-M",
      unitCost: 14.0,
      leadTimeDays: 14,
      minOrderQty: 25,
      packSize: 12,
      safetyStockDays: 7,
      safetyStockMinimum: 15,
    },
    {
      id: "rule-5",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481927",
      inventoryItemId: "gid://shopify/InventoryItem/48192841295",
      productId: "gid://shopify/Product/84920192810",
      supplierId: "sup-apex",
      supplierSku: "HDY-WHT-M",
      unitCost: 18.5,
      leadTimeDays: 14,
      minOrderQty: 50,
      packSize: 24,
      safetyStockDays: 7,
      safetyStockMinimum: 20,
    },
    {
      id: "rule-6",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481928",
      inventoryItemId: "gid://shopify/InventoryItem/48192841296",
      productId: "gid://shopify/Product/84920192814",
      supplierId: "sup-apex",
      supplierSku: "SWP-SGE-S",
      unitCost: 22.0,
      leadTimeDays: 14,
      minOrderQty: 50,
      packSize: 20,
      safetyStockDays: 7,
      safetyStockMinimum: 15,
    },
    {
      id: "rule-7",
      shop,
      variantId: "gid://shopify/ProductVariant/44129481929",
      inventoryItemId: "gid://shopify/InventoryItem/48192841297",
      productId: "gid://shopify/Product/84920192815",
      supplierId: "sup-nordic",
      supplierSku: "SCF-CHR-OS",
      unitCost: 14.0,
      leadTimeDays: 21,
      minOrderQty: 50,
      packSize: 10,
      safetyStockDays: 10,
      safetyStockMinimum: 10,
    },
  ];

  for (const r of rulesData) {
    await prisma.variantSupplierRule.upsert({
      where: {
        shop_variantId: {
          shop: r.shop,
          variantId: r.variantId,
        },
      },
      update: { ...r },
      create: { ...r },
    });
  }
  console.log(`✅ Seeded ${rulesData.length} Sourcing Rules (VariantSupplierRule)`);

  // ---------------------------------------------------------------------------
  // 3. Seed Open Purchase Order (Prevents Double-Ordering!)
  // ---------------------------------------------------------------------------
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + 3);

  const po = await prisma.purchaseOrder.upsert({
    where: {
      shop_poNumber: {
        shop,
        poNumber: "PO-1001",
      },
    },
    update: {
      supplierId: "sup-apex",
      status: PurchaseOrderStatus.ORDERED,
      expectedArrival: expectedDate,
      notes: "Spring restock batch #1 - Incoming shipment arriving in 3 days.",
    },
    create: {
      shop,
      poNumber: "PO-1001",
      supplierId: "sup-apex",
      status: PurchaseOrderStatus.ORDERED,
      expectedArrival: expectedDate,
      notes: "Spring restock batch #1 - Incoming shipment arriving in 3 days.",
    },
  });

  // Seed PO Line Item: 50 incoming units of Thermal Waffle Crewneck
  await prisma.purchaseOrderItem.upsert({
    where: { id: "po-item-1" },
    update: {
      purchaseOrderId: po.id,
      variantId: "gid://shopify/ProductVariant/44129481926",
      inventoryItemId: "gid://shopify/InventoryItem/48192841294",
      sku: "WFL-GRY-M",
      title: "Thermal Waffle Crewneck (Heather Grey / Medium)",
      quantityOrdered: 50,
      quantityReceived: 0,
      unitCost: 14.0,
    },
    create: {
      id: "po-item-1",
      purchaseOrderId: po.id,
      variantId: "gid://shopify/ProductVariant/44129481926",
      inventoryItemId: "gid://shopify/InventoryItem/48192841294",
      sku: "WFL-GRY-M",
      title: "Thermal Waffle Crewneck (Heather Grey / Medium)",
      quantityOrdered: 50,
      quantityReceived: 0,
      unitCost: 14.0,
    },
  });
  console.log(`✅ Seeded Active Purchase Order (PO-1001) with 50 incoming units`);

  // ---------------------------------------------------------------------------
  // 4. Seed 90 Days of Sales in DailySalesAggregator (Sub-Second Cache)
  // ---------------------------------------------------------------------------
  console.log("⏳ Generating 90-day daily sales history for all SKUs...");

  // Baseline target daily sales rate per variant
  const salesProfiles: Record<string, { base: number; variance: number }> = {
    "gid://shopify/ProductVariant/44129481923": { base: 8.5, variance: 3 }, // Fast seller (Hoodie Black)
    "gid://shopify/ProductVariant/44129481924": { base: 2.0, variance: 1 }, // Steady (Beanie)
    "gid://shopify/ProductVariant/44129481925": { base: 11.0, variance: 4 }, // High demand (Jacket)
    "gid://shopify/ProductVariant/44129481926": { base: 4.2, variance: 2 }, // Moderate (Waffle)
    "gid://shopify/ProductVariant/44129481927": { base: 3.5, variance: 2 }, // Moderate (Hoodie White)
    "gid://shopify/ProductVariant/44129481928": { base: 1.0, variance: 1 }, // Slow moving / Overstocked (Sweatpants)
    "gid://shopify/ProductVariant/44129481929": { base: 0.5, variance: 1 }, // Very slow / Overstocked (Scarf)
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const salesRecords = [];

  for (let dayOffset = 1; dayOffset <= 90; dayOffset++) {
    const saleDate = new Date(today);
    saleDate.setUTCDate(today.getUTCDate() - dayOffset);

    for (const [variantId, profile] of Object.entries(salesProfiles)) {
      // Create slight realistic daily variance
      const randomJitter = (Math.sin(dayOffset * 0.7) + (Math.random() - 0.5)) * profile.variance;
      const unitsSold = Math.max(0, Math.round(profile.base + randomJitter));

      salesRecords.push({
        shop,
        variantId,
        date: saleDate,
        unitsSold,
      });
    }
  }

  // Clear previous aggregated records for clean seed
  await prisma.dailySalesAggregator.deleteMany({ where: { shop } });

  // Bulk create in chunks to be respectful of PostgreSQL limits
  const CHUNK_SIZE = 100;
  for (let i = 0; i < salesRecords.length; i += CHUNK_SIZE) {
    const chunk = salesRecords.slice(i, i + CHUNK_SIZE);
    await prisma.dailySalesAggregator.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`✅ Seeded ${salesRecords.length} daily sales ledger rows across 90 days!`);
  console.log("🎉 Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
