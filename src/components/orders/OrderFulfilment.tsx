"use client";
/* The order's booking checklist: Travellers -> Payment -> Book. Everything it
   shows comes from GET /booking-orders/{id} -> fulfilment (server-computed:
   what is done, what is blocked and why). Ticketing and hotel confirmation are
   irreversible, so each asks for an in-page confirmation first. */
import { useEffect, useRef, useState } from "react";
import { Field, Icon } from "../ui";
import {
  bookingCancelHotel, bookingCheckFlight, bookingTripsureOrder, bookingCheckHotel, bookingConfirmHotel, bookingHotelCancelQuote, bookingHotelInvoice, bookingHotelVoucher, bookingIssueTicket, bookingPaymentGateway, bookingRazorpayConfirm,
  bookingRazorpayOrder, bookingRecordPayment, bookingRecordRefund, bookingRefundOnline, bookingResetItem, hotelPaymentTransaction, hotelPaymentVerify, hotelPaymentStatus,
} from "../../services/api";
import { openRazorpayCheckout } from "../../lib/razorpay";
import { pollPaymentSettlement, type PollHandle, type PaymentStatus } from "../../lib/pollPaymentSettlement";
import { errText } from "../../lib/errText";
import { toast } from "../../lib/advisorHelpers";
import { fmtINR, type Fulfilment, type FulfilmentItem, type Order, type PaymentRow } from "../../lib/orderTypes";
import { FlightServicingModal } from "./FlightServicingModal";
import { priceCovers } from "../../lib/flightParty";
import { TravellersForm } from "./TravellersForm";
import { OrderActivity } from "./OrderActivity";
import { HotelBookingDetails } from "./HotelBookingDetails";
import { HotelInvoiceView } from "./HotelInvoiceView";
import { HotelVoucherView } from "./HotelVoucherView";
import { policyLines } from "../../lib/hotelPolicy";

