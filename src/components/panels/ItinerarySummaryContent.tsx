"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ItinerarySummaryContent.tsx
 * The "Summary window" (2026-09-03) — an itinerary snapshot rendered in
 * two places: the confirm modal ItinerarySummaryModal.tsx shows before
 * handing off to Proposal Composer, and the Proposal Composer page itself
 * once that handoff has happened (see console/proposal-composer/page.tsx).
 * One component so both stay visually identical instead of drifting.
 *
 * Deliberately condensed, not interactive — no expand/collapse, no
 * editing, no drag. This is a read-only recap for a decision point
 * ("does this look ready to send?"), not another copy of the full
 * builder. Recomputes `unresolved`/`finTotal` from `data` itself rather
 * than taking them as props, since this can be handed a data snapshot
 * from a different render tree (Proposal Composer) than the one that
 * originally computed them (ItineraryView).
 * ===========================================================================*/
import { inr } from "../../services/api";
import { Icon } from "../ui";
import { STATUS_META, tierOf } from "../../lib/mockItinerary";

function dayTotalLabel(day: any) {
  if (day.subtotal != null) return inr(day.subtotal);
  const known = day.items.filter((it: any) => it.price != null);
  if (!known.length) return "—";
  const sum = known.reduce((s: number, it: any) => s + it.price, 0);
  return (known.some((it: any) => it.priceIsFrom) ? "from " : "") + inr(sum);
}

export function ItinerarySummaryContent({ data }: { data: any }) {
  const unresolved = data.days
    .flatMap((d: any) => d.items)
    .filter((it: any) => it.priceIsFrom)
    .reduce((s: number, it: any) => s + it.price, 0);
  const finTotal = data.totals.confirmed + data.totals.held + unresolved || 1;
  const attentionDays = data.days.filter((d: any) => d.items.some((it: any) => tierOf(it.status) === "attention")).length;

  return (
    <div className="taw-itinsum">
      <div className="taw-itinsum-title">
        {data.destination} · {data.dateRange}
      </div>
      <div className="taw-itinsum-sub">
        {data.cities.join(" · ")} · {data.nights} night{data.nights === 1 ? "" : "s"} · {data.pax} adult{data.pax === 1 ? "" : "s"} · {data.purpose}
      </div>
      <div className="taw-itin-totals">
        <div>
          <b>
            {inr(data.totals.grand)}
            {unresolved > 0 ? "–" + inr(data.totals.grand + unresolved) + "+" : ""}
          </b>
          <span>total</span>
        </div>
        <div>
          <b>{inr(data.totals.confirmed)}</b>
          <span>confirmed</span>
        </div>
        <div>
          <b>{inr(data.totals.held)}</b>
          <span>held</span>
        </div>
        {unresolved > 0 ? (
          <div>
            <b>{inr(unresolved)}+</b>
            <span>unresolved</span>
          </div>
        ) : null}
      </div>
      <div className="taw-itin-fin-bar">
        <div className="taw-itin-fin-seg taw-itin-fin-seg--confirmed" style={{ flexBasis: (data.totals.confirmed / finTotal) * 100 + "%" }} />
        <div className="taw-itin-fin-seg taw-itin-fin-seg--held" style={{ flexBasis: (data.totals.held / finTotal) * 100 + "%" }} />
        {unresolved > 0 ? (
          <div className="taw-itin-fin-seg taw-itin-fin-seg--unresolved" style={{ flexBasis: (unresolved / finTotal) * 100 + "%" }} />
        ) : null}
      </div>

      {attentionDays > 0 ? (
        <div className="taw-itinsum-flag">
          <Icon name="alert" size={13} />
          {attentionDays} day{attentionDays === 1 ? "" : "s"} still need attention before this is really ready
        </div>
      ) : null}

      <div className="taw-itinsum-list">
        {/* data.visa can be null (2026-09-03) — an itinerary built purely
            from Search's Flights/Hotels adds, with nothing added from
            VisaDesk yet. */}
        {data.visa ? (
          <div className="taw-itinsum-row">
            <Icon name="visa" size={14} />
            <span className="taw-itinsum-row-label">{data.visa.title}</span>
            <span className={cxStatusDot(data.visa.status)} />
            <span className="taw-itinsum-row-total">{inr(data.visa.price)}</span>
          </div>
        ) : null}
        {data.days.map((day: any) => (
          <div className="taw-itinsum-row" key={day.id}>
            <span className="taw-itinsum-row-date">{day.date}</span>
            <span className="taw-itinsum-row-label">{day.route}</span>
            <span className={cxDayDot(day)} />
            <span className="taw-itinsum-row-total">{dayTotalLabel(day)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function cxStatusDot(status: any) {
  const bucket = STATUS_META[status as keyof typeof STATUS_META].bucket;
  return "taw-itinsum-dot taw-itinsum-dot--" + bucket;
}

function cxDayDot(day: any) {
  const attention = day.items.some((it: any) => tierOf(it.status) === "attention");
  return "taw-itinsum-dot " + (attention ? "taw-itinsum-dot--warn" : "taw-itinsum-dot--success");
}
