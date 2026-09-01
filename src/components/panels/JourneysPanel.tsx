"use client";
/* =============================================================================
 * TripAgent — src/components/panels/JourneysPanel.tsx
 * Ported from web/js/journey.js: View (~314 lines). The Concierge Care
 * lifecycle console: every customer journey runs enquiry -> home through 8
 * stages, with proactive touchpoints (WhatsApp/email/SMS/app) queued on a
 * schedule. Personal touchpoints (requires_approval) need an advisor's sign-
 * off before they send; the rest send themselves once "Run scheduler" (or the
 * real cron behind journey-tick) processes what's due.
 *
 * Live backend:
 *   list journeys      -> journeys() / journeyTouchpoints() (table reads)
 *   run scheduler       -> journeyTick({})
 *   approve / skip      -> journeyApprove({ touchpoint_id, advisor_id, decision })
 *                          then journeyTick({ journey_id }) to send it
 * journey-advance (creating journeys / materialising touchpoints from
 * templates) runs upstream of this panel — off order/quote lifecycle events,
 * not off anything an advisor clicks here — so it's not called from this UI,
 * same as the legacy module.
 *
 * advisorId comes from a prop (this panel is a sibling top-level route under
 * AppShell, not nested inside WorkbenchShell) — same convention
 * SupplierBroadcastPanel established. Member names aren't shared from
 * WorkbenchShell's state for the same reason, so this panel fetches its own
 * id->name map, exactly as the legacy View did (API.db("members?select=id,name...")).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { journeys as fetchJourneys, journeyTouchpoints as fetchTouchpoints, journeyTick, journeyApprove, members as fetchMembers } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

const STAGES = ["enquiry", "quoted", "booked", "pre_departure", "in_trip", "returned", "post_trip", "closed"];
const STAGE_LABEL: any = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  booked: "Booked",
  pre_departure: "Pre-departure",
  in_trip: "In-trip",
  returned: "Returned",
  post_trip: "Follow-up",
  closed: "Closed",
};
const KIND_LABEL: any = {
  enquiry_ack: "Enquiry acknowledged",
  quote_ready: "Itinerary ready",
  booking_confirmed: "Booking confirmed",
  predeparture_checklist: "Pre-departure checklist",
  departure_day: "Bon voyage",
  intrip_checkin: "In-trip check-in",
  welcome_home: "Welcome home",
  post_trip_followup: "Post-trip follow-up",
};
const CHANNEL_ICON: any = { whatsapp: "chat", email: "mail", sms: "chat", app: "spark" };

function fmtDay(s: any) {
  if (!s) return "—";
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return s;
  }
}
function fmtWhen(s: any) {
  if (!s) return "";
  try {
    const dt = new Date(s);
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " + dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return String(s);
  }
}

function Stepper({ stage }: any) {
  const idx = STAGES.indexOf(stage);
  const labelStages = [STAGES[0], STAGES[2], STAGES[4], STAGES[6], STAGES[7]];
  return (
    <div>
      <div className="taw-jny-stepper">
        {STAGES.map((s, i) => (
          <div key={s} className={cx("taw-jny-step", i < idx && "done", i === idx && "cur")} />
        ))}
      </div>
      <div className="taw-jny-steplabels">
        {labelStages.map((s) => (
          <span key={s} className={cx("taw-jny-steplbl", s === stage && "cur")}>
            {STAGE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function JourneyCard(props: any) {
  const j = props.journey;
  const tps = props.tps || [];
  const sent = tps.filter((t: any) => t.status === "sent").length;
  const pending = tps.filter((t: any) => t.requires_approval && t.status === "queued").length;
  const next = tps
    .filter((t: any) => t.status === "queued" || t.status === "approved")
    .sort((a: any, b: any) => (new Date(a.scheduled_for) as any) - (new Date(b.scheduled_for) as any))[0];

  return (
    <button type="button" className={cx("taw-order-item", props.selected && "is-active")} onClick={props.onClick} aria-pressed={props.selected ? "true" : "false"}>
      <div className="taw-order-top">
        <div>
          <div className="taw-enq-name">{props.memberName || "Member"}</div>
          <div className="taw-order-meta" style={{ marginTop: 3 }}>
            <Icon name="compass" size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
            {(j.destination || "—") + (j.trip_start ? "  ·  " + fmtDay(j.trip_start) + " → " + fmtDay(j.trip_end) : "")}
          </div>
        </div>
        <span className="taw-qbadge">{STAGE_LABEL[j.stage] || j.stage}</span>
      </div>
      <Stepper stage={j.stage} />
      <div className="taw-jny-meta">
        <span>
          <b className="ta-num">{sent}</b> sent
        </span>
        {pending ? (
          <span className="is-pending">
            <b className="ta-num">{pending}</b> awaiting you
          </span>
        ) : null}
        {next ? (
          <span>
            next: <b>{KIND_LABEL[next.kind] || next.kind}</b>
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function JourneysPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;

  const [journeys, setJourneys] = useState<any>(null); // null = loading
  const [tpByJourney, setTpByJourney] = useState<any>({});
  const [membersById, setMembersById] = useState<any>({});
  const [selId, setSelId] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [acting, setActing] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    Promise.all([
      fetchJourneys("select=*&order=updated_at.desc&limit=100"),
      fetchTouchpoints("select=*&limit=500"),
      fetchMembers("select=id,name&limit=200").catch(() => []),
    ])
      .then(([jrows, trows, mrows]: any) => {
        const tmap: any = {};
        (trows || []).forEach((t: any) => {
          (tmap[t.journey_id] = tmap[t.journey_id] || []).push(t);
        });
        const mmap: any = {};
        (mrows || []).forEach((m: any) => {
          mmap[m.id] = m;
        });
        setJourneys(jrows || []);
        setTpByJourney(tmap);
        setMembersById(mmap);
        setSelId((prev: any) => prev || ((jrows && jrows[0]) ? jrows[0].id : null));
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/unavailable|not found|404|403|forbidden|not permitted/i.test(msg)) {
          setJourneys([]);
          setNotice("The journeys feed is not live yet.");
        } else {
          setErr(msg);
          setJourneys([]);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function runScheduler() {
    setActing("tick");
    setErr(null);
    journeyTick({})
      .then((r: any) => {
        toast("Scheduler ran — " + (r && r.delivered != null ? r.delivered : 0) + " touchpoint(s) delivered.", "success");
        load();
      })
      .catch((e: any) => {
        const msg = "Scheduler failed: " + errText(e);
        setErr(msg);
        toast(msg, "error");
      })
      .then(() => setActing(null));
  }

  function decide(tp: any, decision: any) {
    if (!advisorId) {
      setErr("No advisor selected to sign off.");
      return;
    }
    setActing(tp.id);
    setErr(null);
    journeyApprove({ touchpoint_id: tp.id, advisor_id: advisorId, decision: decision })
      .then(() => (decision === "approve" ? journeyTick({ journey_id: tp.journey_id }) : null))
      .then(() => {
        toast(decision === "approve" ? "Approved & sent." : "Touchpoint skipped.", "success");
        load();
      })
      .catch((e: any) => {
        const msg = "Action failed: " + errText(e);
        setErr(msg);
        toast(msg, "error");
      })
      .then(() => setActing(null));
  }

  const selJourney = (journeys || []).find((j: any) => j.id === selId) || null;
  const selTps = (tpByJourney[selId] || []).slice().sort((a: any, b: any) => (new Date(a.scheduled_for) as any) - (new Date(b.scheduled_for) as any));
  const now = Date.now();

  const actions = (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <button className="taw-btn taw-btn--primary taw-btn--sm" onClick={runScheduler} disabled={acting === "tick"}>
        {acting === "tick" ? <Spinner /> : <Icon name="refresh" size={14} />}
        {acting === "tick" ? "Running…" : "Run scheduler"}
      </button>
      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh journeys">
        {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
      </button>
    </div>
  );

  return (
    <div className="taw-main">
      <div className="taw-queue taw-fade-in">
      <Card title="Journeys" icon={<Icon name="compass" size={18} />} sub="Concierge Care · enquiry → home" actions={actions}>
        <div style={{ padding: 16 }}>
          {err ? (
            <div className="taw-banner taw-banner--err">
              <Icon name="alert" size={16} />
              {err}
              <button type="button" className="taw-btn taw-btn--ghost taw-btn--sm" style={{ marginLeft: "auto" }} onClick={load}>
                <Icon name="refresh" size={13} />
                Retry
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="taw-banner taw-banner--info">
              <Icon name="bell" size={16} />
              {notice}
            </div>
          ) : null}

          {loading && journeys == null ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="taw-skel" style={{ height: 96 }} />
              ))}
            </div>
          ) : journeys && journeys.length ? (
            <div className="taw-board">
              <div className="taw-orders">
                {journeys.map((j: any) => (
                  <JourneyCard
                    key={j.id}
                    journey={j}
                    tps={tpByJourney[j.id] || []}
                    memberName={membersById[j.member_id] && membersById[j.member_id].name}
                    selected={j.id === selId}
                    onClick={() => {
                      setSelId(j.id);
                      setErr(null);
                    }}
                  />
                ))}
              </div>
              <div className="taw-card">
                {!selJourney ? (
                  <Empty icon={<Icon name="sparkle" size={28} />}>Select a journey to see its timeline.</Empty>
                ) : (
                  <>
                    <div className="taw-card-h">
                      <h3>{(membersById[selJourney.member_id] ? membersById[selJourney.member_id].name : "Member") + " — " + (selJourney.destination || "")}</h3>
                      <span className="sub">
                        {STAGE_LABEL[selJourney.stage] || selJourney.stage}
                        {selJourney.trip_start ? " · " + fmtDay(selJourney.trip_start) + " → " + fmtDay(selJourney.trip_end) : " · dates to be set"}
                        {" · home: " + (selJourney.home_country || "India")}
                      </span>
                    </div>
                    <div className="taw-card-b">
                      <div className="taw-sec-label">Touchpoints</div>
                      {selTps.length ? (
                        <div className="taw-timeline">
                          {selTps.map((t: any) => {
                            const needsGate = t.requires_approval && t.status === "queued";
                            const tlCls = cx("taw-tl", t.status === "sent" && "is-good", t.status === "skipped" && "is-muted");
                            return (
                              <div className={tlCls} key={t.id}>
                                <div className="taw-tl-type" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                  <span>{KIND_LABEL[t.kind] || t.kind}</span>
                                  <span className="taw-tl-at">{t.status === "sent" ? "sent " + fmtWhen(t.sent_at) : "due " + fmtWhen(t.scheduled_for)}</span>
                                </div>
                                <div className="taw-tl-msg">{t.body}</div>
                                <div className="taw-jny-tpfoot">
                                  <span className="taw-jny-chan">
                                    <Icon name={CHANNEL_ICON[t.channel] || "spark"} size={12} />
                                    {t.channel}
                                  </span>
                                  {t.status === "sent" ? <span className="taw-qbadge">sent · {t.provider || ""}</span> : null}
                                  {t.status === "skipped" ? <span className="taw-qstate">skipped</span> : null}
                                  {needsGate ? <span className="taw-qstate warn">needs your ok</span> : null}
                                  {needsGate ? (
                                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                      <button className="taw-btn taw-btn--primary taw-btn--sm" onClick={() => decide(t, "approve")} disabled={acting === t.id}>
                                        {acting === t.id ? <Spinner /> : "Approve & send"}
                                      </button>
                                      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => decide(t, "skip")} disabled={acting === t.id}>
                                        Skip
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Empty icon={<Icon name="compass" size={24} />}>No touchpoints yet for this journey.</Empty>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <Empty icon={<Icon name="flight" size={28} />}>No journeys yet. They appear as enquiries and bookings flow in.</Empty>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}
