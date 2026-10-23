# ClearStock: Inventory Forecasting & Purchase Orders

> **Enterprise-grade replenishment intelligence, automated purchase order generation, and real-time multi-location warehouse receiving for Shopify merchants.**

---

## 1. Executive Summary & Purpose

**ClearStock** is a full-featured, embedded Shopify application designed to eliminate stockouts and prevent dead capital. Built on modern Shopify standards (React Router v7, Shopify Polaris v13, Shopify App Bridge, Prisma ORM, and PostgreSQL), ClearStock acts as an autonomous inventory control center for high-growth e-commerce merchants.

Unlike generic inventory tools that rely on static minimums, ClearStock uses **real-time sales velocity analysis across dynamic timeframes (7D, 14D, 30D, 90D)** combined with supplier lead times, custom safety stock formulas, and master carton multiples to tell merchants:
1. **Exactly what to reorder today** (Strict Reorder Point gating).
2. **Exactly how many cartons to order** (automated MOQ and Case Pack rounding).
3. **When items will run out** (runway calculations in days).
4. **How much capital is trapped in overstock** (dead cash valuation).
5. **Which warehouse to route shipments to** (two-way multi-location receiving via Shopify GraphQL).

---

## 2. System Architecture & Tech Stack

```mermaid
graph TD
    Shopify[Shopify Admin API & Webhooks] <--> AppBridge[Shopify App Bridge & Embedded UI]
    AppBridge <--> Router[React Router v7 / Vite Server]
    Router <--> Engine[Replenishment & Math Engine]
    Router <--> Webhooks[Webhook Ingestion & Idempotency Ledger]
    Webhooks <--> DB[(PostgreSQL via Prisma ORM)]
    Engine <--> DB
    Engine --> GQLMutations[Shopify GraphQL: inventoryAdjustQuantities]
    GQLMutations --> Shopify
```

### Technology Highlights
- **Framework:** React Router v7 (Full-Stack SSR + Client Transitions via Vite)
- **UI Design System:** Shopify Polaris v13 + Custom Modern Dashboard Aesthetics
- **Embedded Integration:** `@shopify/app-bridge-react` + App Bridge Session Token Authentication
- **ORM & Database:** Prisma v6 with PostgreSQL (`DATABASE_URL`)
- **API Version:** Shopify Admin GraphQL API `2025-01`
- **Idempotent Webhooks:** Sub-second sales ingestion with duplicate suppression (`ProcessedWebhook`)
- **GDPR / Privacy Compliance:** Zero Customer PII architecture with 1-click JSON data archive export

---

## 3. The Replenishment Mathematical Engine

ClearStock executes sub-second math across your entire SKU catalog using a 9-step inventory forecasting formula.

```mermaid
flowchart LR
    A[Daily Sales Aggregator] --> B(Average Daily Sales: 7D / 14D / 30D / 90D)
    B --> C[Lead Time Demand = ADS x Lead Time Days]
    B --> D[Safety Stock = ADS x Safety Days x Formula Multiplier]
    C & D --> E[Reorder Point ROP = Lead Time Demand + Safety Stock]
    B --> F[Cycle Stock = ADS x PO Frequency Days]
    E & F --> G[Target Stock Level = ROP + Cycle Stock]
    G --> H{Stock on Hand + On Order <= ROP?}
    H -- Yes --> I[Raw Deficit = Target Stock - Effective Stock]
    I --> J[Round up to MOQ & Case Pack Multiples]
    J --> K[Recommended PO Units & Cases]
    H -- No --> L[Status: Stock OK / Overstocked]
```

### Detailed Mathematical Definitions

1. **Average Daily Sales (ADS):**
   $$\text{ADS}_{\text{window}} = \frac{\sum \text{Paid Units Sold in Window}}{\text{Window Days (7, 14, 30, or 90)}}$$
2. **Lead Time Demand (LTD):**
   $$\text{LTD} = \text{ADS} \times \text{Supplier Lead Time Days}$$
3. **Custom Safety Stock ($SS$):**
   $$SS_{\text{calculated}} = \text{ADS} \times \text{Safety Stock Target Days} \times \text{Formula Multiplier}$$
   $$SS = \max(SS_{\text{calculated}}, \text{Safety Stock Floor Minimum})$$
4. **Reorder Point (ROP):**
   $$\text{ROP} = \text{round}(\text{LTD} + SS)$$
5. **Cycle Stock ($CS$):**
   $$CS = \text{round}(\text{ADS} \times \text{Reorder Frequency Days (default: 30)})$$
6. **Target Stock Level (Order-Up-To Level):**
   $$\text{Target Level} = \text{ROP} + CS$$
