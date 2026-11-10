"use client";
/* =============================================================================
 * TripAgent — src/components/orders/FlightServicingModal.tsx
 *
 * "Cancel or change" on a ticketed flight: cancellation and date change with TripSure, for the advisor.
 * One card per leg of the ticket (outbound, return), as TripSure's order holds them:
 *
 *   Cancel   Get refund quote -> (what TripSure will refund: base, tax, fee, net) -> confirm -> TripSure
 *            processes it -> settled: the ticket is marked cancelled here and "Record refund" is offered.
 *   Change   pick a new date -> TripSure's options -> Price this change (incl. the airline's reissue charge)
 *            -> collect any charge from the customer -> Confirm -> TripSure reissues the ticket.
 *
 * Nothing moves money here: TripSure cancels / reissues; paying the customer back is the order's own
 * "Record refund" step, opened with the amount. Partial (single passenger) cancellation is not offered.
 * Backend: services/flight_postbooking_service.py (GET /booking-orders/flights/{id}/servicing ...).
 * ===========================================================================*/
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Spinner } from "../ui";
import {
  bookingFlightCancel, bookingFlightCancelQuote, bookingFlightRecordManualCancel, bookingFlightRecordManualDateChange, bookingFlightCancelStatus, bookingFlightRescheduleConfirm,
  bookingFlightRescheduleReview, bookingFlightRescheduleSearch, bookingFlightRescheduleSsr, bookingFlightRescheduleStatus, bookingFlightServicing,
} from "../../services/api";
import { errText } from "../../lib/errText";
import { fmtINR } from "../../lib/orderTypes";

type Leg = {
  id: string; trip_type?: string | null; status: string; route?: string | null; pnr?: string | null; tickets: string[];
  can_cancel: boolean; cancel_blocked?: string | null; can_change: boolean; change_blocked?: string | null;
  refund_amount?: number | null; cancellation_status?: string | null;
  passengers?: { pax_id: string; name: string; pax_type: string; ticket_no: string; cancelled: boolean; ticket_known: boolean }[];
  can_cancel_one?: boolean; cancel_one_blocked?: string | null;
  capabilities?: { feature?: string; supported: boolean; automated: boolean; sla_hours?: number | null }[];
  cancellation?: { request_id?: string | number; status?: string; net_refund?: number } | null;
  reschedule?: { change_request_id?: string; status?: string } | null;
};
type Overview = { order_number?: string; title?: string; voucher_url?: string | null; line_items: Leg[] };
type Quote = { partial?: boolean; passengers?: string[]; pax_ids?: string[]; cancellation_key: string; base_refund?: number | null; tax_refund?: number | null; cancellation_fee?: number | null; net_refund?: number | null; warnings?: string[]; valid_minutes?: number };
type CancelRun = { requestId: string | number; state: "pending" | "success" | "partial" | "failed"; refunded?: number; charges?: number; itineraryCancelled?: boolean; wholeLeg?: boolean; names?: string[]; quotedNet?: number | null; refundDiffers?: boolean };
type SsrItem = { code?: string | null; text?: string | null; price?: number | null; currency?: string; weight?: number | string | null; flight?: string | null; route?: string | null };
type Ssr = {
  busy?: boolean; error?: string;
  data?: { note?: string; sectors: { route: string; status?: string | null; baggage: SsrItem[]; meals: SsrItem[]; seats: SsrItem[]; special_services: SsrItem[] }[] };
};
type Journey = { fare_source_code: string; details: any[] };
type Change = {
  date: string; busy?: "search" | "review" | "confirm"; error?: string; searchKey?: string; journeys?: Journey[]; picked?: string;
  reviewed?: { reissue_charge?: number | null; total?: number | null; base_fare?: number | null; tax?: number | null;
               order_payment?: { paid: number; refunded: number; total: number; due: number } | null };
  ack?: boolean; partial?: boolean;
  run?: { id: string; state: "pending" | "success" | "failed" | "partial"; note?: string | null };
};

const POLL_MS = 4000;
const MAX_POLLS = 90; // about six minutes: after that TripSure is still working and the order catches up by itself
const legName = (l: Leg) => `${l.trip_type === "RETURN" ? "Return" : "Outbound"}${l.route ? ` · ${l.route.replace("$", " → ")}` : ""}`;
const money = (n?: number | null) => (n == null ? "—" : fmtINR(n));

