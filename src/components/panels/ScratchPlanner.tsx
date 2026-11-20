"use client";
/* The plan for a trip started with "Plan this trip": from the answers (place, budget, dates, party) it lists, with no LLM, the
   restaurants, things to do and a night out from the customer website's city page, as the "Where to eat" cards, in the half of the
   place asked for and within 15 km of the hotel once one is added, each with a rough per-person estimate (the guide itself has no
   prices; see the backend's rate table). Flights and hotels are searched in the Search desks on the right, as always.
   Everything is a suggestion: nothing goes into the itinerary until the advisor adds it. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { inr, scratchGuide } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";
import { Icon, Spinner } from "../ui";
import { budgetShares, estimateTotals, normalizePlan, type ScratchPlan } from "../../lib/scratchPlan";
import { normalizeBudget, budgetRange, shortMoney, spentBy } from "../../lib/tripBudget";
import { addDaysIso, fmtDayDate } from "../../lib/itineraryFromCart";
import { diningEntry, fullTag, type DiningEntry } from "../../lib/diningPlan";
import { eatPlaceholder } from "../../lib/eatPlaceholder";

type Kind = "eat" | "do" | "party";
const KIND_LABEL: Record<Kind, string> = { eat: "Where to eat", do: "Things to do", party: "A night out" };
/* The category chips of the city page ("Icons & views", "History & culture" ...), in its order, each with its icon. A label the page
   adds later is still shown (after these, with the gem), so nothing is hidden because it is not listed here. */
const TIER_ORDER = [
  "icons & views", "history & culture", "nature & the outdoors", "food & wine", "experiences",
  "destination", "fine", "smart", "casual",
  "cocktail bars", "landmark bars", "late & loud", "rooftops",
];
const tierRank = (label: string) => {
  const l = label.toLowerCase();
  const i = TIER_ORDER.findIndex((t) => l === t || l.startsWith(t));
  return i < 0 ? TIER_ORDER.length : i;
};
const TIER_PATHS: Record<string, string> = {
  camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  landmark: "M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z",
  mountain: "m8 3 4 8 5-5 5 15H2L8 3z",
  wine: "M8 22h8M7 10h10M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5z",
  ticket: "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 11v2M13 17v2",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  shirt: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
  coffee: "M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
  martini: "M8 22h8M12 11v11m7-19-7 8-7-8z",
  music: "M12 18V2l7 4M8 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  sunset: "M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0",
  gem: "M6 3h12l4 6-10 13L2 9zM11 3 8 9l4 13 4-13-3-6M2 9h20",
};
function tierIconKey(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith("icons")) return "camera";
  if (l.startsWith("history") || l.startsWith("landmark")) return "landmark";
  if (l.startsWith("nature")) return "mountain";
  if (l.startsWith("food") || l.startsWith("fine") || l.startsWith("cocktail")) return l.startsWith("cocktail") ? "martini" : "wine";
  if (l.startsWith("experience")) return "ticket";
  if (l.startsWith("destination")) return "pin";
  if (l.startsWith("smart")) return "shirt";
  if (l.startsWith("casual")) return "coffee";
  if (l.startsWith("late")) return "music";
  if (l.startsWith("rooftop")) return "sunset";
  return "gem";
}
function TierIcon({ label }: { label: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TIER_PATHS[tierIconKey(label)]} />
    </svg>
  );
}

const money = (lo: number, hi: number) => (lo === hi ? inr(lo) : `${shortMoney(lo)}–${shortMoney(hi)}`);

const mapsUrl = (name: string, area?: string | null, city?: string) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([name, area, city].filter(Boolean).join(", "));

/** One place from the city page, as the "Where to eat" cards show it (photo, kind, award, area), with how far it is from the hotel and
 *  a labelled per-person estimate. The "+" puts it on the selected day. */
