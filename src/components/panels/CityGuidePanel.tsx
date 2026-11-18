"use client";
/* "Where to eat": the restaurants our website's city page lists for the cities of the itinerary, as cards like the page's own
   (photo, award, area), in a drawer at the side so the itinerary stays in view. Nothing is chosen for the advisor: the "+" on a
   card puts that restaurant on the selected day. Each card says how far the restaurant is from that day's hotel. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { whereToEat, whereToEatDistances } from "../../services/api";
import { Icon } from "../ui";
import { diningEntry, distanceText, type DayHotel, type DiningEntry, type EatDistance, type EatGuide, type EatItem } from "../../lib/diningPlan";
import { itineraryCityTexts } from "../../lib/cityGuideText";
import { eatPlaceholder } from "../../lib/eatPlaceholder";
export { itineraryCityTexts };

export type GuideDay = { id: string; label: string };

const mapsUrl = (name: string, area?: string | null, city?: string) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([name, area, city].filter(Boolean).join(", "));

function EatCard({ item, guide, added, dayLabel, distance, distanceNote, hotel, onAdd }: {
  item: EatItem; guide: EatGuide; added: boolean; dayLabel: string; distance: EatDistance | null | undefined; distanceNote: string | null;
  hotel: DayHotel | null; onAdd: () => void;
}) {
  const [photoOk, setPhotoOk] = useState(true);
  const headline = item.tag || (item.credentials && item.credentials[0]) || null;
  return (
    <article className="taw-eat-card">
      <div className="taw-eat-card-photo">
        {/* the restaurant's photo; a placeholder when it has none or it can't be loaded */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.photo && photoOk ? item.photo : eatPlaceholder(item.name)} alt={item.name} loading="lazy" onError={() => setPhotoOk(false)} />
        {item.tier ? <span className="taw-eat-card-badge">{item.tier}</span> : null}
        <button type="button" className={"taw-eat-card-add" + (added ? " is-added" : "")} disabled={added || !dayLabel}
          aria-label={added ? `${item.name} is already on ${dayLabel}` : `Add ${item.name} to ${dayLabel}`}
          title={added ? "Already on this day" : `Add to ${dayLabel}`} onClick={onAdd}>
          {added ? "✓" : "+"}
        </button>
      </div>
      <div className="taw-eat-card-body">
        <b className="taw-eat-card-name">{item.name}</b>
        {headline ? <span className="taw-eat-card-tag" title={(item.credentials || []).join(" · ")}>{headline}</span> : null}
        {item.description ? <div className="taw-eat-card-desc">{item.description}</div> : null}
        {item.area ? (
          <a className="taw-eat-card-area" href={mapsUrl(item.name, item.area, guide.city)} target="_blank" rel="noopener noreferrer" title={`Open ${item.name} in Google Maps`}>
            <Icon name="pin" size={12} /> {item.area}
          </a>
        ) : null}
        {hotel ? (
          distance ? <div className="taw-eat-card-dist"><Icon name="hotel" size={12} /> {distanceText(distance, hotel.name)}</div>
          : distance === null ? <div className="taw-eat-card-dist taw-muted">Distance from {hotel.name} isn&apos;t available{distanceNote ? ` (${distanceNote})` : ""}</div>
          : <div className="taw-eat-card-dist taw-muted">Working out the distance from {hotel.name}…</div>
        ) : null}
      </div>
    </article>
  );
}

