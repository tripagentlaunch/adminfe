"use client";
/* "Where to eat" for the cities of the itinerary, from our own city guides (GET /hotels/city-guide, the website's city pages).
   It opens in a drawer at the side of the screen, so the itinerary stays in view: only the restaurants are listed (best tier first,
   with their awards), and one click puts a restaurant on a day. A city the website has no page for shows nothing. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cityGuide } from "../../services/api";
import { Icon } from "../ui";
import { firstSentence, itineraryCityTexts, type Pick } from "../../lib/cityGuideText";
import { diningEntry, isBar, type DiningEntry } from "../../lib/diningPlan";
export { itineraryCityTexts };

type Guide = { city: string; slug: string; country?: string | null; url: string; eat?: Pick[] };
export type GuideDay = { id: string; label: string };

export function CityGuidePanel({ texts, days, dining, onAddDining }: {
  texts: string[];
  days: GuideDay[];
  /** dayId -> ids of the restaurants already on that day. */
  dining: Record<string, string[]>;
  onAddDining: (dayId: string, entry: DiningEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayId, setDayId] = useState("");
  const asked = useRef<Map<string, Guide | null>>(new Map());
  const key = useMemo(() => texts.join("|"), [texts]);
  const day = days.some((d) => d.id === dayId) ? dayId : days[0] ? days[0].id : "";

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
    if (!todo.length) { collect(); setLoading(false); return; }
    setLoading(true);
    Promise.all(todo.map((t) => cityGuide(t, 20).then((r: any) => asked.current.set(t, (r && r.guide) || null)).catch(() => asked.current.set(t, null))))
      .finally(() => { collect(); if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onDay = new Set(dining[day] || []);
  const drawer = open ? (
    <aside className="taw-eat-drawer" role="dialog" aria-label="Where to eat">
      <div className="taw-eat-drawer-head">
        <b>Where to eat</b>
        <button type="button" className="taw-btn taw-btn--sm" aria-label="Close where to eat" onClick={() => setOpen(false)}><Icon name="x" size={13} /> Close</button>
      </div>
      {days.length ? (
        <label className="taw-eat-drawer-day">
          <span>Add to</span>
          <select value={day} onChange={(e) => setDayId(e.target.value)}>
            {days.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      ) : <div className="taw-muted">Add a flight or hotel first: restaurants are added to a day of the trip.</div>}
      <div className="taw-eat-drawer-body">
        {loading && !guides.length ? <div className="taw-muted">Looking up our city pages…</div> : null}
        {!loading && !guides.length ? <div className="taw-muted">Our website has no city page for this itinerary&apos;s cities yet.</div> : null}
        {guides.map((g) => {
          const picks = (g.eat || []).filter((p) => !isBar(p));
          return picks.length ? (
            <section key={g.slug} className="taw-eat-drawer-city">
              <div className="taw-itin-guide-head">
                <b>{g.city}</b>
                <a href={g.url} target="_blank" rel="noopener noreferrer">The full {g.city} guide</a>
              </div>
              {picks.map((p) => {
                const entry = diningEntry(p, g);
                const added = onDay.has(entry.id);
                return (
                  <div className="taw-eat-pick" key={entry.id}>
                    <div style={{ minWidth: 0 }}>
                      <b>{p.name}</b>
                      {p.tier ? <span className="taw-itin-guide-tier">{p.tier}</span> : null}
                      {p.area ? <div className="taw-muted" style={{ fontSize: 12 }}>{p.area}</div> : null}
                      {p.credentials && p.credentials.length ? <div className="taw-itin-item-meta">{p.credentials.slice(0, 2).join(" · ")}</div> : null}
                      {p.description ? <div className="taw-itin-item-sub">{firstSentence(p.description)}</div> : null}
                    </div>
                    <button type="button" className="taw-btn taw-btn--sm" disabled={!day || added} onClick={() => onAddDining(day, entry)}>
                      {added ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })}
            </section>
          ) : null;
        })}
      </div>
    </aside>
  ) : null;

  return (
    <>
      <button type="button" className="taw-btn taw-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="pin" size={13} /> {open ? "Hide where to eat" : "Browse where to eat"}
      </button>
      {drawer && typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
    </>
  );
}
