"use client";
/* Fare options for one searched flight (Saver / Flex ...), with baggage,
   cancellation and change rules, plus the full fare rules on demand. Shown in the
   Flight itinerary panel (FlightItinerary.tsx); the chosen option's fare id is
   what gets locked in Create Itinerary. */
import { useEffect, useState } from "react";
import { Icon, Spinner } from "../ui";
import { flightFareOptions, flightFareRulesView, getTripsureFlightOffer, inr } from "../../services/api";
import { errText } from "../../lib/errText";

export type FareChoice = {
  fare_id: string; name: string; total: number | null; delta: number | null;
  checkin_kg: number | null; refundable: boolean;
};

type Option = FareChoice & {
  cabin?: string; cabin_kg: number | null; cancellation: string | null; cancellation_fee: number | null;
  date_change: string | null; date_change_fee: number | null; no_show: string | null;
  seat: string | null; seat_text: string | null; meal: string | null; meal_text: string | null; is_current: boolean;
};

const extraLabel = (status: string | null, text: string | null, what: string) =>
  !status ? null
    : status === "free" ? `Free ${what}`
    : status === "chargeable" ? `Paid ${what}`
    : text || `${what}: ${status.replace(/_/g, " ")}`;

// One fare-options request per searched flight: switching between Timeline and Fare options,
// or reopening the same flight, reuses it. A failed request is forgotten so it can be retried.
const optionsOnce = new Map<string, Promise<any>>();
function fareOptionsFor(id: string, load: () => Promise<any>) {
  let p = optionsOnce.get(id);
  if (!p) {
    p = load();
    optionsOnce.set(id, p);
    p.catch(() => optionsOnce.delete(id));
  }
  return p;
}

/** The fare options of one searched flight as selectable cards (TripSure's "Fare options" tab).
 *  `selected` is the chosen fare id; the searched fare is chosen until the advisor picks another.
 *  Loads once per flight; Fare rules load on demand, once per fare. */
