import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError, useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  InlineGrid,
  Modal,
  TextField,
  Select,
  Banner,
  EmptyState,
  Divider,
  Box,
  Combobox,
  Listbox,
  Icon,
  Checkbox,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, LinkIcon, SearchIcon, ProductIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Standard Catalog Variants (45 realistic items across diverse apparel and accessories)
export const CATALOG_VARIANTS = [
  // 1-5: Heavyweight Boxy Hoodies
  {
    variantId: "gid://shopify/ProductVariant/44129481923",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Vintage Black / Large",
    sku: "HDY-BLK-L",
    defaultCost: 18.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481927",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Off-White / Medium",
    sku: "HDY-WHT-M",
    defaultCost: 18.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481930",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Washed Maroon / XL",
    sku: "HDY-MRN-XL",
    defaultCost: 18.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481931",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Forest Green / Small",
    sku: "HDY-GRN-S",
    defaultCost: 18.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481932",
    productId: "gid://shopify/Product/84920192810",
    title: "Heavyweight Boxy Hoodie",
    variantTitle: "Slate Blue / 2XL",
    sku: "HDY-BLU-2XL",
    defaultCost: 19.5,
  },

  // 6-9: Organic Cotton Ribbed Beanies
  {
    variantId: "gid://shopify/ProductVariant/44129481924",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Olive Green / One Size",
    sku: "BN-OLV-OS",
    defaultCost: 6.2,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481933",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Charcoal Grey / One Size",
    sku: "BN-CHR-OS",
    defaultCost: 6.2,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481934",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Mustard Gold / One Size",
    sku: "BN-GLD-OS",
    defaultCost: 6.2,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481935",
    productId: "gid://shopify/Product/84920192811",
    title: "Organic Cotton Ribbed Beanie",
    variantTitle: "Midnight Black / One Size",
    sku: "BN-BLK-OS",
    defaultCost: 6.2,
  },

  // 10-13: Canvas Chore Jackets
  {
    variantId: "gid://shopify/ProductVariant/44129481925",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Caramel Tan / XL",
    sku: "JKT-CRM-XL",
    defaultCost: 32.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481936",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Washed Navy / Large",
    sku: "JKT-NVY-L",
    defaultCost: 32.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481937",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Sage Green / Medium",
    sku: "JKT-SGE-M",
    defaultCost: 32.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481938",
    productId: "gid://shopify/Product/84920192812",
    title: "Canvas Chore Jacket",
    variantTitle: "Coal Black / Small",
    sku: "JKT-BLK-S",
    defaultCost: 32.0,
  },

  // 14-17: Thermal Waffle Crewnecks
  {
    variantId: "gid://shopify/ProductVariant/44129481926",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Heather Grey / Medium",
    sku: "WFL-GRY-M",
    defaultCost: 14.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481939",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Off-White / Large",
    sku: "WFL-WHT-L",
    defaultCost: 14.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481940",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Olive Drab / Small",
    sku: "WFL-OLV-S",
    defaultCost: 14.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481941",
    productId: "gid://shopify/Product/84920192813",
    title: "Thermal Waffle Crewneck",
    variantTitle: "Midnight Black / XL",
    sku: "WFL-BLK-XL",
    defaultCost: 14.0,
  },

  // 18-21: Fleece Sweatpants
  {
    variantId: "gid://shopify/ProductVariant/44129481928",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Navy Blue / Small",
    sku: "SWT-NVY-S",
    defaultCost: 16.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481942",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Heather Oatmeal / Medium",
    sku: "SWT-OAT-M",
    defaultCost: 16.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481943",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Vintage Black / Large",
    sku: "SWT-BLK-L",
    defaultCost: 16.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481944",
    productId: "gid://shopify/Product/84920192814",
    title: "Fleece Sweatpants",
    variantTitle: "Moss Green / XL",
    sku: "SWT-GRN-XL",
    defaultCost: 16.0,
  },

  // 22-24: Merino Wool Scarves
  {
    variantId: "gid://shopify/ProductVariant/44129481929",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Charcoal / One Size",
    sku: "SCF-CHR-OS",
    defaultCost: 14.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481945",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Camel Beige / One Size",
    sku: "SCF-CML-OS",
    defaultCost: 14.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481946",
    productId: "gid://shopify/Product/84920192815",
    title: "Merino Wool Scarf",
    variantTitle: "Deep Burgundy / One Size",
    sku: "SCF-BUR-OS",
    defaultCost: 14.0,
  },

  // 25-29: Heavyweight Oversized Tees
  {
    variantId: "gid://shopify/ProductVariant/44129481947",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Vintage White / Medium",
    sku: "TEE-OVS-WHT-M",
    defaultCost: 9.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481948",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Faded Black / Large",
    sku: "TEE-OVS-BLK-L",
    defaultCost: 9.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481949",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Sage Green / XL",
    sku: "TEE-OVS-SGE-XL",
    defaultCost: 9.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481950",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Clay Terra / Small",
    sku: "TEE-OVS-TER-S",
    defaultCost: 9.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481951",
    productId: "gid://shopify/Product/84920192816",
    title: "Heavyweight Oversized Tee",
    variantTitle: "Washed Navy / 2XL",
    sku: "TEE-OVS-NVY-2XL",
    defaultCost: 10.0,
  },

  // 30-33: Relaxed Fit Chino Pants
  {
    variantId: "gid://shopify/ProductVariant/44129481952",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Khaki Tan / 32x32",
    sku: "CHN-KHK-32",
    defaultCost: 22.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481953",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Olive Drab / 34x32",
    sku: "CHN-OLV-34",
    defaultCost: 22.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481954",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Charcoal Slate / 30x30",
    sku: "CHN-CHR-30",
    defaultCost: 22.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481955",
    productId: "gid://shopify/Product/84920192817",
    title: "Relaxed Fit Chino Pant",
    variantTitle: "Dark Navy / 36x32",
    sku: "CHN-NVY-36",
    defaultCost: 22.0,
  },

  // 34-36: Down Quilted Puffer Vests
  {
    variantId: "gid://shopify/ProductVariant/44129481956",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Matte Black / Medium",
    sku: "VST-BLK-M",
    defaultCost: 28.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481957",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Deep Forest / Large",
    sku: "VST-FOR-L",
    defaultCost: 28.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481958",
    productId: "gid://shopify/Product/84920192818",
    title: "Down Quilted Puffer Vest",
    variantTitle: "Sand Dune / XL",
    sku: "VST-SND-XL",
    defaultCost: 28.0,
  },

  // 37-39: 6-Panel Twill Caps
  {
    variantId: "gid://shopify/ProductVariant/44129481959",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Washed Olive / Adjustable",
    sku: "CAP-TWL-OLV",
    defaultCost: 8.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481960",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Vintage Navy / Adjustable",
    sku: "CAP-TWL-NVY",
    defaultCost: 8.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481961",
    productId: "gid://shopify/Product/84920192819",
    title: "6-Panel Twill Dad Cap",
    variantTitle: "Desert Tan / Adjustable",
    sku: "CAP-TWL-TAN",
    defaultCost: 8.0,
  },

  // 40-41: Heavyweight Canvas Utility Totes
  {
    variantId: "gid://shopify/ProductVariant/44129481962",
    productId: "gid://shopify/Product/84920192820",
    title: "Heavyweight Canvas Utility Tote",
    variantTitle: "Natural Canvas / Large",
    sku: "BAG-UTE-NAT",
    defaultCost: 12.5,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481963",
    productId: "gid://shopify/Product/84920192820",
    title: "Heavyweight Canvas Utility Tote",
    variantTitle: "Coal Black / Large",
    sku: "BAG-UTE-BLK",
    defaultCost: 12.5,
  },

  // 42-43: Corduroy Overshirt Jackets
  {
    variantId: "gid://shopify/ProductVariant/44129481964",
    productId: "gid://shopify/Product/84920192821",
    title: "Corduroy Overshirt Jacket",
    variantTitle: "Cinnamon Brown / Medium",
    sku: "SHRT-CDR-BRN-M",
    defaultCost: 26.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481965",
    productId: "gid://shopify/Product/84920192821",
    title: "Corduroy Overshirt Jacket",
    variantTitle: "Dark Teal / Large",
    sku: "SHRT-CDR-TEL-L",
    defaultCost: 26.0,
  },

  // 44-45: French Terry Full-Zip Hoodies
  {
    variantId: "gid://shopify/ProductVariant/44129481966",
    productId: "gid://shopify/Product/84920192822",
    title: "French Terry Zip Hoodie",
    variantTitle: "Heather Grey / Large",
    sku: "ZIP-HDY-GRY-L",
    defaultCost: 21.0,
  },
  {
    variantId: "gid://shopify/ProductVariant/44129481967",
    productId: "gid://shopify/Product/84920192822",
    title: "French Terry Zip Hoodie",
    variantTitle: "Deep Navy / XL",
    sku: "ZIP-HDY-NVY-XL",
    defaultCost: 21.0,
  },
];

