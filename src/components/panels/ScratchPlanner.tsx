"use client";
/* The plan for a trip started with "Plan this trip": from the answers (place, budget, dates, party) it finds, with no LLM,
     1. the budget split (flights / stays / on the ground, the 15-60-25 split of lib/tripBudget),
     2. flights within the flights share, per leg,
     3. two stays (the nights split in two), up to six real hotels each, those within the stay's share first,
     4. restaurants, things to do and a night out from the customer website's city page, in the half of the place asked for and
        within 15 km of the hotel, each with a rough per-person estimate (the guide itself has no prices; see the backend's rate table).
   Everything is a suggestion: nothing goes into the itinerary until the advisor adds it. */
import { useEffect, useMemo, useRef, useState } from "react";
import { fastapiFlightSearch, inr, scratchGuide, scratchHotels } from "../../services/api";
import { autoPriceOffer } from "../orders/FlightQuoteDrawer";
import { flightCartItem, errText, toast } from "../../lib/advisorHelpers";
import { Icon, Spinner } from "../ui";
import { budgetShares, estimateTotals, normalizePlan, stayBases, type ScratchPlan, type StayBase } from "../../lib/scratchPlan";
import { normalizeBudget, budgetRange, shortMoney } from "../../lib/tripBudget";
import { addDaysIso, fmtDayDate } from "../../lib/itineraryFromCart";
import { diningEntry, type DiningEntry } from "../../lib/diningPlan";

type Kind = "eat" | "do" | "party";
const KIND_LABEL: Record<Kind, string> = { eat: "Where to eat", do: "Things to do", party: "A night out" };
const money = (lo: number, hi: number) => (lo === hi ? inr(lo) : `${shortMoney(lo)}–${shortMoney(hi)}`);
const offNet = (o: any) => Number(o.base_net != null ? o.base_net : o.baseNet) || (o.detail || {}).baseNet || 0;

type Load<T> = { state: "idle" | "loading" | "done" | "error"; value?: T; error?: string };

