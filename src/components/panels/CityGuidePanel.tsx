"use client";
/* The website's city page for each city of the itinerary, inside the Itinerary Builder (2026-11-13): where to base yourself, and
   its stay / eat / do / after-dark picks with their credentials, best tier first. The advisor does not have to know the best
   restaurant in Sydney: the picks come from our own city guides (GET /hotels/city-guide), and one click adds a pick to a day's
   description, which is what the proposal and its PDF show for that day. A city the website has no page for shows nothing. */
import { useEffect, useMemo, useRef, useState } from "react";
import { cityGuide } from "../../services/api";
import { Icon } from "../ui";
import { itineraryCityTexts, pickLine, type Pick } from "../../lib/cityGuideText";
export { itineraryCityTexts };

type Guide = {
  city: string; slug: string; country?: string | null; tagline?: string | null; url: string;
  base?: { name: string; description?: string | null }[];
  stay?: Pick[]; eat?: Pick[]; do?: Pick[]; party?: Pick[];
};
export type GuideDay = { id: string; label: string };

const SECTIONS: { key: "stay" | "eat" | "do" | "party"; title: string; addable: boolean }[] = [
  { key: "stay", title: "Where we would stay", addable: false },
  { key: "eat", title: "Where to eat", addable: true },
  { key: "do", title: "What to do", addable: true },
  { key: "party", title: "After dark", addable: true },
];

function PickRow({ p, days, addable, onAdd }: { p: Pick; days: GuideDay[]; addable: boolean; onAdd: (dayId: string, text: string) => void }) {
  const [dayId, setDayId] = useState(days[0] ? days[0].id : "");
  const day = days.some((d) => d.id === dayId) ? dayId : days[0] ? days[0].id : "";
  return (
    <div className="taw-itin-guide-pick">
      <div>
        <b>{p.name}</b>
        {p.area ? <span className="taw-muted">{" · " + p.area}</span> : null}
        {p.tier ? <span className="taw-itin-guide-tier">{p.tier}</span> : null}
      </div>
      {p.credentials && p.credentials.length ? <div className="taw-itin-item-meta">{p.credentials.join(" · ")}</div> : null}
      {p.description ? <div className="taw-itin-item-sub">{p.description}</div> : null}
      {addable && days.length ? (
        <div className="taw-itin-guide-add">
          <select value={day} onChange={(e) => setDayId(e.target.value)} aria-label={"Day to add " + p.name + " to"}>
            {days.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button type="button" className="taw-btn taw-btn--sm" onClick={() => onAdd(day, pickLine(p))}>Add to this day</button>
        </div>
      ) : null}
    </div>
  );
}

export function CityGuidePanel({ texts, days, onAddToDay }: { texts: string[]; days: GuideDay[]; onAddToDay: (dayId: string, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(false);
  const asked = useRef<Map<string, Guide | null>>(new Map());
  const key = useMemo(() => texts.join("|"), [texts]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const todo = texts.slice(0, 8).filter((t) => !asked.current.has(t));
    const collect = () => {
      const seen = new Set<string>();
      const out: Guide[] = [];
      texts.forEach((t) => {
        const g = asked.current.get(t);
        if (g && !seen.has(g.slug)) { seen.add(g.slug); out.push(g); }
      });
      if (alive) setGuides(out.slice(0, 4));
    };
    if (!todo.length) { collect(); return; }
    Promise.all(todo.map((t) => cityGuide(t).then((r: any) => asked.current.set(t, (r && r.guide) || null)).catch(() => asked.current.set(t, null))))
      .finally(() => { collect(); if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  return (
    <div className="taw-itin-guide">
      <button type="button" className="taw-btn taw-btn--sm" aria-expanded={open} onClick={() => { setOpen(!open); setLoading(true); }}>
        <Icon name="pin" size={13} /> {open ? "Hide the city guide" : "City guide: where to stay, eat and what to do"}
      </button>
      {open ? (
        <div className="taw-itin-guide-body">
          {loading && !guides.length ? <div className="taw-muted">Looking up our city pages…</div> : null}
          {!loading && !guides.length ? <div className="taw-muted">Our website has no city page for this itinerary&apos;s cities yet.</div> : null}
          {guides.map((g) => (
            <div key={g.slug} className="taw-itin-guide-city">
              <div className="taw-itin-guide-head">
                <b>{g.city}</b>
                {g.country ? <span className="taw-muted">{" · " + g.country}</span> : null}
                <a href={g.url} target="_blank" rel="noopener noreferrer">The full {g.city} guide</a>
              </div>
              {g.tagline ? <div className="taw-itin-item-sub">{g.tagline}</div> : null}
              {g.base && g.base.length ? (
                <div className="taw-itin-item-sub"><b>Where to base yourself: </b>{g.base.slice(0, 2).map((b) => (b.description ? `${b.name} (${b.description})` : b.name)).join(" · ")}</div>
              ) : null}
              {SECTIONS.map((s) => {
                const picks = ((g as any)[s.key] || []).slice(0, s.key === "stay" ? 4 : 6) as Pick[];
                return picks.length ? (
                  <div key={s.key} className="taw-itin-guide-sec">
                    <div className="taw-itin-guide-eyebrow">{s.title}</div>
                    {picks.map((p, i) => <PickRow key={i} p={p} days={days} addable={s.addable} onAdd={onAddToDay} />)}
                  </div>
                ) : null;
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
