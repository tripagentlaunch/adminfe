"use client";
/* The plan for a trip started with "Plan this trip": from the answers (place, budget, dates, party) it lists, with no LLM, the
   restaurants, things to do and a night out from the customer website's city page, as the "Where to eat" cards, in the half of the
   place asked for and within 15 km of the hotel once one is added, each with a rough per-person estimate (the guide itself has no
   prices; see the backend's rate table). Flights and hotels are searched in the Search desks on the right, as always.
   Everything is a suggestion: nothing goes into the itinerary until the advisor adds it. */
import { useEffect, useMemo, useState } from "react";
import { inr, scratchGuide } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";
import { Icon, Spinner } from "../ui";
import { estimateTotals, normalizePlan, type ScratchPlan } from "../../lib/scratchPlan";
import { normalizeBudget, budgetRange, shortMoney, BUDGET_SHARES } from "../../lib/tripBudget";
import { addDaysIso, fmtDayDate } from "../../lib/itineraryFromCart";
import { diningEntry, type DiningEntry } from "../../lib/diningPlan";
import { eatPlaceholder } from "../../lib/eatPlaceholder";

type Kind = "eat" | "do" | "party";
const KIND_LABEL: Record<Kind, string> = { eat: "Where to eat", do: "Things to do", party: "A night out" };
const money = (lo: number, hi: number) => (lo === hi ? inr(lo) : `${shortMoney(lo)}–${shortMoney(hi)}`);

const mapsUrl = (name: string, area?: string | null, city?: string) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([name, area, city].filter(Boolean).join(", "));

/** One place from the city page, as the "Where to eat" cards show it (photo, kind, award, area), with how far it is from the hotel and
 *  a labelled per-person estimate. The "+" puts it on the selected day. */