7. **Effective Stock Position:**
   $$\text{Effective Stock} = \text{Stock on Hand} + \text{Inbound Stock on Open POs}$$
8. **Strict ROP Gate & Recommended PO Units:**
   - If $\text{Effective Stock} \le \text{ROP}$, replenishment is triggered.
   - $\text{Raw Deficit} = \max(0, \text{Target Level} - \text{Effective Stock})$
   - $\text{Cartons Needed} = \left\lceil \frac{\max(\text{Raw Deficit}, \text{MOQ})}{\text{Case Pack Multiplier}} \right\rceil$
   - $\text{Recommended PO Units} = \text{Cartons Needed} \times \text{Case Pack Multiplier}$
9. **Overstock Threshold & Dead Capital Valuation:**
   - $\text{Overstock Ceiling} = \text{round}(\text{Target Level} \times 1.15)$
   - If $\text{Stock on Hand} > \text{Overstock Ceiling}$, the item is tagged **Overstocked**.
   - $\text{Dead Cash Value} = (\text{Stock on Hand} - \text{Target Level}) \times \text{Unit Cost}$

---

## 4. Comprehensive Feature Guide

### 4.1 Replenishment Dashboard (`/app`)
- **Real-Time KPI Cards:** Instant visibility into:
  - *Reorder Now* items (urgent stockout risk).
  - *Incoming* orders (units currently in transit).
  - *Overstocked* variants (excess inventory).
  - *Healthy Stock* (optimally balanced runway).
  - *Total Dead Capital Trapped* (capital eligible for liquidation/clearance).
- **Interactive Velocity Toggles:** Switch between 7D (spike detection), 14D (bi-weekly trend), 30D (standard baseline), and 90D (macro seasonality).
- **Warehouse Selector Filter (Scale Plan):** Toggle between enterprise aggregate views (`All Locations`) or filter replenishment calculations specifically for a single warehouse (e.g. *Main 3PL* vs *Retail Storefront*).
- **Per-Location Stock Breakdown:**
  - **Hover Tooltip:** Instant popover on the *Stock on Hand* table cell revealing available units across every facility.
  - **Math Inspector Modal:** Click **Inspect** on any product to see step-by-step audit calculations, formula multipliers, exact carton rounding, and a dedicated **📍 Warehouse Stock Breakdown** card.
- **Bulk Purchase Order Generation:** Select multiple low-stock SKUs and click **Create Purchase Order**. The system automatically groups items by vendor and generates dedicated POs.

### 4.2 Supplier & Sourcing Management (`/app/suppliers`)
- **Centralized Supplier Directory:** Manage vendor names, contact emails, phone numbers, default lead times, and currency.
- **Variant-Level Constraint Overrides:** Configure specific rules per variant:
  - Unit Cost (COGS).
  - Custom Lead Time overrides (days).
  - Minimum Order Quantity (MOQ).
  - Case Pack / Master Carton multiples (e.g. 6, 12, 24).
  - Safety stock target days and hard unit safety floors.
- **Catalog CSV Import/Export:** Export complete supplier rules or bulk-update constraints using spreadsheet uploads.

### 4.3 Purchase Order Lifecycle (`/app/purchase-orders`)
- **End-to-End Status Pipeline:**
  - `DRAFT`: Editable purchase order; add/remove items, adjust quantities, review order valuation.
  - `ORDERED`: Locked PO awaiting delivery; inbound stock is credited to `Stock on Order` across the dashboard to prevent double-ordering.
  - `PARTIALLY_RECEIVED`: Allows recording partial shipments with tracking of outstanding balances.
  - `RECEIVED`: Completed order; final stock credited to Shopify inventory.
  - `CANCELLED`: Voids the order and releases on-order stock reservations.
- **Permanent Destination Warehouse Tracking:** Every received order records the destination facility name and ID, displaying location badges in the PO listing table and header (`📍 My Custom Location`).
- **Supplier PO Email & Print:** Export formal supplier-ready purchase order summaries with itemized costs, order numbers, and contact details.

### 4.4 Two-Way Multi-Location Warehouse Receiving (`/app/purchase-orders/:id`)
- **Shopify GraphQL Live Sync:** Clicking **Receive Items** triggers Shopify's Admin GraphQL mutation `inventoryAdjustQuantities`.
- **Destination Warehouse Selection (Scale Plan):** Merchants managing multiple Shopify locations can select the exact destination warehouse (e.g. *Main 3PL*, *West Coast Warehouse*, *Retail Storefront*).
- **Local & Remote Synchronization:** Simultaneously updates Shopify storefront stock levels, records destination metadata on the PO, and updates local ClearStock database records.

