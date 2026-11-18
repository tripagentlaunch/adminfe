"use client";
/* "Where to eat" under a day in the Itinerary Builder: the restaurants on that day, taken from our city guides, each removable.
   They show in the proposal's Days and Plan tabs, its web link and its PDF. */
import { Icon } from "../ui";
import { distanceText, type DiningEntry } from "../../lib/diningPlan";

const MEAL: Record<string, string> = { lunch: "Lunch", dinner: "Dinner" };

export function DayDining({ entries, onRemove }: { entries: DiningEntry[]; onRemove: (id: string) => void }) {
  if (!entries.length) return null;
  return (
    <div className="taw-itin-dining">
      <div className="taw-itin-guide-eyebrow">Where to eat <span className="taw-muted">· from our {entries[0].city} guide</span></div>
      {entries.map((e) => (
        <div className="taw-itin-dining-row" key={e.id}>
          <div style={{ minWidth: 0 }}>
            <b>{e.name}</b>
            {e.meal ? <span className="taw-itin-guide-tier">{MEAL[e.meal]}</span> : null}
            {e.area ? <span className="taw-muted">{" · " + e.area}</span> : null}
            {e.distance ? <div className="taw-itin-item-meta">{distanceText(e.distance)}</div> : null}
            {e.credentials.length ? <div className="taw-itin-item-meta">{e.credentials.join(" · ")}</div> : null}
          </div>
          <button type="button" className="taw-btn taw-btn--sm" aria-label={"Remove " + e.name} onClick={() => onRemove(e.id)}>
            <Icon name="x" size={12} /> Remove
          </button>
        </div>
      ))}
    </div>
  );
}