function PlaceCard({ place: p, city, added, dayLabel, hotelName, onAdd }: { place: any; city: string; added: boolean; dayLabel: string; hotelName: string | null; onAdd: () => void }) {
  const [photoOk, setPhotoOk] = useState(true);
  const headline = fullTag(p.tag, p.credentials);
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
  // The same 15 / 60 / 25 split as the budget card above: flights, stays (the nights in two stays) and the ground (meals, cars,
  // sightseeing). Flights and stays are booked from the Search desks; what has been booked is shown against each share.
  const roundTrip = !!plan.endIso && plan.endIso !== plan.startIso;
  const shares = useMemo(() => budgetShares(total, plan.nights, roundTrip), [total, plan.nights, roundTrip]);
  const booked = spentBy(data);
  const ground = shares.ground;
  const perNight = Math.round(shares.stays / Math.max(1, plan.nights) / Math.max(1, plan.rooms));

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
  const [drawerOpen, setDrawerOpen] = useState(false); // the places open in a drawer on the right, like "Where to eat" always did

  // What is already planned on the ground, from the estimates carried on the day entries.
  const planned = estimateTotals(((data && data.days) || []).flatMap((d: any) => [...(d.dining || []), ...(d.activities || [])]));
  const left = Math.max(0, ground - planned.high);
  const have = new Set<string>(((data && data.days) || []).flatMap((d: any) => [...(d.dining || []), ...(d.activities || [])].map((e: any) => e.id)));
  const allPicks: any[] = (guide.value && guide.value[kind]) || [];
  // The city page's category chips: one category at a time, the first by default, as on the page.
  const tiers = useMemo(() => Array.from(new Set(allPicks.map((p: any) => (p.tier ? String(p.tier) : "")).filter(Boolean))).sort((a, b) => tierRank(a) - tierRank(b)), [allPicks]);
  const [tierSel, setTierSel] = useState<Partial<Record<Kind, string>>>({});
  const tier = tiers.length > 1 ? (tiers.includes(tierSel[kind] || "") ? (tierSel[kind] as string) : tiers[0]) : null;
  const picks: any[] = tier ? allPicks.filter((p: any) => String(p.tier || "") === tier) : allPicks;
  const fits = (p: any) => !p.est || p.est.totalHigh <= left || p.est.totalHigh === 0;
  const shown = fitOnly ? picks.filter(fits) : picks;
  const hidden = picks.length - shown.length;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function addPick(p: any) {
    if (kind === "eat") {
      const g = guide.value || {};
      const dist = p.km != null ? { km: p.km, minutes: null, approx: true } : null;
      const entry: any = diningEntry({ ...p }, { city: g.city || plan.city, url: g.url || "" }, dist, base ? { name: String(base.title || "").split(",")[0], city: plan.city, lat: base.lat, lng: base.lng } : null);
      entry.est = p.est;
      onAddDining(iso, entry);
    } else {
      const g = guide.value || {};
      onAddActivity(iso, {
        id: p.id, kind, name: p.name, area: p.area || null, tag: p.tag || null, tier: p.tier || null, credentials: Array.isArray(p.credentials) ? p.credentials.slice(0, 3) : [], description: p.description || null, photo: p.photo || null,
        km: p.km ?? null, est: p.est, far: !!p.far,
        // the city page it comes from, so the proposal can open it on the right tab
        city: g.city || plan.city, url: g.url || "",
      });
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

      <div className="taw-sp-split" aria-label="Budget split">
        <div>
          <span>Flights</span><b>{inr(shares.flights)}</b>
          <small>{roundTrip ? `${inr(shares.perLeg)} each way` : "one way"} · {booked.flights > 0 ? `${inr(booked.flights)} booked` : "none booked"}</small>
        </div>
        <div>
          <span>Hotels</span><b>{inr(shares.stays)}</b>
          <small>about {inr(perNight)} a night for {plan.rooms} room{plan.rooms === 1 ? "" : "s"} · {booked.stays > 0 ? `${inr(booked.stays)} booked` : "none booked"}</small>
        </div>
        <div><span>On the ground</span><b>{inr(ground)}</b><small>meals, cars, sightseeing</small></div>
        <div><span>Budget</span><b>{inr(total)}</b><small>{basis || "for the trip"}</small></div>
      </div>

      {/* places */}
      <div className="taw-sp-sec">
        <div className="taw-sp-sec-h">Around {base ? String(base.title || "the hotel").split(",")[0] : plan.destination} <span className="taw-muted">{base ? "within 15 km of your hotel" : "add a hotel to see what is within 15 km of it"} · from the city page</span></div>
        <div className="taw-leg-switch">
          {(["eat", "do", "party"] as Kind[]).map((k) => (
            <button key={k} className={"taw-leg-tab" + (drawerOpen && kind === k ? " is-active" : "")} aria-expanded={drawerOpen && kind === k}
              onClick={() => { if (drawerOpen && kind === k) setDrawerOpen(false); else { setKind(k); setDrawerOpen(true); } }}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="taw-sp-note">
          {guide.state === "loading" ? "Reading the city page…" : "Open Where to eat, Things to do or A night out to see the places on the right and add them to a day."}
          {" "}
          <span className={"taw-chip " + (planned.high > ground ? "taw-chip--noref" : "taw-chip--ref")} title="The estimates of what is added to the days, against the on-the-ground share">
            Planned {money(planned.low, planned.high)} of {inr(ground)}
          </span>
        </div>
        {drawerOpen && typeof document !== "undefined" ? createPortal(
          <aside className="taw-eat-drawer" role="dialog" aria-label={KIND_LABEL[kind]}>
            <div className="taw-eat-drawer-head">
              <b>{KIND_LABEL[kind]}</b>
              <button type="button" className="taw-btn taw-btn--sm" aria-label="Close" onClick={() => setDrawerOpen(false)}><Icon name="x" size={13} /> Close</button>
            </div>
            <div className="taw-eat-drawer-day" style={{ gap: 6 }}>
              {(["eat", "do", "party"] as Kind[]).map((k) => (
                <button key={k} type="button" className={"taw-leg-tab" + (kind === k ? " is-active" : "")} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            {tiers.length > 1 ? (
              <div className="taw-tier-chips" role="radiogroup" aria-label="Filter by category">
                {tiers.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={t === tier} className={"taw-tier-chip" + (t === tier ? " is-active" : "")}
                    onClick={() => setTierSel((m) => ({ ...m, [kind]: t }))}><TierIcon label={t} />{t}</button>
                ))}
              </div>
            ) : null}
            <label className="taw-eat-drawer-day">
              <span>Add to</span>
              <select value={iso} onChange={(e) => setIso(e.target.value)}>
                {dates.map((d, i) => <option key={d} value={d}>Day {i + 1} · {fmtDayDate(d)}</option>)}
              </select>
            </label>
            <div className="taw-eat-drawer-note" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="taw-sp-check"><input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /> Only what the ground budget still covers</label>
              <span className={"taw-chip " + (planned.high > ground ? "taw-chip--noref" : "taw-chip--ref")}>Planned {money(planned.low, planned.high)} of {inr(ground)}</span>
            </div>
            <div className="taw-eat-drawer-body">
              {guide.state === "loading" ? <div className="taw-sp-load"><Spinner /> Reading the city page…</div> : null}
              {guide.state === "error" ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} /> {guide.error}</div> : null}
              {guide.state === "done" && !guide.value ? <div className="taw-sp-note">The website has no city page for {plan.city}, so there is nothing to suggest.</div> : null}
              {guide.state === "done" && guide.value && guide.value.note ? <div className="taw-sp-note">{guide.value.note}</div> : null}
              {guide.state === "done" && guide.value && !shown.length ? <div className="taw-sp-note">{picks.length ? "Everything listed is above what is left of the ground budget." : `Nothing in this list within reach${plan.region ? " in " + plan.destination : ""}.`}</div> : null}
              {shown.map((p: any) => (
                <PlaceCard key={p.id} place={p} city={(guide.value && guide.value.city) || plan.city} added={have.has(p.id)} dayLabel={`Day ${dates.indexOf(iso) + 1}`}
                  hotelName={base ? String(base.title || "").split(",")[0] : null} onAdd={() => addPick(p)} />
              ))}
              {hidden > 0 ? <div className="taw-sp-note">{hidden} more above what is left ({inr(left)}). <button className="taw-btn taw-btn--sm" onClick={() => setFitOnly(false)}>Show them</button></div> : null}
            </div>
          </aside>,
          document.body,
        ) : null}
      </div>
    </section>
  );
}
