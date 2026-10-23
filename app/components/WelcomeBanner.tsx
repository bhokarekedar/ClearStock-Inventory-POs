interface WelcomeBannerProps {
  onOpenGuide: () => void;
  onOpenSupport: () => void;
}

export function WelcomeBanner({
  onOpenGuide,
  onOpenSupport,
}: WelcomeBannerProps) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "14px",
        border: "1px solid #e1e3e5",
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "20px",
        flexWrap: "wrap",
        marginBottom: "20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "280px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            flexShrink: 0,
          }}
        >
          📦
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#202223" }}>
              Welcome to ClearStock 👋
            </h2>
            <span
              style={{
                backgroundColor: "#e8f5e9",
                color: "#166534",
                fontSize: "11px",
                fontWeight: "700",
                padding: "2px 8px",
                borderRadius: "12px",
                border: "1px solid #bbf7d0",
              }}
            >
              ● Shopify Source of Truth
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6d7175", lineHeight: "1.4" }}>
            Predict stock-outs, automate supplier replenishment, and create Purchase Orders in seconds.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onOpenGuide}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            backgroundColor: "#f6f6f7",
            border: "1px solid #d2d5d8",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
            color: "#202223",
            cursor: "pointer",
          }}
        >
          📖 Setup Guide & Math
        </button>

        <button
          type="button"
          onClick={onOpenSupport}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            backgroundColor: "#f6f6f7",
            border: "1px solid #d2d5d8",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
            color: "#202223",
            cursor: "pointer",
          }}
        >
          💬 Need Help?
        </button>
      </div>
    </div>
  );
}