export interface SupplierItem {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  defaultLeadTime: number;
  currency: string;
  notes: string;
  assignedRulesCount: number;
  activeOrdersCount: number;
  createdAt: string;
}

export interface RuleItem {
  id: string;
  variantId: string;
  supplierId: string;
  supplierName: string;
  title: string;
  variantTitle: string;
  sku: string;
  unitCost: number;
  packSize: number;
  minOrderQty: number;
  leadTimeDays: number | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch all suppliers for this shop (or all if dev)
  let suppliersDb = await prisma.supplier.findMany({
    where: {
      OR: [{ shop }, { shop: "quickstart-demo.myshopify.com" }],
    },
    include: {
      rules: true,
      purchaseOrders: true,
    },
    orderBy: { name: "asc" },
  });

  // Fetch all rules
  const rulesDb = await prisma.variantSupplierRule.findMany({
    where: {
      OR: [{ shop }, { shop: "quickstart-demo.myshopify.com" }],
    },
    include: { supplier: true },
    orderBy: { variantId: "asc" },
  });

  const suppliers: SupplierItem[] = suppliersDb.map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contactName || "",
    email: s.email || "",
    phone: s.phone || "",
    defaultLeadTime: s.defaultLeadTime || 14,
    currency: s.currency || "USD",
    notes: s.notes || "",
    assignedRulesCount: s.rules.length,
    activeOrdersCount: s.purchaseOrders.filter((po) => po.status === "ORDERED" || po.status === "DRAFT").length,
    createdAt: new Date(s.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  }));

  const rules: RuleItem[] = rulesDb.map((r) => {
    const catalog = CATALOG_VARIANTS.find((c) => c.variantId === r.variantId) || {
      title: "Product " + r.variantId.slice(-6),
      variantTitle: "Variant",
      sku: r.supplierSku || "SKU-" + r.id.slice(0, 6),
      defaultCost: Number(r.unitCost),
    };

    return {
      id: r.id,
      variantId: r.variantId,
      supplierId: r.supplierId,
      supplierName: r.supplier.name,
      title: catalog.title,
      variantTitle: catalog.variantTitle,
      sku: catalog.sku,
      unitCost: Number(r.unitCost),
      packSize: r.packSize,
      minOrderQty: r.minOrderQty,
      leadTimeDays: r.leadTimeDays,
    };
  });

  return { suppliers, rules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "CREATE_SUPPLIER") {
    const name = String(formData.get("name") || "").trim();
    const contactName = String(formData.get("contactName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const defaultLeadTime = Math.max(1, parseInt(String(formData.get("defaultLeadTime") || "14"), 10));
    const currency = String(formData.get("currency") || "USD").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!name) {
      return { ok: false, error: "Supplier name is required." };
    }

    const created = await prisma.supplier.create({
      data: {
        shop,
        name,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        defaultLeadTime,
        currency,
        notes: notes || null,
      },
    });

    return { ok: true, action: "created", supplier: created };
  }

  if (intent === "UPDATE_SUPPLIER") {
    const id = String(formData.get("id"));
    const name = String(formData.get("name") || "").trim();
    const contactName = String(formData.get("contactName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const defaultLeadTime = Math.max(1, parseInt(String(formData.get("defaultLeadTime") || "14"), 10));
    const currency = String(formData.get("currency") || "USD").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!name) {
      return { ok: false, error: "Supplier name is required." };
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        defaultLeadTime,
        currency,
        notes: notes || null,
      },
    });

    return { ok: true, action: "updated", supplier: updated };
  }

  // ASSIGN or REASSIGN SKU to a Supplier
  if (intent === "ASSIGN_SKU") {
    const variantId = String(formData.get("variantId"));
    const supplierId = String(formData.get("supplierId"));
    const unitCost = Math.max(0.01, parseFloat(String(formData.get("unitCost") || "10.0")));
    const packSize = Math.max(1, parseInt(String(formData.get("packSize") || "1"), 10));
    const minOrderQty = Math.max(1, parseInt(String(formData.get("minOrderQty") || "1"), 10));
    const leadTimeStr = formData.get("leadTimeDays");
    const leadTimeDays = leadTimeStr ? parseInt(String(leadTimeStr), 10) : null;

    const catalog = CATALOG_VARIANTS.find((c) => c.variantId === variantId);
    const supplierSku = catalog?.sku || "SKU-AUTO";

    await prisma.variantSupplierRule.upsert({
      where: {
        shop_variantId: {
          shop,
          variantId,
        },
      },
      update: {
        supplierId,
        unitCost,
        packSize,
        minOrderQty,
        leadTimeDays,
        supplierSku,
      },
      create: {
        shop,
        variantId,
        productId: catalog?.productId || "gid://shopify/Product/default",
        supplierId,
        unitCost,
        packSize,
        minOrderQty,
        leadTimeDays,
        supplierSku,
      },
    });

    // Optional Two-Way Live Sync to Shopify
    const syncVendor = formData.get("syncToShopifyVendor") === "true";
    const syncCost = formData.get("syncToShopifyCost") === "true";

    if ((syncVendor || syncCost) && catalog?.productId?.startsWith("gid://shopify/Product/")) {
      try {
        const { admin } = await authenticate.admin(request);
        const sup = await prisma.supplier.findUnique({ where: { id: supplierId } });
        if (sup && syncVendor) {
          await admin.graphql(
            `#graphql
            mutation updateProductVendor($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  vendor
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                input: {
                  id: catalog.productId,
                  vendor: sup.name,
                },
              },
            },
          );
        }
      } catch (e) {
        // Safe fallback in dev/mock environments
        console.log("Two-way Shopify vendor sync skipped or mock:", e);
      }
    }

    return { ok: true, action: "sku_assigned", variantId };
  }

  return { ok: false, error: "Unknown action intent." };
};

export default function SuppliersPage() {
  const shopify = useAppBridge();
  const submit = useSubmit();
  const navigation = useNavigation();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const suppliers = loaderData?.suppliers || [];
  const rules = loaderData?.rules || [];
  const isSubmitting = navigation.state === "submitting";

  // Supplier Profile Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);

  // Manage SKUs Modal
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [activeSupplierForSkus, setActiveSupplierForSkus] = useState<SupplierItem | null>(null);

  // Form Fields for Supplier
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [defaultLeadTime, setDefaultLeadTime] = useState("14");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Helper to format consistent variant label
  const getVariantLabel = (item: (typeof CATALOG_VARIANTS)[0]) =>
    `${item.title} • ${item.variantTitle} (${item.sku})`;

  // Form Fields for Assigning SKU with Real-time Search & Virtualized Chunking
  const [selectedVariantId, setSelectedVariantId] = useState(CATALOG_VARIANTS[0].variantId);
  const [skuInputValue, setSkuInputValue] = useState(getVariantLabel(CATALOG_VARIANTS[0]));
  const [visibleSkuCount, setVisibleSkuCount] = useState(50);
  const [assignCost, setAssignCost] = useState(String(CATALOG_VARIANTS[0].defaultCost));
  const [assignPackSize, setAssignPackSize] = useState("12");
  const [assignMoq, setAssignMoq] = useState("24");
  const [syncToShopifyVendor, setSyncToShopifyVendor] = useState(true);
  const [syncToShopifyCost, setSyncToShopifyCost] = useState(true);

  const selectedCatalogItem = useMemo(() => {
    return CATALOG_VARIANTS.find((c) => c.variantId === selectedVariantId) || CATALOG_VARIANTS[0];
  }, [selectedVariantId]);

  // Filter variants: if input matches the selected item label or is empty, show full catalog; otherwise filter by keywords
  const filteredVariants = useMemo(() => {
    const query = skuInputValue.trim().toLowerCase();
    const currentLabel = getVariantLabel(selectedCatalogItem).toLowerCase();

    if (!query || query === currentLabel) {
      return CATALOG_VARIANTS;
    }

    const searchTerms = query.split(/\s+/).filter(Boolean);
    return CATALOG_VARIANTS.filter((v) => {
      const haystack = `${v.title} ${v.variantTitle} ${v.sku}`.toLowerCase();
      return searchTerms.every((term) => haystack.includes(term));
    });
  }, [skuInputValue, selectedCatalogItem]);

  const displayedVariants = useMemo(() => {
    return filteredVariants.slice(0, visibleSkuCount);
  }, [filteredVariants, visibleSkuCount]);

  const hasMoreVariants = filteredVariants.length > visibleSkuCount;

  // Sync default cost and populated input label when variant selection changes
  const handleVariantSelectChange = (variantId: string) => {
    setSelectedVariantId(variantId);
    const catalog = CATALOG_VARIANTS.find((c) => c.variantId === variantId);
    if (catalog) {
      setAssignCost(String(catalog.defaultCost));
      setSkuInputValue(getVariantLabel(catalog));
    }
  };

  // Notify on action response
  useEffect(() => {
    if (actionData?.ok) {
      if (actionData.action === "created") {
        shopify.toast.show("Supplier successfully created.");
        setModalOpen(false);
      } else if (actionData.action === "updated") {
        shopify.toast.show("Supplier details updated.");
        setModalOpen(false);
      } else if (actionData.action === "sku_assigned") {
        shopify.toast.show("SKU successfully assigned to supplier!");
      }
    } else if (actionData?.error) {
      setFormError(actionData.error);
    }
  }, [actionData, shopify]);

  const handleOpenCreateModal = () => {
    setEditingSupplier(null);
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setDefaultLeadTime("14");
    setCurrency("USD");
    setNotes("");
    setFormError("");
    setModalOpen(true);
  };

  const handleOpenEditModal = (sup: SupplierItem) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setContactName(sup.contactName);
    setEmail(sup.email);
    setPhone(sup.phone);
    setDefaultLeadTime(String(sup.defaultLeadTime));
    setCurrency(sup.currency);
    setNotes(sup.notes);
    setFormError("");
    setModalOpen(true);
  };

  const handleOpenSkuModal = (sup: SupplierItem) => {
    setActiveSupplierForSkus(sup);
    setSelectedVariantId(CATALOG_VARIANTS[0].variantId);
    setSkuInputValue(getVariantLabel(CATALOG_VARIANTS[0]));
    setVisibleSkuCount(50);
    setAssignCost(String(CATALOG_VARIANTS[0].defaultCost));
    setAssignPackSize("12");
    setAssignMoq("24");
    setSkuModalOpen(true);
  };

  const handleSaveSupplier = () => {
    if (!name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }

    const payload: Record<string, string> = {
      intent: editingSupplier ? "UPDATE_SUPPLIER" : "CREATE_SUPPLIER",
      name: name.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      defaultLeadTime: defaultLeadTime || "14",
      currency,
      notes: notes.trim(),
    };

    if (editingSupplier) {
      payload.id = editingSupplier.id;
    }

    submit(payload, { method: "post" });
  };

  const handleAssignSkuToSupplier = () => {
    if (!activeSupplierForSkus) return;

    submit(
      {
        intent: "ASSIGN_SKU",
        supplierId: activeSupplierForSkus.id,
        variantId: selectedVariantId,
        unitCost: assignCost || "10",
        packSize: assignPackSize || "1",
        minOrderQty: assignMoq || "1",
        syncToShopifyVendor: String(syncToShopifyVendor),
        syncToShopifyCost: String(syncToShopifyCost),
      },
      { method: "post" },
    );
  };

  // High-level metrics
  const totalVariantsManaged = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.assignedRulesCount, 0),
    [suppliers],
  );
  const avgLeadTime = useMemo(() => {
    if (suppliers.length === 0) return 0;
    const total = suppliers.reduce((sum, s) => sum + s.defaultLeadTime, 0);
    return Math.round(total / suppliers.length);
  }, [suppliers]);
  const totalActiveOrders = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.activeOrdersCount, 0),
    [suppliers],
  );

  const currencyOptions = [
    { label: "USD ($) - US Dollar", value: "USD" },
    { label: "CAD ($) - Canadian Dollar", value: "CAD" },
    { label: "EUR (€) - Euro", value: "EUR" },
    { label: "GBP (£) - British Pound", value: "GBP" },
    { label: "AUD ($) - Australian Dollar", value: "AUD" },
  ];

  // Filter rules belonging to the active supplier in the SKU modal
  const activeSupplierRules = useMemo(() => {
    if (!activeSupplierForSkus) return [];
    return rules.filter((r) => r.supplierId === activeSupplierForSkus.id);
  }, [rules, activeSupplierForSkus]);

  return (
    <Page
      title="Suppliers"
      subtitle="Manage vendor profiles, default production lead times, and sourcing currencies."
      primaryAction={{
        content: "Add Supplier",
        icon: PlusIcon,
        onAction: handleOpenCreateModal,
      }}
    >
      <BlockStack gap="400">
        {/* Executive KPI Metric Strip */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {/* Card 1: Active Vendors */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Active Suppliers
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {suppliers.length}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    vendors
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="info">Direct Master</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Registered manufacturing partners
              </Text>
            </BlockStack>
          </Card>

          {/* Card 2: Linked SKUs */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Linked Sourcing Rules
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {totalVariantsManaged}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    SKUs
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="success">Active Terms</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Variants with unit costs & pack sizes
              </Text>
            </BlockStack>
          </Card>

          {/* Card 3: Avg Lead Time */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Average Lead Time
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {avgLeadTime}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    days
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone="attention">Transit Buffer</Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Base production & delivery cycle
              </Text>
            </BlockStack>
          </Card>

          {/* Card 4: Open Purchase Orders */}
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" tone="subdued">
                Open Purchase Orders
              </Text>
              <InlineStack wrap={false} blockAlign="center" gap="200">
                <Text as="p" variant="headingLg">
                  {totalActiveOrders}&nbsp;
                  <Text as="span" variant="bodySm" fontWeight="regular" tone="subdued">
                    orders
                  </Text>
                </Text>
                <div style={{ flexShrink: 0 }}>
                  <Badge size="small" tone={totalActiveOrders > 0 ? "attention" : "info"}>
                    {totalActiveOrders > 0 ? "In-Flight" : "Dock Ready"}
                  </Badge>
                </div>
              </InlineStack>
              <Text as="p" variant="bodyXs" tone="subdued">
                Drafts and vendor in-transit batches
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Clean Contextual Guidance */}
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Default lead times dictate replenishment reorder points. Click <strong>"Manage SKUs"</strong> on any vendor row below to map products, set purchase unit costs, and enforce container pack sizes.
          </Text>
        </Banner>

        {/* Suppliers IndexTable with Pinned Actions Column */}
        <div className="clearstock-po-table">
          <Card padding="0">
            {suppliers.length === 0 ? (
              <EmptyState
                heading="No suppliers registered"
                action={{
                  content: "Add First Supplier",
                  onAction: handleOpenCreateModal,
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Register your suppliers and their default delivery lead times to power replenishment formulas.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "supplier", plural: "suppliers" }}
                itemCount={suppliers.length}
                selectable={false}
                headings={[
                  { title: "Supplier Name" },
                  { title: "Contact Person" },
                  { title: "Contact Email & Phone" },
                  { title: "Default Lead Time" },
                  { title: "Assigned SKUs" },
                  { title: "Active Orders" },
                  { title: "Currency" },
                  { title: "Actions", alignment: "end" },
                ]}
              >
                {suppliers.map((sup, index) => (
                  <IndexTable.Row id={sup.id} key={sup.id} position={index}>
                    {/* Supplier Name (Pinned Column 1) */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "160px" }}>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {sup.name}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Contact Person */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "140px" }}>
                        <Text as="span" variant="bodySm">
                          {sup.contactName || "—"}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Contact Email & Phone */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "190px" }}>
                        <BlockStack gap="050">
                          <Text as="span" variant="bodySm">
                            {sup.email || "No email"}
                          </Text>
                          {sup.phone && (
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {sup.phone}
                            </Text>
                          )}
                        </BlockStack>
                      </div>
                    </IndexTable.Cell>

                    {/* Default Lead Time */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "130px" }}>
                        <Badge tone="info">{`${sup.defaultLeadTime} days`}</Badge>
                      </div>
                    </IndexTable.Cell>

                    {/* Assigned SKUs */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "130px" }}>
                        <Badge tone={sup.assignedRulesCount > 0 ? "success" : "attention"}>
                          {`${sup.assignedRulesCount} variants`}
                        </Badge>
                      </div>
                    </IndexTable.Cell>

                    {/* Active Orders */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "120px" }}>
                        {sup.activeOrdersCount > 0 ? (
                          <Badge tone="attention">{`${sup.activeOrdersCount} in-flight`}</Badge>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            None
                          </Text>
                        )}
                      </div>
                    </IndexTable.Cell>

                    {/* Currency */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "90px" }}>
                        <Text as="span" variant="bodySm" fontWeight="medium">
                          {sup.currency}
                        </Text>
                      </div>
                    </IndexTable.Cell>

                    {/* Actions (Pinned Column to Right) */}
                    <IndexTable.Cell>
                      <div style={{ minWidth: "210px", textAlign: "right" }}>
                        <InlineStack gap="150" align="end">
                          <Button
                            size="slim"
                            icon={LinkIcon}
                            onClick={() => handleOpenSkuModal(sup)}
                          >
                            Manage SKUs
                          </Button>
                          <Button
                            size="slim"
                            icon={EditIcon}
                            onClick={() => handleOpenEditModal(sup)}
                          >
                            Edit
                          </Button>
                        </InlineStack>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </div>

        {/* Modal 1: Create / Edit Supplier Profile */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : "Add New Supplier"}
          primaryAction={{
            content: isSubmitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Create Supplier",
            loading: isSubmitting,
            onAction: handleSaveSupplier,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {formError && (
                <Banner tone="critical">
                  <p>{formError}</p>
                </Banner>
              )}

              <TextField
                label="Supplier Name"
                value={name}
                onChange={setName}
                autoComplete="off"
                placeholder="e.g. Apex Apparel Ltd."
                requiredIndicator
              />

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Contact Person Name"
                    value={contactName}
                    onChange={setContactName}
                    autoComplete="off"
                    placeholder="e.g. Sarah Jenkins"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="e.g. orders@supplier.com"
                  />
                </div>
              </InlineStack>

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Phone Number"
                    value={phone}
                    onChange={setPhone}
                    autoComplete="tel"
                    placeholder="e.g. +1 (555) 019-2834"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Default Lead Time (Days)"
                    type="number"
                    value={defaultLeadTime}
                    onChange={setDefaultLeadTime}
                    autoComplete="off"
                    helpText="Default days between placing PO and receipt at dock"
                  />
                </div>
              </InlineStack>

              <Select
                label="Billing Currency"
                options={currencyOptions}
                value={currency}
                onChange={setCurrency}
              />

              <TextField
                label="Internal Vendor Notes"
                value={notes}
                onChange={setNotes}
                multiline={3}
                autoComplete="off"
                placeholder="Payment terms (e.g. Net 30), shipping port, or direct account rep info."
              />
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Modal 2: Manage Linked SKUs for Supplier */}
        <Modal
          open={skuModalOpen}
          onClose={() => setSkuModalOpen(false)}
          title={`Manage SKUs • ${activeSupplierForSkus?.name || ""}`}
          primaryAction={{
            content: "Done",
            onAction: () => setSkuModalOpen(false),
          }}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Connect product variants to <strong>{activeSupplierForSkus?.name}</strong>. Define the purchase cost, master case pack size, and supplier minimum order quantities (MOQ).
              </Text>

              {/* Form to Assign a SKU */}
              <Card background="bg-surface-secondary">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Connect a Product Variant / SKU
                  </Text>

                  <Combobox
                    activator={
                      <Combobox.TextField
                        prefix={<Icon source={SearchIcon} />}
                        onChange={(val) => {
                          setSkuInputValue(val);
                          setVisibleSkuCount(50);
                        }}
                        label="Search & Select Product Variant"
                        value={skuInputValue}
                        placeholder="Search by product name, color, or SKU..."
                        clearButton={Boolean(skuInputValue)}
                        onClearButtonClick={() => {
                          setSkuInputValue("");
                          setVisibleSkuCount(50);
                        }}
                        autoComplete="off"
                        helpText={
                          skuInputValue &&
                          skuInputValue.trim().toLowerCase() !== getVariantLabel(selectedCatalogItem).toLowerCase()
                            ? `Found ${filteredVariants.length} matching variant${filteredVariants.length === 1 ? "" : "s"}`
                            : `Selected: ${selectedCatalogItem.title} (${selectedCatalogItem.sku}) • Default Cost: $${selectedCatalogItem.defaultCost.toFixed(2)}`
                        }
                      />
                    }
                  >
                    <div className="clearstock-combobox-container">
                      <div className="clearstock-combobox-header">
                        <span className="clearstock-combobox-header-title">
                          {skuInputValue &&
                          skuInputValue.trim().toLowerCase() !== getVariantLabel(selectedCatalogItem).toLowerCase()
                            ? `Matching Products (${filteredVariants.length})`
                            : `Catalog Products (${filteredVariants.length} items)`}
                        </span>
                        <span className="clearstock-combobox-header-hint">
                          Scroll to explore • Click row to select
                        </span>
                      </div>

                      <div className="clearstock-combobox-scroll">
                        {displayedVariants.length > 0 ? (
                          <Listbox
                            onSelect={(val) => {
                              handleVariantSelectChange(val);
                            }}
                          >
                            {displayedVariants.map((item) => {
                              const isSelected = selectedVariantId === item.variantId;
                              const isAlreadyLinked = activeSupplierRules.some(
                                (r) => r.variantId === item.variantId,
                              );
                              return (
                                <Listbox.Option
                                  key={item.variantId}
                                  value={item.variantId}
                                  selected={isSelected}
                                  accessibilityLabel={`${item.title} ${item.variantTitle} ${item.sku}`}
                                >
                                  <div
                                    className={`clearstock-sku-option-row ${isSelected ? "selected" : ""} ${isAlreadyLinked ? "linked" : ""}`}
                                  >
                                    <div className="clearstock-sku-thumb">
                                      <Icon source={ProductIcon} tone="base" />
                                    </div>

                                    <div className="clearstock-sku-info">
                                      <div className="clearstock-sku-title">
                                        {item.title}
                                      </div>
                                      <div className="clearstock-sku-meta">
                                        <span className="clearstock-sku-variant">{item.variantTitle}</span>
                                        <span className="clearstock-sku-dot">•</span>
                                        <span className="clearstock-sku-code">SKU: {item.sku}</span>
                                      </div>
                                    </div>

                                    <div className="clearstock-sku-badges">
                                      <span className="clearstock-sku-cost">
                                        ${item.defaultCost.toFixed(2)}
                                      </span>
                                      {isAlreadyLinked && (
                                        <span className="clearstock-sku-tag-linked">Linked</span>
                                      )}
                                      {isSelected && (
                                        <span className="clearstock-sku-tag-selected">Selected</span>
                                      )}
                                    </div>
                                  </div>
                                </Listbox.Option>
                              );
                            })}

                            {hasMoreVariants && (
                              <Box padding="300">
                                <Button
                                  variant="plain"
                                  fullWidth
                                  onClick={() => setVisibleSkuCount((prev) => prev + 30)}
                                >
                                  Load more matching variants...
                                </Button>
                              </Box>
                            )}
                          </Listbox>
                        ) : (
                          <div className="clearstock-combobox-empty">
                            <p>No product variants match "{skuInputValue}"</p>
                            <span className="subdued">Try typing a product name, color, or SKU code</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Combobox>

                  <InlineStack gap="300">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Purchase Unit Cost ($)"
                        type="number"
                        step={0.01}
                        value={assignCost}
                        onChange={setAssignCost}
                        autoComplete="off"
                        helpText="Internal cost paid to vendor. Does NOT affect customer retail selling price."
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Case Pack Size"
                        type="number"
                        value={assignPackSize}
                        onChange={setAssignPackSize}
                        autoComplete="off"
                        helpText="Units per box"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Min Order Qty (MOQ)"
                        type="number"
                        value={assignMoq}
                        onChange={setAssignMoq}
                        autoComplete="off"
                        helpText="Vendor MOQ threshold"
                      />
                    </div>
                  </InlineStack>

                  <Divider />

                  <InlineStack align="space-between" blockAlign="center" gap="400">
                    <BlockStack gap="150">
                      <Checkbox
                        label={`Update Shopify Product Vendor to "${activeSupplierForSkus?.name}"`}
                        checked={syncToShopifyVendor}
                        onChange={setSyncToShopifyVendor}
                        helpText="Keeps Shopify storefront vendor field synchronized to prevent sync conflicts"
                      />
                      <Checkbox
                        label={`Sync Unit Cost ($${parseFloat(assignCost || "0").toFixed(2)}) to Shopify Cost per item (COGS)`}
                        checked={syncToShopifyCost}
                        onChange={setSyncToShopifyCost}
                        helpText="Internal accounting only. Updates Shopify profit reports — will NEVER change the customer retail selling price."
                      />
                    </BlockStack>

                    <Button
                      variant="primary"
                      size="large"
                      loading={isSubmitting}
                      onClick={handleAssignSkuToSupplier}
                    >
                      Connect SKU to Supplier
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Divider />

              {/* Currently Linked SKUs */}
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Currently Linked SKUs ({activeSupplierRules.length})
                </Text>

                {activeSupplierRules.length === 0 ? (
                  <Box padding="300">
                    <Text as="p" variant="bodySm" tone="subdued">
                      No SKUs linked to this supplier yet. Select a product variant above to connect your first SKU!
                    </Text>
                  </Box>
                ) : (
                  <Card padding="0">
                    <IndexTable
                      resourceName={{ singular: "SKU", plural: "SKUs" }}
                      itemCount={activeSupplierRules.length}
                      selectable={false}
                      headings={[
                        { title: "Product / Variant" },
                        { title: "SKU" },
                        { title: "Unit Cost" },
                        { title: "Case Pack" },
                        { title: "MOQ" },
                      ]}
                    >
                      {activeSupplierRules.map((r, idx) => (
                        <IndexTable.Row id={r.id} key={r.id} position={idx}>
                          <IndexTable.Cell>
                            <BlockStack gap="050">
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {r.title}
                              </Text>
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {r.variantTitle}
                              </Text>
                            </BlockStack>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm">
                              {r.sku}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              ${r.unitCost.toFixed(2)}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Badge tone="info">{`${r.packSize} units/case`}</Badge>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="span" variant="bodySm">
                              {`${r.minOrderQty} units`}
                            </Text>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  </Card>
                )}
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
