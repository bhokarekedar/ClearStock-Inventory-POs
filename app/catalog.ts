// ============================================================================
// ClearStock Shared Catalog & Sourcing Dataset
// 45 realistic apparel, accessories, outerwear, and footwear products
// ============================================================================

export interface CatalogVariant {
  variantId: string;
  productId: string;
  inventoryItemId?: string;
  title: string;
  variantTitle: string;
  sku: string;
  defaultCost: number;
  imageUrl: string;
  category: "Hoodies" | "Headwear" | "Outerwear" | "Tops" | "Bottoms" | "Accessories";
  baseStockOnHand: number;
  stockOnHand?: number;
}

export const CATALOG_VARIANTS: CatalogVariant[] = [
  // 1-5: Heavyweight Boxy Hoodies
  {
    variantId: "gid://shopify/ProductVariant/44129481923",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Large",
    sku: "HDY-BLK-L",
    defaultCost: 18.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 15,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481927",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Off-White / Medium",
    sku: "HDY-WHT-M",
    defaultCost: 18.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 22,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481930",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Washed Maroon / XL",
    sku: "HDY-MRN-XL",
    defaultCost: 18.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 8,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481931",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Forest Green / Small",
    sku: "HDY-GRN-S",
    defaultCost: 18.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 34,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481932",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Slate Blue / 2XL",
    sku: "HDY-BLU-2XL",
    defaultCost: 19.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 12,
  },

  // 6-9: Organic Cotton Ribbed Beanies
  {
    variantId: "gid://shopify/ProductVariant/44129481924",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Olive Green / One Size",
    sku: "BN-OLV-OS",
    defaultCost: 6.2,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 85,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481933",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Charcoal Grey / One Size",
    sku: "BN-CHR-OS",
    defaultCost: 6.2,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 60,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481934",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Mustard Gold / One Size",
    sku: "BN-GLD-OS",
    defaultCost: 6.2,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 45,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481935",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Midnight Black / One Size",
    sku: "BN-BLK-OS",
    defaultCost: 6.2,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 110,
  },

  // 10-13: Canvas Chore Jackets
  {
    variantId: "gid://shopify/ProductVariant/44129481925",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Caramel Tan / XL",
    sku: "JKT-CRM-XL",
    defaultCost: 32.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 14,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481936",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Washed Navy / Large",
    sku: "JKT-NVY-L",
    defaultCost: 32.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 18,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481937",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Sage Green / Medium",
    sku: "JKT-SGE-M",
    defaultCost: 32.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 9,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481938",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Coal Black / Small",
    sku: "JKT-BLK-S",
    defaultCost: 32.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 25,
  },

  // 14-17: Thermal Waffle Crewnecks
  {
    variantId: "gid://shopify/ProductVariant/44129481926",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Heather Grey / Medium",
    sku: "WFL-GRY-M",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Tops",
    baseStockOnHand: 40,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481939",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Off-White / Large",
    sku: "WFL-WHT-L",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Tops",
    baseStockOnHand: 32,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481940",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Olive Drab / Small",
    sku: "WFL-OLV-S",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Tops",
    baseStockOnHand: 28,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481941",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Midnight Black / XL",
    sku: "WFL-BLK-XL",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Tops",
    baseStockOnHand: 16,
  },

  // 18-21: Fleece Sweatpants
  {
    variantId: "gid://shopify/ProductVariant/44129481928",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Navy Blue / Small",
    sku: "SWT-NVY-S",
    defaultCost: 16.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Bottoms",
    baseStockOnHand: 55,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481942",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Heather Oatmeal / Medium",
    sku: "SWT-OAT-M",
    defaultCost: 16.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Bottoms",
    baseStockOnHand: 38,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481943",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Vintage Black / Large",
    sku: "SWT-BLK-L",
    defaultCost: 16.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Bottoms",
    baseStockOnHand: 44,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481944",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Moss Green / XL",
    sku: "SWT-GRN-XL",
    defaultCost: 16.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Bottoms",
    baseStockOnHand: 19,
  },

  // 22-24: Merino Wool Scarves
  {
    variantId: "gid://shopify/ProductVariant/44129481929",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Charcoal / One Size",
    sku: "SCF-CHR-OS",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Accessories",
    baseStockOnHand: 220,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481945",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Camel Beige / One Size",
    sku: "SCF-CML-OS",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Accessories",
    baseStockOnHand: 180,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481946",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Deep Burgundy / One Size",
    sku: "SCF-BUR-OS",
    defaultCost: 14.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Accessories",
    baseStockOnHand: 140,
  },

  // 25-29: Heavyweight Oversized Tees
  {
    variantId: "gid://shopify/ProductVariant/44129481947",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Vintage White / Medium",
    sku: "TEE-OVS-WHT-M",
    defaultCost: 9.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Tops",
    baseStockOnHand: 75,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481948",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Faded Black / Large",
    sku: "TEE-OVS-BLK-L",
    defaultCost: 9.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Tops",
    baseStockOnHand: 80,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481949",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Sage Green / XL",
    sku: "TEE-OVS-SGE-XL",
    defaultCost: 9.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Tops",
    baseStockOnHand: 65,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481950",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Clay Terra / Small",
    sku: "TEE-OVS-TER-S",
    defaultCost: 9.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Tops",
    baseStockOnHand: 50,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481951",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Washed Navy / 2XL",
    sku: "TEE-OVS-NVY-2XL",
    defaultCost: 10.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_small.png",
    category: "Tops",
    baseStockOnHand: 40,
  },

  // 30-33: Relaxed Fit Chino Pants
  {
    variantId: "gid://shopify/ProductVariant/44129481952",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Khaki Tan / 32x32",
    sku: "CHN-KHK-32",
    defaultCost: 22.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Bottoms",
    baseStockOnHand: 30,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481953",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Olive Drab / 34x32",
    sku: "CHN-OLV-34",
    defaultCost: 22.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Bottoms",
    baseStockOnHand: 25,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481954",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Charcoal Slate / 30x30",
    sku: "CHN-CHR-30",
    defaultCost: 22.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Bottoms",
    baseStockOnHand: 20,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481955",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Dark Navy / 36x32",
    sku: "CHN-NVY-36",
    defaultCost: 22.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Bottoms",
    baseStockOnHand: 28,
  },

  // 34-36: Down Quilted Puffer Vests
  {
    variantId: "gid://shopify/ProductVariant/44129481956",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Matte Black / Medium",
    sku: "VST-BLK-M",
    defaultCost: 28.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Outerwear",
    baseStockOnHand: 15,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481957",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Deep Forest / Large",
    sku: "VST-FOR-L",
    defaultCost: 28.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Outerwear",
    baseStockOnHand: 18,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481958",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Sand Dune / XL",
    sku: "VST-SND-XL",
    defaultCost: 28.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Outerwear",
    baseStockOnHand: 11,
  },

  // 37-39: 6-Panel Twill Caps
  {
    variantId: "gid://shopify/ProductVariant/44129481959",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Washed Olive / Adjustable",
    sku: "CAP-TWL-OLV",
    defaultCost: 8.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 90,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481960",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Vintage Navy / Adjustable",
    sku: "CAP-TWL-NVY",
    defaultCost: 8.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 85,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481961",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Desert Tan / Adjustable",
    sku: "CAP-TWL-TAN",
    defaultCost: 8.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_small.png",
    category: "Headwear",
    baseStockOnHand: 70,
  },

  // 40-41: Heavyweight Canvas Utility Totes
  {
    variantId: "gid://shopify/ProductVariant/44129481962",
    productId: "gid://shopify/Product/84920192820",
    title: "Heavyweight Canvas Utility Tote",
    variantTitle: "Natural Canvas / Large",
    sku: "BAG-UTE-NAT",
    defaultCost: 12.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Accessories",
    baseStockOnHand: 115,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481963",
    productId: "gid://shopify/Product/84920192820",
    title: "Heavyweight Canvas Utility Tote",
    variantTitle: "Coal Black / Large",
    sku: "BAG-UTE-BLK",
    defaultCost: 12.5,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-3_small.png",
    category: "Accessories",
    baseStockOnHand: 95,
  },

  // 42-43: Corduroy Overshirt Jackets
  {
    variantId: "gid://shopify/ProductVariant/44129481964",
    productId: "gid://shopify/Product/84920192821",
    title: "Corduroy Overshirt Jacket",
    variantTitle: "Cinnamon Brown / Medium",
    sku: "SHRT-CDR-BRN-M",
    defaultCost: 26.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 20,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481965",
    productId: "gid://shopify/Product/84920192821",
    title: "Corduroy Overshirt Jacket",
    variantTitle: "Dark Teal / Large",
    sku: "SHRT-CDR-TEL-L",
    defaultCost: 26.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-2_small.png",
    category: "Outerwear",
    baseStockOnHand: 17,
  },

  // 44-45: French Terry Full-Zip Hoodies
  {
    variantId: "gid://shopify/ProductVariant/44129481966",
    productId: "gid://shopify/Product/84920192822",
    title: "French Terry Zip Hoodie",
    variantTitle: "Heather Grey / Large",
    sku: "ZIP-HDY-GRY-L",
    defaultCost: 21.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 28,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481967",
    productId: "gid://shopify/Product/84920192822",
    title: "French Terry Zip Hoodie",
    variantTitle: "Deep Navy / XL",
    sku: "ZIP-HDY-NVY-XL",
    defaultCost: 21.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Hoodies",
    baseStockOnHand: 24,
  },
];

