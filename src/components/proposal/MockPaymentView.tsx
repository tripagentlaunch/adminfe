"use client";
/* The mock payment page (/pay/mock): shows exactly what Razorpay's checkout would be
   opened with (order id, amount, customer prefill, notes), then reports the outcome to
   the same confirm endpoint Razorpay's success handler calls, and returns to the proposal. */
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { proposalFlightPayConfirm, inr } from "../../services/api";
import { errText } from "../../lib/advisorHelpers";
import { MOCK_PAY_KEY } from "./ProposalFlightPayModal";

const noSubscribe = () => () => {};
const readSearch = () => window.location.search;
const readSaved = () => {
  try { return sessionStorage.getItem(MOCK_PAY_KEY) || ""; } catch { return ""; }
};

export function MockPaymentView() {
  const router = useRouter();
  const search = useSyncExternalStore(noSubscribe, readSearch, () => "");
  const savedRaw = useSyncExternalStore(noSubscribe, readSaved, () => "");
  const q = new URLSearchParams(search);
  const token = q.get("token") || "";
  const orderId = q.get("order") || "";
  const rz = q.get("rz") || "";
  let saved: any = {};
  try { saved = savedRaw ? JSON.parse(savedRaw) : {}; } catch { saved = {}; }
  const o = saved.razorpay_order_id === rz ? saved : {};
  const [method, setMethod] = useState("upi");
  const [busy, setBusy] = useState<"" | "ok" | "fail">("");
  const [err, setErr] = useState<string | null>(null);

  async function finish(success: boolean) {
    setBusy(success ? "ok" : "fail");
    setErr(null);
    const back = `/p/${encodeURIComponent(token)}`;
    try {
      const r: any = await proposalFlightPayConfirm(token, {
        order_id: orderId, razorpay_order_id: rz,
        razorpay_payment_id: success ? "pay_mock_" + Math.random().toString(16).slice(2, 12) : "",
        razorpay_signature: success ? "mock_ok" : "mock_failed",
      });
      try { sessionStorage.removeItem(MOCK_PAY_KEY); } catch { /* fine */ }
      // More bookings to pay (flight, then hotel): back to the trip, which opens the next payment.
      if (r?.next) router.push(`${back}?pay=open`);
      else router.push(`${back}?payment=success${r?.order_number ? "&ref=" + encodeURIComponent(r.order_number) : ""}`);
    } catch (e: any) {
      if (!success && e?.status === 402) { router.push(`${back}?payment=failed`); return; }
      setErr(errText(e));
      setBusy("");
    }
  }

  if (!token || !orderId || !rz) {
    return <div style={wrap}><div style={card}><h2>Nothing to pay</h2><p style={{ color: "#666" }}>This payment link is incomplete. Go back to your proposal and press Pay now again.</p></div></div>;
  }
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <b style={{ fontSize: 18 }}>{o.name || "TripAgent"}</b>
          <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", background: "#fff3cd", color: "#7a5b00", padding: "3px 8px", borderRadius: 6 }}>Mock payment · test</span>
        </div>
        {o.steps > 1 ? <div style={{ fontSize: 12, color: "#7a5b00", marginBottom: 4 }}>Payment {o.step} of {o.steps}</div> : null}
        {o.mock_reason ? (
          <div style={{ fontSize: 12, background: "#fff6e5", color: "#8a6400", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
            TripSure didn&apos;t open a real payment, so this mock stands in: {o.mock_reason}
          </div>
        ) : null}
        <div style={{ fontSize: 13, color: "#666" }}>{o.description || "Flights"}</div>
        <div style={{ fontSize: 32, fontWeight: 700, margin: "6px 0 16px" }}>{o.amount != null ? inr(o.amount) : o.amount_paise ? inr(o.amount_paise / 100) : "—"}</div>

        <div style={{ display: "grid", gap: 6, fontSize: 12.5, color: "#555", background: "#f7f7f5", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div><b>Razorpay order</b> {rz}</div>
          <div><b>Amount (paise)</b> {o.amount_paise ?? "—"} {o.currency || "INR"}</div>
          {o.prefill ? <div><b>Customer</b> {[o.prefill.name, o.prefill.email, o.prefill.contact].filter(Boolean).join(" · ")}</div> : null}
          {o.notes ? <div><b>Notes</b> {Object.entries(o.notes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div> : null}
          <div style={{ color: "#888" }}>
            On a live server TripSure&apos;s Payment Service creates this Razorpay order on its merchant (POST /api/payment/transactions,
            booking_type {o.kind || "flight"}) and returns the key; Checkout opens with the name TripAgent and these fields, and
            TripSure verifies the payment (POST /api/payment/verify).
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }} role="radiogroup" aria-label="Payment method">
          {[["upi", "UPI"], ["card", "Card"], ["netbanking", "Netbanking"]].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}
              style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: method === k ? "2px solid #1f6f5c" : "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
              {label}
            </button>
          ))}
        </div>

        {err ? <div style={{ background: "#fdecea", color: "#a3261a", padding: "10px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div> : null}
        <button type="button" disabled={!!busy} onClick={() => finish(true)}
          style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#1f6f5c", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy === "ok" ? "Recording payment…" : `Pay ${o.amount != null ? inr(o.amount) : ""} (simulate success)`}
        </button>
        <button type="button" disabled={!!busy} onClick={() => finish(false)}
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd", background: "#fff", color: "#a3261a", fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 8 }}>
          {busy === "fail" ? "Reporting failure…" : "Simulate a failed payment"}
        </button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#eef1f4", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" };
const card: React.CSSProperties = { background: "#fff", color: "#1a1a1a", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 10px 40px -12px rgba(0,0,0,.25)" };
