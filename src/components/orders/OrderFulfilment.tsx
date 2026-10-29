"use client";
/* The order's booking checklist: Travellers -> Payment -> Book. Everything it
   shows comes from GET /booking-orders/{id} -> fulfilment (server-computed:
   what is done, what is blocked and why). Ticketing and hotel confirmation are
   irreversible, so each asks for an in-page confirmation first. */
import { useEffect, useState } from "react";
import { Field, Icon } from "../ui";
import {
  bookingCancelHotel, bookingCheckHotel, bookingConfirmHotel, bookingHotelCancelQuote, bookingHotelInvoice, bookingIssueTicket, bookingPaymentGateway, bookingRazorpayConfirm,
  bookingRazorpayOrder, bookingRecordPayment, bookingRecordRefund, bookingResetItem,
} from "../../services/api";
import { errText } from "../../lib/errText";
import { toast } from "../../lib/advisorHelpers";
import { fmtINR, type Fulfilment, type FulfilmentItem, type Order } from "../../lib/orderTypes";
import { TravellersForm } from "./TravellersForm";

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
  const [refundOpen, setRefundOpen] = useState<{ amount: number } | null>(null); // opened after a cancel, pre-filled with Tripsure's refund
  const [fareChange, setFareChange] = useState<{ item: FulfilmentItem; message: string } | null>(null);

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
      await bookingCancelHotel(item.id);
      toast("Hotel booking cancelled", "success");
      const owed = cancelling?.quote?.refund_amount ?? 0;
      setCancelling(null);
      if (owed > 0 && f && f.payment.paid - (f.payment.refunded || 0) > 0.5) setRefundOpen({ amount: owed });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function downloadInvoice(item: FulfilmentItem) {
    setBusy(item.id);
    setErr(null);
    try {
      const r: any = await bookingHotelInvoice(item.id);
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
        toast("TripSure sent the invoice in a format that can't be downloaded here — see the console", "warn");
        console.warn("hotel tax invoice response", r.data);
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
                Online payment (Razorpay) isn&apos;t set up — missing {gw.missing.map((m) => <code key={m}>{m} </code>)}
                on the server. You can still record payments received outside the portal.
              </div>
            ) : null}
            {!payDone && gw?.configured && !gw.webhook_configured ? (
              <div className="taw-banner taw-banner--info" style={{ margin: "6px 0" }}>
                <code>RAZORPAY_WEBHOOK_SECRET</code> isn&apos;t set. Payments still confirm in this window, but one made after the window is closed won&apos;t be picked up.
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
            {refundOpen ? (
              <RefundForm order={order} returnable={Math.round((f.payment.paid - (f.payment.refunded || 0)) * 100) / 100} suggested={refundOpen.amount}
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
                        <span><b>{it.title}</b><small>{it.label}{it.amount ? ` · ${fmtINR(it.amount)}` : ""}</small></span>
                      </span>
                      {pill(st.tone, st.label)}
                    </div>
                    {done ? (
                      <div className="ow-ful-ref">
                        {it.kind === "flight"
                          ? (it.pnrs?.length ? <>PNR <b>{it.pnrs.join(", ")}</b></> : "Ticketed")
                          : (it.confirmation_number ? <>Confirmation <b>{it.confirmation_number}</b></> : "Confirmed")}
                        {it.booking_ref ? <span className="ow-sub"> · TripSure {it.booking_ref}</span> : null}
                      </div>
                    ) : null}
                    {it.error && !done ? <div className="ow-ful-err">{it.error}</div> : null}
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
                      {it.kind === "hotel" && (it.status === "pending" || it.status === "check_required" || it.can_cancel) ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy}
                          onClick={() => simple(it.id, () => bookingCheckHotel(it.id), "Status updated from the supplier")}>
                          {busy === it.id ? "Checking…" : "Check status"}
                        </button>
                      ) : null}
                      {it.kind === "hotel" && it.can_invoice ? (
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy} onClick={() => downloadInvoice(it)}>
                          {busy === it.id ? "Working…" : "Tax invoice"}
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
                          <li>Cancellation charges: <b>{fmtINR(cancelling.quote.cancellation_charges ?? 0)}</b></li>
                          <li>Refund: <b>{fmtINR(cancelling.quote.refund_amount ?? 0)}</b></li>
                        </ul>
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
function RefundForm({ order, returnable, suggested, onClose, onSaved }: { order: Order; returnable: number; suggested: number; onClose: () => void; onSaved: () => void }) {
  const first = suggested > 0 ? Math.min(suggested, returnable) : returnable;
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