// O(1) Lookup Map by Variant GID
export const CATALOG_MAP: Record<string, CatalogVariant> = CATALOG_VARIANTS.reduce(
  (acc, item) => {
    acc[item.variantId] = item;
    return acc;
  },
  {} as Record<string, CatalogVariant>,
);

// Helper function to safely retrieve any catalog item by variant ID
export function getCatalogItem(variantId: string): CatalogVariant {
  if (CATALOG_MAP[variantId]) {
    const item = CATALOG_MAP[variantId];
    return {
      ...item,
      inventoryItemId: item.inventoryItemId || `gid://shopify/InventoryItem/${item.variantId.split("/").pop()}`,
      stockOnHand: item.baseStockOnHand,
    };
  }
  // Safe generic fallback if a variant is created dynamically
  return {
    variantId,
    productId: "gid://shopify/Product/custom",
    inventoryItemId: `gid://shopify/InventoryItem/${variantId.split("/").pop() || "custom"}`,
    title: "Catalog Product",
    variantTitle: "Standard",
    sku: "SKU-" + (variantId.split("/").pop()?.slice(-6) || "CUSTOM"),
    defaultCost: 15.0,
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-lifestyle-1_small.png",
    category: "Tops",
    baseStockOnHand: 25,
    stockOnHand: 25,
  };
}

// Case-insensitive multi-term search across titles, variants, SKUs, and categories
export function searchCatalog(query: string): CatalogVariant[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return CATALOG_VARIANTS;

  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  return CATALOG_VARIANTS.filter((v) => {
    const haystack = `${v.title} ${v.variantTitle} ${v.sku} ${v.category}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
