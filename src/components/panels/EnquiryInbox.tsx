"use client";
/* =============================================================================
 * TripAgent — src/components/panels/EnquiryInbox.tsx
 * Ported from web/js/advisor.js: EnquiryInbox (line ~1610), using its sibling
 * helper enqSla (line ~1600, now in lib/advisorHelpers.js since a later panel
 * — LeadsPanel, Phase 4 — reuses it too).
 * ===========================================================================*/
import { cx } from "../../lib/cx";
import { enqSla } from "../../lib/advisorHelpers";
import { Empty, Icon, SleekScroll } from "../ui";

export function EnquiryInbox(props: any) {
  const { enquiries, membersById, loading, selectedId } = props;

  if (loading) {
    return (
      <div className="taw-enq">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="taw-skel" style={{ height: 92 }} />
        ))}
      </div>
    );
  }

  if (!enquiries.length) {
    return (
      <Empty icon={<Icon name="inbox" size={28} />}>
        No open enquiries right now.
        <br />
        <span className="taw-muted" style={{ fontSize: 11.5 }}>
          Pick a member below to start a workbench session.
        </span>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {props.members.slice(0, 6).map((m: any) => (
            <button
              key={m.id}
              className="taw-btn taw-btn--sm taw-btn--block"
              onClick={() => props.onPickMember(m)}
            >
              <Icon name="user" size={13} />
              {m.name + " · " + (m.tier || "STD")}
            </button>
          ))}
        </div>
      </Empty>
    );
  }

  // Triage: SLA-breached enquiries float to the top, oldest-waiting first.
  const ordered = enquiries.slice().sort((a: any, b: any) => {
    const sa = enqSla(a), sb = enqSla(b);
    const ba = sa && sa.cls === "breach" ? 1 : 0, bb = sb && sb.cls === "breach" ? 1 : 0;
    if (ba !== bb) return bb - ba;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });

  return (
    <SleekScroll className="taw-enq-scroll">
      <div className="taw-enq">
      {ordered.map((e: any) => {
        const m = e.member_id ? membersById[e.member_id] : null;
        const intent = e.intent || {};
        let dests = intent.destinations || intent.destination || [];
        if (typeof dests === "string") dests = [dests];
        let services = intent.services || [];
        if (typeof services === "string") services = [services];
        const sla = enqSla(e);
        // Raw hours-since-enquiry (no "SLA breached"/minutes framing —
        // enqSla()'s own .txt carries both, but the Queue row only wants
        // the bare number). Same underlying elapsed time as enqSla(), so
        // the breach/ok color still lines up with the real SLA state.
        const createdMs = e.created_at ? new Date(e.created_at).getTime() : 0;
        const hours = createdMs ? Math.floor(Math.max(0, Date.now() - createdMs) / 3600000) : null;
        const pax = e.ask && e.ask.persons ? e.ask.persons.length : null;
        const bookings = (services || []).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ");
        const destText = (dests || []).slice(0, 2).join(", ");
        // "Departure day" — the enquiry data model only carries a month
        // (ask.dates), not an exact calendar date, for the 3 mock
        // enquiries; real Supabase enquiries don't have `ask` at all yet.
        // Shows what's actually known rather than inventing a day.
        const departs = e.ask && e.ask.dates && e.ask.dates.month ? "Departs " + e.ask.dates.month : "No dates yet";
        return (
          <button
            key={e.id}
            className={cx("taw-enq-item", selectedId === e.id && "is-active")}
            onClick={() => props.onSelect(e, m)}
          >
            <div className="taw-enq-top">
              <div className="taw-enq-name">
                {m ? m.name : "New lead"}
                {pax ? <span className="taw-enq-pax">· {pax} pax</span> : null}
              </div>
              {hours != null ? (
                <span className={"taw-enq-hours" + (sla && sla.cls === "breach" ? " is-breach" : "")}>{hours}h</span>
              ) : null}
            </div>
            <div className="taw-enq-meta">
              {destText}
              {destText && bookings ? " · " : ""}
              {bookings}
            </div>
            <div className="taw-enq-depart">{departs}</div>
          </button>
        );
      })}
      </div>
    </SleekScroll>
  );
}
