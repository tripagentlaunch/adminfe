"use client";
/* The Flights tab's counterpart of HotelRecommendations: while the itinerary has no flight for a leg of the trip (out from home
   on the first day, back on the last), it searches that leg live with TripSure, ranks the answers the way the Search desk does,
   and shows the best three. "Get live price" hands the chosen flight to the Search panel, which opens its pricing drawer on it
   (seats, meals, baggage) and adds it to the itinerary. Nothing here invents a number: every fare is TripSure's search price. */
import { useEffect, useState } from "react";
import { fastapiFlightSearch, inr } from "../../services/api";
import { neededFlightLegs, type FlightLeg } from "../../lib/flightLegs";
import { rankFlightOffers, withoutBudgetCarriers } from "../../lib/flightRank";
import { requestLivePrice } from "../../lib/livePriceRequest";
import { flightFit, budgetRange, normalizeBudget } from "../../lib/tripBudget";
import { FitChip } from "../BudgetFit";
import { liveAirports } from "../../lib/airportSuggest";
import { searchAirports } from "../../lib/airports";
import { errText } from "../../lib/advisorHelpers";
import { Icon, Spinner } from "../ui";

type LegState = { status: "loading" | "done" | "error"; offers: any[]; error?: string };

const paren = (t: any) => { const m = String(t || "").match(/\(([A-Z]{3})\)/); return m ? m[1] : /^[A-Za-z]{3}$/.test(String(t || "").trim()) ? String(t).trim().toUpperCase() : ""; };
async function airportCode(name: any): Promise<string> {
  const known = paren(name);
  if (known) return known;
  const text = String(name || "").trim();
  if (!text) return "";
  try {
    const rows: any[] = (await liveAirports(text, 5)) || searchAirports(text, 5) || [];
    const best = rows.reduce((a: any, b: any) => (!a || (b.popularity_score || 0) > (a.popularity_score || 0) ? b : a), null);
    return (best && best.airport_code) || "";
  } catch { return ""; }
}
const net = (o: any) => Number(o.base_net != null ? o.base_net : o.baseNet) || Number((o.detail || {}).baseNet) || 0;
const dayLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });

export function FlightRecommendations({ data, ask }: { data: any; ask: any }) {
  const [codes, setCodes] = useState<{ from: string; to: string } | null>(null);
  const [byLeg, setByLeg] = useState<Record<string, LegState>>({});
  const [retry, setRetry] = useState(0);
  const adults = Math.max(1, (ask?.persons || []).length || Number(data?.pax) || 2);

  // The airports the enquiry names (home city, first destination), looked up once.
  const fromText = ask && ask.from, toText = ask && ask.destinations && ask.destinations[0];
  useEffect(() => {
    let live = true;
    Promise.all([airportCode(fromText), airportCode(toText)]).then(([from, to]) => { if (live) setCodes({ from, to }); });
    return () => { live = false; };
  }, [fromText, toText]);

  const legs: FlightLeg[] = codes ? neededFlightLegs(data, codes.from, codes.to) : [];
  const sig = legs.map((l) => l.key).join(",") + "|" + adults;

  useEffect(() => {
    if (!legs.length) return;
    let cancelled = false;
    legs.forEach((leg) => {
      const key = leg.key;
      setByLeg((m) => (m[key] && retry === 0 ? m : { ...m, [key]: { status: "loading", offers: [] } }));
      fastapiFlightSearch({ originCode: leg.origin, destCode: leg.dest, date: leg.date, pax: adults, children: 0, infants: 0, cabin: "economy" })
        .then((r: any) => {
          if (cancelled) return;
          const offers = ((r && r.offers) || []).map((o: any) => ({ ...o, _searchDate: leg.date }));
          const ranked = rankFlightOffers(withoutBudgetCarriers(offers).length ? withoutBudgetCarriers(offers) : offers);
          setByLeg((m) => ({ ...m, [key]: { status: "done", offers: ranked.slice(0, 3) } }));
        })
        .catch((e: any) => { if (!cancelled) setByLeg((m) => ({ ...m, [key]: { status: "error", offers: [], error: errText(e) } })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, retry]);

  if (!codes) return <div className="taw-hotelrec-loading"><Spinner /> Finding the airports for this trip…</div>;
  if (!legs.length) return null;
  const range = budgetRange(normalizeBudget(data?.budget));

  return (
    <div className="taw-hotelrec taw-flightrec">
      {legs.map((leg) => {
        const st = byLeg[leg.key] || { status: "loading", offers: [] };
        return (
          <div key={leg.key} className="taw-hotelrec-base">
            <div className="taw-hotelrec-base-h">
              <Icon name="flight" size={15} />
              <span>{leg.kind === "outbound" ? "Flight out" : "Flight back"} · {leg.origin} → {leg.dest}</span>
              <span className="taw-muted">{dayLabel(leg.date)} · {adults} adult{adults === 1 ? "" : "s"}</span>
            </div>
            {st.status === "loading" ? (
              <div className="taw-hotelrec-loading"><Spinner /> Searching live flights {leg.origin} → {leg.dest} on {dayLabel(leg.date)}…</div>
            ) : st.status === "error" ? (
              <div className="taw-banner taw-banner--err">
                <Icon name="alert" size={14} /> Flight search {leg.origin} → {leg.dest} failed: {st.error || "no answer from TripSure."}{" "}
                <button className="taw-btn taw-btn--sm" onClick={() => setRetry((n) => n + 1)}>Retry search</button>
              </div>
            ) : st.offers.length === 0 ? (
              <div className="taw-banner taw-banner--info"><Icon name="alert" size={14} /> No flights found {leg.origin} → {leg.dest} on {dayLabel(leg.date)}. Try another day in Search.</div>
            ) : (
              <div className="taw-results">
                {st.offers.map((o: any) => {
                  const d = o.detail || {};
                  const price = net(o);
                  const fit = range && price ? flightFit(price, range, data) : null;
                  return (
                    <div key={o.id} className="taw-res" style={{ display: "block" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                        <div className="taw-res-main">
                          <div className="taw-res-title">
                            <Icon name="flight" size={18} /> {d.airlineName || d.airline || "Flight"} <span className="taw-muted">{d.flightNo || ""}</span>
                            {o._rec ? <span className="taw-chip taw-chip--star">Recommended #{o._rec.rank}</span> : null}
                            {d.refundable ? <span className="taw-chip taw-chip--ref">Refundable</span> : null}
                          </div>
                          <div className="taw-res-sub">
                            <span><b>{d.depTime || ""} – {d.arrTime || ""}</b></span>
                            {d.duration ? <span>{d.duration}</span> : null}
                            <span>{d.stops ? d.stops + " stop" + (d.stops === 1 ? "" : "s") : "Non-stop"}</span>
                            <FitChip fit={fit} what="for flights" />
                          </div>
                          {o._rec ? <div className="taw-muted" style={{ fontSize: 12 }}>{o._rec.reasons.slice(0, 3).join(" · ")}</div> : null}
                        </div>
                        <div className="taw-res-side">
                          <div className="taw-res-net ta-num">{price > 0 ? inr(price) : "—"}<small>search price</small></div>
                          <button type="button" className="taw-btn taw-btn--accent taw-btn--sm"
                            onClick={() => requestLivePrice({
                              origin: leg.origin, dest: leg.dest, date: leg.date, cabin: "economy",
                              flightNos: ((d.segments || []) as any[]).map((sg: any) => sg.flightNo).filter(Boolean),
                              pax: { adults, children: 0, infants: 0 },
                            })}>
                            Get live price
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