function PlaceCard({ place: p, city, added, dayLabel, hotelName, onAdd }: { place: any; city: string; added: boolean; dayLabel: string; hotelName: string | null; onAdd: () => void }) {
  const [photoOk, setPhotoOk] = useState(true);
  const headline = p.tag || (p.credentials && p.credentials[0]) || null;
  return (
    <article className="taw-eat-card">
      <div className="taw-eat-card-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.photo && photoOk ? p.photo : eatPlaceholder(p.name)} alt={p.name} loading="lazy" onError={() => setPhotoOk(false)} />
        {p.tier ? <span className="taw-eat-card-badge">{p.tier}</span> : null}
        <button type="button" className={"taw-eat-card-add" + (added ? " is-added" : "")} disabled={added}
          aria-label={added ? `${p.name} is already on the trip` : `Add ${p.name} to ${dayLabel}`} title={added ? "Already on the trip" : `Add to ${dayLabel}`} onClick={onAdd}>
          {added ? "✓" : "+"}
        </button>
      </div>
      <div className="taw-eat-card-body">
        <b className="taw-eat-card-name">{p.name}</b>
        {headline ? <span className="taw-eat-card-tag" title={(p.credentials || []).join(" · ")}>{headline}</span> : null}
        {p.far ? <span className="taw-eat-card-tag taw-eat-card-tag--far">Far from the hotel</span> : null}
        {p.description ? <div className="taw-eat-card-desc">{p.description}</div> : null}
        {p.area ? (
          <a className="taw-eat-card-area" href={mapsUrl(p.name, p.area, city)} target="_blank" rel="noopener noreferrer" title={`Open ${p.name} in Google Maps`}>
            <Icon name="pin" size={12} /> {p.area}
          </a>
        ) : null}
        {hotelName && p.km != null ? <div className="taw-eat-card-dist"><Icon name="hotel" size={12} /> about {p.km} km from {hotelName}</div> : null}
        {p.est ? (
          <div className="taw-eat-card-est" title={`Estimate: ${p.est.basis}`}>
            <b>{p.est.high === 0 ? "Free" : `${money(p.est.low, p.est.high)} each`}</b>
            <span>{p.est.high === 0 ? "" : ` · ≈ ${money(p.est.totalLow, p.est.totalHigh)} for ${p.est.pax}`} · estimate</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type Load<T> = { state: "idle" | "loading" | "done" | "error"; value?: T; error?: string };

export function ScratchPlanner({ plan: savedPlan, data, onAddDining, onAddActivity, onHide }: {
  plan: ScratchPlan;
  data: any;
  onAddDining: (iso: string, entry: DiningEntry) => void;
  onAddActivity: (iso: string, entry: any) => void;
  onHide: () => void;
}) {
  const plan = useMemo(() => normalizePlan(savedPlan), [savedPlan]);
  // The budget the advisor sets on the itinerary wins over the one typed at the start.
  const typedBudget = normalizeBudget(data && data.budget);
  const total = (budgetRange(typedBudget) || { max: plan.budgetTotal }).max || plan.budgetTotal;
  const basis = typedBudget && typedBudget.per === "person" ? `${shortMoney(typedBudget.max)} × ${typedBudget.pax} travellers` : typedBudget ? "whole trip" : "";
  const dates = useMemo(() => Array.from({ length: plan.nights + 1 }, (_, i) => addDaysIso(plan.startIso, i)), [plan.startIso, plan.nights]);
  const items: any[] = ((data && data.days) || []).flatMap((d: any) => d.items || []);
  const hotelsIn = items.filter((i) => i.type === "hotel");
  // Flights and stays are booked from the Search desks: what is left of the budget after them is for the ground (meals, cars,
  // sightseeing); before anything is booked, the usual quarter of it.
  const booked = items.reduce((n: number, it: any) => n + (Number(it.price) || 0), 0);
  const ground = booked > 0 ? Math.max(0, total - booked) : Math.round(total * BUDGET_SHARES.ground);

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
  const left = Math.max(0, ground - planned.high);
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

  return (
    <section className="taw-sp" aria-label="Trip plan">
      <header className="taw-sp-head">
        <div>
          <div className="taw-sp-title"><Icon name="sparkle" size={15} /> Plan for {plan.destination}</div>
          <div className="taw-muted">
            {fmtDayDate(plan.startIso)} – {fmtDayDate(plan.endIso)} · {plan.nights} night{plan.nights === 1 ? "" : "s"} · {plan.adults} traveller{plan.adults === 1 ? "" : "s"}
          </div>
        </div>
        <button type="button" className="taw-btn taw-btn--sm" onClick={onHide}>Hide plan</button>
      </header>

      <div className="taw-sp-split" aria-label="Budget">
        <div><span>Budget</span><b>{inr(total)}</b><small>{basis || "for the trip"}{booked > 0 ? ` · ${inr(booked)} booked` : ""}</small></div>
        <div><span>On the ground</span><b>{inr(ground)}</b><small>{booked > 0 ? "what is left after flights and stays" : "meals, cars, sightseeing"}</small></div>
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
          <span className={"taw-chip " + (planned.high > ground ? "taw-chip--noref" : "taw-chip--ref")} title="The estimates of what is added to the days, against the on-the-ground share">
            Planned {money(planned.low, planned.high)} of {inr(ground)}
          </span>
        </div>
        {guide.state === "loading" ? <div className="taw-sp-load"><Spinner /> Reading the city page…</div> : null}
        {guide.state === "error" ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} /> {guide.error}</div> : null}
        {guide.state === "done" && !guide.value ? <div className="taw-sp-note">The website has no city page for {plan.city}, so there is nothing to suggest.</div> : null}
        {guide.state === "done" && guide.value && guide.value.note ? <div className="taw-sp-note">{guide.value.note}</div> : null}
        {guide.state === "done" && guide.value && !shown.length ? <div className="taw-sp-note">{picks.length ? "Everything listed is above what is left of the ground budget." : `Nothing in this list within reach${plan.region ? " in " + plan.destination : ""}.`}</div> : null}
        <div className="taw-sp-cards">
          {shown.map((p: any) => (
            <PlaceCard key={p.id} place={p} city={(guide.value && guide.value.city) || plan.city} added={have.has(p.id)} dayLabel={`Day ${dates.indexOf(iso) + 1}`}
              hotelName={base ? String(base.title || "").split(",")[0] : null} onAdd={() => addPick(p)} />
          ))}
        </div>
        {hidden > 0 ? <div className="taw-sp-note">{hidden} more above what is left ({inr(left)}). <button className="taw-btn taw-btn--sm" onClick={() => setFitOnly(false)}>Show them</button></div> : null}
      </div>
    </section>
  );
}