const STAGE: Record<Fulfilment["stage"], { label: string; tone: string }> = {
  empty: { label: "Nothing to book", tone: "warn" },
  travellers: { label: "Travellers needed", tone: "warn" },
  payment: { label: "Awaiting payment", tone: "warn" },
  ready: { label: "Ready to book", tone: "info" },
  attention: { label: "Needs attention", tone: "danger" },
  partially_booked: { label: "Partly booked", tone: "info" },
  booked: { label: "Booked", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const ITEM_STATUS: Record<string, { label: string; tone: string }> = {
  fare_locked: { label: "Fare locked", tone: "warn" },
  price_checked: { label: "Not locked", tone: "warn" },
  room_locked: { label: "Room locked", tone: "warn" },
  ticketing: { label: "Ticketing…", tone: "info" },
  booking: { label: "Confirming…", tone: "info" },
  ticketed: { label: "Ticketed", tone: "success" },
  confirmed: { label: "Confirmed", tone: "success" },
  pending: { label: "Supplier confirming", tone: "info" },
  failed: { label: "Failed", tone: "danger" },
  check_required: { label: "Check required", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const METHODS = [
  { key: "upi", label: "UPI" },
  { key: "bank_transfer", label: "Bank transfer (NEFT / RTGS / IMPS)" },
  { key: "card", label: "Card" },
  { key: "payment_link", label: "Payment link" },
  { key: "cash", label: "Cash" },
  { key: "agency_credit", label: "Agency credit" },
];

const pill = (tone: string, label: string) => <span className={`taw-status taw-status--${tone}`}>{label}</span>;
const paxText = (m: Record<string, number> | null | undefined) =>
  !m ? "" : [["adult", "adult"], ["child", "child"], ["infant", "infant"]]
    .filter(([k]) => m[k])
    .map(([k, w]) => `${m[k]} ${w}${m[k] === 1 ? "" : k === "child" ? "ren" : "s"}`)
    .join(", ");

type Gateway = { configured: boolean; webhook_configured: boolean; missing: string[]; mode: "test" | "live" | null };

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

type Pending = { item: FulfilmentItem; acceptFare?: boolean } | null;
type CancelQuote = {
  booking_amount: number | null; cancellation_charges: number | null; refund_amount: number | null; discount: number | null;
  /** What the hotel itself charges (guide 7.1 r360hotelCharges). */
  hotel_charges?: number | null;
  /** Tripsure's cancellation schedule; the guide doesn't fix its shape, so each entry is a sentence or an object. */
  policies?: unknown[];
};
type Cancelling = { item: FulfilmentItem; quote: CancelQuote | null } | null;

export function OrderFulfilment({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const f = order.fulfilment;
  const [travOpen, setTravOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirming, setConfirming] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gw, setGw] = useState<Gateway | null>(null);
  const [gwErr, setGwErr] = useState(false);
  useEffect(() => {
    let live = true;
    bookingPaymentGateway().then((g: Gateway) => live && setGw(g)).catch(() => live && setGwErr(true));
    return () => { live = false; };
  }, []);
  const [cancelling, setCancelling] = useState<Cancelling>(null);
  // The hotel item whose payment we're polling for settlement, plus the active
  // poll handle so it is cancelled on unmount (or when a new poll starts).
  const [settling, setSettling] = useState<string | null>(null);
  const pollRef = useRef<PollHandle | null>(null);
  useEffect(() => () => pollRef.current?.cancel(), []);
  const [refundOpen, setRefundOpen] = useState<{ amount: number } | null>(null); // opened after a cancel, pre-filled with Tripsure's refund
  const [servicing, setServicing] = useState<FulfilmentItem | null>(null); // a ticketed flight being cancelled / its date changed
  const [fareChange, setFareChange] = useState<{ item: FulfilmentItem; message: string } | null>(null);
  // TripSure's own order for a flight (guide 7.2 / 7.3), fetched only when asked for.
  const [tsOrder, setTsOrder] = useState<Record<string, { busy?: boolean; err?: string; data?: any }>>({});
  function toggleTsOrder(id: string) {
    if (tsOrder[id] && !tsOrder[id].busy) { setTsOrder((m) => { const n = { ...m }; delete n[id]; return n; }); return; }
    setTsOrder((m) => ({ ...m, [id]: { busy: true } }));
    bookingTripsureOrder(id)
      .then((d: any) => setTsOrder((m) => ({ ...m, [id]: { data: d } })))
      .catch((e: any) => setTsOrder((m) => ({ ...m, [id]: { err: errText(e) } })));
  }

  // Tripsure's booking record for a hotel (guide 6.7), opened per room on demand.
  const [hotelOpen, setHotelOpen] = useState<Record<string, boolean>>({});
  // A tax invoice Tripsure sent as data (not a file): shown in the app instead of downloaded.
  const [invoiceView, setInvoiceView] = useState<{ item: FulfilmentItem; data: unknown } | null>(null);
  const [voucherView, setVoucherView] = useState<{ item: FulfilmentItem; voucher: any; html: string } | null>(null);

  // Book Room can be slow (guide 6.6): a room left "Confirming" / "Supplier confirming" is re-read
  // from Tripsure every 20s for up to 4 minutes. This only reads (check-status), it never books again.
  const inFlight = (f?.items || []).filter((i) => i.kind === "hotel" && (i.status === "booking" || i.status === "pending")).map((i) => i.id).join(",");
  useEffect(() => {
    if (!inFlight) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 12) { clearInterval(timer); return; }
      Promise.all(inFlight.split(",").map((id) => bookingCheckHotel(id).catch(() => null))).then(() => onChanged());
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight]);

  if (!f) return null;
  const stage = STAGE[f.stage] || STAGE.ready;
  const lead = f.travellers.list.find((t: any) => t.is_lead);
  const travDone = f.travellers.complete;
  const payDone = f.payment.total > 0 && f.payment.due <= 0.5;
  const locked = f.stage === "cancelled";

  async function run(item: FulfilmentItem, acceptFare = false) {
    setBusy(item.id);
    setErr(null);
    setFareChange(null);
    setConfirming(null);
    try {
      if (item.kind === "flight") {
        const r: any = await bookingIssueTicket(item.id, acceptFare);
        toast(r.ok ? `Ticket issued${r.pnrs?.length ? ` · PNR ${r.pnrs.join(", ")}` : ""}` : "Ticketing needs a check — see the order", r.ok ? "success" : "warn");
      } else {
        const r: any = await bookingConfirmHotel(item.id);
        toast(r.status === "confirmed" ? "Hotel confirmed" : "Hotel sent — the supplier is still confirming", r.status === "confirmed" ? "success" : "info");
      }
    } catch (e: any) {
      const msg = errText(e);
      if (item.kind === "flight" && e?.status === 409 && /Accept the new fare/i.test(msg)) setFareChange({ item, message: msg });
      else setErr(msg);
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  // TripSure hotel payment: get a Razorpay order on TripSure's merchant, open
  // Checkout, then verify the callback with TripSure so the payment is recorded.
  async function payHotel(item: FulfilmentItem) {
    setBusy(item.id);
    setErr(null);
    try {
      const o: any = await hotelPaymentTransaction(item.id);
      if (o?.mock && o?.razorpay_order_id) {
        // PAYMENT_MOCK (dev): no Checkout — the server records the payment with a mock UTR.
        await hotelPaymentVerify(item.id, { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: "", razorpay_signature: "mock" });
        toast("Test payment recorded (mock UTR) — you can now confirm the room", "success");
        onChanged();
        return;
      }
      if (!o?.key_id || !o?.razorpay_order_id) throw new Error("TripSure didn't return a payment order.");
      await openRazorpayCheckout({
        keyId: o.key_id,
        orderId: o.razorpay_order_id,
        amount: o.amount,
        currency: o.currency || "INR",
        name: "Hotel payment",
        description: item.title || "Hotel booking",
        onSuccess: async (r) => {
          setBusy(item.id);
          try {
            await hotelPaymentVerify(item.id, {
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
            });
            toast("Payment verified — confirming settlement with TripSure…", "success");
            onChanged();
            startSettlementPoll(item);
          } catch (e) {
            setErr(errText(e));
          } finally {
            setBusy(null);
          }
        },
        onDismiss: () => toast("Payment window closed — nothing recorded yet", "info"),
      });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  // After verify, TripSure confirms settlement asynchronously, so we poll
  // /payment/status with backoff until it is settled (then the room can be
  // confirmed with the supplier), failed, or the 2-minute cap is reached.
  function startSettlementPoll(item: FulfilmentItem) {
    pollRef.current?.cancel();
    setSettling(item.id);
    pollRef.current = pollPaymentSettlement(() => hotelPaymentStatus(item.id) as Promise<PaymentStatus>, {
      onSettled: () => { setSettling(null); toast("Payment settled — you can confirm the room with the hotel", "success"); onChanged(); },
      onFailed: () => { setSettling(null); setErr("TripSure reports the payment failed — check with TripSure before retrying."); onChanged(); },
      onTimeout: () => { setSettling(null); toast("Still awaiting TripSure's settlement — use Check status in a moment", "info"); onChanged(); },
    });
  }

  async function simple(id: string, call: () => Promise<any>, done: string) {
    setBusy(id);
    setErr(null);
    try {
      await call();
      toast(done, "success");
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  // Cancelling a room is irreversible, so the fee TripSure quotes is shown first.
  async function openCancel(item: FulfilmentItem) {
    setBusy(item.id);
    setErr(null);
    setConfirming(null);
    try {
      setCancelling({ item, quote: (await bookingHotelCancelQuote(item.id)) as CancelQuote });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function doCancel(item: FulfilmentItem) {
    setBusy(item.id);
    setErr(null);
    try {
      // the fee the advisor was shown is sent back: if TripSure's fee moved in the meantime the cancel is refused
      const shown = cancelling?.quote;
      const r: any = await bookingCancelHotel(item.id, shown ? { cancellation_charges: shown.cancellation_charges, refund_amount: shown.refund_amount } : undefined);
      const owed = shown?.refund_amount ?? 0;
      setCancelling(null);
      if (r && r.status === "check_required") {
        // TripSure took the request but hasn't reported the room Cancelled: not a cancellation yet
        setErr("TripSure hasn't confirmed the cancellation yet. Use Check status on the room before doing anything else.");
      } else {
        toast("Hotel booking cancelled", "success");
        if (owed > 0 && f && f.payment.paid - (f.payment.refunded || 0) > 0.5) setRefundOpen({ amount: owed });
      }
    } catch (e: any) {
      setErr(errText(e));
      if (e && e.status === 409 && /fee changed/i.test(errText(e))) {
        // show the new fee so the advisor can decide again
        try { setCancelling({ item, quote: (await bookingHotelCancelQuote(item.id)) as CancelQuote }); } catch { /* the message above stays */ }
      }
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function openVoucher(item: FulfilmentItem) {
    setBusy(item.id);
    setErr(null);
    try {
      const r: any = await bookingHotelVoucher(item.id);
      setVoucherView({ item, voucher: r.voucher, html: String(r.html || "") });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function downloadInvoice(item: FulfilmentItem, regenerate = false) {
    setBusy(item.id);
    setErr(null);
    try {
      const r: any = await bookingHotelInvoice(item.id, regenerate);
      if (r.blob) {
        const href = URL.createObjectURL(r.blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `hotel-tax-invoice-${item.booking_ref || item.id.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
      } else if (r.url) {
        window.open(r.url, "_blank", "noopener");
      } else {
        setInvoiceView({ item, data: r.data });
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function payOnline() {
    setBusy("razorpay");
    setErr(null);
    try {
      const [o, ready]: [any, boolean] = await Promise.all([bookingRazorpayOrder(order.dbId), loadCheckout()]);
      if (!ready) throw new Error("Couldn't load Razorpay Checkout — check the connection or an ad blocker, then try again.");
      await new Promise<void>((resolve, reject) => {
        const rz = new (window as any).Razorpay({
          key: o.key_id, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: o.currency,
          name: "Booking payment", description: o.description, prefill: o.prefill, theme: { color: "#1f6f5c" },
          handler: (r: any) => {
            bookingRazorpayConfirm(order.dbId, r).then(() => { toast("Payment received", "success"); resolve(); }, reject);
          },
          modal: { ondismiss: () => reject(new Error("Payment window closed — nothing was charged unless Razorpay shows a payment. Try again or record it manually.")) },
        });
        rz.on("payment.failed", (e: any) => reject(new Error(e?.error?.description || "The payment failed.")));
        rz.open();
      });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  function copySummary() {
    const lines = [
      `Booking ${order.id} — ${order.customerName}`,
      order.travelDates,
      ...f!.items.map((i) => {
        const ref = i.kind === "flight"
          ? (i.pnrs?.length ? `PNR ${i.pnrs.join(", ")}` : "not ticketed yet")
          : (i.confirmation_number ? `Confirmation ${i.confirmation_number}` : i.status === "confirmed" ? "Confirmed" : "not confirmed yet");
        return `• ${i.kind === "flight" ? "Flight" : "Hotel"}: ${i.title} — ${ref}`;
      }),
      f!.travellers.list.length ? `Travellers: ${f!.travellers.list.map((t: any) => t.full_name).join(", ")}` : "",
      `Total ${fmtINR(f!.payment.total)} · Paid ${fmtINR(f!.payment.paid)}${f!.payment.due > 0.5 ? ` · Due ${fmtINR(f!.payment.due)}` : ""}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("Booking summary copied", "success"), () => toast("Couldn't copy — select the text manually", "warn"));
  }

  return (
    <div className="ow-card ow-ful">
      <div className="ow-ful-head">
        <div>
          <h4 style={{ margin: 0 }}>Booking progress</h4>
          <div className="ow-sub" style={{ whiteSpace: "normal" }}>{f.next_action}</div>
        </div>
        {pill(stage.tone, stage.label)}
      </div>

      {!f.schema_ready ? (
        <div className="taw-banner taw-banner--warn" style={{ margin: "10px 0 0" }}>
          Ticketing and payments aren&apos;t switched on for this environment yet (database migration db/150 is pending).
          You can still build the order.
        </div>
      ) : null}
      {err ? <div className="taw-banner taw-banner--danger" style={{ margin: "10px 0 0" }}>{err}</div> : null}

      <ol className="ow-ful-steps">
        {/* 1 · Travellers */}
        <li className={travDone ? "done" : "current"}>
          <span className="ow-ful-dot">{travDone ? <Icon name="check" size={13} /> : 1}</span>
          <div className="ow-ful-body">
            <div className="ow-ful-row">
              <b>Travellers</b>
              <button type="button" className={`taw-btn taw-btn--sm${travDone ? "" : " taw-btn--primary"}`}
                disabled={locked || !f.schema_ready} onClick={() => setTravOpen(true)}>
                {f.travellers.list.length ? "Edit" : "Add travellers"}
              </button>
            </div>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>
              {f.travellers.mix_error
                ? f.travellers.mix_error
                : f.travellers.list.length
                  ? `${f.travellers.list.length} added${lead ? ` · Lead: ${lead.full_name}` : ""}${f.travellers.needed && !travDone ? ` · fares are for ${paxText(f.travellers.needed)}` : ""}`
                  : f.travellers.needed
                    ? `Needed: ${paxText(f.travellers.needed)}, names exactly as on ID${f.international ? ", with passports" : ""}.`
                    : "Add the guests for this booking."}
            </div>
          </div>
        </li>

        {/* 2 · Payment */}
        <li className={payDone ? "done" : travDone ? "current" : ""}>
          <span className="ow-ful-dot">{payDone ? <Icon name="check" size={13} /> : 2}</span>
          <div className="ow-ful-body">
            <div className="ow-ful-row">
              <b>Payment</b>
              {!payDone ? (
                <span className="ow-ful-acts" style={{ margin: 0 }}>
                  <button type="button" className={`taw-btn taw-btn--sm${travDone && gw?.configured ? " taw-btn--primary" : ""}`}
                    disabled={locked || !f.schema_ready || f.payment.total <= 0 || !gw?.configured || !!busy} onClick={payOnline}
                    title={gw?.configured ? undefined : "Razorpay credentials are missing on the server"}>
                    {busy === "razorpay" ? "Opening…" : `Pay ${fmtINR(f.payment.due)} online${gw?.mode === "test" ? " (test)" : ""}`}
                  </button>
                  <button type="button" className="taw-btn taw-btn--sm"
                    disabled={locked || !f.schema_ready || f.payment.total <= 0} onClick={() => setPayOpen(true)}>
                    Record payment
                  </button>
                </span>
              ) : null}
            </div>
            {!payDone && f.schema_ready && gw && !gw.configured ? (
              <div className="taw-banner taw-banner--warn" style={{ margin: "6px 0" }}>
                {/* One text block: the banner is a flex row, so loose text and <code> became columns. */}
                <span style={{ whiteSpace: "normal" }}>
                  Online payment (Razorpay) isn&apos;t set up on the server yet (missing {gw.missing.join(", ")}). You can still record payments received outside the portal.
                </span>
              </div>
            ) : null}
            {!payDone && gw?.configured && !gw.webhook_configured ? (
              <div className="taw-banner taw-banner--info" style={{ margin: "6px 0" }}>
                <span style={{ whiteSpace: "normal" }}>
                  RAZORPAY_WEBHOOK_SECRET isn&apos;t set. Payments still confirm in this window, but one made after the window is closed won&apos;t be picked up.
                </span>
              </div>
            ) : null}
            {gwErr ? <div className="ow-sub">Couldn&apos;t check whether online payment is set up.</div> : null}
            <div className="ow-sub">
              {fmtINR(f.payment.paid)} of {fmtINR(f.payment.total)} received{f.payment.due > 0.5 ? ` · ${fmtINR(f.payment.due)} due` : ""}
            </div>
            {f.payment.payments.some((p) => p.status === "paid") ? (
              <ul className="ow-ful-pays">
                {f.payment.payments.filter((p) => p.status === "paid").map((p) => (
                  <li key={p.id}>
                    <span>{fmtINR(p.amount)} · {(METHODS.find((m) => m.key === p.method) || { label: p.method === "razorpay" ? "Razorpay" : p.method || "Payment" }).label}</span>
                    <span className="ow-sub">{p.reference ? `Ref ${p.reference} · ` : ""}{p.paid_at ? String(p.paid_at).slice(0, 10) : ""}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {(f.payment.refunded || 0) > 0 ? (
              <ul className="ow-ful-pays">
                {f.payment.payments.filter((p) => p.status === "refunded").map((p) => (
                  <li key={p.id}>
                    <span>Refunded {fmtINR(p.amount)} · {(METHODS.find((m) => m.key === p.method) || { label: p.method || "Refund" }).label}</span>
                    <span className="ow-sub">{p.reference ? `Ref ${p.reference} · ` : ""}{p.paid_at ? String(p.paid_at).slice(0, 10) : ""}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {f.items.some((i) => i.status === "cancelled") && f.payment.paid - (f.payment.refunded || 0) > 0.5 && !refundOpen ? (
              <div className="ow-ful-acts">
                <button type="button" className="taw-btn taw-btn--sm" onClick={() => setRefundOpen({ amount: 0 })}>Record refund to customer</button>
              </div>
            ) : null}
            {servicing ? (
              <FlightServicingModal itemId={servicing.id} title={servicing.title}
                onClose={() => { setServicing(null); onChanged(); }} onChanged={onChanged}
                onRefund={(amount) => setRefundOpen({ amount })} onCollect={() => setPayOpen(true)} />
            ) : null}
            {refundOpen ? (
              <RefundForm order={order} returnable={Math.round((f.payment.paid - (f.payment.refunded || 0)) * 100) / 100} suggested={refundOpen.amount}
                payments={f.payment.payments}
                onClose={() => setRefundOpen(null)} onSaved={() => { setRefundOpen(null); onChanged(); }} />
            ) : null}
            {payOpen ? <PaymentForm order={order} due={f.payment.due} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); onChanged(); }} /> : null}
          </div>
        </li>

        {/* 3 · Book */}
        <li className={f.stage === "booked" ? "done" : travDone && payDone ? "current" : ""}>
          <span className="ow-ful-dot">{f.stage === "booked" ? <Icon name="check" size={13} /> : 3}</span>
          <div className="ow-ful-body">
            <div className="ow-ful-row"><b>Book with the supplier</b></div>
            {f.items.length === 0 ? <div className="ow-sub">Add a flight or hotel to this order first.</div> : null}
            <ul className="ow-ful-items">
              {f.items.map((it) => {
                const st = ITEM_STATUS[it.status] || { label: it.status, tone: "warn" };
                const done = it.status === "ticketed" || it.status === "confirmed";
                return (
                  <li key={it.id}>
                    <div className="ow-ful-row">
                      <span className="ow-ful-item">
                        <Icon name={it.kind === "flight" ? "flight" : "hotel"} size={14} />
                        <span><b>{it.title}</b><small>{it.label}{it.amount ? ` · ${fmtINR(it.amount)}` : ""}{it.kind === "flight" && it.party && it.amount ? ` ${priceCovers(it.amount, it.party, fmtINR)}` : ""}</small></span>
                      </span>
                      {pill(st.tone, st.label)}
                    </div>
                    {done ? (
                      <div className="ow-ful-ref">
                        {it.kind === "flight"
                          ? (it.pnrs?.length ? <>PNR <b>{it.pnrs.join(", ")}</b></> : "Ticketed")
                          : (it.confirmation_number ? <>Confirmation <b>{it.confirmation_number}</b></> : "Confirmed")}
                        {it.booking_ref ? <span className="ow-sub"> · TripSure {it.booking_ref}</span> : null}
                        {it.kind === "flight" && it.tickets?.length ? (
                          <div className="ow-sub" style={{ whiteSpace: "normal" }}>
                            Ticket{it.tickets.length > 1 ? "s" : ""}: {it.tickets.map((t, i) => (
                              <span key={i}>{i ? " · " : ""}{t.name ? `${t.name} ` : ""}<b>{t.number}</b>{(it.tickets || []).some((x) => x.route !== t.route) && t.route ? ` (${t.route})` : ""}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {it.error && !done ? <div className="ow-ful-err">{it.error}</div> : null}
                    {it.hold && !done ? (
                      <div className="ow-sub" style={{ whiteSpace: "normal" }}>
                        TripSure placed a hold with the airline{it.hold.pnr ? <> (PNR <b>{it.hold.pnr}</b>)</> : null}
                        {it.hold.last_ticket_date ? <>; it lapses on <b>{String(it.hold.last_ticket_date).replace("T", " ").slice(0, 16)}</b> unless ticketed</> : null}.
                      </div>
                    ) : null}
                    {!done && it.blocked_reason && it.status !== "check_required" ? (
                      <div className="ow-sub" style={{ whiteSpace: "normal" }}>{it.blocked_reason}</div>
                    ) : null}

                    <div className="ow-ful-acts">
                      {!done && it.can_book ? (
                        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={!!busy}
                          onClick={() => { setFareChange(null); setConfirming({ item: it }); }}>
                          {it.kind === "flight" ? "Issue ticket" : "Confirm hotel"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && !done && it.status !== "cancelled" && it.status !== "booking" ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy || settling === it.id} onClick={() => payHotel(it)}>
                          {settling === it.id ? "Confirming settlement…" : busy === it.id ? "Opening…" : "Pay via TripSure"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && (it.status === "pending" || it.status === "check_required" || it.can_cancel) ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy}
                          onClick={() => simple(it.id, () => bookingCheckHotel(it.id), "Status updated from the supplier")}>
                          {busy === it.id ? "Checking…" : "Check status"}
                        </button>
                      ) : null}
                      {it.kind === "flight" && it.status !== "fare_locked" ? (
                        <button type="button" className="taw-btn taw-btn--sm" aria-expanded={!!tsOrder[it.id]} onClick={() => toggleTsOrder(it.id)}>
                          {tsOrder[it.id]?.busy ? "Loading…" : tsOrder[it.id] ? "Hide TripSure order" : "TripSure order"}
                        </button>
                      ) : null}
                      {it.kind === "flight" && it.can_service ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} onClick={() => setServicing(it)}>Cancel or change</button>
                      ) : null}
                      {it.kind === "flight" && it.status === "check_required" ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy}
                          onClick={() => simple(it.id, () => bookingCheckFlight(it.id), "Status updated from TripSure")}>
                          {busy === it.id ? "Checking…" : "Check status"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && it.can_invoice ? (
                        <>
                          <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} onClick={() => downloadInvoice(it)}>
                            {busy === it.id ? "Working…" : "Tax invoice"}
                          </button>
                          <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} title="Ask Tripsure to rebuild the invoice instead of sending its saved copy"
                            onClick={() => downloadInvoice(it, true)}>
                            Regenerate invoice
                          </button>
                        </>
                      ) : null}
                      {it.kind === "hotel" && it.status === "confirmed" ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} title="The guest voucher, made from this booking"
                          onClick={() => openVoucher(it)}>
                          {busy === it.id ? "Working…" : "Voucher"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && ["booking", "pending", "confirmed", "check_required", "failed", "cancelled"].includes(it.status) ? (
                        <button type="button" className="taw-btn taw-btn--sm" aria-expanded={!!hotelOpen[it.id]}
                          onClick={() => setHotelOpen((m) => ({ ...m, [it.id]: !m[it.id] }))}>
                          {hotelOpen[it.id] ? "Hide booking details" : "Booking details"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && it.can_cancel ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} onClick={() => openCancel(it)}>
                          Cancel booking
                        </button>
                      ) : null}
                      {it.status === "check_required" || it.status === "failed" ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy}
                          onClick={() => setConfirming({ item: { ...it, status: "__reset" } })}>
                          Mark as not booked
                        </button>
                      ) : null}
                    </div>

                    {it.kind === "flight" && it.documents_required?.length && it.status === "fare_locked" ? (
                      <div className="ow-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>
                        This fare needs: {it.documents_required.map((d) => (d === "pan" ? "PAN" : d === "gst" ? "GST details" : "passports")).join(", ")}.
                      </div>
                    ) : null}
                    {it.kind === "hotel" && (it.status === "booking" || it.status === "pending" || it.status === "check_required") ? (
                      <div className="ow-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>
                        {it.status === "check_required"
                          ? "Tripsure's answer wasn't clear. Don't confirm this room again — it could create a duplicate booking. Use Booking details or Check status to see what Tripsure has."
                          : "Tripsure is still confirming this room. Don't confirm it again; the status refreshes by itself, or press Check status."}
                      </div>
                    ) : null}
                    {it.kind === "hotel" && hotelOpen[it.id] ? <HotelBookingDetails item={it} onRefreshed={onChanged} /> : null}
                    {tsOrder[it.id] && !tsOrder[it.id].busy ? (
                      <div className="ow-ts">
                        {tsOrder[it.id].err ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{tsOrder[it.id].err}</div> : (() => {
                          const o = tsOrder[it.id].data || {};
                          return (
                            <>
                              <div className="ow-ts-head">
                                <b>{o.order_no || "TripSure order"}</b>
                                {o.status ? <span className={`ow-ts-st ${String(o.status).toLowerCase()}`}>{String(o.status).replace(/_/g, " ")}</span> : null}
                                {o.total != null ? <span>{fmtINR(o.total)}</span> : null}
                              </div>
                              {(o.line_items || []).map((li: any, k: number) => (
                                <div key={k} className="ow-ts-row">
                                  <span>{li.from} → {li.to}</span>
                                  <span>{li.supplier ? `${li.supplier} · ` : ""}booking {li.booking_id || "—"}{li.pnr ? ` · PNR ${li.pnr}` : ""}</span>
                                </div>
                              ))}
                              {(o.events || []).length ? (
                                <ol className="ow-ts-events">
                                  {o.events.map((e: any, k: number) => (
                                    <li key={k}><b>{e.title || e.type}</b><small>{e.at ? new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}</small></li>
                                  ))}
                                </ol>
                              ) : null}
                              {it.trace_id ? <div className="ow-sub">Trace id for TripSure support: {it.trace_id}</div> : null}
                            </>
                          );
                        })()}
                      </div>
                    ) : null}
                    {confirming?.item.id === it.id ? (
                      <ConfirmBox
                        item={confirming.item}
                        busy={busy === it.id}
                        onCancel={() => setConfirming(null)}
                        onConfirm={() => confirming.item.status === "__reset"
                          ? (setConfirming(null), simple(it.id, () => bookingResetItem(it.kind, it.id), "Cleared — you can book it again"))
                          : run(it)}
                      />
                    ) : null}
                    {cancelling?.item.id === it.id && cancelling.quote ? (
                      <div className="ow-ful-confirm" role="alertdialog" aria-label="Confirm cancellation">
                        <div style={{ whiteSpace: "normal" }}>
                          Cancel <b>{it.title}</b>? TripSure&apos;s cancellation terms apply as of now:
                        </div>
                        <ul className="ow-sub" style={{ whiteSpace: "normal", margin: "6px 0" }}>
                          {cancelling.quote.booking_amount != null ? <li>Booking amount: {fmtINR(cancelling.quote.booking_amount)}</li> : null}
                          {cancelling.quote.hotel_charges ? <li>Hotel charges: {fmtINR(cancelling.quote.hotel_charges)}</li> : null}
                          {cancelling.quote.discount ? <li>Discount: {fmtINR(cancelling.quote.discount)}</li> : null}
                          <li>Cancellation charges: <b>{fmtINR(cancelling.quote.cancellation_charges ?? 0)}</b></li>
                          <li>Refund: <b>{fmtINR(cancelling.quote.refund_amount ?? 0)}</b></li>
                        </ul>
                        {policyLines(cancelling.quote.policies).length ? (
                          <details className="ow-room-pol">
                            <summary>Tripsure&apos;s cancellation schedule</summary>
                            <ul className="ow-sub" style={{ whiteSpace: "normal", margin: "6px 0" }}>
                              {policyLines(cancelling.quote.policies).map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                          </details>
                        ) : null}
                        <div className="ow-sub" style={{ whiteSpace: "normal" }}>
                          This can&apos;t be undone. Any refund to the customer is handled outside this screen.
                        </div>
                        <div className="ow-ful-acts">
                          <button type="button" className="taw-btn taw-btn--sm" disabled={busy === it.id} onClick={() => setCancelling(null)}>Keep booking</button>
                          <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={busy === it.id} onClick={() => doCancel(it)}>
                            {busy === it.id ? "Cancelling…" : "Yes, cancel the room"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {fareChange?.item.id === it.id ? (
                      <div className="ow-ful-confirm">
                        <div style={{ whiteSpace: "normal" }}>{fareChange.message}</div>
                        <div className="ow-ful-acts">
                          <button type="button" className="taw-btn taw-btn--sm" onClick={() => setFareChange(null)}>Don&apos;t book</button>
                          <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={!!busy} onClick={() => run(it, true)}>
                            Accept new fare and issue ticket
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </li>
      </ol>

      {f.items.length ? (
        <button type="button" className="taw-btn taw-btn--sm" onClick={copySummary}>
          <Icon name="note" size={13} /> Copy booking summary
        </button>
      ) : null}

      <OrderActivity orderId={order.id} f={f} />

      {invoiceView ? (
        <HotelInvoiceView data={invoiceView.data} title={invoiceView.item.title} reference={invoiceView.item.booking_ref || invoiceView.item.confirmation_number || ""}
          busy={busy === invoiceView.item.id}
          onClose={() => setInvoiceView(null)}
          onRegenerate={() => { const it = invoiceView.item; setInvoiceView(null); downloadInvoice(it, true); }} />
      ) : null}

      {voucherView ? (
        <HotelVoucherView voucher={voucherView.voucher} html={voucherView.html} onClose={() => setVoucherView(null)} />
      ) : null}

      {travOpen ? (
        <TravellersForm order={order} onClose={() => setTravOpen(false)} onSaved={() => { setTravOpen(false); onChanged(); }} />
      ) : null}
    </div>
  );
}

function ConfirmBox({ item, busy, onCancel, onConfirm }: { item: FulfilmentItem; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const reset = item.status === "__reset";
  return (
    <div className="ow-ful-confirm" role="alertdialog" aria-label="Confirm action">
      <div style={{ whiteSpace: "normal" }}>
        {reset
          ? "Only do this after TripSure support has confirmed nothing was booked. The item can then be booked again."
          : item.kind === "flight"
            ? <>Issue the ticket for <b>{item.title}</b>{item.amount ? <> ({fmtINR(item.amount)} fare)</> : null}? The passengers are sent to the airline and the ticket is issued. This can&apos;t be undone here.</>
            : <>Confirm <b>{item.title}</b>{item.amount ? <> for {fmtINR(item.amount)}</> : null} with the supplier? This books the room and can&apos;t be undone here.</>}
      </div>
      <div className="ow-ful-acts">
        <button type="button" className="taw-btn taw-btn--sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`taw-btn taw-btn--sm${reset ? "" : " taw-btn--primary"}`} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : reset ? "Yes, mark as not booked" : item.kind === "flight" ? "Issue ticket" : "Confirm hotel"}
        </button>
      </div>
    </div>
  );
}

// Money paid back to the customer outside the portal. TripSure's cancellation quote pre-fills the amount.
function RefundForm({ order, returnable, suggested, payments, onClose, onSaved }: {
  order: Order; returnable: number; suggested: number; payments?: PaymentRow[]; onClose: () => void; onSaved: () => void;
}) {
  const first = suggested > 0 ? Math.min(suggested, returnable) : returnable;
  // Payments taken online on TripAgent's Razorpay can be refunded straight back to the customer's card / UPI.
  const online = (payments || []).filter((p) => p.can_refund_online && (p.refundable_left || 0) > 0);
  const [how, setHow] = useState<"online" | "manual">(online.length ? "online" : "manual");
  const [payId, setPayId] = useState(online[0]?.id || "");
  const chosen = online.find((p) => p.id === payId) || online[0];
  const onlineMax = chosen ? Math.min(chosen.refundable_left || 0, returnable) : 0;
  const [onlineAmt, setOnlineAmt] = useState(String(Math.round(Math.min(first, onlineMax || first) * 100) / 100));
  const [sure, setSure] = useState(false);
  const onlineNum = Number(onlineAmt);
  const onlineOk = !!chosen && onlineNum >= 1 && onlineNum <= onlineMax + 0.005 && sure;
  function refundOnline() {
    if (!chosen) return;
    setSaving(true);
    setErr(null);
    bookingRefundOnline(order.dbId, { payment_id: chosen.id, amount: onlineNum })
      .then(() => { toast(`${fmtINR(onlineNum)} refunded to the customer`, "success"); onSaved(); })
      .catch((e: any) => setErr(errText(e)))
      .finally(() => setSaving(false));
  }
  const [form, setForm] = useState({ amount: String(Math.round(first * 100) / 100), method: "upi", reference: "", refunded_on: new Date().toISOString().slice(0, 10), note: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const needsRef = form.method !== "cash" && form.method !== "agency_credit";
  const amount = Number(form.amount);
  const ok = amount > 0 && amount <= returnable + 0.5 && (!needsRef || form.reference.trim());

  function save() {
    setSaving(true);
    setErr(null);
    bookingRecordRefund(order.dbId, {
      amount, method: form.method, reference: form.reference.trim() || null, refunded_on: form.refunded_on || null, note: form.note.trim() || null,
    })
      .then(() => { toast("Refund recorded", "success"); onSaved(); })
      .catch((e: any) => setErr(errText(e)))
      .finally(() => setSaving(false));
  }

  return (
    <div className="ow-ful-form">
      {online.length ? (
        <div className="ow-tabs" role="tablist" aria-label="How the customer is paid back">
          <button type="button" role="tab" aria-selected={how === "online"} className={"ow-tab" + (how === "online" ? " is-active" : "")} onClick={() => setHow("online")}>Refund through Razorpay</button>
          <button type="button" role="tab" aria-selected={how === "manual"} className={"ow-tab" + (how === "manual" ? " is-active" : "")} onClick={() => setHow("manual")}>I paid them back myself</button>
        </div>
      ) : null}
      {how === "online" && chosen ? (
        <>
          <div className="taw-banner taw-banner--info" style={{ whiteSpace: "normal" }}>
            The customer is paid back now, on the card / UPI they paid with, through TripAgent&apos;s Razorpay (it usually reaches them in 5–7 working days).
            Up to {fmtINR(onlineMax)} can be refunded this way.
          </div>
          {err ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal" }}>{err}</div> : null}
          {online.length > 1 ? (
            <Field label="Payment to refund" htmlFor="ref-online-pay">
              <select className="taw-input" value={chosen.id} onChange={(e) => { setPayId(e.target.value); setSure(false); }}>
                {online.map((p) => <option key={p.id} value={p.id}>{fmtINR(p.amount)}{p.paid_at ? ` · ${String(p.paid_at).slice(0, 10)}` : ""} · {fmtINR(p.refundable_left || 0)} left</option>)}
              </select>
            </Field>
          ) : (
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>
              Payment of {fmtINR(chosen.amount)}{chosen.paid_at ? ` on ${String(chosen.paid_at).slice(0, 10)}` : ""} · {fmtINR(chosen.refundable_left || 0)} left to refund
            </div>
          )}
          <Field label="Amount to refund" htmlFor="ref-online-amt">
            <input className="taw-input" inputMode="decimal" value={onlineAmt} onChange={(e) => { setOnlineAmt(e.target.value.replace(/[^\d.]/g, "")); setSure(false); }} />
          </Field>
          <label className="ow-tf-lead">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            Refund {fmtINR(onlineNum || 0)} to the customer now. This can&apos;t be undone.
          </label>
          <div className="ow-ful-acts">
            <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={saving}>Not now</button>
            <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={refundOnline} disabled={!onlineOk || saving}>
              {saving ? "Refunding…" : `Refund ${fmtINR(onlineNum || 0)}`}
            </button>
          </div>
        </>
      ) : (
      <>
      <div className="taw-banner taw-banner--info" style={{ whiteSpace: "normal" }}>
        Record the money you have paid back to the customer (up to {fmtINR(returnable)} still returnable). This only keeps the record; the transfer itself is made outside this screen.
      </div>
      {err ? <div className="taw-banner taw-banner--danger">{err}</div> : null}
      <div className="ow-grid2">
        <Field label="Amount refunded" htmlFor="ref-amt">
          <input className="taw-input" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <Field label="Method" htmlFor="ref-method">
          <select className="taw-input" value={form.method} onChange={(e) => set("method", e.target.value)}>
            {METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>
        <Field label={needsRef ? "Reference (UTR / transaction id)" : "Reference (optional)"} htmlFor="ref-ref">
          <input className="taw-input" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
        <Field label="Refunded on" htmlFor="ref-date">
          <input className="taw-input" type="date" value={form.refunded_on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("refunded_on", e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="ref-note">
        <input className="taw-input" value={form.note} onChange={(e) => set("note", e.target.value)} />
      </Field>
      <div className="ow-ful-acts">
        <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={saving}>Not now</button>
        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={save} disabled={!ok || saving}>
          {saving ? "Saving…" : "Record refund"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}

function PaymentForm({ order, due, onClose, onSaved }: { order: Order; due: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: String(Math.round(due * 100) / 100), method: "upi", reference: "", paid_on: new Date().toISOString().slice(0, 10), note: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const needsRef = form.method !== "cash" && form.method !== "agency_credit";
  const amount = Number(form.amount);
  const ok = amount > 0 && amount <= due + 0.5 && (!needsRef || form.reference.trim());

  function save() {
    setSaving(true);
    setErr(null);
    bookingRecordPayment(order.dbId, {
      amount, method: form.method, reference: form.reference.trim() || null, paid_on: form.paid_on || null, note: form.note.trim() || null,
    })
      .then(() => { toast("Payment recorded", "success"); onSaved(); })
      .catch((e: any) => setErr(errText(e)))
      .finally(() => setSaving(false));
  }

  return (
    <div className="ow-ful-form">
      {err ? <div className="taw-banner taw-banner--danger">{err}</div> : null}
      <div className="ow-grid2">
        <Field label={`Amount received (₹${due.toLocaleString("en-IN")} due)`} htmlFor="pay-amt">
          <input className="taw-input" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <Field label="Method" htmlFor="pay-method">
          <select className="taw-input" value={form.method} onChange={(e) => set("method", e.target.value)}>
            {METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>
        <Field label={needsRef ? "Reference (UTR / transaction id)" : "Reference (optional)"} htmlFor="pay-ref">
          <input className="taw-input" value={form.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
        <Field label="Received on" htmlFor="pay-date">
          <input className="taw-input" type="date" value={form.paid_on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("paid_on", e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="pay-note">
        <input className="taw-input" value={form.note} onChange={(e) => set("note", e.target.value)} />
      </Field>
      <div className="ow-ful-acts">
        <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={save} disabled={!ok || saving}>
          {saving ? "Saving…" : "Record payment"}
        </button>
      </div>
    </div>
  );
}
