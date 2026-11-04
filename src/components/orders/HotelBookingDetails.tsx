"use client";

/* Tripsure's own record of a hotel booking (guide 6.7 "Booking Details"). The hotel twin of the
   flight "TripSure order" panel: opened on demand from Booking progress, it re-reads the booking
   with Tripsure so a slow or unclear Book Room outcome can be reconciled, and shows the trace id
   to quote to Tripsure support (guide section 9).

   The guide gives no response schema for this call, so the panel reads the fields it knows by
   several likely names and lists whatever else is a plain value. Nothing here writes anything. */

import { useEffect, useState } from "react";
import { bookingHotelTripsureBooking } from "../../services/api";
import { errText } from "../../lib/errText";
import { collectPolicies, maskedJson } from "../../lib/hotelPolicy";
import { fmtINR, type FulfilmentItem } from "../../lib/orderTypes";

/** The journey's x-trace-id: the backend derives it from the hotel row id ("adm-" + 32 hex). */
export function hotelTraceId(hotelId: string): string {
  return "adm-" + String(hotelId).replace(/-/g, "");
}

/** Booking states Tripsure can answer with, in the words an advisor needs. */
function describeStatus(raw: string): { label: string; tone: "success" | "info" | "danger" | "warn"; note?: string } {
  const s = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (/^(confirmed|booked|success|completed)$/.test(s)) return { label: "Confirmed", tone: "success" };
  if (/(cancelled|canceled)/.test(s)) return { label: "Cancelled", tone: "danger" };
  if (/(fail|reject|declin)/.test(s)) return { label: "Failed", tone: "danger", note: "Tripsure did not book this room." };
  if (/(process|pending|progress|await|initiat|hold)/.test(s)) {
    return { label: "Processing", tone: "info", note: "Tripsure is still confirming. Don't confirm the room again — check back shortly." };
  }
  return { label: raw, tone: "warn" };
}

const KNOWN: Record<string, string[]> = {
  status: ["status", "bookingStatus", "booking_status", "orderStatus", "state"],
  hotel: ["hotelName", "hotel_name", "propertyName"],
  confirmation: ["confirmationNumber", "confirmationNo", "hotelConfirmationNumber", "bookingReference", "supplierReference", "pnr"],
  checkIn: ["checkIn", "checkInDate"],
  checkOut: ["checkOut", "checkOutDate"],
  amount: ["totalAmount", "bookingAmount", "amount", "total", "totalRate"],
  policy: ["cancellationPolicy", "cancellation"],
};

function pick(o: any, keys: string[]): any {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
}

/** Where the booking object lives: the envelope's `response`, or a nested `booking`. */
function unwrap(d: any): any {
  let o = d && typeof d === "object" ? d : {};
  if (o.response && typeof o.response === "object") o = o.response;
  if (o.booking && typeof o.booking === "object") o = { ...o, ...o.booking };
  return o;
}

const SHOWN = new Set(Object.values(KNOWN).flat());
const SKIP_LIKE = /(token|key|password|secret|pan|gst|email|mobile|phone)/i;

