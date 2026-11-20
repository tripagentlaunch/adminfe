"use client";
/* What to do and where to go out on a day, taken from the plan (the city page's places) with a rough per-person estimate each.
   They show in the proposal's Days tab; the estimate is labelled as one there too. */
import { Icon } from "../ui";
import { inr } from "../../services/api";
import { shortMoney } from "../../lib/tripBudget";

export function DayActivities({ entries, onRemove }: { entries: any[]; onRemove: (id: string) => void }) {
  if (!entries.length) return null;
  return (
    <div className="taw-itin-dining">
      <div className="taw-itin-guide-eyebrow">To do <span className="taw-muted">· from the city guide, costs are estimates</span></div>
      {entries.map((e) => (
        <div className="taw-itin-dining-row" key={e.id}>
          <div style={{ minWidth: 0 }}>
            <b>{e.name}</b>
            <span className="taw-itin-guide-tier">{e.kind === "party" ? "Night out" : "Activity"}</span>
            {e.area ? <span className="taw-muted">{" · " + e.area}</span> : null}
            {e.est ? <div className="taw-itin-item-meta">{e.est.high === 0 ? "Free" : `≈ ${shortMoney(e.est.totalLow)}–${shortMoney(e.est.totalHigh)} for ${e.est.pax} (${inr(e.est.low)}–${inr(e.est.high)} each)`} · estimate</div> : null}
          </div>
          <button type="button" className="taw-btn taw-btn--sm" aria-label={"Remove " + e.name} onClick={() => onRemove(e.id)}>
            <Icon name="x" size={12} /> Remove
          </button>
        </div>
      ))}
    </div>
  );
}
