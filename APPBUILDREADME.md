# ClearStock Inventory & POs

> **Tagline:** Transparent stock forecasting and purchase order workflows.  
> **Philosophy:** The anti-AI inventory manager — 100% deterministic, explainable, and math-driven.

---

## Table of Contents

1. [App Overview & Core Philosophy ("The Why")](#1-app-overview--core-philosophy-the-why)
   - [Market Problem & Opportunity (The Inventory Planner by Sage Breakdown)](#market-problem--opportunity-the-inventory-planner-by-sage-breakdown)
   - [Competitive Moat: Sage vs. ClearStock](#competitive-moat-sage-vs-clearstock)
   - [Target Audience: The Stocky & Sage Refugees](#target-audience-the-stocky--sage-refugees)
   - [The "Show The Math" Principle](#the-show-the-math-principle)
2. [Key Features & Specifications ("The What")](#2-key-features--specifications-the-what)
   - [1. Data Ingestion & Resilient Syncing](#1-data-ingestion--resilient-syncing)
   - [2. Deterministic Replenishment Engine](#2-deterministic-replenishment-engine)
   - [3. Supplier Constraints & Rule Optimization](#3-supplier-constraints--rule-optimization)
   - [4. Purchase Order (PO) Lifecycle & Receiving](#4-purchase-order-po-lifecycle--receiving)
   - [5. Self-Service Data Healing ("The Heal Button")](#5-self-service-data-healing-the-heal-button)
   - [MVP Scope Boundaries (In-Scope vs. Out-of-Scope)](#mvp-scope-boundaries-in-scope-vs-out-of-scope)
3. [System Architecture & Tech Stack](#3-system-architecture--tech-stack)
   - [Architecture Diagram](#architecture-diagram)
   - [Technology Stack Matrix](#technology-stack-matrix)
   - [Shopify-First Sync Resilience (Avoiding the Multi-Channel Sync Trap)](#shopify-first-sync-resilience-avoiding-the-multi-channel-sync-trap)
   - [Shopify Rate Limiting Strategy](#shopify-rate-limiting-strategy)
4. [Database Schema (Prisma ORM)](#4-database-schema-prisma-orm)
   - [Schema Definition (`schema.prisma`)](#schema-definition-schemaprisma)
   - [Model Breakdown & Indexing Strategy](#model-breakdown--indexing-strategy)
5. [Webhook & Queue Configuration Checklist](#5-webhook--queue-configuration-checklist)
   - [Required OAuth Scopes](#required-oauth-scopes)
   - [Webhook Subscriptions](#webhook-subscriptions)
   - [Worker Processing & Bulletproof Idempotency](#worker-processing--bulletproof-idempotency)
6. [Local Development Setup](#6-local-development-setup)
   - [Prerequisites](#prerequisites)
   - [Environment Variables (`.env`)](#environment-variables-env)
   - [Installation & Database Setup](#installation--database-setup)
   - [Running the App & Background Workers](#running-the-app--background-workers)
   - [Tunneling (Cloudflare / ngrok)](#tunneling-cloudflare--ngrok)
7. [Shopify GraphQL Reference Patterns](#7-shopify-graphql-reference-patterns)
   - [Initial Historical Sync (`bulkOperationRunQuery`)](#initial-historical-sync-bulkoperationrunquery)
   - [On-Demand Self-Service Healing Query](#on-demand-self-service-healing-query)
   - [Stock Receiving Mutation (`inventoryAdjustQuantities`)](#stock-receiving-mutation-inventoryadjustquantities)
8. [Implementation Nuances & Technical "Gotchas"](#8-implementation-nuances--technical-gotchas)
   - [1. Variant GID vs. InventoryItem GID Mapping](#1-variant-gid-vs-inventoryitem-gid-mapping)
   - [2. Dynamic Date Filtering in Historical Bulk Query](#2-dynamic-date-filtering-in-historical-bulk-query)
   - [3. Order Webhook Sanitization & Payment/Fraud Filtering](#3-order-webhook-sanitization--paymentfraud-filtering)
   - [4. Node.js BigInt Serialization in Remix Loaders](#4-nodejs-bigint-serialization-in-remix-loaders)

---

## 1. App Overview & Core Philosophy ("The Why")

### Market Problem & Opportunity (The Inventory Planner by Sage Breakdown)

Inventory management for growing Shopify merchants is fundamentally broken. An analysis of merchant reviews for category incumbents like **Inventory Planner by Sage** reveals acute market frustration:

1. **Extortionate, Predatory Contracts:** Incumbents force merchants into **$4,000+ upfront annual commitments** with pricing pegged directly to merchant gross revenue. As merchants scale, they are financially penalized. When features or integrations break, refunds are routinely denied.
2. **Abandoning the Small-to-Midsize Merchant:** Incumbents are actively turning away or pricing out merchants doing under $1M in annual GMV.
3. **The 10-Week Onboarding Nightmare:** Legacy tools have become bloated with complex accounting connectors and opaque predictive models that take months to configure and train.
4. **Fragile Sync Architecture (The 21-Day Outage):** By attempting to maintain bi-directional synchronization across Shopify, Amazon, QuickBooks, Xero, and 3PL warehouses simultaneously, incumbent sync pipelines frequently collapse. A single breaking API change in QuickBooks halts inventory updates across the entire system for weeks.
5. **The Deprecation of Stocky:** Thousands of merchants reliant on Shopify's deprecated Stocky app are stranded between abandoned legacy software and overpriced enterprise bloat.

---

### Competitive Moat: Sage vs. ClearStock

| Strategic Dimension | Inventory Planner by Sage | ClearStock Inventory & POs |
| :--- | :--- | :--- |
| **Pricing Model** | $4,000+/yr upfront, revenue-tied tiers, rigid lock-in | **Flat-rate monthly** by SKU tier ($39 / $79 / $149/mo). Cancel anytime. |
| **Target Customer** | $1M–$50M+ enterprises | **$100K–$15M DTC & omnichannel merchants** (Stocky & Sage refugees). |
| **Onboarding Time** | 8 to 10 weeks of calls and configuration | **15 minutes:** Install $\rightarrow$ 2-minute bulk sync $\rightarrow$ Set lead times $\rightarrow$ Generate PO. |
| **Forecasting Engine** | Black-box machine learning & opaque statistical curves | **100% Deterministic:** Simple, verifiable math with "Show the Math" transparency. |
| **Integrations** | Fragile web of 3PLs, QuickBooks, Xero, EDI, and Amazon | **Shopify-First:** Shopify is the single source of truth. Zero sync conflicts. |
| **Self-Healing** | Support tickets with weeks of turnaround time | **1-Click "Heal" Button:** Merchant can re-sync the last 7–30 days instantly from the UI. |

---

### Target Audience: The Stocky & Sage Refugees
- Shopify merchants generating **$100K to $15M GMV**.
- Stores with **50 to 5,000 active SKUs** that require disciplined, periodic purchase orders.
- Lean operations teams who value operational clarity over complex algorithmic forecasts.
- Merchants who want native Shopify admin performance without paying a percentage of their revenue.

---

### The "Show The Math" Principle
**ClearStock is built as the uncompromising "Anti-AI" inventory manager.** 

Every single recommendation produced by the application can be verified with a calculator in under 15 seconds. If the application recommends ordering 120 units, the merchant can click **"Show the Math"** in the UI to inspect an unvarnished audit trail:

$$\text{Reorder Point (ROP)} = (\text{Average Daily Sales (ADS)} \times \text{Lead Time}) + \text{Safety Stock}$$

$$\text{Net Deficit} = \text{Reorder Point} - (\text{Stock On Hand} + \text{Stock On Order})$$

$$\text{Recommended Order} = \text{CeilToPackSize}(\max(\text{Net Deficit}, \text{MOQ}))$$

No neural networks, no hidden weights, and zero guessing.

---

## 2. Key Features & Specifications ("The What")

### 1. Data Ingestion & Resilient Syncing
* **Historical Backfill via Bulk API:** Upon initial store connection, the app initiates a Shopify Admin GraphQL `bulkOperationRunQuery`. This ingests up to 180 days of fulfilled line items without risking REST/GraphQL rate limit exhaustion.
* **Continuous Delta Syncing via Webhooks:**
  - `orders/create` & `orders/updated`: Streams sales into the local store (filtered strictly by paid, non-fraudulent orders).
  - `inventory_levels/update`: Keeps available stock in sync with live warehouse counts.
  - `products/create`, `products/update`, `products/delete`: Synchronizes variant IDs, titles, SKUs, and inventoryItem IDs.
* **Pre-Aggregated Sales Table:** Instead of recalculating sales across millions of orders on the fly, events are aggregated into a daily ledger (`DailySalesAggregator`). Dashboard queries run in **< 150ms** locally.

### 2. Deterministic Replenishment Engine
* **Selectable Rolling Windows:** Merchants can toggle between **7, 14, 30, or 90-day** rolling windows for Average Daily Sales (ADS).
* **Configurable Safety Stock:**
  - *Option A:* Fixed Days of Safety Stock (e.g., 14 days of coverage).
  - *Option B:* Fixed Unit Floor (e.g., maintain at least 25 units).
* **Executive Summary Cards (Top Dashboard Metrics):**
  - **Items Below Reorder Point:** Instant count of SKUs needing replenishment with action-required indicators.
  - **Total Shortage Units:** Aggregated deficit units across all items, factoring supplier case-pack roundings.
  - **Estimated Order Cost:** Clear, merchant-friendly pre-tax projection of capital needed for restock.
  - **Cash Tied Up (Overstock):** Explicit dollar amount trapped in items exceeding a healthy 90-day runway.
* **Overstock & Runway Management:**
  - Quick-filter tabs in the Polaris `IndexTable` for "All", "Needs Reorder", "Overstocked", and "Stock OK".
  - Dedicated warnings identifying dead cash trapped in slow-moving inventory.
* **"Show The Math" Inspection Modal:**
  - Interactive Polaris modal presenting clear, jargon-free audit steps for every buying recommendation:
    - **Step 1: Reorder Point (ROP) Formula** (tagged *Industry Standard*).
    - **Step 2: Prevent Double-Ordering** by deducting open incoming POs to compute **Net Shortage**.
    - **Step 3: Supplier MOQs & Case Pack Auto-Rounding** with plain-English **Rounding Logic** (e.g., `"147 units rounded up to the next multiple of 24"`).
    - Overstock warnings displaying days of runway and locked cash value when stock exceeds 90 days.

### 3. Supplier Constraints & Rule Optimization
* **Vendor Master Catalog:** Manage vendors with default contacts, currency, payment terms, and baseline lead times.
* **Per-Variant Sourcing Rules (`VariantSupplierRule`):**
  - **Supplier SKU:** Match vendor-specific part numbers.
  - **Inventory Item ID:** Direct reference to Shopify's `InventoryItem` for instant stock adjustments.
  - **Unit Cost:** Track purchase unit cost for margin and PO valuation.
  - **Lead Time (Days):** Specific production + transit time for this variant.
  - **Minimum Order Quantity (MOQ):** Supplier's minimum threshold.
  - **Pack Size (Case Pack / Inner Pack):** Forces calculations to round up to the nearest valid container multiple (e.g., box of 12 or master carton of 48).

### 4. Purchase Order (PO) Lifecycle & Receiving
* **One-Click Draft Generation:** Automatically convert selected SKUs below their reorder point into a grouped Draft PO per supplier via Polaris `useIndexResourceState`.
* **Spreadsheet-Style Interactive Editor:**
  - Fast inline keyboard navigation to adjust order quantities.
  - Live subtotal, weight/unit totals, and variance indicators.
* **Export & Sharing:** Clean PDF generation (printable purchase order) and CSV export formatted for supplier ingestion.
* **Partial & Full Receiving Workflow:**
  - Mark line items as partially received or fully received.
  - Directly commits additions to Shopify using the `inventoryAdjustQuantities` GraphQL mutation with clear audit reference strings.

### 5. Self-Service Data Healing ("The Heal Button")
* **The Problem It Solves:** If a webhook fails during high-traffic spikes (e.g., Black Friday), legacy apps leave merchants in the dark for days.
* **The Solution:** A dedicated **"Heal Data"** button prominently exposed in the top action bar:
  - Positioned directly beside the primary "Create PO from Selected" button (no hidden dropdown).
  - Wrapped with an informative tooltip (*"Instantly re-syncs recent paid orders from Shopify to verify local sales counts."*).
  - Triggers a targeted, lightweight GraphQL query for recent paid orders.
  - Compares and reconciles `DailySalesAggregator` locally within 5 to 10 seconds.
  - Gives merchants 100% autonomy without needing to submit customer support tickets.

---

### MVP Scope Boundaries (In-Scope vs. Out-of-Scope)

To guarantee high velocity, operational stability, and sub-second performance, the MVP maintains strict architectural boundaries:

| Feature Dimension | In-Scope (MVP) | Out-of-Scope (Post-MVP / Roadmap) | Rationale |
| :--- | :--- | :--- | :--- |
| **Locations** | Single Primary Location (Shopify primary location) | Multi-location cross-docking & store rebalancing | Multi-location transfers introduce complex graph routing and stock allocation logic. |
| **Product Structure** | Standard Single & Multi-Variant SKUs | Bundles, Assemblies, Kits, and Bill of Materials (BOM) | BOM requires recursive explosion and component-level tracking. |
| **Forecasting Logic** | Deterministic rolling-window ADS + Lead Time math | Prophet, ARIMA, Machine Learning, Seasonal AI curves | Contradicts the "anti-AI", explainable core value proposition. |
| **Integrations** | **Shopify Admin API Only** | QuickBooks, Xero, ShipStation, 3PLs, Amazon | Prevents multi-channel sync breakdowns that cripple legacy incumbents. |
| **Financials** | Unit cost tracking, total PO cost tally | Complex cash flow forecasting, multi-currency hedging | Keeps focus locked on physical replenishment execution. |
| **PO Data Sync** | Local ClearStock PO engine with exportable PDF/CSV | Dual-way sync into Shopify Native PO admin screens | Prevents dual-sync race conditions and API schema conflicts. |

---

## 3. System Architecture & Tech Stack

### Architecture Diagram

```mermaid
flowchart TD
    subgraph Shopify Ecosystem
        AdminUI[Shopify Admin App Bridge / Polaris UI]
        ShopifyGQL[Shopify Admin GraphQL API]
        ShopifyWH[Shopify Webhook Engine]
    end

    subgraph ClearStock Application Server (Remix / Node.js)
        RemixLoader[Remix Route Loaders & Actions]
        AuthHandler[Shopify App Authentication]
        MathEngine[Deterministic Replenishment Engine]
        PDFGen[PDF & CSV Export Engine]
        HealEngine[Self-Service Reconciliation Engine]
    end

    subgraph Async Processing & Database
        RedisQueue[(Redis / BullMQ Queue)]
        Worker[Background Worker Process]
        PostgreSQL[(PostgreSQL via Prisma ORM)]
    end

    AdminUI <--> RemixLoader
    AuthHandler <--> ShopifyGQL
    ShopifyWH -->|orders, inventory, products| RemixLoader
    RemixLoader -->|1. Instant 200 OK & Enqueue Job| RedisQueue
    RedisQueue --> Worker
    Worker -->|2. Check Idempotency & Write Aggregates| PostgreSQL

    RemixLoader --> MathEngine
    MathEngine <--> PostgreSQL
    MathEngine --> AdminUI

    AdminUI -->|Click 'Heal / Recalculate'| HealEngine
    HealEngine -->|Targeted 7-Day Query| ShopifyGQL
    HealEngine -->|Reconcile Aggregates| PostgreSQL

    RemixLoader -->|Receive PO: inventoryAdjustQuantities| ShopifyGQL
    RemixLoader --> PDFGen
```

### Technology Stack Matrix

* **Application Framework:** [Shopify App Template for Remix](https://shopify.dev/docs/apps/templates/remix) (Node.js >= 22, React 18, React Router 7 v7 engine).
* **Database & ORM:** PostgreSQL managed via [Prisma ORM](https://www.prisma.io/).
* **UI Design System:** `@shopify/polaris` (v12+) and `@shopify/app-bridge-react` (v4+) for pixel-perfect Shopify Admin integration.
* **Background Queues & Workers:** Redis with **BullMQ** for background webhook digestion, historical bulk imports, and nightly sales rollups.
* **Shopify API Version:** Admin GraphQL API (2025-01 or later).
* **Document Rendering:** `@react-pdf/renderer` or `pdfkit` for generating purchase orders.

---

### Shopify-First Sync Resilience (Avoiding the Multi-Channel Sync Trap)
Why did Inventory Planner's sync break for 21+ days? Because they attempt to act as the bi-directional master database for QuickBooks, Amazon, Xero, and Shopify simultaneously. When any third-party accounting schema updates, their entire pipeline freezes.

**ClearStock avoids this failure mode with four architectural pillars:**
1. **Shopify is the Single Source of Truth:** We never fight Shopify for state. Inventory quantities, catalog metadata, and sales originate in Shopify. We calculate replenishment recommendations and write back receipts via standard Shopify APIs.
2. **Instant Webhook Ingestion (`< 200ms`):** Routes never process order math synchronously. The route immediately returns `HTTP 200` to Shopify and pushes the event to BullMQ.
3. **Strict Idempotency Table:** Every webhook record is keyed by `X-Shopify-Webhook-Id`. If Shopify fires a duplicate webhook, it is detected and ignored.
4. **Self-Healing Architecture:** The merchant can manually recalibrate any time range with one click via the GraphQL Reconciliation Engine.

---

### Shopify Rate Limiting Strategy
Querying historical sales across all products via standard GraphQL queries during a page load will immediately trigger Shopify `429 Too Many Requests` errors or consume standard GraphQL bucket points (maximum 1,000 points/sec).

ClearStock bypasses this constraint:
1. **Zero Runtime Order Queries:** The replenishment screen *never* queries Shopify order endpoints at render time.
2. **Local Aggregate Ledger:** Daily sales are summarized inside PostgreSQL (`DailySalesAggregator`). Evaluating 90-day ADS across 1,000 SKUs executes as a single SQL `SUM()` query with an index on `[variantId, date]`.
3. **Targeted Mutations Only:** Outbound Shopify API calls are limited to app installation (`bulkOperationRunQuery`), on-demand healing, and PO fulfillment receiving (`inventoryAdjustQuantities`).

---

## 4. Database Schema (Prisma ORM)

### Schema Definition (`schema.prisma`)

Replace or extend `/prisma/schema.prisma` with the following production-ready PostgreSQL model structure:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ---------------------------------------------------------
// 1. Shopify Session Storage
// ---------------------------------------------------------
model Session {
  id                  String    @id
  shop                String
  state               String
  isOnline            Boolean   @default(false)
  scope               String?
  expires             DateTime?
  accessToken         String
  userId              BigInt?
  firstName           String?
  lastName            String?
  email               String?
  accountOwner        Boolean   @default(false)
  locale              String?
  collaborator        Boolean?  @default(false)
  emailVerified       Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([shop])
}

// ---------------------------------------------------------
// 2. Vendor Management
// ---------------------------------------------------------
model Supplier {
  id              String                @id @default(uuid())
  shop            String
  name            String
  contactName     String?
  email           String?
  phone           String?
  defaultLeadTime Int                   @default(14) // Lead time in days
  currency        String                @default("USD")
  notes           String?
  rules           VariantSupplierRule[]
  purchaseOrders  PurchaseOrder[]
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([shop])
}

// ---------------------------------------------------------
// 3. Variant Supplier Constraints & Replenishment Rules
// ---------------------------------------------------------
model VariantSupplierRule {
  id                 String   @id @default(uuid())
  shop               String
  variantId          String   // Shopify GID: gid://shopify/ProductVariant/XXXXX
  inventoryItemId    String?  // Shopify GID: gid://shopify/InventoryItem/XXXXX (Needed for inventory adjustments)
  productId          String   // Shopify GID: gid://shopify/Product/XXXXX
  supplierId         String
  supplier           Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  supplierSku        String?
  unitCost           Decimal  @default(0.00) @db.Decimal(12, 2)
  leadTimeDays       Int?     // Overrides Supplier default if provided
  minOrderQty        Int      @default(1)  // MOQ
  packSize           Int      @default(1)  // Multiples to round up to (e.g., 12)
  safetyStockDays    Int      @default(7)  // Coverage target in days
  safetyStockMinimum Int      @default(0)  // Hard unit floor
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([shop, variantId])
  @@index([shop, variantId])
  @@index([supplierId])
  @@index([inventoryItemId])
}

// ---------------------------------------------------------
// 4. Purchase Orders (PO)
// ---------------------------------------------------------
enum PurchaseOrderStatus {
  DRAFT
  ORDERED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
}

model PurchaseOrder {
  id              String              @id @default(uuid())
  shop            String
  poNumber        String              // Human-readable sequential ID (e.g., PO-1001)
  supplierId      String
  supplier        Supplier            @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  status          PurchaseOrderStatus @default(DRAFT)
  expectedArrival DateTime?
  notes           String?
  items           PurchaseOrderItem[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([shop, poNumber])
  @@index([shop, status])
  @@index([supplierId])
}

model PurchaseOrderItem {
  id               String        @id @default(uuid())
  purchaseOrderId  String
  purchaseOrder    PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  variantId        String        // Shopify GID: gid://shopify/ProductVariant/XXXXX
  inventoryItemId  String?       // Shopify GID: gid://shopify/InventoryItem/XXXXX (For receiving mutation)
  sku              String?
  title            String
  quantityOrdered  Int
  quantityReceived Int           @default(0)
  unitCost         Decimal       @db.Decimal(12, 2)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([purchaseOrderId])
  @@index([variantId])
  @@index([inventoryItemId])
}

// ---------------------------------------------------------
// 5. Daily Sales Aggregations (Sub-Second Math Cache)
// ---------------------------------------------------------
model DailySalesAggregator {
  id        String   @id @default(uuid())
  shop      String
  variantId String   // Shopify GID: gid://shopify/ProductVariant/XXXXX
  date      DateTime @db.Date // Stored as midnight UTC date
  unitsSold Int      @default(0)

  @@unique([shop, variantId, date])
  @@index([shop, variantId, date])
  @@index([shop, date])
}

// ---------------------------------------------------------
// 6. Webhook Idempotency Ledger (Prevents Double Counting)
// ---------------------------------------------------------
model ProcessedWebhook {
  id        String   @id // Stores the X-Shopify-Webhook-Id header
  shop      String
  topic     String
  orderId   String?  // Shopify Order GID or numeric ID if applicable
  createdAt DateTime @default(now())

  @@index([shop, topic])
}

// ---------------------------------------------------------
// 7. Bulk Ingestion & Reconciliation Tracker
// ---------------------------------------------------------
enum SyncStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model HistoricalSyncJob {
  id               String     @id @default(uuid())
  shop             String
  bulkOperationId   String?
  status           SyncStatus @default(PENDING)
  totalDays        Int        @default(90)
  errorMessage     String?
  lastReconciledAt DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  @@index([shop])
}
```

### Model Breakdown & Indexing Strategy
* **`DailySalesAggregator`:** Uses a composite unique constraint `[shop, variantId, date]`. Calculating ADS for any SKU over a selected date range executes with index scans:
  ```sql
  SELECT SUM("unitsSold") 
  FROM "DailySalesAggregator" 
  WHERE "shop" = :shop 
    AND "variantId" = :variantId 
    AND "date" >= NOW() - INTERVAL '30 days';
  ```
* **`ProcessedWebhook`:** Guarantees absolute deduplication. Before processing an `orders/create` or `orders/updated` job, the worker checks if `ProcessedWebhook.findUnique({ where: { id: webhookId } })` exists. If yes, it aborts immediately.
* **`inventoryItemId` in Rules and Line Items:** Eliminates runtime resolution queries when executing PO receiving.

---

## 5. Webhook & Queue Configuration Checklist

### Required OAuth Scopes
Configure these scopes inside `shopify.app.toml`:
```toml
[access_scopes]
scopes = "read_orders,read_products,write_products,read_inventory,write_inventory"
```

* `read_orders`: Required to backfill and ingest order line items to calculate ADS.
* `read_products`, `write_products`: Read SKU, barcode, title, and query `inventoryItem` GIDs.
* `read_inventory`, `write_inventory`: Ingest live on-hand counts and adjust stock upon PO receiving via `inventoryAdjustQuantities`.

### Webhook Subscriptions
Ensure the following webhooks are declared in `shopify.app.toml` or registered dynamically via Remix `afterAuth`:

| Webhook Topic | Target URI | Payload Purpose & Filtering Rule |
| :--- | :--- | :--- |
| `orders/create` | `/webhooks/orders/create` | Increment units in `DailySalesAggregator`. **Rule:** Only aggregate if `financial_status == 'paid'` and order is not cancelled. |
| `orders/updated` | `/webhooks/orders/updated` | Reconcile cancellations, refunds, or financial status changes. |
| `inventory_levels/update` | `/webhooks/inventory/update` | Synchronize stock-on-hand changes from external channels/POS. |
| `products/update` | `/webhooks/products/update` | Synchronize variant title, SKU, and maintain `variantId` $\leftrightarrow$ `inventoryItemId` mapping. |
| `app/uninstalled` | `/webhooks/app/uninstalled` | Clean up sessions and pause scheduled worker tasks. |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Refresh and re-authenticate scopes if requirements change. |

### Worker Processing & Bulletproof Idempotency
1. **Immediate HTTP Response:** Route responds with `HTTP 200 OK` in `< 200ms`, dropping the payload directly into Redis.
2. **Idempotency Verification:** Worker checks `ProcessedWebhook` table using `X-Shopify-Webhook-Id`. If already seen, the job completes with no action.
3. **Atomic Upsert:** Updates to `DailySalesAggregator` execute via atomic SQL upsert (`ON CONFLICT (shop, "variantId", date) DO UPDATE SET "unitsSold" = "unitsSold" + :delta`).

---

## 6. Local Development Setup

### Prerequisites
* **Node.js:** `v22.12.0` or higher (per `engines` field in `package.json`).
* **Package Manager:** `npm` or `pnpm`.
* **Database:** Running instance of **PostgreSQL** (v15+ recommended).
* **Redis:** Running instance of **Redis** (v7+ for queue management).
* **Shopify CLI:** Installed globally or run via `npx @shopify/cli`.
* **Shopify Partner Account:** With a development store containing sample products and test orders.

---

### Environment Variables (`.env`)
Create a `.env` file in the root directory:

```bash
# Shopify Credentials (Auto-populated by Shopify CLI during link)
SHOPIFY_API_KEY="your-shopify-api-key"
SHOPIFY_API_SECRET="your-shopify-api-secret"
SCOPES="read_orders,read_products,write_products,read_inventory,write_inventory"

# Database Configuration (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clearstock_dev?schema=public"

# Redis & Background Workers
REDIS_URL="redis://127.0.0.1:6379"

# Application Settings
NODE_ENV="development"
PORT=3000
```

---

### Installation & Database Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Database Schema:**
   Ensure PostgreSQL is running locally and the database exists:
   ```bash
   createdb clearstock_dev
   ```

3. **Run Prisma Migrations:**
   ```bash
   npm run prisma migrate dev --name init_clearstock_schema
   npm run prisma generate
   ```

---

### Running the App & Background Workers

1. **Start Redis Server:**
   ```bash
   redis-server
   ```

2. **Start the Background Queue Worker:**
   In a separate terminal window, start the BullMQ consumer:
   ```bash
   npm run worker:dev
   ```
   *(Ensure your `package.json` contains a script executing `tsx ./app/workers/index.ts`)*

3. **Start the Shopify Development Server:**
   ```bash
   npm run dev
   ```

---

### Tunneling (Cloudflare / ngrok)
Shopify requires HTTPS tunnels for local development:
* **Default (Cloudflare):** `npm run dev` automatically creates a managed Cloudflare tunnel via the Shopify CLI.
* **Alternative (ngrok):** If your network restricts Cloudflare tunnels, run:
  ```bash
  npm run dev -- --tunnel-url https://your-ngrok-subdomain.ngrok-free.app:3000
  ```

---

## 7. Shopify GraphQL Reference Patterns

### Initial Historical Sync (`bulkOperationRunQuery`)
On first install, trigger this mutation dynamically with calculated date ranges (e.g., 90 or 180 days prior) and filter strictly for valid `paid` orders:

```typescript
// Helper to construct dynamic bulk query in Remix action/worker
export function buildHistoricalBulkOperationQuery(daysToBackfill = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToBackfill);
  const formattedDate = cutoffDate.toISOString().split("T")[0]; // "YYYY-MM-DD"

  return `
    mutation CreateHistoricalOrdersBulkOperation {
      bulkOperationRunQuery(
        query: """
        {
          orders(query: "created_at:>='${formattedDate}' financial_status:paid status:open,closed") {
            edges {
              node {
                id
                createdAt
                lineItems {
                  edges {
                    node {
                      variant {
                        id
                      }
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
        """
      ) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
}
```

---

### On-Demand Self-Service Healing Query
Triggered when a merchant clicks the **"Recalculate Recent Sales"** button to self-heal any sync discrepancies for the last $N$ days without contacting support:

```typescript
export async function reconcileRecentSales(admin: any, shop: string, days = 14) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const formattedDate = cutoffDate.toISOString().split("T")[0];

  const response = await admin.graphql(`
    #graphql
    query FetchRecentOrders($query: String!) {
      orders(first: 250, query: $query) {
        edges {
          node {
            id
            createdAt
            lineItems(first: 50) {
              edges {
                node {
                  variant {
                    id
                  }
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `, {
    variables: {
      query: `created_at:>='${formattedDate}' financial_status:paid status:open,closed`
    }
  });

  const data = await response.json();
  // Worker rapidly compares and overwrites DailySalesAggregator rows for the date window
  return data;
}
```

---

### Stock Receiving Mutation (`inventoryAdjustQuantities`)
When receiving a Purchase Order in ClearStock, fire the official mutation to immediately update inventory at the primary warehouse location:

```graphql
mutation AdjustInventoryOnReceiving($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    userErrors {
      field
      message
    }
    inventoryAdjustmentGroup {
      createdAt
      reason
      changes {
        name
        delta
        quantityAfterChange
        item {
          id
          sku
        }
        location {
          id
          name
        }
      }
    }
  }
}
```

#### Example Variables Payload:
```json
{
  "input": {
    "reason": "purchase_order",
    "name": "available",
    "referenceDocumentUri": "clearstock://po/PO-1002",
    "changes": [
      {
        "inventoryItemId": "gid://shopify/InventoryItem/89481928312",
        "locationId": "gid://shopify/Location/1298491823",
        "delta": 24
      }
    ]
  }
}
```

---

## 8. Implementation Nuances & Technical "Gotchas"

Keep these 4 crucial technical nuances in mind when writing code and implementing workers:

### 1. Variant GID vs. InventoryItem GID Mapping
* **The Nuance:** Replenishment metrics and ADS are tracked per `variantId` (`gid://shopify/ProductVariant/123`), but Shopify's `inventoryAdjustQuantities` mutation exclusively accepts `inventoryItemId` (`gid://shopify/InventoryItem/456`).
* **Implementation Rule:** 
  - When storing `VariantSupplierRule` or generating `PurchaseOrderItem`s, store both `variantId` and `inventoryItemId`.
  - When syncing products via GraphQL, extract the nested inventory item ID:
    ```graphql
    productVariant {
      id
      inventoryItem {
        id
      }
    }
    ```
  - This eliminates extra Shopify API calls at the moment a merchant receives a Purchase Order.

### 2. Dynamic Date Filtering in Historical Bulk Query
* **The Nuance:** Hardcoded query strings (e.g., `created_at:>='2026-01-01'`) will pull progressively larger datasets as time goes on, causing slow initial syncs or hitting bulk operation memory limits.
* **Implementation Rule:** Always dynamically calculate the ISO date string:
  ```typescript
  const msIn90Days = 90 * 24 * 60 * 60 * 1000;
  const dateOffset = new Date(Date.now() - msIn90Days).toISOString().split('T')[0];
  const query = `created_at:>='${dateOffset}' financial_status:paid status:open,closed`;
  ```

### 3. Order Webhook Sanitization & Payment/Fraud Filtering
* **The Nuance:** `orders/create` fires for unpaid, pending, high-risk fraudulent, and pre-authorized orders. Aggregating all orders naively will artificially inflate Average Daily Sales (ADS), causing merchants to over-order.
* **Implementation Rule:** In your webhook queue worker, filter events before writing to `DailySalesAggregator`:
  ```typescript
  // app/workers/orderSync.worker.ts
  if (order.cancelled_at !== null) return;
  if (order.financial_status !== "paid" && order.financial_status !== "partially_paid") return;
  // Proceed with aggregating units
  ```
  Additionally, listen to `orders/updated` to decrement units if an order is cancelled or refunded within the rolling ADS window.

### 4. Node.js BigInt Serialization in Remix Loaders
* **The Nuance:** The Prisma session model uses `BigInt` for `userId` (required by `@shopify/shopify-app-session-storage-prisma`). JavaScript's native `JSON.stringify()` throws a `TypeError: Do not know how to serialize a BigInt` when returning data from Remix loaders.
* **Implementation Rule:** Add a global BigInt JSON serializer in `entry.server.tsx` or use `superjson`:
  ```typescript
  // app/entry.server.tsx (or top of server startup)
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  ```
  Or explicitly map/omit `userId` when querying sessions in your application loaders.

---

## Summary Checklist for Developers

- [ ] Check out repository and verify Node `>=22.12.0`.
- [ ] Ensure local PostgreSQL and Redis servers are running.
- [ ] Copy `.env.example` to `.env` and verify `DATABASE_URL` matches your local Postgres instance.
- [ ] Run `npx prisma migrate dev` to establish the database schema (including `ProcessedWebhook`).
- [ ] Implement the `BigInt.prototype.toJSON` polyfill in `entry.server.tsx`.
- [ ] Ensure product sync populates both `variantId` and `inventoryItemId`.
- [ ] Implement the **"Heal Data"** (Recalculate Recent Sales) endpoint and button in your dashboard route.
- [ ] Launch `npm run dev` and select your target development store.
- [ ] Verify test orders populate `DailySalesAggregator` through the webhook queue (confirming `paid` status filtering and idempotency).
- [ ] Open the replenishment dashboard and click **"Show The Math"** on any item to verify calculations!