export function FareOptionsList({ offer, selected, onSelect }: {
  offer: any; selected: string | null; onSelect: (c: FareChoice) => void;
}) {
  const cached = getTripsureFlightOffer(offer.id) || {};
  const price = ((cached.raw || {}).priceSummaries || (cached.raw || {}).PriceSummaries || [])[0] || {};
  const keys: string[] = ((price.fareFamilies || []) as any[]).map((f) => f.fareId).filter(Boolean);
  const traceMap = (cached.supplierTraceIds || {}) as Record<string, string>;
  const traceId = traceMap[String(cached.providerId)] || (Object.keys(traceMap).length === 1 ? Object.values(traceMap)[0] : "") || "";

  const [opts, setOpts] = useState<Option[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, { busy?: boolean; err?: string; sectors?: any[] }>>({});
  const [open, setOpen] = useState<string | null>(null);

  const d = offer.detail || {};
  const fallback: FareChoice = { fare_id: cached.fareSourceCode, name: "Searched fare", total: null, delta: 0, checkin_kg: d.baggageKg ?? null, refundable: d.refundable === true };

  useEffect(() => {
    let live = true;
    fareOptionsFor(offer.id, () => flightFareOptions({
      search_key: cached.searchKey, provider_id: cached.providerId, trace_id: traceId,
      fare_keys: keys.length ? keys : [cached.fareSourceCode], current_fare_key: cached.fareSourceCode,
    }))
      .then((r: any) => {
        if (!live) return;
        const list: Option[] = r.options || [];
        setOpts(list);
        // Nothing chosen yet: the searched fare is the selected one (as on TripSure).
        if (!selected) onSelect(list.find((o) => o.is_current) || list[0] || fallback);
      })
      .catch((e: any) => {
        if (!live) return;
        setErr(errText(e));
        if (!selected) onSelect(fallback);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  function toggleRules(o: Option) {
    setOpen((cur) => (cur === o.fare_id ? null : o.fare_id));
    if (rules[o.fare_id]) return;
    setRules((r) => ({ ...r, [o.fare_id]: { busy: true } }));
    flightFareRulesView({ fare_key: o.fare_id, provider_id: cached.providerId, trace_id: traceId })
      .then((r: any) => setRules((x) => ({ ...x, [o.fare_id]: { sectors: r.sectors || [] } })))
      .catch((e: any) => setRules((x) => ({ ...x, [o.fare_id]: { err: errText(e) } })));
  }

  if (!opts && !err) return <div className="ow-sub" style={{ padding: 8 }}><Spinner /> Loading fare options…</div>;
  return (
    <div className="fi-fares">
      {err ? (
        <div className="taw-banner taw-banner--warn" style={{ whiteSpace: "normal" }}>
          Couldn&apos;t load the other fare options ({err}). The fare you searched is selected — you can continue with it.
        </div>
      ) : null}
      {(opts || []).map((o) => {
        const on = selected === o.fare_id;
        const seat = extraLabel(o.seat, o.seat_text, "seat");
        const meal = extraLabel(o.meal, o.meal_text, "meal");
        const r = rules[o.fare_id];
        return (
          <div key={o.fare_id} className={`fi-fare${on ? " on" : ""}`}>
            {o.cabin ? <span className="fi-fare-cabin">{o.cabin}</span> : null}
            <div className="fi-fare-top">
              <div>
                <div className="fi-fare-name">{o.name}{o.is_current ? <span className="ow-tag"> searched</span> : null}</div>
                <b className="fi-fare-price">{inr(offer.base_net + (o.delta || 0))}</b>
                {o.delta ? <small className="ow-sub"> {o.delta > 0 ? "+" : "−"}{inr(Math.abs(o.delta))} vs searched</small> : null}
              </div>
              {on ? (
                <span className="fi-fare-sel"><Icon name="check" size={13} /> Selected</span>
              ) : (
                <button type="button" className="taw-btn taw-btn--sm" onClick={() => onSelect(o)}>Select</button>
              )}
            </div>
            <ul className="fi-fare-feat">
              <li><Icon name="luggage" size={13} /> {o.checkin_kg ? `${o.checkin_kg} Kg check-in` : "No check-in baggage listed"}</li>
              {seat ? <li>{seat}</li> : null}
              {o.cabin_kg ? <li><Icon name="luggage" size={13} /> {o.cabin_kg} Kg cabin</li> : null}
              {meal ? <li>{meal}</li> : null}
            </ul>
            <ul className="fi-fare-feat fi-fare-rules">
              <li className={o.refundable ? "ok" : "no"}>
                {o.refundable ? "Refundable" : "Non-refundable"}{o.cancellation_fee != null ? ` · cancellation fee ${inr(o.cancellation_fee)}` : o.refundable ? "" : ""}
              </li>
              <li>{o.date_change ? (o.date_change_fee != null ? `Date change fee from ${inr(o.date_change_fee)}` : "Date change allowed") : "Date change: see fare rules"}</li>
            </ul>
            <button type="button" className="ow-link fi-fare-more" onClick={() => toggleRules(o)} aria-expanded={open === o.fare_id}>
              {open === o.fare_id ? "Hide fare rules" : "Fare rules"}
            </button>
            {open === o.fare_id ? (
              <div className="ow-fare-rules">
                {r?.busy ? <div className="ow-sub"><Spinner /> Loading rules…</div> : null}
                {r?.err ? <div className="taw-banner taw-banner--warn">{r.err}</div> : null}
                {(r?.sectors || []).map((s: any) => (
                  <div key={s.route}>
                    <div className="ow-sub"><b>{s.route}</b>{s.rebooking_allowed === false ? " · rerouting not allowed" : ""}{s.partial_cancel_allowed === false ? " · no partial cancellation" : ""}</div>
                    {s.warnings.map((w: string, i: number) => <div key={i} className="taw-banner taw-banner--warn">{w}</div>)}
                    {s.rules.map((x: any, i: number) => (
                      <div key={i} className="ow-fare-rule"><b>{x.category}</b><span>{x.text}</span></div>
                    ))}
                  </div>
                ))}
                {r?.sectors && r.sectors.length === 0 ? <div className="ow-sub">The airline returned no rule text for this fare.</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
