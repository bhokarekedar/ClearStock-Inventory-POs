import { useState, useEffect } from "react";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shop: string;
  plan?: string;
}

export function SupportModal({ isOpen, onClose, shop, plan }: SupportModalProps) {
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

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
      <button
        type="button"
        aria-label="Close support modal backdrop"
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

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
        style={{
          position: "relative",
          zIndex: 10000,
          backgroundColor: "#ffffff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e1e3e5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px" }}>💬</span>
            <h2 id="support-modal-title" style={{ fontSize: "16px", fontWeight: "700", color: "#202223", margin: 0 }}>
              ClearStock Support & Developer Help
            </h2>
            {plan === "scale" && (
              <span
                style={{
                  backgroundColor: "#ecfdf5",
                  color: "#065f46",
                  border: "1px solid #a7f3d0",
                  borderRadius: "9999px",
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "2px 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                ⚡ Priority 1h SLA
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              color: "#5c5f62",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎉</div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#202223", margin: "0 0 8px 0" }}>
                Message Received!
              </h3>
              <p style={{ fontSize: "14px", color: "#5c5f62", margin: "0 0 20px 0", lineHeight: "1.5" }}>
                Our engineering team will review your inquiry for <strong>{shop}</strong> and respond to <strong>{email || "your registered email"}</strong> within 2–4 hours.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  onClose();
                }}
                style={{
                  padding: "9px 20px",
                  backgroundColor: "#008060",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#202223", marginBottom: "6px" }}>
                  Your Store Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="merchant@yourstore.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d2d5d8",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#202223", marginBottom: "6px" }}>
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d2d5d8",
                    fontSize: "14px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="Onboarding & Initial Setup">Onboarding & Initial Setup</option>
                  <option value="Supplier & MOQ Configuration">Supplier & MOQ Configuration</option>
                  <option value="Shopify Inventory Sync">Shopify Inventory Sync</option>
                  <option value="Purchase Orders & Receiving">Purchase Orders & Receiving</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Other Question">Other Question</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#202223", marginBottom: "6px" }}>
                  How can we help?
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe your issue or what supplier setup you need assistance with..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d2d5d8",
                    fontSize: "14px",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "9px 16px",
                    backgroundColor: "#f6f6f7",
                    color: "#202223",
                    border: "1px solid #d2d5d8",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "9px 20px",
                    backgroundColor: "#008060",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? "Sending..." : "Submit Question"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
