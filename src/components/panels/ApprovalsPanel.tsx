"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ApprovalsPanel.tsx
 * Ported from web/js/advisor.js: ApprovalsPanel (line ~5014), using its
 * sibling helpers tierMeta (line ~4994) and approvalSla (line ~5001),
 * colocated here since they're only ever used by this panel.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { advisorWorkbench, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";

function tierMeta(tier: any) {
  const t = String(tier || "auto");
  if (t === "finance") return { label: "Finance", cls: "err" };
  if (t === "duty_mgr") return { label: "Duty mgr", cls: "warn" };
  return { label: "Auto", cls: "info" };
}
// SLA badge from the workbench's { breached, hours_to_due, age_bucket } shape.
function approvalSla(s: any) {
  if (!s) return null;
  if (s.breached) return { cls: "err", label: "SLA breached" };
  if (s.hours_to_due != null) {
    const hrs = Number(s.hours_to_due);
    if (isFinite(hrs)) {
      const human = Math.abs(hrs) >= 1 ? Math.round(hrs * 10) / 10 + "h" : Math.round(hrs * 60) + "m";
      return { cls: hrs <= 2 ? "warn" : "ok", label: "Due in " + human };
    }
  }
  return { cls: "", label: String(s.age_bucket || "open").replace(/_/g, " ") };
}

