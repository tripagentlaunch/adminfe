"use client";
/* =============================================================================
 * TripAgent — ProposalPayModal.tsx
 * The customer-facing "Pay now" flow on the public proposal web link
 * (/proposal/[token]). Three steps on the SAME token the page already holds:
 *   1. guest details -> POST /pay/prepare  (server re-searches + locks the room,
 *      creating the booking order the advisor then sees in Orders)
 *   2. Razorpay checkout for the server-priced amount (never the browser's)
 *   3. POST /pay/confirm  (verifies the signature, books the room once)
 * No cost/margin is ever shown here; the amount comes from the server.
 * ===========================================================================*/
import { useState } from "react";
import { proposalPayPrepare, proposalPayRazorpay, proposalPayConfirm, inr } from "../../services/api";
import { errText } from "../../lib/advisorHelpers";
import { Spinner } from "../ui";

function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type Stay = { id?: string; name?: string; room?: string; price?: number; check_in?: string; check_out?: string };

export function ProposalPayModal({ token, stay, gatewayConfigured, onClose }:
  { token: string; stay: Stay; gatewayConfigured: boolean; onClose: (booked: boolean) => void }) {
  const [step, setStep] = useState<"form" | "working" | "done">("form");
  const [err, setErr] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<{ was: number; now: number } | null>(null);
  const [g, setG] = useState({ title: "Mr", firstName: "", lastName: "", mobile: "", email: "", pan: "" });
  const set = (k: string, v: string) => setG((f) => ({ ...f, [k]: v }));

  const panBad = g.pan !== "" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(g.pan.toUpperCase());
  const ready = g.firstName.trim() && g.lastName.trim() && /^\d{10}$/.test(g.mobile.replace(/\D/g, "").slice(-10)) && g.email.includes("@") && !panBad;

  async function pay() {
    setErr(null);
    setStep("working");
    try {
      const guest = {
        title: g.title, firstName: g.firstName.trim(), lastName: g.lastName.trim(),
        mobile: g.mobile.replace(/\D/g, "").slice(-10), email: g.email.trim(),
        pan: g.pan.trim().toUpperCase() || null,
      };
      // 1. record + lock the room (server re-prices with the supplier)
      const prep: any = await proposalPayPrepare(token, { stay_id: stay.id, guest, adults: 1, rooms: 1, accept_changes: true });
      if (prep.price_changed) setPriceNote({ was: prep.old_price, now: prep.new_price });
      const orderId = prep.order_id;
      // 2. Razorpay for the server-priced due amount
      const [o, ok]: [any, boolean] = await Promise.all([proposalPayRazorpay(token, orderId), loadCheckout()]);
      if (!ok) throw new Error("Couldn't load the payment window — check your connection and try again.");
      await new Promise<void>((resolve, reject) => {
        const rz = new (window as any).Razorpay({
          key: o.key_id, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: o.currency,
          name: "TripAgent", description: o.description || "Hotel booking", prefill: o.prefill, theme: { color: "#1f6f5c" },
          handler: (r: any) => {
            // 3. verify + book the room
            proposalPayConfirm(token, {
              order_id: orderId, razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature,
            }).then(() => resolve(), reject);
          },
          modal: { ondismiss: () => reject(new Error("Payment window closed — you haven't been charged. You can try again.")) },
        });
        rz.on("payment.failed", (e: any) => reject(new Error(e?.error?.description || "The payment failed.")));
        rz.open();
      });
      setStep("done");
    } catch (e) {
      setErr(errText(e));
      setStep("form");
    }
  }

  return (
    <div className="ppm-back" role="dialog" aria-modal="true" aria-label="Pay for your booking"
      onClick={() => step !== "working" && onClose(step === "done")}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", color: "#1a1a1a", borderRadius: 16, padding: 24, maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        {step === "done" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <h2 style={{ margin: "8px 0" }}>Booking confirmed</h2>
            <p style={{ color: "#555" }}>
              Thank you — your payment went through and your hotel is booked.{stay.name ? ` (${stay.name})` : ""} Your advisor will send the voucher shortly.
            </p>
            <button type="button" onClick={() => onClose(true)} style={btn(true)}>Done</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px" }}>Pay for your stay</h2>
            <p style={{ color: "#555", margin: "0 0 16px", fontSize: 14 }}>
              {stay.name}{stay.room ? ` · ${stay.room}` : ""}<br />
              <b style={{ color: "#1a1a1a", fontSize: 18 }}>{stay.price != null ? inr(stay.price) : ""}</b>
              {stay.check_in && stay.check_out ? <span style={{ color: "#888" }}> · {stay.check_in} → {stay.check_out}</span> : null}
            </p>

            {!gatewayConfigured ? (
              <div style={banner("warn")}>Online payment isn&apos;t set up yet. Please contact your advisor to complete this booking.</div>
            ) : null}
            {priceNote ? (
              <div style={banner("warn")}>
                The price changed since the proposal: was <s>{inr(priceNote.was)}</s>, now <b>{inr(priceNote.now)}</b>. The new amount is what you&apos;ll pay.
              </div>
            ) : null}
            {err ? <div style={banner("err")}>{err}</div> : null}

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 8 }}>
                <select value={g.title} onChange={(e) => set("title", e.target.value)} style={inp}>
                  {["Mr", "Mrs", "Ms", "Miss", "Dr"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input placeholder="First name" value={g.firstName} onChange={(e) => set("firstName", e.target.value)} style={inp} />
                <input placeholder="Last name" value={g.lastName} onChange={(e) => set("lastName", e.target.value)} style={inp} />
              </div>
              <input placeholder="Mobile (10 digits)" inputMode="numeric" value={g.mobile} onChange={(e) => set("mobile", e.target.value)} style={inp} />
              <input placeholder="Email" type="email" value={g.email} onChange={(e) => set("email", e.target.value)} style={inp} />
              <input placeholder="PAN (if asked for this rate)" maxLength={10} value={g.pan}
                onChange={(e) => set("pan", e.target.value.toUpperCase())} style={{ ...inp, borderColor: panBad ? "#c0392b" : "#ddd" }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => onClose(false)} disabled={step === "working"} style={btn(false)}>Cancel</button>
              <button type="button" onClick={pay} disabled={!ready || !gatewayConfigured || step === "working"} style={btn(true)}>
                {step === "working" ? <Spinner /> : `Pay ${stay.price != null ? inr(stay.price) : "now"}`}
              </button>
            </div>
            <p style={{ color: "#999", fontSize: 11.5, marginTop: 12, textAlign: "center" }}>
              Secured by Razorpay. Your PAN, if entered, is sent to the hotel supplier only and never stored.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box" };
function btn(primary: boolean): React.CSSProperties {
  return { flex: 1, padding: "12px 16px", borderRadius: 10, border: primary ? "none" : "1px solid #ddd", fontSize: 14, fontWeight: 600, cursor: "pointer",
    background: primary ? "#1a1a1a" : "#fff", color: primary ? "#fff" : "#1a1a1a", opacity: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 };
}
function banner(kind: "warn" | "err"): React.CSSProperties {
  return { padding: "10px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13,
    background: kind === "err" ? "#fdecea" : "#fff6e5", color: kind === "err" ? "#a3261a" : "#8a6400" };
}
