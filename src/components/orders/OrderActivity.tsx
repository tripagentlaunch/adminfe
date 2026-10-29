"use client";
/* Booking activity for one order: why it is still pending (from the server's own
   fulfilment answer) and the journey log of what was done to it (booking_events,
   db/155) — lock, book, cancel, ticket, payments — newest first, each with the
   TripSure trace id to quote to support. */
import { useEffect, useState } from "react";
import { bookingEvents } from "../../services/api";
import { fmtINR, type Fulfilment } from "../../lib/orderTypes";

type Ev = { id: number; item_type: string | null; step: string; status: "ok" | "failed" | "unclear"; trace_id?: string | null; summary?: any; created_at: string };

const STEP: Record<string, string> = {
  lock: "Locked with TripSure", book: "Booking sent to TripSure", ticket: "Ticket issued", cancel: "Cancelled",
  payment_started: "Online payment started", payment_paid: "Online payment received", payment_recorded: "Payment recorded", refund_recorded: "Refund recorded",
};
const TONE: Record<string, string> = { ok: "success", failed: "danger", unclear: "warn" };
const KIND: Record<string, string> = { flight: "Flight", hotel: "Hotel", payment: "Payment", order: "Order", visa: "Visa" };

function detail(e: Ev): string {
  const s = e.summary || {};
  return [
    s.hotel, s.amount != null ? fmtINR(Number(s.amount)) : null, s.method, s.reference ? `ref ${s.reference}` : null,
    s.booking_ref ? `ref ${s.booking_ref}` : null, s.pnrs && s.pnrs.length ? `PNR ${s.pnrs.join(", ")}` : null,
    s.supplier_status ? `supplier: ${s.supplier_status}` : null, s.razorpay_payment_id ? `txn ${s.razorpay_payment_id}` : s.razorpay_order_id ? `Razorpay order ${s.razorpay_order_id}` : null, s.error,
  ].filter(Boolean).join(" · ");
}

// Everything keeping the order from moving on, in plain words.
function reasons(f: Fulfilment): string[] {
  const out: string[] = [];
  if (f.stage === "booked" || f.stage === "cancelled" || f.stage === "empty") return out;
  if (f.next_action) out.push(f.next_action);
  if (f.payment.due > 0.5 && f.stage !== "payment") out.push(`${fmtINR(f.payment.due)} of ${fmtINR(f.payment.total)} is still unpaid.`);
  f.items.forEach((it) => {
    if (it.status === "confirmed" || it.status === "ticketed" || it.status === "cancelled") return;
    const why = it.error || it.blocked_reason;
    out.push(`${it.kind === "flight" ? "Flight" : "Hotel"} ${it.title}: ${why || "waiting for the earlier steps"}`);
  });
  return Array.from(new Set(out));
}

export function OrderActivity({ orderId, f }: { orderId: string; f: Fulfilment }) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Refetched whenever the fulfilment changes (every booking action returns a fresh one).
  useEffect(() => {
    let live = true;
    bookingEvents(orderId)
      .then((r: any) => live && (setEvents((r && r.events) || []), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [orderId, f]);
  const why = reasons(f);
  return (
    <div className="ow-act" style={{ marginTop: 14 }}>
      {why.length ? (
        <div className="taw-banner taw-banner--warn" style={{ display: "block", whiteSpace: "normal" }}>
          <b>Why this order is still pending</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{why.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      ) : null}
      <h4 style={{ margin: "12px 0 6px" }}>Booking activity</h4>
      {failed ? <div className="ow-sub">Couldn&apos;t load the activity log.</div> : null}
      {events && !events.length && !failed ? (
        <div className="ow-sub" style={{ whiteSpace: "normal" }}>
          Nothing logged yet. Locking a room or fare, booking, cancelling and recording a payment will appear here.
        </div>
      ) : null}
      {(events || []).map((e) => (
        <div key={e.id} style={{ borderTop: "1px solid var(--line)", padding: "7px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13 }}>
              <span className={`taw-status taw-status--${TONE[e.status] || "info"}`}>{e.status === "ok" ? "Done" : e.status === "failed" ? "Failed" : "Unclear"}</span>{" "}
              <b>{KIND[e.item_type || ""] || "Order"}</b> · {STEP[e.step] || e.step.replace(/_/g, " ")}
            </div>
            {detail(e) ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{detail(e)}</div> : null}
            {e.trace_id ? <div className="ow-sub">Trace {e.trace_id}</div> : null}
          </div>
          <small className="ow-sub" style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
        </div>
      ))}
    </div>
  );
}