/** A readable line for one of TripSure's new-date options: its fare, plus flight numbers / times when it gives them. */
function journeyLine(j: Journey): { fare: number | null; text: string } {
  let fare: number | null = null;
  const bits: string[] = [];
  for (const d of j.details || []) {
    const t = d?.priceSummary?.totalFare;
    if (typeof t === "number") fare = (fare || 0) + t;
    for (const seg of (d?.segments || d?.flights || [])) {
      const no = [seg.airlineCode || seg.airline, seg.flightNumber].filter(Boolean).join(" ");
      const when = String(seg.departureDateTime || seg.departureTime || seg.departure || "").replace("T", " ").slice(0, 16);
      if (no || when) bits.push([no, when].filter(Boolean).join(" · "));
    }
  }
  return { fare, text: bits.join("  →  ") || "Flight option" };
}

export function FlightServicingModal({ itemId, title, onClose, onChanged, onRefund, onCollect }: {
  itemId: string; title: string; onClose: () => void; onChanged: () => void; onRefund: (amount: number) => void;
  /** Opens the order's Record payment form (to collect the reissue charge before a date change is confirmed). */
  onCollect?: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"cancel" | "change">("cancel");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, CancelRun>>({});
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [pick, setPick] = useState<Record<string, string[]>>({});   // the passengers chosen on a leg (nobody picked = everyone still ticketed)
  const [ssr, setSsr] = useState<Record<string, Ssr>>({});
  // TripSure holds no order for this ticket: its support cancels it, and the advisor records that here.
  const [manual, setManual] = useState({ reference: "", note: "", refund: "" });
  const [manualBusy, setManualBusy] = useState(false);
  const [manualErr, setManualErr] = useState<string | null>(null);
  const [mdc, setMdc] = useState({ reference: "", date: "", dep: "", arr: "", flight: "", note: "" });
  const polls = useRef<Record<string, number>>({});
  const inFlight = useRef<Record<string, boolean>>({});

  const load = useCallback(() => {
    bookingFlightServicing(itemId)
      .then((d: any) => {
        setData(d);
        // A cancellation or date change started earlier and still open: follow it.
        const r: Record<string, CancelRun> = {};
        const c: Record<string, Change> = {};
        for (const l of d.line_items as Leg[]) {
          if (l.cancellation?.request_id && String(l.cancellation.status).toUpperCase() === "PENDING") r[l.id] = { requestId: l.cancellation.request_id, state: "pending" };
          if (l.reschedule?.change_request_id && String(l.reschedule.status).toUpperCase() === "PENDING")
            c[l.id] = { date: "", run: { id: l.reschedule.change_request_id, state: "pending" } };
        }
        setRuns((p) => ({ ...r, ...p }));
        setChanges((p) => ({ ...c, ...p }));
      })
      .catch((e: any) => setLoadErr(errText(e)));
  }, [itemId]);
  useEffect(() => { load(); }, [load]);

  async function recordManualDateChange() {
    setManualBusy(true);
    setManualErr(null);
    try {
      await bookingFlightRecordManualDateChange(itemId, {
        reference: mdc.reference.trim(), new_date: mdc.date, note: mdc.note.trim() || null,
        new_departure_time: mdc.dep || null, new_arrival_time: mdc.arr || null, new_flight_number: mdc.flight.trim() || null,
      });
      onChanged();
      onClose();
    } catch (e: any) {
      setManualErr(errText(e));
    } finally {
      setManualBusy(false);
    }
  }
  const noTripsureOrder = !!loadErr && /TripSure has no order for this ticket/i.test(loadErr);
  async function recordManual() {
    const refund = manual.refund.trim() === "" ? null : Number(manual.refund);
    if (refund !== null && (!Number.isFinite(refund) || refund < 0)) { setManualErr("The refund TripSure said it will pay must be a number."); return; }
    setManualBusy(true);
    setManualErr(null);
    try {
      await bookingFlightRecordManualCancel(itemId, { reference: manual.reference.trim(), note: manual.note.trim() || null, refund_expected: refund });
      onChanged();
      if (refund && refund > 0) onRefund(refund);   // opens the order's refund form with that amount
      onClose();
    } catch (e: any) {
      setManualErr(errText(e));
    } finally {
      setManualBusy(false);
    }
  }

  const patchChange = (leg: string, patch: Partial<Change>) => setChanges((p) => ({ ...p, [leg]: { ...(p[leg] || { date: "" }), ...patch } }));
  const note = (leg: string, msg?: string) => setErr((p) => { const n = { ...p }; if (msg) n[leg] = msg; else delete n[leg]; return n; });

  // ---- who the action is for ---------------------------------------------------------------------------------------
  const activePax = (l: Leg) => (l.passengers || []).filter((p) => !p.cancelled);
  const picked = (l: Leg) => { const a = activePax(l).map((p) => p.pax_id); const c = (pick[l.id] || a).filter((id) => a.includes(id)); return c.length ? c : a; };
  const everyone = (l: Leg) => picked(l).length === activePax(l).length;
  const namesOf = (l: Leg, ids: string[]) => (l.passengers || []).filter((p) => ids.includes(p.pax_id)).map((p) => p.name);
  function togglePax(l: Leg, id: string) {
    const cur = picked(l);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (!next.length) return;                       // at least one passenger stays chosen
    setPick((p) => ({ ...p, [l.id]: next }));
    setQuotes((p) => { const n = { ...p }; delete n[l.id]; return n; });            // a quote is for the passengers it was asked for
    patchChange(l.id, { journeys: undefined, picked: undefined, reviewed: undefined, searchKey: undefined, ack: false, error: undefined });
  }
  // What the airline says about doing this on its own: automatic, by hand within some hours, or not at all.
  function airlineLine(l: Leg, kind: "cancel" | "change"): string | null {
    const c = (l.capabilities || []).find((x) => { const f = String(x.feature || "").toLowerCase(); return kind === "cancel" ? f === "cancellation" : f === "partial_date_change_future" || f === "date_change"; });
    if (!c) return null;
    if (!c.supported) return "The airline does not support this online.";
    return c.automated ? "The airline handles this automatically." : `The airline processes this by hand${c.sla_hours ? `, usually within ${c.sla_hours} hours` : ""}.`;
  }
  function loadSsr(leg: Leg) {
    setSsr((p) => ({ ...p, [leg.id]: { busy: true } }));
    bookingFlightRescheduleSsr(itemId, leg.id)
      .then((d: any) => setSsr((p) => ({ ...p, [leg.id]: { data: d } })))
      .catch((e: any) => setSsr((p) => ({ ...p, [leg.id]: { error: errText(e) } })));
  }

  // ---- follow open cancellations / date changes until TripSure settles them ----------------------------------
  useEffect(() => {
    const pendingCancels = Object.entries(runs).filter(([, r]) => r.state === "pending");
    const pendingChanges = Object.entries(changes).filter(([, c]) => c.run?.state === "pending");
    if (!pendingCancels.length && !pendingChanges.length) return;
    const t = setInterval(() => {
      pendingCancels.forEach(([leg, r]) => {
        const key = "c" + leg;
        if (inFlight.current[key]) return;
        polls.current[key] = (polls.current[key] || 0) + 1;
        inFlight.current[key] = true;
        bookingFlightCancelStatus(itemId, leg, r.requestId)
          .then((s: any) => {
            if (s.status === "pending") {
              if (polls.current[key] > MAX_POLLS) note(leg, "TripSure is still processing this. The order will update when it finishes; you can close this window.");
              return;
            }
            setRuns((p) => ({ ...p, [leg]: { ...r, state: s.status, refunded: s.refunded, charges: s.cancellation_charges, itineraryCancelled: !!s.itinerary_cancelled, wholeLeg: s.whole_leg !== false, quotedNet: s.quoted_net_refund, refundDiffers: !!s.refund_differs } }));
            if (s.status === "success" || s.status === "partial") onChanged();
          })
          .catch((e: any) => note(leg, errText(e)))
          .finally(() => { inFlight.current[key] = false; });
      });
      pendingChanges.forEach(([leg, c]) => {
        const key = "r" + leg;
        if (inFlight.current[key] || !c.run) return;
        polls.current[key] = (polls.current[key] || 0) + 1;
        inFlight.current[key] = true;
        bookingFlightRescheduleStatus(itemId, leg, c.run.id)
          .then((s: any) => {
            if (s.status === "pending") return;
            setChanges((p) => ({ ...p, [leg]: { ...(p[leg] || { date: "" }), run: { id: c.run!.id, state: s.status, note: s.note } } }));
            if (s.status === "success") onChanged();
          })
          .catch((e: any) => note(leg, errText(e)))
          .finally(() => { inFlight.current[key] = false; });
      });
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, changes, itemId]);

  // ---- cancel ---------------------------------------------------------------------------------------------------
  function getQuote(leg: Leg) {
    setBusy((p) => ({ ...p, [leg.id]: "quote" })); note(leg.id);
    bookingFlightCancelQuote(itemId, leg.id, everyone(leg) ? [] : picked(leg))
      .then((q: any) => { setQuotes((p) => ({ ...p, [leg.id]: q })); setAck((p) => ({ ...p, [leg.id]: false })); })
      .catch((e: any) => note(leg.id, errText(e)))
      .finally(() => setBusy((p) => { const n = { ...p }; delete n[leg.id]; return n; }));
  }
  function doCancel(leg: Leg) {
    const q = quotes[leg.id];
    if (!q) return;
    setBusy((p) => ({ ...p, [leg.id]: "cancel" })); note(leg.id);
    bookingFlightCancel(itemId, leg.id, q.cancellation_key, q.pax_ids || [])
      .then((r: any) => { polls.current["c" + leg.id] = 0; setRuns((p) => ({ ...p, [leg.id]: { requestId: r.request_id, state: "pending", names: q.partial ? q.passengers : undefined } })); })
      .catch((e: any) => note(leg.id, errText(e)))
      .finally(() => setBusy((p) => { const n = { ...p }; delete n[leg.id]; return n; }));
  }

  // ---- change date ----------------------------------------------------------------------------------------------
  function findFlights(leg: Leg) {
    const c = changes[leg.id];
    if (!c?.date) return;
    patchChange(leg.id, { busy: "search", error: undefined, journeys: undefined, picked: undefined, reviewed: undefined, ack: false });
    bookingFlightRescheduleSearch(itemId, leg.id, c.date, everyone(leg) ? [] : picked(leg))
      .then((r: any) => patchChange(leg.id, { busy: undefined, searchKey: r.search_key, journeys: r.journeys, partial: !!r.partial }))
      .catch((e: any) => patchChange(leg.id, { busy: undefined, error: errText(e) }));
  }
  function priceChange(leg: Leg, fsc: string) {
    const c = changes[leg.id];
    if (!c?.searchKey) return;
    patchChange(leg.id, { busy: "review", error: undefined, picked: fsc, reviewed: undefined, ack: false });
    bookingFlightRescheduleReview(itemId, leg.id, c.searchKey, fsc)
      .then((r: any) => patchChange(leg.id, { busy: undefined, reviewed: { reissue_charge: r.reissue_charge, total: r.total, base_fare: r.base_fare, tax: r.tax, order_payment: r.order_payment } }))
      .catch((e: any) => patchChange(leg.id, { busy: undefined, error: errText(e) }));
  }
  function confirmChange(leg: Leg) {
    const c = changes[leg.id];
    if (!c?.searchKey || !c.picked) return;
    patchChange(leg.id, { busy: "confirm", error: undefined });
    bookingFlightRescheduleConfirm(itemId, leg.id, c.searchKey, c.picked, !!c.ack)
      .then((r: any) => { polls.current["r" + leg.id] = 0; patchChange(leg.id, { busy: undefined, run: { id: r.change_request_id, state: "pending" } }); })
      .catch((e: any) => patchChange(leg.id, { busy: undefined, error: errText(e) }));
  }

  const anyBusy = Object.keys(busy).length > 0 || Object.values(changes).some((c) => c.busy);

  // Who the action is for: one checkbox per passenger still ticketed on the leg.
  const paxPicker = (leg: Leg) => {
    const list = leg.passengers || [];
    const cancelTab = tab === "cancel";
    const canPick = cancelTab ? !!leg.can_cancel_one : true;
    const sel = picked(leg);
    const locked = !canPick || !!busy[leg.id] || runs[leg.id]?.state === "pending" || !!changes[leg.id]?.busy || changes[leg.id]?.run?.state === "pending";
    return (
      <fieldset className="ow-fs-pax">
        <legend>{cancelTab ? "Cancel for" : "Change the date for"}</legend>
        {list.map((p) => (
          <label key={p.pax_id} className={p.cancelled ? "off" : ""}>
            <input type="checkbox" checked={!p.cancelled && sel.includes(p.pax_id)} disabled={p.cancelled || locked} onChange={() => togglePax(leg, p.pax_id)} />
            <span>{p.name}</span>
            <small>{p.cancelled ? "cancelled" : [p.pax_type, p.ticket_no].filter(Boolean).join(" · ")}</small>
          </label>
        ))}
        {cancelTab && leg.can_cancel && !leg.can_cancel_one && leg.cancel_one_blocked ? (
          <div className="ow-sub" style={{ whiteSpace: "normal" }}>{leg.cancel_one_blocked}</div>
        ) : null}
      </fieldset>
    );
  };

  // The baggage / meals / seats the airline offers on the booking (listed by TripSure for reference).
  const ssrView = (leg: Leg) => {
    const x = ssr[leg.id];
    if (!x) return null;
    if (x.error) return <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal", margin: 0 }}>{x.error}</div>;
    if (!x.data) return null;
    const groups: [string, keyof NonNullable<Ssr["data"]>["sectors"][number]][] = [["Baggage", "baggage"], ["Meals", "meals"], ["Seats", "seats"], ["Special services", "special_services"]];
    return (
      <div className="ow-fs-ssr">
        {x.data.sectors.length === 0 ? <div className="ow-sub">The airline lists no add-ons for this booking.</div> : null}
        {x.data.sectors.map((sec) => (
          <div key={sec.route}>
            <b>{sec.route.replace("$", " → ")}</b>
            {groups.map(([label, key]) => {
              const items = sec[key] as SsrItem[];
              return (
                <div key={String(key)} className="ow-fs-ssr-g">
                  <span className="ow-sub">{label}</span>
                  {items.length ? (
                    <ul>{items.map((it, i) => <li key={(it.code || "") + i}><span>{it.text || it.code}{it.flight ? ` · ${it.flight}` : ""}</span><b>{it.price != null ? money(it.price) : ""}</b></li>)}</ul>
                  ) : <span className="ow-sub"> none offered</span>}
                </div>
              );
            })}
          </div>
        ))}
        {x.data.note ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{x.data.note}</div> : null}
      </div>
    );
  };

  return (
    <div className="taw-modal-overlay" role="dialog" aria-modal="true" aria-label="Cancel or change flight"
      onClick={(e) => { if (e.target === e.currentTarget && !anyBusy) onClose(); }}>
      <div className="taw-modal-panel ow-modal ow-modal--wide">
        <div className="ow-modal-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Cancel or change this flight</div>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>{title}{data?.order_number ? ` · ${data.order_number}` : ""} · done with TripSure; nothing here moves money.</div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={anyBusy} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>

        <div className="ow-tabs" role="tablist" aria-label="What to do">
          <button role="tab" aria-selected={tab === "cancel"} className={"ow-tab" + (tab === "cancel" ? " is-active" : "")} onClick={() => setTab("cancel")}>Cancel ticket</button>
          <button role="tab" aria-selected={tab === "change"} className={"ow-tab" + (tab === "change" ? " is-active" : "")} onClick={() => setTab("change")}>Change date</button>
        </div>

        {loadErr ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal" }}>{loadErr}</div> : null}
        {!data && !loadErr ? <div className="ow-sub"><Spinner /> Asking TripSure about this ticket…</div> : null}
        {noTripsureOrder && tab === "change" ? (
          <section className="ow-fs-leg" aria-label="Date changed by TripSure support">
            <div className="ow-fs-head"><b>Date changed by TripSure support?</b></div>
            <div className="ow-sub" style={{ whiteSpace: "normal", marginBottom: 8 }}>
              TripSure can&apos;t change this ticket from here. Ask TripSure support to change the date (use “Copy details for TripSure support” on the order). When they
              confirm, record the new date here: the flights move to it and nothing is sent to TripSure. Any charge for the change is collected through the order&apos;s own payment steps.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>TripSure&apos;s reference (their reply, case or ticket number) — required
                <input className="taw-input" value={mdc.reference} maxLength={120} onChange={(e) => setMdc({ ...mdc, reference: e.target.value })} />
              </label>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>New travel date (of the first flight) — required
                <input className="taw-input" type="date" value={mdc.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setMdc({ ...mdc, date: e.target.value })} />
              </label>
              <div className="ow-sub" style={{ whiteSpace: "normal" }}>Only for a ticket with a single flight (a connection moves together by the same number of days):</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <label className="ow-sub" style={{ display: "grid", gap: 4 }}>New departure time
                  <input className="taw-input" type="time" value={mdc.dep} onChange={(e) => setMdc({ ...mdc, dep: e.target.value })} />
                </label>
                <label className="ow-sub" style={{ display: "grid", gap: 4 }}>New arrival time
                  <input className="taw-input" type="time" value={mdc.arr} onChange={(e) => setMdc({ ...mdc, arr: e.target.value })} />
                </label>
                <label className="ow-sub" style={{ display: "grid", gap: 4 }}>New flight number
                  <input className="taw-input" value={mdc.flight} maxLength={12} onChange={(e) => setMdc({ ...mdc, flight: e.target.value })} />
                </label>
              </div>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>Note (optional)
                <input className="taw-input" value={mdc.note} maxLength={500} onChange={(e) => setMdc({ ...mdc, note: e.target.value })} />
              </label>
              {manualErr ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal" }}>{manualErr}</div> : null}
              <div>
                <button type="button" className="taw-btn taw-btn--primary" disabled={manualBusy || mdc.reference.trim().length < 3 || !mdc.date} onClick={recordManualDateChange}>
                  {manualBusy ? "Recording…" : "Record date change"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {noTripsureOrder && tab === "cancel" ? (
          <section className="ow-fs-leg" aria-label="Cancelled by TripSure support">
            <div className="ow-fs-head"><b>Already cancelled by TripSure support?</b></div>
            <div className="ow-sub" style={{ whiteSpace: "normal", marginBottom: 8 }}>
              Ask TripSure support to cancel it (use “Copy details for TripSure support” on the order). When they confirm, record it here: the flight is marked cancelled
              and nothing is sent to TripSure. Paying the customer back stays the order&apos;s “Record refund”.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>TripSure&apos;s reference (their reply, case or ticket number) — required
                <input className="taw-input" value={manual.reference} maxLength={120} onChange={(e) => setManual({ ...manual, reference: e.target.value })} />
              </label>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>Refund TripSure said it will pay, in rupees (optional — opens the refund form)
                <input className="taw-input" inputMode="decimal" value={manual.refund} onChange={(e) => setManual({ ...manual, refund: e.target.value })} />
              </label>
              <label className="ow-sub" style={{ display: "grid", gap: 4 }}>Note (optional)
                <input className="taw-input" value={manual.note} maxLength={500} onChange={(e) => setManual({ ...manual, note: e.target.value })} />
              </label>
              {manualErr ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal" }}>{manualErr}</div> : null}
              <div>
                <button type="button" className="taw-btn taw-btn--primary" disabled={manualBusy || manual.reference.trim().length < 3} onClick={recordManual}>
                  {manualBusy ? "Recording…" : "Record cancellation"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="ow-fs">
          {data?.line_items.map((leg) => {
            const q = quotes[leg.id], run = runs[leg.id], chg = changes[leg.id], e = err[leg.id];
            return (
              <section className="ow-fs-leg" key={leg.id}>
                <div className="ow-fs-head">
                  <b>{legName(leg)}</b>
                  <span className="ow-sub">{leg.pnr ? `PNR ${leg.pnr}` : ""}{leg.tickets.length ? ` · ticket${leg.tickets.length > 1 ? "s" : ""} ${leg.tickets.join(", ")}` : ""}</span>
                  <span className="ow-fs-st">{(leg.cancellation_status && leg.cancellation_status !== "NOT_APPLICABLE" ? leg.cancellation_status : leg.status).toLowerCase()}</span>
                </div>
                {e ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal", margin: 0 }}>{e}</div> : null}
                {(leg.passengers || []).filter((p) => !p.cancelled).length > 1 && !(tab === "cancel" ? run?.state === "success" : chg?.run?.state === "success") ? paxPicker(leg) : null}
                {airlineLine(leg, tab === "cancel" ? "cancel" : "change") ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{airlineLine(leg, tab === "cancel" ? "cancel" : "change")}</div> : null}

                {tab === "cancel" ? (
                  run?.state === "success" ? (
                    <div className="ow-fs-ok" role="status">
                      <b>Cancelled with TripSure{run.names?.length ? <> for {run.names.join(", ")}</> : null}.</b> Refund to the customer: <b>{money(run.refunded)}</b>
                      {run.charges ? <> (cancellation charges {money(run.charges)})</> : null}.
                      {run.refundDiffers ? <span className="ow-sub" style={{ display: "block", whiteSpace: "normal" }} role="alert">TripSure&apos;s final refund ({money(run.refunded)}) is not the {money(run.quotedNet)} it quoted. Check the amount before recording the refund.</span> : null}
                      {run.itineraryCancelled ? " The ticket is marked cancelled on this order." : ""}
                      {run.wholeLeg === false ? " The other passengers on this leg are still ticketed." : ""}
                      <div className="ow-ful-acts">
                        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => { onRefund(run.refunded || 0); onClose(); }}>Record refund to customer</button>
                      </div>
                    </div>
                  ) : run?.state === "partial" ? (
                    <div className="ow-fs-bad" role="alert">
                      <b>TripSure cancelled some of the tickets on this leg, not all.</b> The passengers it did cancel are cancelled
                      {run.refunded ? <>; refund so far <b>{money(run.refunded)}</b></> : null}. The rest are still ticketed. Reload the order and check with TripSure before trying again.
                      {run.refunded ? (
                        <div className="ow-ful-acts">
                          <button type="button" className="taw-btn taw-btn--sm" onClick={() => { onRefund(run.refunded || 0); onClose(); }}>Record refund to customer</button>
                        </div>
                      ) : null}
                    </div>
                  ) : run?.state === "failed" ? (
                    <div className="ow-fs-bad" role="alert">TripSure could not cancel this leg. Nothing was cancelled and nothing is owed. Close this window and try again, or contact TripSure.</div>
                  ) : run?.state === "pending" ? (
                    <div className="ow-sub" role="status"><Spinner /> TripSure is processing the cancellation (request {String(run.requestId)})…</div>
                  ) : !leg.can_cancel ? (
                    <div className="ow-sub" style={{ whiteSpace: "normal" }}>{leg.cancel_blocked || "This leg can't be cancelled here."}</div>
                  ) : q ? (
                    <div className="ow-fs-quote">
                      {q.partial && q.passengers?.length ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>For <b>{q.passengers.join(", ")}</b> only: everyone else keeps their ticket.</div> : null}
                      <ul>
                        <li><span>Base refund</span><b>{money(q.base_refund)}</b></li>
                        <li><span>Tax refund</span><b>{money(q.tax_refund)}</b></li>
                        <li><span>Cancellation fee</span><b>− {money(q.cancellation_fee)}</b></li>
                        <li className="net"><span>Refund to the customer</span><b>{money(q.net_refund)}</b></li>
                      </ul>
                      {q.warnings?.length ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{q.warnings.join(" · ")}</div> : null}
                      <label className="ow-tf-lead">
                        <input type="checkbox" checked={!!ack[leg.id]} onChange={(ev) => setAck((p) => ({ ...p, [leg.id]: ev.target.checked }))} />
                        {q.partial && q.passengers?.length ? <>Cancel the ticket for {q.passengers.join(", ")} with the airline. This can&apos;t be undone.</> : <>Cancel this leg with the airline. This can&apos;t be undone.</>}
                      </label>
                      <div className="ow-ful-acts">
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy[leg.id]} onClick={() => getQuote(leg)}>Refresh quote</button>
                        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={!ack[leg.id] || !!busy[leg.id]} onClick={() => doCancel(leg)}>
                          {busy[leg.id] === "cancel" ? "Cancelling…" : "Cancel ticket"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ow-ful-acts">
                      <button type="button" className="taw-btn taw-btn--sm" disabled={!!busy[leg.id]} onClick={() => getQuote(leg)}>
                        {busy[leg.id] === "quote" ? "Asking TripSure…" : "Get refund quote"}
                      </button>
                    </div>
                  )
                ) : (
                  chg?.run?.state === "success" ? (
                    <div className="ow-fs-ok" role="status"><b>Date changed{chg.date ? <> to {chg.date}</> : null}.</b> {chg.run.note || "TripSure has reissued the ticket."}</div>
                  ) : chg?.run?.state === "failed" || chg?.run?.state === "partial" ? (
                    <div className="ow-fs-bad" role="alert">TripSure could not complete the date change ({chg.run.state}). {chg.run.note || "Check the order with TripSure before trying again."}</div>
                  ) : chg?.run?.state === "pending" ? (
                    <div className="ow-sub" role="status"><Spinner /> TripSure is reissuing the ticket…</div>
                  ) : !leg.can_change ? (
                    <div className="ow-sub" style={{ whiteSpace: "normal" }}>{leg.change_blocked || "The date of this leg can't be changed here."}</div>
                  ) : (
                    <div className="ow-fs-change">
                      <div className="ow-fs-date">
                        <input className="taw-input" type="date" aria-label="New travel date" min={new Date().toISOString().slice(0, 10)} value={chg?.date || ""}
                          onChange={(ev) => patchChange(leg.id, { date: ev.target.value, journeys: undefined, picked: undefined, reviewed: undefined, error: undefined })} />
                        <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={!chg?.date || !!chg?.busy} onClick={() => findFlights(leg)}>
                          {chg?.busy === "search" ? "Searching…" : "Find flights"}
                        </button>
                      </div>
                      {chg?.error ? <div className="taw-banner taw-banner--danger" role="alert" style={{ whiteSpace: "normal", margin: 0 }}>{chg.error}</div> : null}
                      <div className="ow-ful-acts">
                        <button type="button" className="taw-btn taw-btn--sm" disabled={!!ssr[leg.id]?.busy} onClick={() => loadSsr(leg)}>
                          {ssr[leg.id]?.busy ? "Asking TripSure…" : ssr[leg.id]?.data ? "Refresh add-ons" : "See add-ons the airline offers"}
                        </button>
                      </div>
                      {ssrView(leg)}
                      {chg?.journeys ? (
                        <ul className="ow-fs-opts">
                          {chg.journeys.map((j, i) => {
                            const jl = journeyLine(j);
                            return (
                              <li key={j.fare_source_code || i} className={chg.picked === j.fare_source_code ? "on" : ""}>
                                <span>{jl.text}</span>
                                <b>{jl.fare != null ? money(jl.fare) : ""}</b>
                                <button type="button" className="taw-btn taw-btn--sm" disabled={!!chg.busy} onClick={() => priceChange(leg, j.fare_source_code)}>
                                  {chg.busy === "review" && chg.picked === j.fare_source_code ? "Pricing…" : "Price this change"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {chg?.reviewed ? (
                        <div className="ow-fs-quote">
                          <ul>
                            {chg.reviewed.base_fare != null ? <li><span>Base fare</span><b>{money(chg.reviewed.base_fare)}</b></li> : null}
                            {chg.reviewed.tax != null ? <li><span>Taxes</span><b>{money(chg.reviewed.tax)}</b></li> : null}
                            <li><span>Airline reissue charge</span><b>{money(chg.reviewed.reissue_charge)}</b></li>
                            <li className="net"><span>New fare quoted</span><b>{money(chg.reviewed.total)}</b></li>
                          </ul>
                          {chg.partial ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>Only the passengers chosen above move to the new date.</div> : null}
                          {chg.reviewed.order_payment ? (
                            <div className="ow-sub" style={{ whiteSpace: "normal" }}>
                              The customer has paid {money(chg.reviewed.order_payment.paid)} of {money(chg.reviewed.order_payment.total)} on this order
                              {chg.reviewed.order_payment.due > 0 ? <> · {money(chg.reviewed.order_payment.due)} still due</> : null}.
                            </div>
                          ) : null}
                          <label className="ow-tf-lead">
                            <input type="checkbox" checked={!!chg.ack} onChange={(ev) => patchChange(leg.id, { ack: ev.target.checked })} />
                            I have collected what the customer owes for this change (charges and any fare difference).
                          </label>
                          <div className="ow-ful-acts">
                            {onCollect ? (
                              <button type="button" className="taw-btn taw-btn--sm" disabled={!!chg.busy} title="Opens the order's payment form; come back here afterwards to confirm"
                                onClick={() => { onClose(); onCollect(); }}>Record a payment first…</button>
                            ) : null}
                            <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" disabled={!chg.ack || !!chg.busy} onClick={() => confirmChange(leg)}>
                              {chg.busy === "confirm" ? "Changing…" : "Confirm date change"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                )}
              </section>
            );
          })}
        </div>
        <div className="ow-modal-foot">
          <span className="ow-sub" style={{ whiteSpace: "normal" }}>Cancelling asks TripSure for the refund; paying the customer back is Record refund on the order.</span>
          <button type="button" className="taw-btn" onClick={onClose} disabled={anyBusy}>Close</button>
        </div>
      </div>
    </div>
  );
}