function fmtDate(v: any): string {
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? String(v) : new Date(t).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export function HotelBookingDetails({ item, onRefreshed }: { item: FulfilmentItem; onRefreshed?: () => void }) {
  const [state, setState] = useState<{ busy: boolean; err?: string; data?: any; at?: Date }>({ busy: true });
  const [copied, setCopied] = useState(false);
  const trace = item.trace_id || hotelTraceId(item.id);

  // The first read starts as soon as the panel opens (state begins "busy"); Refresh re-reads.
  function read(live: () => boolean = () => true) {
    bookingHotelTripsureBooking(item.id)
      .then((d: any) => { if (!live()) return; setState({ busy: false, data: d, at: new Date() }); if (onRefreshed) onRefreshed(); })
      .catch((e: any) => { if (live()) setState((s) => ({ ...s, busy: false, err: errText(e) })); });
  }
  function load() {
    setState((s) => ({ ...s, busy: true, err: undefined }));
    read();
  }
  useEffect(() => {
    let alive = true;
    read(() => alive);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const o = unwrap(state.data);
  const rawStatus = pick(o, KNOWN.status);
  const st = rawStatus != null ? describeStatus(String(rawStatus)) : null;
  const hotel = pick(o, KNOWN.hotel);
  const conf = pick(o, KNOWN.confirmation);
  const cin = pick(o, KNOWN.checkIn);
  const cout = pick(o, KNOWN.checkOut);
  const amount = Number(pick(o, KNOWN.amount));
  const policy = pick(o, KNOWN.policy);
  const schedule = collectPolicies(o);
  const rest = Object.entries(o)
    .filter(([k, v]) => !SHOWN.has(k) && !SKIP_LIKE.test(k) && v != null && v !== "" && typeof v !== "object")
    .slice(0, 12);

  return (
    <div className="ow-ts" aria-live="polite">
      <div className="ow-ts-head">
        <b>Tripsure booking</b>
        {st ? <span className={`ow-ts-st ${st.tone === "success" ? "confirmed" : st.tone === "danger" ? "booking_failed" : ""}`}>{st.label}</span> : null}
        {Number.isFinite(amount) && amount > 0 ? <span>{fmtINR(amount)}</span> : null}
        <button type="button" className="taw-btn taw-btn--sm" disabled={state.busy} onClick={load} style={{ marginLeft: "auto" }}>
          {state.busy ? "Reading…" : "Refresh"}
        </button>
      </div>

      {state.busy && !state.data ? <div className="ow-sub">Asking Tripsure for this booking…</div> : null}
      {state.err ? <div className="ow-ful-err" style={{ whiteSpace: "normal" }}>{state.err}</div> : null}
      {st?.note ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{st.note}</div> : null}

      {state.data ? (
        <>
          {hotel ? <div className="ow-ts-row"><span>Hotel</span><span>{String(hotel)}</span></div> : null}
          {cin || cout ? <div className="ow-ts-row"><span>Stay</span><span>{cin ? fmtDate(cin) : "—"} → {cout ? fmtDate(cout) : "—"}</span></div> : null}
          {conf ? <div className="ow-ts-row"><span>Hotel confirmation</span><b>{String(conf)}</b></div> : null}
          {item.booking_ref ? <div className="ow-ts-row"><span>Tripsure reference</span><span>{item.booking_ref}</span></div> : null}
          {rest.map(([k, v]) => (
            <div key={k} className="ow-ts-row"><span>{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase()}</span><span>{String(v)}</span></div>
          ))}
          {schedule.length || (typeof policy === "string" && policy) ? (
            <details className="ow-room-pol" open={schedule.length > 0 && schedule.length <= 4}>
              <summary>Cancellation policy</summary>
              {schedule.length ? <ul className="ow-sub" style={{ whiteSpace: "normal", margin: "6px 0" }}>{schedule.map((l, i) => <li key={i}>{l}</li>)}</ul> : <div className="ow-pre">{String(policy)}</div>}
            </details>
          ) : null}
          <details className="ow-room-pol">
            <summary>Raw Tripsure response</summary>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>Exactly what Tripsure sent, with personal details hidden. Quote it to support, or use it to see a field this panel doesn&apos;t list.</div>
            <pre className="ow-pre" style={{ maxHeight: 260, overflow: "auto", fontSize: 11 }}>{maskedJson(state.data)}</pre>
          </details>
        </>
      ) : null}

      <div className="ow-sub" style={{ whiteSpace: "normal", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>Trace id for Tripsure support: <b>{trace}</b></span>
        <button type="button" className="taw-btn taw-btn--sm"
          onClick={() => { try { navigator.clipboard.writeText(trace); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } }}>
          {copied ? "Copied" : "Copy"}
        </button>
        {state.at ? <span>· read {state.at.toLocaleTimeString("en-IN", { timeStyle: "short" })}</span> : null}
      </div>
    </div>
  );
}
