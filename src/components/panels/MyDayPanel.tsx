"use client";
/* =============================================================================
 * TripAgent — src/components/panels/MyDayPanel.tsx
 * Ported from web/js/advisor.js: MyDayPanel (line ~3336). The ranked "My Day"
 * task worklist for the selected advisor, driven through the authoritative
 * `advisor-tasks` function. NON-MONEY: a payment_pending task is a reminder,
 * not a ledger line.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { advisorTasks, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, queueSla } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

const MYDAY_TERMINAL: any = { done: 1, cancelled: 1 };

function taskTypeIcon(t: any) {
  const s = String(t || "").toLowerCase();
  if (s === "payment_pending") return "tag";
  if (s === "callback") return "bell";
  if (s === "review") return "shield";
  if (s === "follow_up") return "compass";
  return "note";
}
function taskStateClass(status: any, overdue: any) {
  const s = String(status || "").toLowerCase();
  if (s === "done") return "ok";
  if (s === "cancelled") return "err";
  if (s === "snoozed") return "info";
  if (overdue) return "warn";
  return "info";
}

export function MyDayPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const advisors = props.advisors || [];
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [filter, setFilter] = useState("today");
  const [busy, setBusy] = useState<any>({});

  function setRowBusy(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  // Transport: prefer a thin wrapper if api-wiring adds one, else the generic
  // function transport (exactly the VisaDeskQueue/EscalationQueue pattern).
  // The backend is authoritative on scope, ranking and the task FSM.
  function callTasks(payload: any) {
    if (typeof advisorTasks === "function") return advisorTasks(payload);
    if (typeof apiCall === "function") return apiCall("advisor-tasks", payload);
    return Promise.reject(new Error("advisor-tasks transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    // No advisor selected — nothing to scope to. The backend REQUIRES an
    // advisor_id (it is the ownership/isolation key) so we never call unscoped.
    if (!advisorId) {
      setRows([]);
      setNotice("Select an advisor to load their day.");
      setLoading(false);
      return;
    }
    callTasks({ action: "list", advisor_id: advisorId, include_done: false })
      .then((res: any) => {
        const list = (res && res.tasks) || [];
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        // A 403/forbidden or missing-fn here means the task read-model isn't
        // live yet — degrade calmly, never throw.
        if (/advisor_id_required|403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setRows([]);
          setNotice("The My Day task engine is not live yet for this advisor.");
        } else {
          setErr(msg);
          setRows([]);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);

  useEffect(() => {
    load();
  }, [load]);

  function isTerminal(t: any) {
    return !!MYDAY_TERMINAL[String(t.status || "").toLowerCase()];
  }
  function isOverdue(t: any) {
    if (!t.due_at) return false;
    const due = new Date(t.due_at).getTime();
    return isFinite(due) && due <= Date.now() && String(t.status).toLowerCase() === "open";
  }

  // ACTION — mark a task done. Scoped to advisorId server-side.
  function complete(t: any) {
    if (!advisorId) {
      toast("Select an advisor to action tasks.", "error");
      return;
    }
    setRowBusy(t.id, true);
    callTasks({ action: "complete", advisor_id: advisorId, task_id: t.id })
      .then(() => {
        setRowBusy(t.id, false);
        toast("Done — " + (t.title || "task"), "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(t.id, false);
        toast("Could not complete: " + errText(e), "error");
      });
  }

  // ACTION — snooze a task (reason captured for the trail, like the
  // EscalationQueue snooze). Default 24h.
  function snooze(t: any) {
    if (!advisorId) {
      toast("Select an advisor to action tasks.", "error");
      return;
    }
    let reason = typeof window !== "undefined" && window.prompt ? window.prompt("Snooze reason (kept on the task trail):", "") : "";
    if (reason == null) return; // cancelled the prompt
    reason = String(reason).trim();
    setRowBusy(t.id, true);
    callTasks({ action: "snooze", advisor_id: advisorId, task_id: t.id, hours: 24, reason: reason || undefined })
      .then(() => {
        setRowBusy(t.id, false);
        toast("Snoozed 24h" + (reason ? " · " + reason : ""), "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(t.id, false);
        toast("Could not snooze: " + errText(e), "error");
      });
  }

  // ACTION — reassign to another advisor (reason captured). The reassign
  // select mirrors the EscalationQueue reassign control.
  function reassign(t: any, toAdvisorId: any) {
    if (!toAdvisorId) return;
    if (!advisorId) {
      toast("Select an advisor to action tasks.", "error");
      return;
    }
    const who = advisors.filter((a: any) => a.id === toAdvisorId)[0];
    let reason = typeof window !== "undefined" && window.prompt ? window.prompt("Reassign reason (kept on the task trail):", "") : "";
    if (reason == null) return; // cancelled
    reason = String(reason).trim();
    setRowBusy(t.id, true);
    callTasks({ action: "reassign", advisor_id: advisorId, task_id: t.id, to_advisor_id: toAdvisorId, reason: reason || undefined })
      .then(() => {
        setRowBusy(t.id, false);
        toast("Reassigned to " + (who ? who.name : "advisor"), "success");
        load(); // it leaves THIS advisor's worklist
      })
      .catch((e: any) => {
        setRowBusy(t.id, false);
        toast("Could not reassign: " + errText(e), "error");
      });
  }

  const visible = (rows || []).filter((t: any) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(t);
    if (filter === "snoozed") return String(t.status).toLowerCase() === "snoozed";
    // "today" — the live open lane (not snoozed, not terminal).
    return String(t.status).toLowerCase() === "open";
  });

  const counts = {
    today: (rows || []).filter((t: any) => String(t.status).toLowerCase() === "open").length,
    overdue: (rows || []).filter(isOverdue).length,
    snoozed: (rows || []).filter((t: any) => String(t.status).toLowerCase() === "snoozed").length,
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
        title="My Day"
        icon={<Icon name="sliders" size={18} />}
        sub={counts.today ? counts.today + " to do" : ""}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh my day">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 16 }}>
          <div className="taw-qfilters" role="tablist" aria-label="My Day filter">
            {FilterBtn("today", "Today")}
            {FilterBtn("overdue", "Overdue")}
            {FilterBtn("snoozed", "Snoozed")}
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
              {visible.map((t: any) => {
                const status = String(t.status || "open").toLowerCase();
                const overdue = isOverdue(t);
                const rowBusy = !!busy[t.id];
                const terminal = isTerminal(t);
                const snoozed = status === "snoozed";
                const mem = t.member_id ? membersById[t.member_id] : null;
                const sla = queueSla(t.due_at);
                const typeLabel = String(t.type || "custom").replace(/_/g, " ");
                return (
                  <div key={t.id} className={cx("taw-qrow", snoozed && "is-snoozed")}>
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        {t.order_id ? (
                          <button className="taw-qlink" onClick={() => onOpenOrder(t.order_id)} title={"Open order " + shortId(t.order_id)}>
                            <Icon name="luggage" size={13} />#{shortId(t.order_id)}
                          </button>
                        ) : null}
                        <span className="taw-qtype taw-icrow">
                          <Icon name={taskTypeIcon(t.type)} size={13} />
                          {t.title || typeLabel}
                        </span>
                        <span className={cx("taw-qstate", taskStateClass(status, overdue))}>{overdue && status === "open" ? "overdue" : typeLabel}</span>
                        {snoozed ? <span className="taw-qstate info">Snoozed</span> : null}
                        {t.priority && Number(t.priority) > 0 ? <span className="taw-qbadge ta-num">P{Number(t.priority)}</span> : null}
                      </div>
                      <div className="taw-qrow-meta">
                        {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                        {t.due_at ? (
                          <span className={cx("taw-qsla", sla.cls)}>
                            <Icon name="clock" size={11} />
                            {sla.label}
                          </span>
                        ) : null}
                        {snoozed && t.snoozed_until ? <span className="taw-muted">Until {fmtDate(t.snoozed_until)}</span> : null}
                        {t.detail && t.detail.snooze_reason ? <span className="taw-muted">“{t.detail.snooze_reason}”</span> : null}
                        <span className="taw-muted">Task {shortId(t.id)}</span>
                      </div>
                    </div>
                    {/* actions */}
                    <div className="taw-qrow-actions">
                      {!terminal ? (
                        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={rowBusy} onClick={() => complete(t)} title="Mark this task done">
                          {rowBusy ? <Spinner /> : <Icon name="check" size={13} />}
                          Done
                        </button>
                      ) : null}
                      {!terminal && !snoozed ? (
                        <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => snooze(t)} title="Snooze 24h with reason">
                          <Icon name="clock" size={13} />
                          Snooze
                        </button>
                      ) : null}
                      {!terminal && advisors.length ? (
                        <select
                          className="taw-sel taw-sel--sm"
                          aria-label="Reassign task"
                          value=""
                          disabled={rowBusy}
                          onChange={(e) => {
                            if (e.target.value) reassign(t, e.target.value);
                          }}
                        >
                          <option value="">Reassign…</option>
                          {advisors
                            .filter((a: any) => a.id !== advisorId)
                            .map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      ) : null}
                      {t.order_id ? (
                        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => onOpenOrder(t.order_id)}>
                          <Icon name="compass" size={13} />
                          Open
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Icon name="sliders" size={28} />}>
              {filter === "today" ? "Your day is clear — nothing to do right now." : filter === "overdue" ? "Nothing overdue. Nicely done." : filter === "snoozed" ? "No snoozed tasks." : "No tasks yet."}
            </Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
