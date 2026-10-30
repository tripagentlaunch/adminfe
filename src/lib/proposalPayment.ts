/* Handing a held proposal order to the payment gateway — shared by the proposal page's one-tap
   Pay now and the details form (ProposalFlightPayModal). The server prices and holds the order;
   this only opens each payment and reports it back:
   - TripSure's Razorpay (key and order from TripSure's Payment Service), one Checkout per
     booking, branded TripAgent, closing itself when the hold window ends; TripSure verifies;
   - mock mode (test server, PAYMENT_MOCK): the /pay/mock page plays that part per booking. */
import { proposalFlightPayConfirm, proposalFlightPayStart } from "../services/api";
import { secondsLeft } from "../components/proposal/PayTimer";

/** Where the mock payment page finds this payment (it has no other way to know it). */
export const MOCK_PAY_KEY = "ta-mock-payment";

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

export type PayOutcome = { kind: "redirected" } | { kind: "paid"; orderNumber: string | null };
export type PayStep = { step: number; steps: number; label: string };

/** Pays every booking of a held order, one TripSure payment each (flights first, then rooms).
 *  TripSure's Payment Service creates each Razorpay order on its own merchant and verifies it;
 *  Checkout itself is branded TripAgent. `onStep` reports "payment 1 of 2 · Flight …". */
export async function payHeldOrder(token: string, held: { order_id: string; pay_by?: string | null }, go: (url: string) => void,
  onStep?: (s: PayStep) => void): Promise<PayOutcome> {
  for (let guard = 0; guard < 6; guard++) {
    const o: any = await proposalFlightPayStart(token, held.order_id);
    onStep?.({ step: o.step || 1, steps: o.steps || 1, label: o.label || "" });
    if (o.mode === "mock") {
      try {
        sessionStorage.setItem(MOCK_PAY_KEY, JSON.stringify({ token, order_id: held.order_id, ...o }));
      } catch { /* storage blocked: the page still has the ids in its URL */ }
      go(`/pay/mock?token=${encodeURIComponent(token)}&order=${encodeURIComponent(held.order_id)}&rz=${encodeURIComponent(o.razorpay_order_id)}`);
      return { kind: "redirected" };
    }
    if (!(await loadCheckout())) throw new Error("Couldn't load the payment window — check your connection and try again.");
    const left = secondsLeft(held.pay_by || o.pay_by);
    const done: any = await new Promise((resolve, reject) => {
      const rz = new (window as any).Razorpay({
        key: o.key_id, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: o.currency,
        name: o.name || "TripAgent",
        description: (o.steps > 1 ? `Payment ${o.step} of ${o.steps} · ` : "") + (o.description || ""),
        prefill: o.prefill, notes: o.notes, theme: { color: "#3a352e" },
        // Razorpay closes its own window when the hold ends (it needs at least 60 seconds)
        ...(left != null ? { timeout: Math.max(60, left) } : {}),
        handler: (r: any) => proposalFlightPayConfirm(token, {
          order_id: held.order_id, razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature,
        }).then(resolve, reject),
        modal: { ondismiss: () => reject(new Error(o.step > 1
          ? `Payment ${o.step} of ${o.steps} was closed — the earlier payment went through; press Pay now to finish the rest.`
          : "Payment window closed — you haven't been charged. You can try again.")) },
      });
      rz.on("payment.failed", (e: any) => reject(new Error(e?.error?.description || "The payment failed.")));
      rz.open();
    });
    if (!done?.next) return { kind: "paid", orderNumber: done?.order_number || null };
  }
  throw new Error("Something went wrong taking the payments — please contact your advisor.");
}
