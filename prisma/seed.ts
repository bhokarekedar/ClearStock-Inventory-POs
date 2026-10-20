import { PrismaClient, PurchaseOrderStatus } from "@prisma/client";
import { CATALOG_VARIANTS, getCatalogItem } from "../app/catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting ClearStock database seeding...");

  // Determine shop domain: use existing session shop, or environment variable, or local fallback
  const session = await prisma.session.findFirst();
  const shop = session?.shop || process.env.SHOP_DOMAIN || "test-store-pzq1asjy.myshopify.com";
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
  // 2. Seed Sourcing Rules for all 45 variants
  // ---------------------------------------------------------------------------
  const rulesData = CATALOG_VARIANTS.map((item, idx) => {
    let supplierId = "sup-apex";
    let leadTimeDays = 14;

    if (item.category === "Headwear" || item.category === "Accessories") {
      supplierId = "sup-nordic";
      leadTimeDays = 21;
    } else if (item.category === "Outerwear" || item.sku.startsWith("CPT")) {
      supplierId = "sup-summit";
      leadTimeDays = 28;
    }

    const inventoryItemId = `gid://shopify/InventoryItem/481928412${idx < 10 ? "0" + idx : idx}`;

    return {
      shop,
      variantId: item.variantId,
      inventoryItemId,
      productId: item.productId,
      supplierId,
      supplierSku: item.sku,
      unitCost: item.defaultCost,
      leadTimeDays,
      minOrderQty: item.category === "Outerwear" ? 20 : 40,
      packSize: item.category === "Outerwear" ? 6 : 12,
      safetyStockDays: 7,
      safetyStockMinimum: 15,
    };
  });

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
  // 3. Seed Open Purchase Order (PO-1001)
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
      unitCost: 11.5,
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
      unitCost: 11.5,
    },
  });
  console.log(`✅ Seeded Active Purchase Order (PO-1001) with 50 incoming units`);

  // ---------------------------------------------------------------------------
  // 4. Seed 90 Days of Sales in DailySalesAggregator
  // ---------------------------------------------------------------------------
  console.log("⏳ Generating 90-day daily sales history for all 45 SKUs...");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const salesRecords = [];

  for (let dayOffset = 1; dayOffset <= 90; dayOffset++) {
    const saleDate = new Date(today);
    saleDate.setUTCDate(today.getUTCDate() - dayOffset);

    for (let i = 0; i < CATALOG_VARIANTS.length; i++) {
      const v = CATALOG_VARIANTS[i];
      // Generate diverse sales velocities:
      // - First 10 items: fast-moving (6 to 12 units/day)
      // - Next 20 items: moderate (2 to 5 units/day)
      // - Next 10 items: slow / seasonal (0 to 2 units/day)
      // - Last 5 items: overstocked (0.2 units/day)
      let baseVelocity = 3.5;
      if (i < 10) baseVelocity = 8.0;
      else if (i >= 30 && i < 40) baseVelocity = 1.2;
      else if (i >= 40) baseVelocity = 0.5;

      const randomJitter = (Math.sin(dayOffset * 0.5 + i) + (Math.random() - 0.5)) * 1.5;
      const unitsSold = Math.max(0, Math.round(baseVelocity + randomJitter));

      salesRecords.push({
        shop,
        variantId: v.variantId,
        date: saleDate,
        unitsSold,
      });
    }
  }

  // Clear previous aggregated records for clean seed
  await prisma.dailySalesAggregator.deleteMany({ where: { shop } });

  // Bulk create in chunks
  const CHUNK_SIZE = 150;
  for (let i = 0; i < salesRecords.length; i += CHUNK_SIZE) {
    const chunk = salesRecords.slice(i, i + CHUNK_SIZE);
    await prisma.dailySalesAggregator.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log(`✅ Seeded ${salesRecords.length} daily sales ledger rows across 90 days!`);

  // ---------------------------------------------------------------------------
  // 5. Seed Default AppSettings
  // ---------------------------------------------------------------------------
  await prisma.appSettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      defaultLookbackWindow: 30,
      defaultSafetyStockDays: 7,
      defaultLeadTimeDays: 14,
      autoRoundCasePacks: true,
      emailAlerts: false,
    },
  });
  console.log(`✅ Seeded Default AppSettings for ${shop}`);
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
