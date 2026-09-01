"use client";
/* =============================================================================
 * TripAgent — src/components/panels/DisruptionQueue.tsx
 * Ported from web/js/advisor.js: DisruptionQueue (line ~4175). A live worklist
 * of schedule-change / IRROPS signals ingested off disruption-ingest: which
 * order slipped, cancelled, or was rebooked. Mirrors the Servicing Queue
 * chrome. The panel ACTS only by calling disruption-ingest (which itself only
 * OPENS cases + enqueues a member draft + creates an advisor task) — never any
 * execute / money action from here. Re-protection (simulate -> approve ->
 * execute) is the human advisor's job in the Servicing Queue. Degrades calmly;
 * never throws.
 *
 * Note: disruption-ingest has no dedicated lib/api.js wrapper (same as the
 * original — TA_API never had a disruptionIngest() convenience function
 * either), so this always goes through the generic call() transport.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, shortId, queueSla, sevClass } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

export function DisruptionQueue(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [filter, setFilter] = useState("open");

  // Transport: prefer a thin wrapper if api-wiring adds one, else the generic
  // function transport (exactly the MyDayPanel/EscalationQueue pattern). The
  // backend is authoritative on scope + case state; the client never executes.
  function callIngest(payload: any) {
    if (typeof apiCall === "function") return apiCall("disruption-ingest", payload);
    return Promise.reject(new Error("disruption-ingest transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callIngest({ action: "queue" })
      .then((res: any) => {
        const list = (res && res.cases) || [];
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        // A missing-fn / not-live here means the disruption feed isn't wired
        // yet — degrade calmly, never throw (mirror MyDayPanel).
        if (/unavailable|not found|404|403|forbidden|not permitted/i.test(msg)) {
          setRows([]);
          setNotice("The disruption feed is not live yet.");
        } else {
          setErr(msg);
          setRows([]);
        }
        setLoading(false);
      });
    // queue is advisor-agnostic on the backend; scoped read by case type
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function caseState(c: any) {
    return String(c.case_state || c.status || "").toUpperCase();
  }

  // The disruption queue scopes to THIS advisor's affected orders by default
  // (the backend returns all open disruption cases; we surface the advisor's).
  const scoped = (rows || []).filter((c: any) => {
    if (!advisorId) return true;
    return !c.advisor_id || c.advisor_id === advisorId;
  });

  const visible = scoped.filter((c: any) => {
    const sev = c.signal ? String(c.signal.severity || "").toLowerCase() : "";
    if (filter === "all") return true;
    if (filter === "critical") return sev === "critical" || sev === "major";
    // "open" — anything not terminal-closed (the backend already excludes
    // CLOSED/REJECTED/CANCELLED, so this is the live lane).
    return true;
  });

  const counts = {
    open: scoped.length,
    critical: scoped.filter((c: any) => {
      const sev = c.signal ? String(c.signal.severity || "").toLowerCase() : "";
      return sev === "critical" || sev === "major";
    }).length,
    all: (rows || []).length,
  } as any;

  function FilterBtn(key: any, label: any) {
    return (
      <button key={key} className={cx("taw-qfilter", filter === key && "is-active")} onClick={() => setFilter(key)}>
        {label}
        <span className="n ta-num">{counts[key] || 0}</span>
      </button>
    );
  }

  return (
    <div className="taw-queue taw-fade-in">
      <Card
        title="Disruptions"
        icon={<Icon name="shield" size={18} />}
        sub={counts.open ? counts.open + " open" : ""}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh disruptions">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 16 }}>
          <div className="taw-qfilters" role="tablist" aria-label="Disruption filter">
            {FilterBtn("open", "Open")}
            {FilterBtn("critical", "Critical")}
            {FilterBtn("all", "All")}
          </div>
          {err ? (
            <div className="taw-banner taw-banner--err" style={{ marginTop: 12 }}>
              <Icon name="alert" size={16} />
              {err}
            </div>
          ) : null}
          {notice ? (
            <div className="taw-banner taw-banner--info" style={{ marginTop: 12 }}>
              <Icon name="bell" size={16} />
              {notice}
            </div>
          ) : null}

          {loading && rows == null ? (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="taw-skel" style={{ height: 72 }} />
              ))}
            </div>
          ) : visible.length ? (
            <div className="taw-qlist">
              {visible.map((c: any) => {
                const sig = c.signal || null;
                const sev = sig ? String(sig.severity || "minor").toLowerCase() : "minor";
                const kind = sig ? String(sig.kind || "change").replace(/_/g, " ") : "change";
                const st = caseState(c);
                const mem = c.member_id ? membersById[c.member_id] : null;
                const sla = queueSla(c.sla_due_at);
                return (
                  <div key={c.id} className="taw-qrow">
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        {c.order_id ? (
                          <button className="taw-qlink" onClick={() => onOpenOrder(c.order_id)} title={"Open order " + shortId(c.order_id)}>
                            <Icon name="luggage" size={13} />#{shortId(c.order_id)}
                          </button>
                        ) : null}
                        <span className="taw-qtype taw-icrow">
                          <Icon name="shield" size={13} />
                          {kind}
                        </span>
                        <span className={cx("taw-qstate", sevClass(sev))}>{sev}</span>
                        {st ? <span className="taw-qstate info">{st}</span> : null}
                      </div>
                      <div className="taw-qrow-meta">
                        {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                        {c.sla_due_at ? (
                          <span className={cx("taw-qsla", sla.cls)}>
                            <Icon name="clock" size={11} />
                            {sla.label}
                          </span>
                        ) : null}
                        {sig && sig.payload && sig.payload.delay_minutes ? <span className="taw-muted">{sig.payload.delay_minutes}m delay</span> : null}
                        {sig && sig.payload && sig.payload.cancelled ? <span className="taw-muted">cancelled leg</span> : null}
                        <span className="taw-muted">Case {shortId(c.id)}</span>
                      </div>
                    </div>
                    {/* ACTIONS — open the order / jump to the servicing case for
                        the human re-protection. NO execute / money action here. */}
                    <div className="taw-qrow-actions">
                      {c.order_id ? (
                        <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={() => onOpenOrder(c.order_id)} title="Open the order to re-protect">
                          <Icon name="compass" size={13} />
                          Open order
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Icon name="shield" size={28} />}>{filter === "critical" ? "No critical disruptions." : "No active disruptions — every journey is on track."}</Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
