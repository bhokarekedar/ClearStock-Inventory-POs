# ClearStock Inventory & POs

> **Tagline:** Transparent stock forecasting and purchase order workflows.  
> **Philosophy:** The anti-AI inventory manager — 100% deterministic, explainable, and math-driven.

---

## Table of Contents

1. [App Overview & Core Philosophy ("The Why")](#1-app-overview--core-philosophy-the-why)
   - [Market Problem & Opportunity](#market-problem--opportunity)
   - [Target Audience](#target-audience)
   - [The "Show The Math" Principle](#the-show-the-math-principle)
2. [Key Features & Specifications ("The What")](#2-key-features--specifications-the-what)
   - [1. Data Ingestion & Resilient Syncing](#1-data-ingestion--resilient-syncing)
   - [2. Deterministic Replenishment Engine](#2-deterministic-replenishment-engine)
   - [3. Supplier Constraints & Rule Optimization](#3-supplier-constraints--rule-optimization)
   - [4. Purchase Order (PO) Lifecycle & Receiving](#4-purchase-order-po-lifecycle--receiving)
   - [MVP Scope Boundaries (In-Scope vs. Out-of-Scope)](#mvp-scope-boundaries-in-scope-vs-out-of-scope)
3. [System Architecture & Tech Stack](#3-system-architecture--tech-stack)
   - [Architecture Diagram](#architecture-diagram)
   - [Technology Stack Matrix](#technology-stack-matrix)
   - [Shopify Rate Limiting Strategy](#shopify-rate-limiting-strategy)
4. [Database Schema (Prisma ORM)](#4-database-schema-prisma-orm)
   - [Schema Definition (`schema.prisma`)](#schema-definition-schemaprisma)
   - [Model Breakdown & Indexing Strategy](#model-breakdown--indexing-strategy)
5. [Webhook & Queue Configuration Checklist](#5-webhook--queue-configuration-checklist)
   - [Required OAuth Scopes](#required-oauth-scopes)
   - [Webhook Subscriptions](#webhook-subscriptions)
   - [Worker Processing & Idempotency](#worker-processing--idempotency)
6. [Local Development Setup](#6-local-development-setup)
   - [Prerequisites](#prerequisites)
   - [Environment Variables (`.env`)](#environment-variables-env)
   - [Installation & Database Setup](#installation--database-setup)
   - [Running the App & Background Workers](#running-the-app--background-workers)
   - [Tunneling (Cloudflare / ngrok)](#tunneling-cloudflare--ngrok)
7. [Shopify GraphQL Reference Patterns](#7-shopify-graphql-reference-patterns)
   - [Initial Historical Sync (`bulkOperationRunQuery`)](#initial-historical-sync-bulkoperationrunquery)
   - [Stock Receiving Mutation (`inventoryAdjustQuantities`)](#stock-receiving-mutation-inventoryadjustquantities)

---

## 1. App Overview & Core Philosophy ("The Why")

### Market Problem & Opportunity
Small-to-midsize Shopify merchants face an acute inventory management crisis:
1. **The Deprecation of Shopify Stocky:** Thousands of merchants built their ordering habits around Stocky, which is being retired or restricted.
2. **The "Black Box AI" Trap:** Modern replenishment software (e.g., Inventory Planner by Sage) has pivoted heavily toward complex machine learning algorithms, opaque neural-network predictions, and exorbitant monthly fees ($300–$1,000+/mo).
3. **Loss of Merchant Trust:** When an "AI" engine advises a merchant to purchase 850 units of a seasonal SKU without detailing *why*, merchants hesitate. When the forecast fails, they suffer stockouts or warehouse bloat with dead stock.

### Target Audience
- Direct-to-Consumer (DTC) and omnichannel merchants doing **$500K to $15M GMV** on Shopify.
- Merchants with 50 to 5,000 active SKUs and physical supplier lead times between 7 and 90 days.
- Former Stocky power users demanding speed, simplicity, and predictable purchase order generation.
- Operators who prefer clear statistical heuristics and verifiable math over "predictive AI".

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
  - `orders/create` & `orders/updated`: Streams sales into the local store.
  - `inventory_levels/update`: Keeps available stock in sync with live warehouse counts.
  - `products/create`, `products/update`, `products/delete`: Synchronizes variant IDs, titles, SKUs, and barcodes.
* **Pre-Aggregated Sales Table:** Instead of recalculating sales across millions of orders on the fly, events are aggregated into a daily ledger (`DailySalesAggregator`). Dashboard queries run in **< 150ms** locally.

### 2. Deterministic Replenishment Engine
* **Selectable Rolling Windows:** Merchants can toggle between **7, 14, 30, or 90-day** rolling windows for Average Daily Sales (ADS).
* **Configurable Safety Stock:**
  - *Option A:* Fixed Days of Safety Stock (e.g., 14 days of coverage).
  - *Option B:* Fixed Unit Floor (e.g., maintain at least 25 units).
* **"Show The Math" Inspection Modal:**
  - Interactive Polaris modal displaying:
    - Total units sold in the selected window.
    - Active daily sales rate: $\text{Units Sold} / \text{Window Days}$.
    - Effective supplier lead time in days.
    - Safety stock buffer calculation.
    - Available stock vs. incoming purchase orders.
    - Final rounding applied due to MOQ or box case sizes.

### 3. Supplier Constraints & Rule Optimization
* **Vendor Master Catalog:** Manage vendors with default contacts, currency, payment terms, and baseline lead times.
* **Per-Variant Sourcing Rules (`VariantSupplierRule`):**
  - **Supplier SKU:** Match vendor-specific part numbers.
  - **Unit Cost:** Track purchase unit cost for margin and PO valuation.
  - **Lead Time (Days):** Specific production + transit time for this variant.
  - **Minimum Order Quantity (MOQ):** Supplier's minimum threshold.
  - **Pack Size (Case Pack / Inner Pack):** Forces calculations to round up to the nearest valid container multiple (e.g., box of 12 or master carton of 48).

### 4. Purchase Order (PO) Lifecycle & Receiving
* **One-Click Draft Generation:** Automatically convert all SKUs below their reorder point into a grouped Draft PO per supplier.
* **Spreadsheet-Style Interactive Editor:**
  - Fast inline keyboard navigation to adjust order quantities.
  - Live subtotal, weight/unit totals, and variance indicators.
* **Export & Sharing:** Clean PDF generation (printable purchase order) and CSV export formatted for supplier ingestion.
* **Partial & Full Receiving Workflow:**
  - Mark line items as partially received or fully received.
  - Directly commits additions to Shopify using the `inventoryAdjustQuantities` GraphQL mutation with clear audit reference strings.

---

### MVP Scope Boundaries (In-Scope vs. Out-of-Scope)

To guarantee high velocity, operational stability, and sub-second performance, the MVP maintains strict architectural boundaries:

| Feature Dimension | In-Scope (MVP) | Out-of-Scope (Post-MVP / Roadmap) | Rationale |
| :--- | :--- | :--- | :--- |
| **Locations** | Single Primary Location (Shopify primary location) | Multi-location cross-docking & store rebalancing | Multi-location transfers introduce complex graph routing and stock allocation logic. |
| **Product Structure** | Standard Single & Multi-Variant SKUs | Bundles, Assemblies, Kits, and Bill of Materials (BOM) | BOM requires recursive explosion and component-level tracking. |
| **Forecasting Logic** | Deterministic rolling-window ADS + Lead Time math | Prophet, ARIMA, Machine Learning, Seasonal AI curves | Contradicts the "anti-AI", explainable core value proposition. |
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
    end

    subgraph Async Processing & Database
        RedisQueue[(Redis / BullMQ Queue)]
        Worker[Background Worker Process]
        PostgreSQL[(PostgreSQL via Prisma ORM)]
    end

    AdminUI <--> RemixLoader
    AuthHandler <--> ShopifyGQL
    ShopifyWH -->|orders, inventory, products| RemixLoader
    RemixLoader -->|Enqueue Webhook Job| RedisQueue
    RedisQueue --> Worker
    Worker -->|Write Aggregated Sales & Stock| PostgreSQL

    RemixLoader --> MathEngine
    MathEngine <--> PostgreSQL
    MathEngine --> AdminUI

    RemixLoader -->|Receive PO: inventoryAdjustQuantities| ShopifyGQL
    RemixLoader --> PDFGen
```

### Technology Stack Matrix

* **Application Framework:** [Shopify App Template for Remix](https://shopify.dev/docs/apps/templates/remix) (Node.js >= 22, React 18, React Router 7 v7 engine).
* **Database & ORM:** PostgreSQL managed via [Prisma ORM](https://www.prisma.io/).
* **UI Design System:** `@shopify/polaris` (v12+) and `@shopify/app-bridge-react` (v4+) for pixel-perfect Shopify Admin integration.
* **Background Queues & Workers:** Redis with **BullMQ** (or Inngest) for background webhook digestion, historical bulk imports, and nightly sales rollups.
* **Shopify API Version:** Admin GraphQL API (2025-01 or later).
* **Document Rendering:** `@react-pdf/renderer` or `pdfkit` for generating purchase orders.

### Shopify Rate Limiting Strategy
Querying historical sales across all products via standard GraphQL queries during a page load will immediately trigger Shopify `429 Too Many Requests` errors or consume standard GraphQL bucket points (maximum 1,000 points/sec).

ClearStock bypasses this constraint:
1. **Zero Runtime Order Queries:** The replenishment screen *never* queries Shopify order endpoints at render time.
2. **Local Aggregate Ledger:** Daily sales are summarized inside PostgreSQL (`DailySalesAggregator`). Evaluating 90-day ADS across 1,000 SKUs executes as a single SQL `SUM()` query with an index on `[variantId, date]`.
3. **Targeted Mutations Only:** Outbound Shopify API calls are limited to app installation (`bulkOperationRunQuery`) and PO fulfillment receiving (`inventoryAdjustQuantities`).

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
  id              String        @id @default(uuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  variantId       String        // Shopify GID
  sku             String?
  title           String
  quantityOrdered Int
  quantityReceived Int          @default(0)
  unitCost        Decimal       @db.Decimal(12, 2)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@index([purchaseOrderId])
  @@index([variantId])
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
// 6. Bulk Ingestion Tracker
// ---------------------------------------------------------
enum SyncStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model HistoricalSyncJob {
  id             String     @id @default(uuid())
  shop           String
  bulkOperationId String?
  status         SyncStatus @default(PENDING)
  totalDays      Int        @default(90)
  errorMessage   String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

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
* **`VariantSupplierRule`:** Contains unique constraints per variant to prevent duplicate supplier mappings for the single-location MVP.
* **`PurchaseOrder` & `PurchaseOrderItem`:** Preserves an exact ledger of historical costs and received unit counts independent of live Shopify product price edits.

---

## 5. Webhook & Queue Configuration Checklist

### Required OAuth Scopes
Configure these scopes inside `shopify.app.toml`:
```toml
[access_scopes]
scopes = "read_orders,read_products,write_products,read_inventory,write_inventory"
```

* `read_orders`: Required to backfill and ingest order line items to calculate ADS.
* `read_products`, `write_products`: Read SKU, barcode, title; store configuration metafields if needed.
* `read_inventory`, `write_inventory`: Ingest live on-hand counts and adjust stock upon PO receiving via `inventoryAdjustQuantities`.

### Webhook Subscriptions
Ensure the following webhooks are declared in `shopify.app.toml` or registered dynamically via Remix `afterAuth`:

| Webhook Topic | Target URI | Payload Purpose |
| :--- | :--- | :--- |
| `orders/create` | `/webhooks/orders/create` | Increment units in `DailySalesAggregator` for current date. |
| `orders/updated` | `/webhooks/orders/updated` | Handle order cancellations, line item edits, or returns. |
| `inventory_levels/update` | `/webhooks/inventory/update` | Synchronize stock-on-hand changes from external channels/POS. |
| `products/update` | `/webhooks/products/update` | Synchronize variant title, SKU, or status changes. |
| `app/uninstalled` | `/webhooks/app/uninstalled` | Clean up sessions and pause scheduled worker tasks. |
| `app/scopes_update` | `/webhooks/app/scopes_update` | Refresh and re-authenticate scopes if requirements change. |

### Worker Processing & Idempotency
1. **Fast Webhook Acknowledgment:** Webhook endpoints must respond with HTTP `200 OK` in **< 2000ms** to avoid Shopify retries. Endpoints simply push the raw payload to BullMQ / Redis.
2. **Idempotency Header:** Use the Shopify-provided header `X-Shopify-Webhook-Id` as the job ID in Redis to automatically deduplicate re-delivered webhooks.
3. **Queue Failure Strategy:** Retry failed jobs up to 3 times with exponential backoff before sending them to a Dead Letter Queue (DLQ).

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
On first install, trigger this mutation to extract historical orders for the past 90 days without exhausting GraphQL rate limits:

```graphql
mutation CreateHistoricalOrdersBulkOperation {
  bulkOperationRunQuery(
    query: """
    {
      orders(query: "created_at:>='2026-01-01' status:open,closed") {
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
```

When the bulk operation webhook (`bulk_operations/finish`) fires, stream the `.jsonl` result file into the worker to populate `DailySalesAggregator`.

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

## Summary Checklist for Developers

- [ ] Check out repository and verify Node `>=22.12.0`.
- [ ] Ensure local PostgreSQL and Redis servers are running.
- [ ] Copy `.env.example` to `.env` and verify `DATABASE_URL` matches your local Postgres instance.
- [ ] Run `npx prisma migrate dev` to establish the database schema.
- [ ] Launch `npm run dev` and select your target development store.
- [ ] Verify test orders populate `DailySalesAggregator` through the webhook queue.
- [ ] Open the replenishment dashboard and click **"Show The Math"** on any item to verify calculations!