export function CityGuidePanel({ texts, days, dayTexts, hotelForDay, dining, onAddDining }: {
  texts: string[];
  days: GuideDay[];
  /** The city texts of each day (so the restaurants of the selected day's city come first). */
  dayTexts: Record<string, string[]>;
  hotelForDay: (dayId: string) => DayHotel | null;
  /** dayId -> ids of the restaurants already on that day. */
  dining: Record<string, string[]>;
  onAddDining: (dayId: string, entry: DiningEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dayId, setDayId] = useState("");
  // what the website answered for each city text (null: no page for it), and each hotel+city's distances
  const [byText, setByText] = useState<Record<string, EatGuide | null>>({});
  const [distCache, setDistCache] = useState<Record<string, { results: Record<string, EatDistance | null>; note: string | null }>>({});
  const key = useMemo(() => texts.join("|"), [texts]);
  const day = days.some((d) => d.id === dayId) ? dayId : days[0] ? days[0].id : "";
  const hotel = day ? hotelForDay(day) : null;
  const dayLabel = (days.find((d) => d.id === day) || { label: "" }).label;

  const wanted = useMemo(() => texts.slice(0, 8), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = open && wanted.some((t) => !(t in byText));
  useEffect(() => {
    if (!open) return;
    const todo = wanted.filter((t) => !(t in byText));
    todo.forEach((t) =>
      whereToEat(t)
        .then((r: any) => setByText((m) => ({ ...m, [t]: (r && r.guide) || null })))
        .catch(() => setByText((m) => ({ ...m, [t]: null }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wanted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const guides = useMemo(() => {
    const seen = new Set<string>();
    const out: EatGuide[] = [];
    texts.forEach((t) => { const g = byText[t]; if (g && !seen.has(g.slug)) { seen.add(g.slug); out.push(g); } });
    return out.slice(0, 4);
  }, [texts, byText]);
  // The city of the selected day first: its restaurants are the ones near that day's hotel.
  const dayCity = useMemo(() => {
    for (const t of dayTexts[day] || []) { const g = byText[t]; if (g) return g.slug; }
    return null;
  }, [dayTexts, day, byText]);
  const ordered = useMemo(() => guides.slice().sort((a, b) => Number(b.slug === dayCity) - Number(a.slug === dayCity)), [guides, dayCity]);
  const nearGuide = ordered.find((g) => g.slug === dayCity) || null;

  // How far each restaurant of the day's city is from the day's hotel (asked once per hotel and city).
  const distKey = hotel && nearGuide ? `${hotel.lat},${hotel.lng}|${nearGuide.slug}` : null;
  const distHit = distKey ? distCache[distKey] : undefined;
  const dist = distHit ? distHit.results : {};
  const distNote = distHit ? distHit.note : null;
  useEffect(() => {
    if (!open || !distKey || distHit || !hotel || !nearGuide) return;
    let alive = true;
    whereToEatDistances({ origin: { lat: hotel.lat, lng: hotel.lng }, items: nearGuide.items.slice(0, 60).map((i) => ({ id: i.id, place_id: i.place_id || null })) })
      .then((r: any) => { if (alive) setDistCache((m) => ({ ...m, [distKey]: { results: ((r && r.results) || {}) as Record<string, EatDistance | null>, note: (r && r.note) || null } })); })
      .catch(() => { if (alive) setDistCache((m) => ({ ...m, [distKey]: { results: Object.fromEntries(nearGuide.items.map((i) => [i.id, null])), note: "the lookup failed" } })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, distKey]);

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
      ) : <div className="taw-muted" style={{ padding: "10px 16px" }}>Add a flight or hotel first: restaurants are added to a day of the trip.</div>}
      {days.length && !hotel ? <div className="taw-eat-drawer-note">Add a hotel with a map position to this trip to see how far each restaurant is from it.</div> : null}
      <div className="taw-eat-drawer-body">
        {loading && !guides.length ? <div className="taw-muted">Looking up our city pages…</div> : null}
        {!loading && !guides.length ? <div className="taw-muted">Our website has no city page for this itinerary&apos;s cities yet.</div> : null}
        {ordered.map((g) => (
          <section key={g.slug} className="taw-eat-drawer-city">
            <div className="taw-itin-guide-head">
              <b>{g.city}</b>
              <span className="taw-muted">{g.items.length} on our page</span>
              <a href={g.url} target="_blank" rel="noopener noreferrer">The full {g.city} guide</a>
            </div>
            {g.items.map((item) => (
              <EatCard key={item.id} item={item} guide={g} added={onDay.has(item.id)} dayLabel={dayLabel}
                hotel={g.slug === dayCity ? hotel : null} distance={g.slug === dayCity && hotel ? (item.id in dist ? dist[item.id] : undefined) : undefined}
                distanceNote={distNote}
                onAdd={() => {
                  const near = g.slug === dayCity && hotel;
                  onAddDining(day, diningEntry(item, g, near ? dist[item.id] : null, near ? hotel : null));
                }} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  ) : null;

  return (
    <>
      <button type="button" className="taw-btn taw-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="pin" size={13} /> {open ? "Hide where to eat" : "Where to eat"}
      </button>
      {drawer && typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
    </>
  );
}
