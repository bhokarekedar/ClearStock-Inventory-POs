import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ReplenishmentItem {
  id: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  variantTitle: string;
  sku: string;
  imageUrl: string;
  supplierId: string;
  supplierName: string;
  stockOnHand: number;
  stockOnOrder: number;
  ads7d: number;
  ads14d: number;
  ads30d: number;
  ads90d: number;
  unitsSold30d: number;
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStockMinimum: number;
  minOrderQty: number;
  packSize: number;
  unitCost: number;
  lastSyncDate: string;
}

function computeReplenishmentMath(
  item: ReplenishmentItem,
  windowDays: 7 | 14 | 30 | 90 = 30,
  reorderFrequencyDays: number = 30,
) {
  const adsMap = {
    7: item.ads7d,
    14: item.ads14d,
    30: item.ads30d,
    90: item.ads90d,
  };
  const ads = adsMap[windowDays];

  // 1. Lead time demand
  const leadTimeDemand = ads * item.leadTimeDays;

  // 2. Safety stock
  const safetyStockFromDays = ads * item.safetyStockDays;
  const safetyStock = Math.max(
    Math.round(safetyStockFromDays),
    item.safetyStockMinimum,
  );

  // 3. Reorder Point (ROP)
  const reorderPoint = Math.round(leadTimeDemand + safetyStock);

  // 4. Cycle Stock
  const cycleStock = Math.round(ads * reorderFrequencyDays);

  // 5. Target Stock Level
  const targetStockLevel = Math.round(reorderPoint + cycleStock);

  // 6. Current Stock Position
  const effectiveStock = item.stockOnHand + item.stockOnOrder;
  const isBelowReorderPoint = effectiveStock <= reorderPoint;

  // 7. Purchase Quantity
  let rawDeficit = 0;
  let recommendedUnits = 0;
  let casesCount = 0;

  if (isBelowReorderPoint) {
    rawDeficit = Math.max(0, targetStockLevel - effectiveStock);
    if (rawDeficit > 0) {
      const minUnitsNeeded = Math.max(rawDeficit, item.minOrderQty);
      casesCount = Math.ceil(minUnitsNeeded / item.packSize);
      recommendedUnits = casesCount * item.packSize;
    }
  }

  // Days of current stock on hand
  const daysOfCoverageOnHand =
    item.stockOnHand <= 0 ? 0 : ads > 0 ? Math.floor(item.stockOnHand / ads) : 0;

  // 8. Overstock Threshold (Ceiling): Target Stock Level + 15% buffer
  const overstockThreshold = Math.round(targetStockLevel * 1.15);
  const isOverstocked = ads > 0 && item.stockOnHand > overstockThreshold;
  const deadCashValue = isOverstocked
    ? Math.max(0, item.stockOnHand - targetStockLevel) * item.unitCost
    : 0;

  let statusTone: "critical" | "warning" | "info" | "success" = "success";
  let statusLabel: "Reorder Now" | "Overstocked" | "Incoming" | "Stock OK" = "Stock OK";

  if (effectiveStock <= reorderPoint) {
    statusTone = "critical";
    statusLabel = "Reorder Now";
  } else if (item.stockOnHand <= reorderPoint && item.stockOnOrder > 0) {
    statusTone = "info";
    statusLabel = "Incoming";
  } else if (isOverstocked) {
    statusTone = "warning";
    statusLabel = "Overstocked";
  } else {
    statusTone = "success";
    statusLabel = "Stock OK";
  }

  return {
    ads,
    windowDays,
    leadTimeDemand: Math.round(leadTimeDemand),
    safetyStock,
    reorderPoint,
    cycleStock,
    targetStockLevel,
    overstockThreshold,
    stockOnHand: item.stockOnHand,
    stockOnOrder: item.stockOnOrder,
    effectiveStock,
    rawDeficit,
    minOrderQty: item.minOrderQty,
    packSize: item.packSize,
    casesCount,
    recommendedUnits,
    estimatedCost: recommendedUnits * item.unitCost,
    daysOfCoverageOnHand,
    statusTone,
    statusLabel,
    isOverstocked,
    deadCashValue,
    isBelowReorderPoint,
  };
}

async function run() {
  const rules = await prisma.variantSupplierRule.findMany({
    include: { supplier: true },
    orderBy: { createdAt: "asc" },
  });
  const sales = await prisma.dailySalesAggregator.findMany();
  const openPos = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
    include: { items: true },
  });
  const openPoItems = openPos.flatMap((p) => p.items);

  const now = new Date();
  const windows: Array<7 | 14 | 30 | 90> = [7, 14, 30, 90];

  const report = [];

  for (const r of rules) {
    const rSales = sales.filter((s) => s.variantId === r.variantId);

    const calcAds = (days: number) => {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setUTCHours(0, 0, 0, 0);
      const units = rSales
        .filter((s) => new Date(s.date) >= cutoff)
        .reduce((sum, s) => sum + s.unitsSold, 0);
      return Number((units / days).toFixed(1));
    };

    const stockOnOrder = openPoItems
      .filter((p) => p.variantId === r.variantId)
      .reduce((sum, p) => sum + (p.quantityOrdered - p.quantityReceived), 0);

    const unitsSold30d = rSales
      .filter((s) => {
        const c = new Date(now);
        c.setDate(c.getDate() - 30);
        return new Date(s.date) >= c;
      })
      .reduce((sum, s) => sum + s.unitsSold, 0);

    const item: ReplenishmentItem = {
      id: r.id,
      variantId: r.variantId,
      inventoryItemId: r.inventoryItemId || "",
      title: r.title,
      variantTitle: r.variantTitle || "",
      sku: r.supplierSku || "",
      imageUrl: r.imageUrl || "",
      supplierId: r.supplierId,
      supplierName: r.supplier?.name || "Unknown",
      stockOnHand: r.availableStock,
      stockOnOrder,
      ads7d: calcAds(7),
      ads14d: calcAds(14),
      ads30d: calcAds(30),
      ads90d: calcAds(90),
      unitsSold30d,
      leadTimeDays: r.leadTimeDays ?? r.supplier?.defaultLeadTime ?? 14,
      safetyStockDays: r.safetyStockDays,
      safetyStockMinimum: r.safetyStockMinimum,
      minOrderQty: r.minOrderQty,
      packSize: r.packSize,
      unitCost: Number(r.unitCost),
      lastSyncDate: "",
    };

    const row: any = {
      sku: r.supplierSku,
      product: `${r.title} (${r.variantTitle})`,
      supplier: item.supplierName,
      leadTimeDays: item.leadTimeDays,
      safetyStockDays: item.safetyStockDays,
      stockOnHand: item.stockOnHand,
      stockOnOrder: item.stockOnOrder,
      moq: item.minOrderQty,
      packSize: item.packSize,
      unitCost: item.unitCost,
      unitsSoldByWindow: {
        "7d": Math.round(item.ads7d * 7),
        "14d": Math.round(item.ads14d * 14),
        "30d": Math.round(item.ads30d * 30),
        "90d": Math.round(item.ads90d * 90),
      },
      windows: {},
    };

    for (const w of windows) {
      row.windows[w] = computeReplenishmentMath(item, w);
    }

    report.push(row);
  }

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
