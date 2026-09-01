"use client";
/* =============================================================================
 * TripAgent — src/components/panels/EnquiryInbox.tsx
 * Ported from web/js/advisor.js: EnquiryInbox (line ~1610), using its sibling
 * helper enqSla (line ~1600, now in lib/advisorHelpers.js since a later panel
 * — LeadsPanel, Phase 4 — reuses it too).
 * ===========================================================================*/
import { cx } from "../../lib/cx";
import { enqSla, fmtDate } from "../../lib/advisorHelpers";
import { Empty, Icon } from "../ui";

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
    <div className="taw-enq">
      {ordered.map((e: any) => {
        const m = e.member_id ? membersById[e.member_id] : null;
        const intent = e.intent || {};
        let dests = intent.destinations || intent.destination || [];
        if (typeof dests === "string") dests = [dests];
        let services = intent.services || [];
        if (typeof services === "string") services = [services];
        const sla = enqSla(e);
        return (
          <button
            key={e.id}
            className={cx("taw-enq-item", selectedId === e.id && "is-active")}
            onClick={() => props.onSelect(e, m)}
          >
            <div className="taw-enq-top">
              <div className="taw-enq-name">
                <span className="taw-dot" />
                {m ? m.name : "New lead"}
                {m ? <span className="taw-chip taw-chip--tier">{m.tier}</span> : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                {sla ? (
                  <span className={"taw-chip taw-chip--sla-" + sla.cls} title="Response SLA target: 15 min">
                    {sla.cls === "breach" ? <Icon name="alert" size={11} /> : <Icon name="clock" size={11} />}
                    {sla.txt}
                  </span>
                ) : null}
                <span className="taw-chip taw-chip--dom">{e.channel || "web"}</span>
              </div>
            </div>
            {e.message ? <div className="taw-enq-msg">{e.message}</div> : null}
            <div className="taw-enq-foot">
              {(dests || []).slice(0, 3).map((d: any, i: number) => (
                <span key={"d" + i} className="taw-tag taw-icrow">
                  <Icon name="compass" size={12} />
                  {d}
                </span>
              ))}
              {(services || []).slice(0, 3).map((s: any, i: number) => (
                <span key={"s" + i} className="taw-tag">
                  {s}
                </span>
              ))}
              <span className="taw-muted" style={{ marginLeft: "auto", fontSize: 10.5 }}>
                {fmtDate(e.created_at)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