### 4.5 Settings & Data Sync Engine (`/app/settings`)
- **Global Replenishment Defaults:** Default lookback windows, baseline safety days, fallback transit lead times, and automated case pack rounding.
- **Custom Safety Stock Formula Models (Scale Plan):**
  - **Standard (1.0x):** Baseline safety stock ($ADS \times \text{Days}$).
  - **Surge Protection (+25%):** Increases safety stock by 25% for high-volatility merchants.
  - **Aggressive Peak (+50%):** Zero-stockout policy buffer for holiday rushes and flash sales.
  - **Lean / JIT (-20%):** Rapid-inventory-turnover model for cash-flow-optimized businesses.
- **Shopify 90-Day Historical Resync:** 1-click self-healing engine that re-aggregates Shopify historical orders and repairs local sales data.
- **GDPR Article 15 Data Portability:** Download complete JSON archives of store configurations, supplier directories, and sales ledgers.

---

## 5. Subscription Plans & Feature Matrix

Subscription tiers are enforced via `app/utils/planGatekeeper.ts` with automated UI badge gating and trial tracking:

| Feature / Capability | Starter Plan ($9/mo) | Growth Plan ($39/mo) | Scale Plan ($89/mo) |
| :--- | :---: | :---: | :---: |
| **Free Trial** | 14 Days | 14 Days *(Recommended)* | 14 Days *(Enterprise)* |
| **SKU & Variant Limit** | Up to 50 SKUs | Unlimited | Unlimited |
| **Supplier Directory** | 1 Primary Supplier | Unlimited Suppliers | Unlimited Suppliers |
| **Sales Velocity Windows** | 30D Baseline only | 7D, 14D, 30D, and 90D | 7D, 14D, 30D, and 90D |
| **Case Pack & MOQ Rounding** | 🔒 Locked | Included | Included |
| **1-Click Purchase Orders** | Included | Included | Included |
| **Multi-Location Warehouse Filtering & Receiving** | Primary Location only | Primary Location only | **Any Shopify Location + Dashboard Filter** |
| **Custom Safety Stock Formulas** | Standard (1.0x) only | Standard (1.0x) only | **Surge (+25%), Aggressive (+50%), Lean (-20%)** |
| **Support SLA** | Standard | Standard | **Priority 24/7 SLA** |

---

## 6. Merchant User Journey

```mermaid
journey
    title Complete Merchant Journey with ClearStock
    section Installation & Setup
      Install from Shopify App Store: 5: Merchant
      Automated Session Auth: 5: ClearStock
      Run Initial 90-Day Sync: 5: ClearStock
      Configure Sourcing Defaults: 4: Merchant
    section Daily Operations
      Review Replenishment Dashboard: 5: Merchant
      Audit Reorder Points via Math Inspector: 5: Merchant
      Toggle 7D/14D/30D/90D Velocity Windows: 5: Merchant
    section Ordering & Receiving
      1-Click Draft PO Generation: 5: Merchant
      Email / Export PO to Supplier: 5: Merchant
      Boxes Arrive at Warehouse: 4: Merchant
      Receive Items into Shopify Location: 5: ClearStock, Merchant
      Live Store Inventory Auto-Updated: 5: Shopify, ClearStock
```

1. **Install App:** Merchant installs ClearStock from Shopify Admin. OAuth scopes are granted automatically.
2. **Initial Sync:** Background ingestion processes up to 90 days of Shopify paid order history, populating the `DailySalesAggregator` cache without blocking UI responsiveness.
3. **Supplier Setup:** Sourcing constraints (MOQ, case packs, lead times, and unit costs) are configured in the Supplier directory or auto-populated from Shopify product vendors.
4. **Daily Replenishment Review:** The merchant monitors the dashboard for **Reorder Now** alerts. They can switch lookback windows (e.g. 7D during Black Friday) or test custom formula buffers.
5. **PO Generation:** Clicking **Draft PO** compiles recommended carton counts. The merchant confirms the draft and sends it to the vendor.
6. **Receiving & Live Adjustment:** Upon shipment arrival, the merchant selects the destination location in the receiving modal. ClearStock adjusts Shopify inventory levels in real time.

---

## 7. Data Models & Database Schema

The database is managed via Prisma ORM connected to PostgreSQL. Below are the primary models:

