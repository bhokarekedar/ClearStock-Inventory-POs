import { useState, useEffect } from "react";

interface ClearStockGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "math" | "pos" | "sync" | "faqs";
}

export function ClearStockGuideModal({
  isOpen,
  onClose,
  defaultTab = "math",
}: ClearStockGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"math" | "pos" | "sync" | "faqs">(defaultTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close guide backdrop"
        tabIndex={-1}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.55)",
          backdropFilter: "blur(3px)",
          border: "none",
          margin: 0,
          padding: 0,
          cursor: "default",
        }}
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clearstock-guide-modal-title"
        style={{
          position: "relative",
          zIndex: 10000,
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "720px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e1e3e5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>📖</span>
            <div>
              <h2
                id="clearstock-guide-modal-title"
                style={{ fontSize: "18px", fontWeight: "700", color: "#202223", margin: 0 }}
              >
                ClearStock Playbook & Technical Guide
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6d7175" }}>
                How replenishment formulas, live Shopify syncing, and automated POs keep your store stock-outs at 0%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "#f1f2f3",
              border: "1px solid #d2d5d8",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              color: "#5c5f62",
              padding: "6px 12px",
              borderRadius: "8px",
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e1e3e5",
            padding: "0 16px",
            backgroundColor: "#ffffff",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("math")}
            style={{
              padding: "12px 14px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "math" ? "600" : "500",
              color: activeTab === "math" ? "#008060" : "#5c5f62",
              borderBottom: activeTab === "math" ? "2px solid #008060" : "2px solid transparent",
            }}
          >
            🧮 Replenishment Math
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pos")}
            style={{
              padding: "12px 14px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "pos" ? "600" : "500",
              color: activeTab === "pos" ? "#008060" : "#5c5f62",
              borderBottom: activeTab === "pos" ? "2px solid #008060" : "2px solid transparent",
            }}
          >
            📦 Purchase Orders & Double-Order Guard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sync")}
            style={{
              padding: "12px 14px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "sync" ? "600" : "500",
              color: activeTab === "sync" ? "#008060" : "#5c5f62",
              borderBottom: activeTab === "sync" ? "2px solid #008060" : "2px solid transparent",
            }}
          >
            ⚡ Live Shopify Sync & Truth
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("faqs")}
            style={{
              padding: "12px 14px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "faqs" ? "600" : "500",
              color: activeTab === "faqs" ? "#008060" : "#5c5f62",
              borderBottom: activeTab === "faqs" ? "2px solid #008060" : "2px solid transparent",
            }}
          >
            💡 Pro-Tips & Rules
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* TAB 1: MATH */}
          {activeTab === "math" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "700", color: "#166534" }}>
                  🎯 The Complete Replenishment Formula (Min-Max System)
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#15803d", lineHeight: "1.5" }}>
                  ClearStock uses an industry-standard <strong>Min-Max (ROP + Target Level)</strong> model. The Reorder Point is your safety floor (when to order), and the Target Stock Level is your ceiling (how much to order so you don&apos;t run out right after delivery).
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>1. Sales Velocity</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Average Daily Sales (ADS)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    ADS = Total Units Sold (N days) / N
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Select between 7, 14, 30, or 90-day lookback windows. Short windows capture viral spikes; longer windows smooth out seasonality.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>2. Buffer Coverage</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Safety Stock Units</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Safety = Max(ADS × Safety Days, Floor Min)
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Protects against supplier shipping delays and sudden demand surges.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>3. Order Trigger Floor</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Reorder Point (ROP)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    ROP = (ADS × Lead Time Days) + Safety Stock
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    When available stock (OnHand + Inbound) reaches ROP, it triggers a reorder so goods arrive before safety stock is touched.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>4. Order Cycle Coverage</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Cycle Stock</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Cycle Stock = ADS × Reorder Frequency Days (e.g. 30d)
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    The volume of inventory you plan to sell between recurring purchase orders.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>5. Replenishment Ceiling</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Target Stock Level (Max)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Target Level = ROP + Cycle Stock
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Your ideal inventory peak right after a delivery arrives at your warehouse.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>6. Purchase Quantity</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>Recommended Order Qty</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Qty = Target Level - (OnHand + OnOrder) (when Stock &le; ROP)
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    <strong>Strict ROP Gate:</strong> Only triggers when available stock hits or drops below the ROP floor. Orders up to Target Level, rounded up to MOQ & Case Pack multiples. If stock &gt; ROP, Qty = 0.
                  </p>
                </div>
              </div>

              {/* Status Definitions Table */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e1e3e5",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223", marginBottom: "10px" }}>
                  🏷️ How ClearStock Classifies Every SKU:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", lineHeight: "1.5" }}>
                  <div>
                    <span style={{ fontWeight: "700", color: "#d72c0d" }}>⚠️ Reorder Now:</span>{" "}
                    <code>OnHand + OnOrder &le; ROP</code>. Stock has fallen to or below the safety floor. Place a PO immediately.
                  </div>
                  <div>
                    <span style={{ fontWeight: "700", color: "#006e52" }}>🚚 Incoming:</span>{" "}
                    <code>OnHand &le; ROP</code> but <code>OnHand + OnOrder &gt; ROP</code>. Shelves are low, but incoming POs cover the deficit.
                  </div>
                  <div>
                    <span style={{ fontWeight: "700", color: "#108043" }}>🟢 Stock OK:</span>{" "}
                    <code>Total Stock &gt; ROP</code> and <code>OnHand &le; Target Level × 1.15</code>. Balanced inventory.
                  </div>
                  <div>
                    <span style={{ fontWeight: "700", color: "#b98900" }}>📦 Overstocked:</span>{" "}
                    <code>OnHand &gt; Target Level + 15%</code>. Holding more stock than your target ceiling (+15% tolerance buffer), which ties up working capital. <em>Note: Dead capital is calculated on all units held above your optimal Target Stock Level.</em>
                  </div>
                </div>
              </div>

              {/* Plain English Real-World Example */}
              <div
                style={{
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#1e40af", marginBottom: "6px" }}>
                  ☕ Simple Real-World Example (Plain English):
                </div>
                <div style={{ fontSize: "13px", color: "#1d4ed8", lineHeight: "1.6" }}>
                  • You sell <strong>10 shirts/day</strong> (Sales Velocity = 10).<br />
                  • Your manufacturer takes <strong>14 days</strong> to deliver (Lead Time Demand = 140 shirts).<br />
                  • You keep a <strong>7-day safety buffer</strong> (Safety Stock = 70 shirts).<br />
                  • <strong>Reorder Point (Floor) = 210 shirts</strong> (140 lead time + 70 safety buffer).<br />
                  • You place POs every <strong>30 days</strong> (Cycle Stock = 300 shirts).<br />
                  • <strong>Target Stock Level (Ceiling) = 510 shirts</strong> (210 ROP + 300 Cycle Stock).<br />
                  • If your stock on hand is <strong>180 shirts</strong>, ClearStock tells you to order <strong>330 shirts</strong> (510 Target &minus; 180 OnHand).<br />
                  • When the order arrives, your inventory hits exactly 510 shirts and will smoothly last until the next cycle without running dry!
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: POs & GUARD */}
          {activeTab === "pos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "700", color: "#1e40af" }}>
                  🛡️ Eliminating Costly Duplicate Reorders
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#1d4ed8", lineHeight: "1.5" }}>
                  A common failure in inventory spreadsheets is re-ordering an item while a purchase order is already en route from your manufacturer.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    1. Stock on Order Awareness
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Whenever a Purchase Order is moved to <span style={{ fontWeight: "600", color: "#008060" }}>ORDERED</span> or <span style={{ fontWeight: "600", color: "#b98900" }}>PARTIALLY_RECEIVED</span>, ClearStock adds the incoming units to <code>Stock On Order</code>. This immediately satisfies the Reorder Point, preventing double purchases.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    2. One-Click Inbound Receiving & Shopify Sync
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    When goods arrive at your warehouse, click <strong>Receive Items</strong> inside the PO. ClearStock performs an atomic Shopify GraphQL <code>inventoryAdjustQuantities</code> mutation to update your live Shopify store stock instantaneously!
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    3. Supplier Minimum Order Quantities (MOQ) & Case Packs
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Suppliers often enforce minimum production runs or ship in pallet master cartons. ClearStock enforces your MOQ and mathematically rounds up to the exact pack multiple so orders are accepted without manual back-and-forth.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REAL-TIME SYNC */}
          {activeTab === "sync" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  backgroundColor: "#faf5ff",
                  border: "1px solid #e9d5ff",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "700", color: "#6b21a8" }}>
                  ⚡ Shopify is the Single Source of Truth
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#7e22ce", lineHeight: "1.5" }}>
                  ClearStock is built around live Shopify GraphQL APIs and bidirectional webhooks so you never have to manually export CSVs.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    📦 Customer Orders Webhook (<code>orders/create</code>)
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Every time an order is placed on your store or POS, our webhook increments today's sales aggregation cache with sub-second latency and an idempotency ledger to prevent duplicate counts.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    🔄 Inventory Adjustments Webhook (<code>inventory_levels/update</code>)
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Manual warehouse counts, POS sales, returns, or adjustments made in the Shopify admin immediately reflect on your ClearStock dashboard without page refreshes.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    🩺 Self-Service Heal & Re-Sync Button
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62" }}>
                    Want to force a fresh pull from Shopify? Click <strong>"Heal Data / Sync Stock"</strong> at any time to verify variant counts across all locations directly against Shopify servers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FAQS */}
          {activeTab === "faqs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  Q: What lookback window should I use?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  <strong>30 Days</strong> is recommended for most apparel and consumer goods brands. Use <strong>7 or 14 Days</strong> during peak holiday flash sales or BFCM to quickly spot viral surges. Use <strong>90 Days</strong> for steady staple catalog items.
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  Q: How do supplier lead times affect my stock?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  Lead time is the total days from when you place the PO until the boxes arrive and are unpacked. If your supplier takes 20 days and you sell 5 units/day, you need 100 units just to cover lead time demand before new stock lands!
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  Q: What does the "Overstock (&gt;90D)" alert mean?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  It warns you that your current stock will take more than 90 days to sell through at current sales velocity. This indicates trapped working capital that could be freed up through bundling, promotions, or pausing reorders.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e1e3e5",
            backgroundColor: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "12px", color: "#6d7175" }}>
            Need custom onboarding help or formula adjustments? We're available 24/7.
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 18px",
              backgroundColor: "#008060",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
}
