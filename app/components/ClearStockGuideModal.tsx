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
          width: "94vw",
          maxWidth: "840px",
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
            padding: "16px 20px",
            borderBottom: "1px solid #e1e3e5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#f9fafb",
            gap: "16px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <span style={{ fontSize: "24px", flexShrink: 0 }}>📖</span>
            <div style={{ minWidth: 0 }}>
              <h2
                id="clearstock-guide-modal-title"
                style={{ fontSize: "17px", fontWeight: "700", color: "#202223", margin: 0 }}
              >
                ClearStock Inventory Playbook
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#6d7175" }}>
                A simple, practical guide to stock calculations, purchase orders, and live store sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "#f1f2f3",
              border: "1px solid #d2d5d8",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: "1",
              fontWeight: "600",
              color: "#5c5f62",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher (flexShrink: 0 ensures tabs NEVER collapse when content overflows) */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e1e3e5",
            padding: "0 16px",
            backgroundColor: "#ffffff",
            overflowX: "auto",
            scrollbarWidth: "none",
            gap: "4px",
            flexShrink: 0,
            minHeight: "46px",
            alignItems: "stretch",
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
              borderBottom: activeTab === "math" ? "3px solid #008060" : "3px solid transparent",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            🧮 Reorder Math
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
              borderBottom: activeTab === "pos" ? "3px solid #008060" : "3px solid transparent",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            📦 Purchase Orders
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
              borderBottom: activeTab === "sync" ? "3px solid #008060" : "3px solid transparent",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ⚡ Live Shopify Sync
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
              borderBottom: activeTab === "faqs" ? "3px solid #008060" : "3px solid transparent",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            💡 Pro-Tips & FAQs
          </button>
        </div>

        {/* Modal Body (minHeight: 0 enables flex child to scroll instead of collapsing siblings) */}
        <div style={{ padding: "24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "20px" }}>
          
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
                  🎯 How ClearStock Knows When & How Much to Reorder
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#15803d", lineHeight: "1.5" }}>
                  ClearStock uses a two-step system: a <strong>Safety Floor</strong> (tells you <em>when</em> to reorder) and a <strong>Target Ceiling</strong> (tells you <em>how much</em> to order so you stay stocked until your next shipment).
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 1: Sales Pace</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>📈 Average Daily Sales (ADS)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Daily Sales = Total Units Sold ÷ Selected Window Days
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    How fast this SKU is selling right now. Choose between 7, 14, 30, or 90 days. Shorter windows capture viral spikes; longer windows smooth out seasonal dips.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 2: Emergency Reserve</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>🛡️ Safety Cushion (Safety Stock)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Safety Cushion = Daily Sales × Safety Stock Days
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    Your emergency buffer. Keeps your shelves covered if your supplier ships late or if you experience an unexpected weekend sales surge.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 3: When to Reorder</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>🔔 Reorder Point (Safety Floor)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Reorder Point = (Daily Sales × Supplier Lead Time) + Safety Cushion
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    The alert threshold. When your stock (on-hand + on-order) touches this floor, ClearStock flags <strong>Reorder Now</strong> so new boxes land before your safety cushion is touched.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 4: Demand Between Orders</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>📅 Order Cycle Demand</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Cycle Demand = Daily Sales × Reorder Frequency (e.g. 30 Days)
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    The volume of inventory you expect to sell between recurring purchase orders (e.g., placing one order every 30 days).
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 5: Optimal Stock Peak</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>🎯 Target Stock Level (Ceiling)</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Target Ceiling = Reorder Point + Cycle Demand
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    Your ideal inventory level right after a fresh shipment is received and unpacked at your warehouse.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "10px", padding: "14px", backgroundColor: "#fafbfc" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "#6d7175" }}>Step 6: Units to Buy Today</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", margin: "4px 0", color: "#202223" }}>📦 Suggested Order Quantity</div>
                  <code style={{ display: "block", backgroundColor: "#ffffff", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", border: "1px solid #e1e3e5", color: "#2c6ecb" }}>
                    Suggested Qty = Target Ceiling − (On Hand + In Transit)
                  </code>
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.4" }}>
                    When stock drops to the Reorder Point, ClearStock orders enough to reach your Target Ceiling, automatically rounded up to your supplier&apos;s Case Pack and MOQ multiples.
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
                  🏷️ ClearStock Status Indicators:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px", lineHeight: "1.5" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#d72c0d", minWidth: "110px", flexShrink: 0 }}>⚠️ Reorder Now:</span>
                    <span style={{ color: "#202223" }}>Available stock (on-hand + on-order) has fallen to or below your safety floor. Place a purchase order to prevent running out.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#006e52", minWidth: "110px", flexShrink: 0 }}>🚚 Incoming:</span>
                    <span style={{ color: "#202223" }}>Stock on shelves is low, but you already have a Purchase Order placed with your supplier that will safely cover demand.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#108043", minWidth: "110px", flexShrink: 0 }}>🟢 Stock OK:</span>
                    <span style={{ color: "#202223" }}>Healthy, balanced inventory. You have plenty of stock to fulfill current orders without tying up excess cash.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#b98900", minWidth: "110px", flexShrink: 0 }}>📦 Overstocked:</span>
                    <span style={{ color: "#202223" }}>You hold significantly more stock than your target ceiling (+15% buffer). Cash is trapped in slow-moving inventory. Consider product bundles or promotions.</span>
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
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#1e40af", marginBottom: "8px" }}>
                  💡 Real-World Example in Plain English:
                </div>
                <div style={{ fontSize: "13px", color: "#1d4ed8", lineHeight: "1.6" }}>
                  • <strong>Daily Sales:</strong> You sell <strong>10 shirts/day</strong>.<br />
                  • <strong>Supplier Lead Time:</strong> Your manufacturer takes <strong>14 days</strong> to ship (140 shirts needed during transit).<br />
                  • <strong>Safety Cushion:</strong> You want a <strong>7-day buffer</strong> (70 shirts for unexpected surges).<br />
                  • <strong>Safety Floor (Reorder Point):</strong> 140 + 70 = <strong>210 shirts</strong>. (When total stock drops to 210, reorder!)<br />
                  • <strong>Order Frequency:</strong> You place orders every <strong>30 days</strong> (300 shirts cycle demand).<br />
                  • <strong>Target Ceiling:</strong> 210 + 300 = <strong>510 shirts</strong>.<br />
                  • <strong>The Decision:</strong> If your stock on hand is <strong>180 shirts</strong>, ClearStock tells you to order <strong>330 shirts</strong> (510 Target − 180 On Hand).<br />
                  • <em>Outcome: When the shipment lands at your warehouse, you hit 510 shirts and will smoothly sail through the month without stocking out!</em>
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
                  🛡️ Smart Purchase Orders That Prevent Costly Mistakes
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#1d4ed8", lineHeight: "1.5" }}>
                  Traditional spreadsheets fail because you can&apos;t easily see what&apos;s already on the way. ClearStock keeps purchasing locked in sync with your warehouse and store.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    🚚 1. In-Transit Awareness (No Duplicate Orders)
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    The moment you mark a Purchase Order as <strong>Ordered</strong>, ClearStock recognizes those incoming units as &quot;In Transit&quot;. This immediately satisfies your Reorder Point so your team never accidentally orders the same SKU twice.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    📥 2. One-Click Warehouse Receiving
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    When boxes arrive at your warehouse, open the Purchase Order and click <strong>Receive Items</strong>. ClearStock instantly updates your live Shopify store inventory across your locations—no manual spreadsheets or inventory adjustments required.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    📦 3. Automatic Case-Pack & MOQ Rounding
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Suppliers often require minimum production runs (e.g., minimum 50 units) or only ship in master cartons (e.g., boxes of 12). ClearStock automatically rounds your suggested order up to the nearest valid case pack so suppliers accept orders without delays.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "#202223", marginBottom: "4px" }}>
                    📝 4. Partial Receipts & Split Shipments
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Did your supplier only send part of your order? Record a partial receipt to immediately add the received units to your Shopify inventory, while ClearStock continues tracking the remaining balance as inbound until the rest arrives.
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
                  ⚡ Always in Sync with Your Shopify Store
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#7e22ce", lineHeight: "1.5" }}>
                  ClearStock automatically stays up to date with your Shopify store in real time, so you never need to export spreadsheets or manually enter numbers.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    📦 Automatic Live Sales Tracking
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Whenever a customer buys online or through your POS, your daily sales numbers update automatically. Your reorder recommendations always reflect actual customer demand.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    🔄 Instant Stock Level Updates
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.5" }}>
                    When you adjust inventory, receive shipments, or process returns in Shopify admin, ClearStock updates your on-hand counts immediately so you always see accurate numbers.
                  </p>
                </div>

                <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: "#202223" }}>
                    🔄 On-Demand "Sync with Shopify"
                  </div>
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#5c5f62", lineHeight: "1.5" }}>
                    Need to refresh everything right away? Click <strong>"Sync with Shopify"</strong> at the top of your dashboard at any time to pull your latest catalog, stock across all locations, and past 90 days of sales history.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FAQS */}
          {activeTab === "faqs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px", backgroundColor: "#fafbfc" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  💡 Which sales lookback window should I choose?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  • <strong>30 Days (Recommended):</strong> Best everyday balance for consumer goods and apparel.<br />
                  • <strong>7 or 14 Days:</strong> Ideal during holiday flash sales, BFCM, or TikTok viral spikes to react before stock runs dry.<br />
                  • <strong>90 Days:</strong> Best for evergreen core staples with stable, year-round sales.
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px", backgroundColor: "#fafbfc" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  ❓ Why is an item still showing &quot;Reorder Now&quot; after I received a shipment?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  ClearStock evaluates whether your stock is safely above your <strong>Safety Floor (Reorder Point)</strong>. If recent sales velocity has been fast, receiving a small or partial shipment might bring you right up to your safety floor without providing enough cycle stock to last until next month. Click the <strong>&quot;Inspect&quot;</strong> button on that SKU to see the exact daily sales and safety breakdown in plain English.
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px", backgroundColor: "#fafbfc" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  📦 What does the &quot;Overstocked&quot; status mean, and what should I do?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  It warns you that your current on-hand units exceed your target ceiling by more than 15%. This means cash is tied up in slow-moving inventory. Consider creating product bundles, offering discounts, or pausing future reorders until stock normalizes.
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px", backgroundColor: "#fafbfc" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  ⏱️ Why are accurate supplier lead times so critical?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  Lead time is the total days from placing the order until the boxes are unpacked on your warehouse shelves. If your manufacturer takes 20 days and you sell 5 units a day, you will sell 100 units while waiting. Setting an accurate lead time ensures you reorder before your shelves empty.
                </p>
              </div>

              <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "14px", backgroundColor: "#fafbfc" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>
                  ✏️ Can I adjust unit costs or quantities before sending a Purchase Order?
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#5c5f62", lineHeight: "1.5" }}>
                  Absolutely. When creating or drafting a Purchase Order, you can freely edit quantities, unit costs, or add custom notes. Updating a unit cost on a PO automatically saves that price for future orders with that supplier.
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
            flexShrink: 0,
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
