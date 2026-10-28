"use client";
/* Fare options for one searched flight (Saver / Flex ...), with baggage,
   cancellation and change rules, plus the full fare rules on demand. The chosen
   option's fare id is what gets locked in Create Itinerary. */
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

export function FareOptionsPanel({ offer, onClose, onChoose }: { offer: any; onClose: () => void; onChoose: (c: FareChoice) => void }) {
  const cached = getTripsureFlightOffer(offer.id) || {};
  const price = ((cached.raw || {}).priceSummaries || (cached.raw || {}).PriceSummaries || [])[0] || {};
  const keys: string[] = ((price.fareFamilies || []) as any[]).map((f) => f.fareId).filter(Boolean);
  const traceMap = (cached.supplierTraceIds || {}) as Record<string, string>;
  const traceId = traceMap[String(cached.providerId)] || (Object.keys(traceMap).length === 1 ? Object.values(traceMap)[0] : "") || "";

  const [opts, setOpts] = useState<Option[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, { busy?: boolean; err?: string; sectors?: any[] }>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    flightFareOptions({
      search_key: cached.searchKey, provider_id: cached.providerId, trace_id: traceId,
      fare_keys: keys.length ? keys : [cached.fareSourceCode], current_fare_key: cached.fareSourceCode,
    })
      .then((r: any) => live && setOpts(r.options || []))
      .catch((e: any) => live && setErr(errText(e)));
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

  const d = offer.detail || {};
  const fallback: FareChoice = { fare_id: cached.fareSourceCode, name: "Searched fare", total: null, delta: 0, checkin_kg: d.baggageKg ?? null, refundable: d.refundable === true };

  return (
    <div className="ow-fare-back" role="dialog" aria-modal="true" aria-label="Fare options">
      <div className="ow-fare">
        <div className="ow-fare-head">
          <div>
            <b>Choose a fare</b>
            <div className="ow-sub">{d.airlineName || d.airline} {d.flightNo} · {d.originCode} → {d.destCode} · {d.depTime}</div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} aria-label="Close">Close</button>
        </div>

        {!opts && !err ? <div className="ow-sub" style={{ padding: 16 }}><Spinner /> Loading fare options…</div> : null}
        {err ? (
          <div className="taw-banner taw-banner--warn">
            Couldn&apos;t load the fare options ({err}). You can still continue with the fare you searched.
            <div><button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => onChoose(fallback)}>Continue with the searched fare</button></div>
          </div>
        ) : null}

        <div className="ow-fare-list">
          {(opts || []).map((o) => {
            const seat = extraLabel(o.seat, o.seat_text, "seat");
            const meal = extraLabel(o.meal, o.meal_text, "meal");
            const r = rules[o.fare_id];
            return (
              <div key={o.fare_id} className={`ow-fare-card${o.is_current ? " cur" : ""}`}>
                <div className="ow-fare-top">
                  <div>
                    <b>{o.name}</b>{o.is_current ? <span className="ow-tag"> searched fare</span> : null}
                    <div className="ow-sub">{o.cabin}{o.cabin_kg ? ` · cabin ${o.cabin_kg} kg` : ""}</div>
                  </div>
                  <div className="ow-fare-price">
                    <b>{o.total != null ? inr(offer.base_net + (o.delta || 0)) : "—"}</b>
                    <small>{o.delta ? `${o.delta > 0 ? "+" : "−"}${inr(Math.abs(o.delta))} vs searched` : "total"}</small>
                  </div>
                </div>
                <ul className="ow-fare-feat">
                  <li><Icon name="luggage" size={13} /> {o.checkin_kg ? `${o.checkin_kg} kg check-in` : "No check-in baggage listed"}</li>
                  <li className={o.refundable ? "ok" : ""}>
                    {o.refundable ? "Refundable" : "Non-refundable"}{o.cancellation_fee != null ? ` · cancellation fee ${inr(o.cancellation_fee)}` : ""}
                  </li>
                  <li>{o.date_change ? (o.date_change_fee != null ? `Date change ${inr(o.date_change_fee)} + fare difference` : "Date change allowed") : "Date change: see rules"}</li>
                  {seat ? <li>{seat}</li> : null}
                  {meal ? <li>{meal}</li> : null}
                </ul>
                <div className="ow-fare-acts">
                  <button type="button" className="taw-btn taw-btn--sm" onClick={() => toggleRules(o)} aria-expanded={open === o.fare_id}>
                    {open === o.fare_id ? "Hide fare rules" : "Fare rules"}
                  </button>
                  <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => onChoose(o)}>Choose {o.name}</button>
                </div>
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
        <div className="ow-sub" style={{ whiteSpace: "normal" }}>
          Prices are the airline&apos;s fare for the whole party. The final amount is re-checked when the fare is locked.
        </div>
      </div>
    </div>
  );
}