export function ApprovalsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [sub, setSub] = useState("inbox"); // 'inbox' | 'workload'
  const [scope, setScope] = useState("mine"); // inbox scope

  const [inbox, setInbox] = useState<any>(null); // {counts, items, scope, caller_*}
  const [work, setWork] = useState<any>(null); // {self, ranking_anonymised, team_totals}
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});

  function setRowBusy(key: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[key] = true;
      else delete n[key];
      return n;
    });
  }

  // Transport — prefer the thin wrappers, fall back to the generic call (the
  // exact MyDay/Analytics pattern). The backend is authoritative on scope,
  // tiering and decision authority.
  function callWb(payload: any) {
    if (typeof advisorWorkbench === "function") return advisorWorkbench(payload);
    if (typeof apiCall === "function") return apiCall("advisor-workbench-read", payload);
    return Promise.reject(new Error("advisor-workbench-read transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    if (!advisorId) {
      setInbox(null);
      setWork(null);
      setNotice("Select an advisor to load their approvals.");
      setLoading(false);
      return;
    }
    const req =
      sub === "workload"
        ? callWb({ action: "workload", advisor_id: advisorId })
        : callWb({ action: "approvals_inbox", advisor_id: advisorId, scope: scope });
    req
      .then((res: any) => {
        if (!res || res.ok === false) {
          const em = (res && res.error) || "unavailable";
          setNotice("Approvals are not live yet (" + em + ").");
          if (sub === "workload") setWork(null);
          else setInbox(null);
        } else if (sub === "workload") {
          setWork(res);
        } else {
          setInbox(res);
          // Reflect the scope the server actually honoured (it coerces 'all'
          // down to 'mine' for a non-manager — surface that calmly).
          if (scope === "all" && res.scope !== "all") {
            setNotice("Team-wide approvals need manager authority — showing yours.");
          }
        }
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/advisor_id_required|403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setNotice("The approvals workbench is not live yet for this advisor.");
          if (sub === "workload") setWork(null);
          else setInbox(null);
        } else {
          setErr(msg);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId, sub, scope]);

  useEffect(() => {
    load();
  }, [load]);

  // DECISION — approve / reject / escalate one inbox item. Reject/escalate
  // capture a reason for the trail (like the MyDay snooze). NO MONEY MOVES.
  function decide(item: any, decision: any) {
    if (!advisorId) {
      toast("Select an advisor to action approvals.", "error");
      return;
    }
    const key = item.source_kind + ":" + item.source_id;
    let reason: any = "";
    if (decision === "rejected" || decision === "escalated") {
      reason =
        typeof window !== "undefined" && window.prompt
          ? window.prompt((decision === "rejected" ? "Reject" : "Escalate") + " reason (kept on the decision trail):", "")
          : "";
      if (reason == null) return; // cancelled
      reason = String(reason).trim();
    }
    setRowBusy(key, true);
    callWb({
      action: "approval_decide",
      advisor_id: advisorId,
      source_kind: item.source_kind,
      source_id: item.source_id,
      decision: decision,
      reason: reason || undefined,
    })
      .then((res: any) => {
        setRowBusy(key, false);
        if (res && res.ok === false) {
          // The decision log (db/071) may be unapplied — degrade calmly.
          if (/decide_failed|db\/071|unapplied/i.test(JSON.stringify(res))) {
            setNotice("Decisions can't be recorded yet — the approval log (db/071) isn't applied.");
          } else if (res.error === "insufficient_authority") {
            toast("You can't approve this tier — escalate it instead.", "error");
          } else {
            toast("Decision failed: " + (res.error || "unknown"), "error");
          }
          return;
        }
        toast(res && res.deduped ? "Already decided" : "Recorded — " + decision, "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(key, false);
        const msg = errText(e);
        if (/decide_failed|db\/071|unapplied/i.test(msg)) {
          setNotice("Decisions can't be recorded yet — the approval log (db/071) isn't applied.");
        } else if (/insufficient_authority|403/i.test(msg)) {
          toast("You can't approve this tier — escalate it instead.", "error");
        } else {
          toast("Decision failed: " + msg, "error");
        }
      });
  }

  function SubBtn(key: any, icon: any, label: any) {
    return (
      <button
        className={cx("taw-desk-tab", sub === key && "is-active")}
        role="tab"
        aria-selected={sub === key ? "true" : "false"}
        onClick={() => setSub(key)}
      >
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  // ---- INBOX render --------------------------------------------------------
  function renderInbox() {
    const counts = (inbox && inbox.counts) || {};
    const items = (inbox && inbox.items) || [];
    const isAll = inbox && inbox.scope === "all";
    return (
      <div>
        {/* scope toggle (Mine / Team — server coerces Team to Mine without authority) */}
        <div className="taw-qfilters" style={{ marginBottom: 14 }}>
          <button className={cx("taw-qfilter", scope === "mine" && "is-active")} onClick={() => setScope("mine")}>
            Mine
          </button>
          <button className={cx("taw-qfilter", scope === "all" && "is-active")} onClick={() => setScope("all")}>
            Team
          </button>
        </div>
        {/* count tiles */}
        <div className="taw-recon-grid">
          <div className="taw-recon-stat">
            <div className="k">Pending</div>
            <div className="v ta-num">{counts.total || 0}</div>
            <div className="sub">{isAll ? "team-wide" : "yours"}</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">You can action</div>
            <div className="v ta-num">{counts.actionable_by_caller || 0}</div>
            <div className="sub">within your authority</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">SLA breached</div>
            <div className={cx("v ta-num", (counts.sla_breached || 0) > 0 && "is-bad")}>{counts.sla_breached || 0}</div>
            <div className="sub">past due</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">By tier</div>
            <div className="v ta-num" style={{ fontSize: "15px" }}>
              {(counts.auto || 0) + " · " + (counts.duty_mgr || 0) + " · " + (counts.finance || 0)}
            </div>
            <div className="sub">auto · duty · finance</div>
          </div>
        </div>

        {items.length ? (
          <div className="taw-qlist">
            {items.map((it: any) => {
              const key = it.source_kind + ":" + it.source_id;
              const tm = tierMeta(it.approval_tier);
              const s = approvalSla(it.sla);
              const mem = it.member_id ? membersById[it.member_id] : null;
              const rowBusy = !!busy[key];
              const decided = !!it.already_decided;
              const canDecide = !!it.caller_can_decide;
              const typeLabel = String(it.item_type || it.source_kind).replace(/_/g, " ");
              return (
                <div key={key} className={cx("taw-qrow", decided && "is-snoozed")}>
                  <div className="taw-qrow-main">
                    <div className="taw-qrow-top">
                      {it.order_id ? (
                        <button
                          className="taw-qlink"
                          onClick={() => onOpenOrder(it.order_id)}
                          title={"Open order " + shortId(it.order_id)}
                        >
                          <Icon name="luggage" size={13} />#{shortId(it.order_id)}
                        </button>
                      ) : null}
                      <span className="taw-qtype taw-icrow">
                        <Icon name="shield" size={13} />
                        {typeLabel}
                      </span>
                      <span className={cx("taw-qstate", tm.cls)}>{tm.label}</span>
                      {s ? (
                        <span className={cx("taw-qsla", s.cls)}>
                          <Icon name="clock" size={11} />
                          {s.label}
                        </span>
                      ) : null}
                      {decided ? <span className="taw-qstate info">Decided</span> : null}
                    </div>
                    <div className="taw-qrow-meta">
                      {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                      <span>Amount {inr(it.amount_inr || 0)}</span>
                      {it.policy_limit_inr != null ? (
                        <span className="taw-muted">Limit {inr(it.policy_limit_inr)}</span>
                      ) : null}
                      <span className="taw-muted">{String(it.status || "")}</span>
                      <span className="taw-muted">Ref {shortId(it.source_id)}</span>
                    </div>
                  </div>
                  <div className="taw-qrow-actions">
                    {decided ? (
                      <span className="taw-muted">Recorded</span>
                    ) : canDecide ? (
                      <>
                        <button
                          key="a"
                          className="taw-btn taw-btn--accent taw-btn--sm"
                          disabled={rowBusy}
                          onClick={() => decide(it, "approved")}
                          title="Approve this item (no money moves)"
                        >
                          {rowBusy ? <Spinner /> : <Icon name="check" size={13} />}
                          Approve
                        </button>
                        <button
                          key="r"
                          className="taw-btn taw-btn--ghost taw-btn--sm"
                          disabled={rowBusy}
                          onClick={() => decide(it, "rejected")}
                          title="Reject this item"
                        >
                          <Icon name="alert" size={13} />
                          Reject
                        </button>
                        <button
                          key="e"
                          className="taw-btn taw-btn--ghost taw-btn--sm"
                          disabled={rowBusy}
                          onClick={() => decide(it, "escalated")}
                          title="Escalate to a higher tier"
                        >
                          <Icon name="compass" size={13} />
                          Escalate
                        </button>
                      </>
                    ) : (
                      <>
                        <span key="n" className="taw-muted" title="Above your approval authority">
                          Needs {tm.label}
                        </span>
                        <button
                          key="e"
                          className="taw-btn taw-btn--ghost taw-btn--sm"
                          disabled={rowBusy}
                          onClick={() => decide(it, "escalated")}
                          title="Escalate to a higher tier"
                        >
                          {rowBusy ? <Spinner /> : <Icon name="compass" size={13} />}
                          Escalate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Icon name="shield" size={28} />}>No approvals pending — nothing waiting on a decision.</Empty>
        )}

        <div style={{ marginTop: 14, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
          Amounts shown are sell-side (what a member pays or is refunded) and the policy limit that gates the tier —
          advisor-internal approval controls. Recording a decision moves no money; the refund/charge stays on the
          servicing path.
        </div>
      </div>
    );
  }

  // ---- WORKLOAD render -----------------------------------------------------
  function renderWorkload() {
    const self = work && work.self;
    const ranking = (work && work.ranking_anonymised) || [];
    const totals = (work && work.team_totals) || {};
    const detail = (self && self.detail) || [];
    function Tile(k: any, v: any, sub2: any, cls?: any) {
      return (
        <div className="taw-recon-stat">
          <div className="k">{k}</div>
          <div className={cx("v ta-num", cls)}>{v}</div>
          {sub2 ? <div className="sub">{sub2}</div> : null}
        </div>
      );
    }
    return (
      <div>
        {self ? (
          <div>
            <div className="taw-recon-grid">
              {Tile("Open items", Number(self.open_items || 0).toLocaleString("en-IN"), "across all queues")}
              {Tile("Pending approvals", Number(self.pending_approvals || 0).toLocaleString("en-IN"), "awaiting a decision")}
              {Tile(
                "SLA breached",
                Number(self.sla_breached || 0).toLocaleString("en-IN"),
                "past due",
                (self.sla_breached || 0) > 0 ? "is-bad" : ""
              )}
              {Tile(
                "Open tasks",
                Number(self.open_tasks || 0).toLocaleString("en-IN"),
                (self.overdue_tasks || 0) + " overdue",
                (self.overdue_tasks || 0) > 0 ? "is-bad" : ""
              )}
            </div>

            {/* self open-item detail (caller's own rows only — peers never show here) */}
            <div className="taw-recon-sec">
              <div className="taw-recon-sec-h">
                <span className="ttl">
                  <Icon name="luggage" size={16} />
                  Your open work
                </span>
              </div>
              {detail.length ? (
                <div className="taw-qlist">
                  {detail.map((it: any, i: number) => {
                    const tm = tierMeta(it.approval_tier);
                    const s = approvalSla(it.sla);
                    const mem = it.member_id ? membersById[it.member_id] : null;
                    return (
                      <div key={it.source_id || i} className="taw-qrow">
                        <div className="taw-qrow-main">
                          <div className="taw-qrow-top">
                            {it.order_id ? (
                              <button
                                className="taw-qlink"
                                onClick={() => onOpenOrder(it.order_id)}
                                title={"Open order " + shortId(it.order_id)}
                              >
                                <Icon name="luggage" size={13} />#{shortId(it.order_id)}
                              </button>
                            ) : null}
                            <span className="taw-qtype taw-icrow">
                              <Icon name="shield" size={13} />
                              {String(it.item_type || it.source_kind).replace(/_/g, " ")}
                            </span>
                            <span className={cx("taw-qstate", tm.cls)}>{tm.label}</span>
                            {s ? (
                              <span className={cx("taw-qsla", s.cls)}>
                                <Icon name="clock" size={11} />
                                {s.label}
                              </span>
                            ) : null}
                          </div>
                          <div className="taw-qrow-meta">
                            {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                            <span>Amount {inr(it.amount_inr || 0)}</span>
                            <span className="taw-muted">{String(it.status || "")}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty icon={<Icon name="luggage" size={24} />}>No open work assigned to you right now.</Empty>
              )}
            </div>

            {/* anonymised peer ranking (peers = position + load only) */}
            <div className="taw-recon-sec">
              <div className="taw-recon-sec-h">
                <span className="ttl">
                  <Icon name="shield" size={16} />
                  Team load
                </span>
                <span className="ct">{ranking.length ? ranking.length + " advisors" : ""}</span>
              </div>
              {ranking.length ? (
                <div className="taw-recon-tablewrap">
                  <table className="taw-recon-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Advisor</th>
                        <th className="num">Total load</th>
                        <th className="num">Open items</th>
                        <th className="num">Approvals</th>
                        <th className="num">Breached</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((rk: any, i: number) => (
                        <tr key={i} className={rk.is_self ? "is-self" : ""}>
                          <td className="ta-num">{rk.position || i + 1}</td>
                          <td>
                            {rk.is_self ? (
                              <span className="taw-anl-you">
                                <Icon name="compass" size={12} />
                                You
                              </span>
                            ) : (
                              <span className="taw-muted">{rk.label}</span>
                            )}
                          </td>
                          <td className="num ta-num">{Number(rk.total_load || 0).toLocaleString("en-IN")}</td>
                          <td className="num ta-num">{rk.is_self ? Number(rk.open_items || 0).toLocaleString("en-IN") : "—"}</td>
                          <td className="num ta-num">
                            {rk.is_self ? Number(rk.pending_approvals || 0).toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="num ta-num">{rk.is_self ? Number(rk.sla_breached || 0).toLocaleString("en-IN") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={<Icon name="shield" size={24} />}>No peers to compare load against yet.</Empty>
              )}
              <div style={{ marginTop: 10, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
                Peers show position and total load only — never another advisor's member detail. Team open work:{" "}
                {totals.open_items || 0} · approvals: {totals.pending_approvals || 0} · breached:{" "}
                {totals.sla_breached || 0}.
              </div>
            </div>
          </div>
        ) : (
          <Empty icon={<Icon name="sliders" size={28} />}>No workload to show for this advisor yet.</Empty>
        )}
      </div>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card
        title="Approvals"
        icon={<Icon name="shield" size={18} />}
        sub={sub === "workload" ? "Your workload & SLA" : "Decisions inbox"}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh approvals">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div className="taw-desk-tabs" role="tablist" aria-label="Approvals view" style={{ marginBottom: 16 }}>
          {SubBtn("inbox", "shield", "Inbox")}
          {SubBtn("workload", "sliders", "Workload")}
        </div>
        {err ? (
          <div className="taw-banner taw-banner--err" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        {notice ? (
          <div className="taw-banner taw-banner--info" style={{ marginBottom: 12 }}>
            <Icon name="bell" size={16} />
            {notice}
          </div>
        ) : null}

        {loading && !inbox && !work ? (
          <div className="taw-skel" style={{ height: 160 }} />
        ) : sub === "workload" ? (
          renderWorkload()
        ) : (
          renderInbox()
        )}
      </Card>
    </div>
  );
}