```mermaid
erDiagram
    Supplier ||--o{ VariantSupplierRule : provides
    Supplier ||--o{ PurchaseOrder : receives
    PurchaseOrder ||--o{ PurchaseOrderItem : contains
    AppSettings ||--|| Session : configures
    DailySalesAggregator }|--|| VariantSupplierRule : tracks

    Supplier {
        string id PK
        string shop
        string name
        int defaultLeadTime
        string currency
    }

    VariantSupplierRule {
        string id PK
        string shop
        string variantId
        string inventoryItemId
        string productId
        int availableStock
        decimal unitCost
        int leadTimeDays
        int minOrderQty
        int packSize
        int safetyStockDays
        int safetyStockMinimum
    }

    PurchaseOrder {
        string id PK
        string shop
        string poNumber
        enum status
        datetime expectedArrival
        string destinationLocationId
        string destinationLocationName
    }

    PurchaseOrderItem {
        string id PK
        string purchaseOrderId FK
        string variantId
        string inventoryItemId
        int quantityOrdered
        int quantityReceived
        decimal unitCost
    }

    DailySalesAggregator {
        string id PK
        string shop
        string variantId
        date date
        int unitsSold
    }

    AppSettings {
        string id PK
        string shop UK
        int defaultLookbackWindow
        int defaultSafetyStockDays
        int defaultLeadTimeDays
        boolean autoRoundCasePacks
        string selectedPlan
        string safetyFormulaModel
    }

    ProcessedWebhook {
        string id PK
        string shop
        string topic
        string orderId
    }
```

---

## 8. Webhook Architecture & Idempotency

ClearStock registers and monitors the following Shopify webhooks:

| Webhook Topic | Route URI | Description |
| :--- | :--- | :--- |
| `orders/create` | `/webhooks/orders/create` | Increments daily sales velocity for paid line items. |
| `orders/updated` | `/webhooks/orders/updated` | Reconciles payments, adjustments, and refunds. |
| `inventory_levels/update` | `/webhooks/inventory_levels/update` | Aggregates stock on hand across all active Shopify locations. |
| `products/create` & `update` | `/webhooks/products/create` | Ingests new SKUs, vendors, and links `inventoryItemId`. |
| `products/delete` | `/webhooks/products/delete` | Cleans up removed catalog variants from local database. |
| `app/uninstalled` | `/webhooks/app/uninstalled` | Revokes sessions and triggers clean-up routine. |
| `customers/data_request` | `/webhooks/customers/data_request` | GDPR compliance response (No Customer PII stored). |
| `customers/redact` | `/webhooks/customers/redact` | GDPR customer redaction (Zero Customer PII acknowledgment). |
| `shop/redact` | `/webhooks/shop/redact` | GDPR merchant deletion (Purges store database records). |

### Webhook Idempotency Guarantee
To prevent double-counting sales when Shopify sends multiple retries of `orders/create` and `orders/updated`, ClearStock logs incoming webhook IDs into the `ProcessedWebhook` ledger. Any duplicate payloads within the same shop and order ID are detected and skipped before touching the sales cache.

---

## 9. Local Development & Setup

### Prerequisites
- **Node.js:** v18.20+ or v20+
- **Shopify CLI:** v3.50+
- **PostgreSQL:** Local instance or cloud database (Neon, Supabase, AWS RDS)

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/clear-stock-inventory-p-os.git
   cd clear-stock-inventory-p-os
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   SHOPIFY_API_KEY=your_shopify_api_key
   SHOPIFY_API_SECRET=your_shopify_api_secret
   SCOPES=read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,read_locations
   DATABASE_URL="postgresql://user:password@localhost:5432/clearstock_dev?schema=public"
   PORT=3000
   ```

4. **Initialize Database Schema:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Press `P` to launch the Cloudflare / Shopify CLI tunnel and install the app on your development store.

6. **Validate Types & Build:**
   ```bash
   npm run typecheck
   npm run build
   ```

---

## 10. Privacy, Security & GDPR Compliance

- **Zero Customer PII:** ClearStock does not store customer names, emails, physical addresses, IP addresses, or payment card data. Sales data is strictly aggregated as `(shop, variantId, date, unitsSold)`.
- **Multi-Tenant Scoping:** Every SQL query and Prisma operation strictly enforces `where: { shop: session.shop }` to guarantee complete data isolation between merchants.
- **GDPR Article 15 Compliance:** Merchants can export their full data footprint anytime via the **Download Data Archive (.JSON)** button in `/app/settings`.
- **Automated Shop Redaction:** When a merchant uninstalls the app and requests shop deletion via Shopify, the `/webhooks/shop/redact` endpoint permanently cleanses all associated store records.

---

## 11. Support & Community

- **In-App Support:** Click **Contact Support** in Settings to reach our merchant success team.
- **Enterprise SLA:** Priority 24/7 engineering support is included for all merchants on the **Scale Plan**.
- **Documentation:** Review the interactive **Sync & Math Guide** directly within the app dashboard.