export function ScratchPlanner({ plan: savedPlan, data, enquiryId, enquiry, addedHotelKeys, onAddFlight, onAddHotel, onAddDining, onAddActivity, onHide }: {
  plan: ScratchPlan;
  data: any;
  enquiryId: string;
  enquiry?: any;
  addedHotelKeys: Set<string>;
  onAddFlight: (cartItem: any) => void;
  onAddHotel: (hotel: any, base: StayBase) => void;
  onAddDining: (iso: string, entry: DiningEntry) => void;
  onAddActivity: (iso: string, entry: any) => void;
  onHide: () => void;
}) {
  const plan = useMemo(() => normalizePlan(savedPlan), [savedPlan]);
  // The budget the advisor sets on the itinerary wins over the one typed at the start.
  const total = (budgetRange(normalizeBudget(data && data.budget)) || { max: plan.budgetTotal }).max || plan.budgetTotal;
  const roundTrip = !!plan.endIso && plan.endIso !== plan.startIso;
  const shares = useMemo(() => budgetShares(total, plan.nights, roundTrip), [total, plan.nights, roundTrip]);
  const bases = useMemo(() => stayBases(plan), [plan]);
  const dates = useMemo(() => Array.from({ length: plan.nights + 1 }, (_, i) => addDaysIso(plan.startIso, i)), [plan.startIso, plan.nights]);
  const items: any[] = ((data && data.days) || []).flatMap((d: any) => d.items || []);
  const hotelsIn = items.filter((i) => i.type === "hotel");
  const flightsIn = items.filter((i) => i.type === "flight");

  // ---- flights ---------------------------------------------------------------------------------------------------------------
  const [flights, setFlights] = useState<Record<"out" | "back", Load<any[]>>>({ out: { state: "idle" }, back: { state: "idle" } });
  const [pricing, setPricing] = useState<string | null>(null);
  const flightsFor = useRef("");
  function loadFlights(force = false) {
    if (!plan.fromCode || !plan.toCode) return;
    const sig = [plan.fromCode, plan.toCode, plan.startIso, plan.endIso, plan.adults].join("|");
    if (!force && flightsFor.current === sig) return;
    flightsFor.current = sig;
    // One after the other: a new search empties the offer cache that "Add" prices from, so the return keeps the outbound's.
    const run = (key: "out" | "back", from: string, to: string, date: string, keepCache: boolean) => {
      setFlights((f) => ({ ...f, [key]: { state: "loading" } }));
      return fastapiFlightSearch({ originCode: from, destCode: to, date, pax: plan.adults, cabin: "economy", resultsLimit: 30, keepCache })
        .then((r: any) => setFlights((f) => ({ ...f, [key]: { state: "done", value: ((r && r.offers) || []).map((o: any) => ({ ...o, _searchDate: date })) } })))
        .catch((e: any) => setFlights((f) => ({ ...f, [key]: { state: "error", error: errText(e) } })));
    };
    run("out", plan.fromCode, plan.toCode, plan.startIso, false).then(() => {
      if (roundTrip && flightsFor.current === sig) run("back", plan.toCode as string, plan.fromCode as string, plan.endIso, true);
    });
  }
  useEffect(() => { loadFlights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan.fromCode, plan.toCode, plan.startIso, plan.endIso, plan.adults]);

  async function addFlight(o: any) {
    setPricing(String(o.id));
    try {
      const live = await autoPriceOffer(o);
      onAddFlight({ ...flightCartItem(o, [], { pax: { adults: plan.adults, children: 0, infants: 0 }, pricing: live }), _searchDate: o._searchDate });
      toast("Flight added, priced live", "success");
    } catch (e: any) {
      toast("Couldn't price that flight live: " + errText(e), "error");
    } finally {
      setPricing(null);
    }
  }

  // ---- hotels ----------------------------------------------------------------------------------------------------------------
  const [hotels, setHotels] = useState<Record<string, Load<any>>>({});
  const hotelsFor = useRef("");
  function loadHotels(force = false) {
    const sig = [plan.city, plan.region, plan.startIso, plan.nights, plan.adults, plan.rooms, shares.perStay.join(",")].join("|");
    if (!force && hotelsFor.current === sig) return;
    hotelsFor.current = sig;
    bases.forEach((b, i) => {
      const key = `${b.checkIn}|${b.checkOut}`;
      setHotels((h) => ({ ...h, [key]: { state: "loading" } }));
      scratchHotels({ city: plan.city, region: plan.region, checkIn: b.checkIn, checkOut: b.checkOut, adults: plan.adults, rooms: plan.rooms, budgetTotal: shares.perStay[i] || null, limit: 6 })
        .then((r: any) => setHotels((h) => ({ ...h, [key]: { state: "done", value: r } })))
        .catch((e: any) => setHotels((h) => ({ ...h, [key]: { state: "error", error: errText(e) } })));
    });
  }
  useEffect(() => { loadHotels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [plan.city, plan.region, plan.startIso, plan.nights, plan.adults, plan.rooms, shares.perStay.join(",")]);

  // ---- places near the first hotel -------------------------------------------------------------------------------------------
  const base = hotelsIn.find((h) => typeof h.lat === "number" && typeof h.lng === "number") || null;
  const [guide, setGuide] = useState<Load<any>>({ state: "idle" });
  const guideSig = [plan.city, plan.region, base ? base.lat + "," + base.lng : "", plan.adults].join("|");
  useEffect(() => {
    let off = false;
    setGuide({ state: "loading" });
    scratchGuide({ city: plan.city, region: plan.region, lat: base ? base.lat : undefined, lng: base ? base.lng : undefined, km: 15, pax: plan.adults })
      .then((r: any) => { if (!off) setGuide({ state: "done", value: r && r.guide }); })
      .catch((e: any) => { if (!off) setGuide({ state: "error", error: errText(e) }); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideSig]);

  const [kind, setKind] = useState<Kind>("eat");
  const [iso, setIso] = useState(dates[1] || dates[0]);
  const [fitOnly, setFitOnly] = useState(true);

  // What is already planned on the ground, from the estimates carried on the day entries.
  const planned = estimateTotals(((data && data.days) || []).flatMap((d: any) => [...(d.dining || []), ...(d.activities || [])]));
  const left = Math.max(0, shares.ground - planned.high);
  const have = new Set<string>(((data && data.days) || []).flatMap((d: any) => [...(d.dining || []), ...(d.activities || [])].map((e: any) => e.id)));
  const picks: any[] = (guide.value && guide.value[kind]) || [];
  const fits = (p: any) => !p.est || p.est.totalHigh <= left || p.est.totalHigh === 0;
  const shown = fitOnly ? picks.filter(fits) : picks;
  const hidden = picks.length - shown.length;

  function addPick(p: any) {
    if (kind === "eat") {
      const g = guide.value || {};
      const dist = p.km != null ? { km: p.km, minutes: null, approx: true } : null;
      const entry: any = diningEntry({ ...p }, { city: g.city || plan.city, url: g.url || "" }, dist, base ? { name: String(base.title || "").split(",")[0], city: plan.city, lat: base.lat, lng: base.lng } : null);
      entry.est = p.est;
      onAddDining(iso, entry);
    } else {
      onAddActivity(iso, { id: p.id, kind, name: p.name, area: p.area || null, tag: p.tag || null, description: p.description || null, photo: p.photo || null, km: p.km ?? null, est: p.est, far: !!p.far });
    }
    toast("Added to the day: " + p.name, "success");
  }

  const spent = ((data && data.days) || []).flatMap((d: any) => d.items || []).reduce((n: number, it: any) => n + (Number(it.price) || 0), 0);

  return (
    <section className="taw-sp" aria-label="Trip plan">
      <header className="taw-sp-head">
        <div>
          <div className="taw-sp-title"><Icon name="sparkle" size={15} /> Plan for {plan.destination}</div>
          <div className="taw-muted">
            {fmtDayDate(plan.startIso)} – {fmtDayDate(plan.endIso)} · {plan.nights} night{plan.nights === 1 ? "" : "s"} · {plan.adults} traveller{plan.adults === 1 ? "" : "s"} · {plan.rooms} room{plan.rooms === 1 ? "" : "s"}
          </div>
        </div>
        <button type="button" className="taw-btn taw-btn--sm" onClick={onHide}>Hide plan</button>
      </header>

      <div className="taw-sp-split" aria-label="Budget split">
        <div><span>Flights</span><b>{inr(shares.flights)}</b>{roundTrip ? <small>{inr(shares.perLeg)} each way</small> : null}</div>
        <div><span>Stays</span><b>{inr(shares.stays)}</b><small>{shares.perStay.map((v, i) => `${bases[i].nights}N ${shortMoney(v)}`).join(" · ")}</small></div>
        <div><span>On the ground</span><b>{inr(shares.ground)}</b><small>meals, cars, sightseeing</small></div>
        <div><span>Budget</span><b>{inr(total)}</b><small>{spent ? inr(spent) + " booked so far" : "nothing booked yet"}</small></div>
      </div>

      {/* flights */}
      <div className="taw-sp-sec">
        <div className="taw-sp-sec-h">Flights <span className="taw-muted">within {inr(shares.perLeg)} {roundTrip ? "each way" : ""} · {plan.fromCode || "?"} → {plan.toCode || "?"}</span></div>
        {!plan.fromCode || !plan.toCode ? (
          <div className="taw-sp-note">Couldn't tell the airport for {!plan.fromCode ? `“${plan.from}”` : `“${plan.city}”`}. Use the Flights desk on the right to search this route.</div>
        ) : (
          (["out", ...(roundTrip ? ["back"] : [])] as ("out" | "back")[]).map((leg) => {
            const l = flights[leg];
            const alreadyIn = flightsIn.some((f) => (leg === "out" ? f.origin === plan.fromCode : f.origin === plan.toCode));
            const list = [...((l.value as any[]) || [])].sort((a, b) => offNet(a) - offNet(b));
            const within = list.filter((o) => offNet(o) <= shares.perLeg);
            const show = (within.length ? within : list).slice(0, 5);
            return (
              <div key={leg} className="taw-sp-leg">
                <div className="taw-sp-leg-h">{leg === "out" ? `${plan.fromCode} → ${plan.toCode} · ${fmtDayDate(plan.startIso)}` : `${plan.toCode} → ${plan.fromCode} · ${fmtDayDate(plan.endIso)}`}{alreadyIn ? <span className="taw-chip taw-chip--ref">in the itinerary</span> : null}</div>
                {l.state === "loading" ? <div className="taw-sp-load"><Spinner /> Searching flights…</div> : null}
                {l.state === "error" ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} /> {l.error} <button className="taw-btn taw-btn--sm" onClick={() => loadFlights(true)}>Retry</button></div> : null}
                {l.state === "done" && !list.length ? <div className="taw-sp-note">No flights found for this day (TripSure sells flights up to about 350 days ahead).</div> : null}
                {l.state === "done" && list.length && !within.length ? <div className="taw-sp-note">No flight is within {inr(shares.perLeg)} for {plan.adults}; the cheapest are shown.</div> : null}
                {show.map((o: any) => {
                  const d = o.detail || {};
                  const ok = offNet(o) <= shares.perLeg;
                  return (
                    <div className="taw-sp-row" key={o.id}>
                      <div style={{ minWidth: 0 }}>
                        <b>{d.airlineName || d.airline || "Flight"} {d.flightNo || ""}</b>
                        <span className="taw-muted"> · {[d.depTime, d.arrTime].filter(Boolean).join(" → ")} · {d.duration || ""} · {d.stops ? d.stops + " stop" + (d.stops === 1 ? "" : "s") : "non-stop"}</span>
                      </div>
                      <div className="taw-sp-row-side">
                        <b className="ta-num">{inr(offNet(o))}</b>
                        <span className={"taw-chip " + (ok ? "taw-chip--ref" : "taw-chip--noref")}>{ok ? "Within budget" : "Over by " + inr(offNet(o) - shares.perLeg)}</span>
                        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={pricing === String(o.id)} onClick={() => addFlight(o)}>
                          <Icon name="plus" size={13} /> {pricing === String(o.id) ? "Pricing…" : "Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* hotels */}
      <div className="taw-sp-sec">
        <div className="taw-sp-sec-h">Hotels <span className="taw-muted">{bases.length} stay{bases.length === 1 ? "" : "s"} · {plan.region ? plan.destination + " only" : plan.city} · {plan.rooms} room{plan.rooms === 1 ? "" : "s"}</span></div>
        {bases.map((b, i) => {
          const l = hotels[`${b.checkIn}|${b.checkOut}`] || { state: "loading" };
          const r = l.value || {};
          return (
            <div key={b.checkIn} className="taw-sp-leg">
              <div className="taw-sp-leg-h">Stay {i + 1}: {fmtDayDate(b.checkIn)} → {fmtDayDate(b.checkOut)} · {b.nights} night{b.nights === 1 ? "" : "s"} <span className="taw-muted">· up to {inr(shares.perStay[i])}</span></div>
              {l.state === "loading" ? <div className="taw-sp-load"><Spinner /> Searching real hotels (this can take up to a minute)…</div> : null}
              {l.state === "error" ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} /> {l.error} <button className="taw-btn taw-btn--sm" onClick={() => loadHotels(true)}>Retry</button></div> : null}
              {l.state === "done" && r.status !== "ok" ? (
                <div className="taw-banner taw-banner--info"><Icon name="alert" size={14} /> {r.message || "No hotels found for these dates."} <button className="taw-btn taw-btn--sm" onClick={() => loadHotels(true)}>Retry</button></div>
              ) : null}
              {l.state === "done" && r.status === "ok" && !r.withinBudget ? <div className="taw-sp-note">Nothing here fits {inr(shares.perStay[i])}; the closest are shown.</div> : null}
              {l.state === "done" && r.status === "ok" ? (r.hotels || []).map((h: any) => {
                const already = addedHotelKeys.has(String(h.hotelKey));
                return (
                  <div className="taw-sp-row" key={h.hotelKey}>
                    <div style={{ minWidth: 0 }}>
                      <b>{h.name}</b> {h.stars ? <span className="taw-chip taw-chip--star">{"★".repeat(h.stars)}</span> : null}
                      {h.onGuide ? <span className="taw-chip taw-chip--verified" title="Listed on our city guide">City guide</span> : null}
                      <div className="taw-muted taw-sp-sub">{[h.address, h.board, h.refundable ? "Refundable" : "Non-refundable"].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="taw-sp-row-side">
                      <b className="ta-num">{inr(h.totalPrice)}</b>
                      <span className={"taw-chip " + (h.fits ? "taw-chip--ref" : "taw-chip--noref")}>{h.fits ? "Within budget" : "Over by " + inr(h.over)}</span>
                      <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={already} onClick={() => { onAddHotel(h, b); toast(`${h.name} added`, "success"); }}>
                        <Icon name={already ? "check" : "plus"} size={13} /> {already ? "Added" : "Add"}
                      </button>
                    </div>
                  </div>
                );
              }) : null}
            </div>
          );
        })}
      </div>

      {/* places */}
      <div className="taw-sp-sec">
        <div className="taw-sp-sec-h">Around {base ? String(base.title || "the hotel").split(",")[0] : plan.destination} <span className="taw-muted">{base ? "within 15 km of your hotel" : "add a hotel to see what is within 15 km of it"} · from the city page</span></div>
        <div className="taw-leg-switch">
          {(["eat", "do", "party"] as Kind[]).map((k) => (
            <button key={k} className={"taw-leg-tab" + (kind === k ? " is-active" : "")} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="taw-sp-bar">
          <label>Add to <select className="taw-select-plain" value={iso} onChange={(e) => setIso(e.target.value)}>
            {dates.map((d, i) => <option key={d} value={d}>Day {i + 1} · {fmtDayDate(d)}</option>)}
          </select></label>
          <label className="taw-sp-check"><input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /> Only what the ground budget still covers</label>
          <span className={"taw-chip " + (planned.high > shares.ground ? "taw-chip--noref" : "taw-chip--ref")} title="The estimates of what is added to the days, against the on-the-ground share">
            Planned {money(planned.low, planned.high)} of {inr(shares.ground)}
          </span>
        </div>
        {guide.state === "loading" ? <div className="taw-sp-load"><Spinner /> Reading the city page…</div> : null}
        {guide.state === "error" ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} /> {guide.error}</div> : null}
        {guide.state === "done" && !guide.value ? <div className="taw-sp-note">The website has no city page for {plan.city}, so there is nothing to suggest.</div> : null}
        {guide.state === "done" && guide.value && guide.value.note ? <div className="taw-sp-note">{guide.value.note}</div> : null}
        {guide.state === "done" && guide.value && !shown.length ? <div className="taw-sp-note">{picks.length ? "Everything listed is above what is left of the ground budget." : `Nothing in this list within reach${plan.region ? " in " + plan.destination : ""}.`}</div> : null}
        {shown.map((p: any) => {
          const added = have.has(p.id);
          return (
            <div className="taw-sp-row" key={p.id}>
              <div style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                {p.tag ? <span className="taw-chip taw-chip--star">{p.tag}</span> : null}
                {p.far ? <span className="taw-chip taw-chip--noref">Far</span> : null}
                <div className="taw-muted taw-sp-sub">{[p.area, p.km != null ? p.km + " km from the hotel" : null, p.tier && kind !== "do" ? p.tier : p.tier].filter(Boolean).join(" · ")}</div>
                {p.description ? <div className="taw-sp-desc">{p.description}</div> : null}
              </div>
              <div className="taw-sp-row-side">
                <b className="ta-num" title={`Estimate: ${p.est.basis}`}>{p.est.high === 0 ? "Free" : money(p.est.low, p.est.high)}<small> pp</small></b>
                <span className="taw-muted taw-sp-sub">≈ {money(p.est.totalLow, p.est.totalHigh)} for {p.est.pax} · estimate</span>
                <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={added} onClick={() => addPick(p)}>
                  <Icon name={added ? "check" : "plus"} size={13} /> {added ? "Added" : "Add"}
                </button>
              </div>
            </div>
          );
        })}
        {hidden > 0 ? <div className="taw-sp-note">{hidden} more above what is left ({inr(left)}). <button className="taw-btn taw-btn--sm" onClick={() => setFitOnly(false)}>Show them</button></div> : null}
      </div>
    </section>
  );
}
