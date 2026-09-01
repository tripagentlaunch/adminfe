"use client";
// Ported from web/js/advisor.js (line ~5350). A small reusable note line for
// the sell-only footer disclosure, shared across the servicing/disputes panels.
export function SellNote({ extra }: { extra?: any }) {
  return (
    <div style={{ marginTop: 14, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
      Amounts shown are sell-side (what a member pays or is refunded) — advisor-internal servicing controls. {extra || ""}
    </div>
  );
}
