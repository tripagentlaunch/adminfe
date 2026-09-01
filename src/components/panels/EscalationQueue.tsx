"use client";
/* =============================================================================
 * TripAgent — src/components/panels/EscalationQueue.tsx
 * Ported from web/js/advisor.js: EscalationQueue (line ~2245). A live worklist
 * over servicing_requests: every open case across orders, with SLA clocks,
 * approval-tier badges, ownership transfer + snooze (with reason), a low-risk
 * auto-resolve affordance, and a named-approver action for cases awaiting
 * sign-off.
 *
 * STUBBED DEPENDENCY (checked again at Phase 4g, still accurate):
 * useServicingModule() normally lazy-loads js/servicing.js (window.
 * TA_SERVICING) for ApprovalBadge — a component that lives entirely in that
 * separate file (web/js/advisor.js line ~150-151), never in advisor.js
 * itself, so none of the Phase 4a-4g panel conversions (all sourced from
 * advisor.js) ever touched it. Same stub as OrdersBoard.jsx (Phase 3) —
 * Badge() below degrades to the plain-span badge exactly as the original
 * does when ApprovalBadge is unavailable. (svc.err is never rendered in this
 * file — only svc.mod is checked — so the stub message here is informational
 * only, unlike OrdersBoard's which surfaces in a visible banner.)
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { db, servicingCase, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, queueSla, caseStateClass, r as roundInr } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

// STUBBED — see file header.
function useServicingModule() {
  return { mod: null, err: "ServicingPanel — requires porting web/js/servicing.js (not yet scoped)" };
}

const TERMINAL_CASE: any = { CLOSED: 1, REJECTED: 1, CANCELLED: 1, COMPLETED: 1 };
// Legacy servicing_requests.status -> nearest FSM case_state, used only until
// the authoritative case_state hydrates in. Mirrors servicing-case LEGACY_STATUS.
const LEGACY_TO_STATE: any = { requested: "DRAFT", in_progress: "EXECUTING", completed: "CLOSED", rejected: "REJECTED" };

export function EscalationQueue(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const advisors = props.advisors || [];
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});
  const svc = useServicingModule();

  const [rows, setRows] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState<any>({}); // {caseId: true}
  // Queue-side assignment/snooze annotations (SVC-077). These are worklist
  // metadata, not case-FSM state — there is no servicing-case action to persist
  // them and db() is read-only (data-read), so we keep them as session state on
  // the queue rather than fabricating a write the backend can't honour.
  const [meta, setMeta] = useState<any>({}); // {caseId: {owner_advisor_id, snooze_until, snooze_reason}}

  function setRowBusy(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }
  function setRowMeta(id: any, patch: any) {
    setMeta((m: any) => {
      const n: any = {};
      for (const k in m) n[k] = m[k];
      const cur = n[id] || {};
      const merged: any = {};
      for (const k2 in cur) merged[k2] = cur[k2];
      for (const k3 in patch) merged[k3] = patch[k3];
      n[id] = merged;
      return n;
    });
  }
  function rowMeta(id: any) {
    return meta[id] || {};
  }

  function callCase(payload: any) {
    // Prefer the thin wrapper (api-wiring unit), fall back to the generic
    // function transport. Either way the backend is authoritative on money,
    // tier and FSM — the client never computes an amount here.
    if (typeof servicingCase === "function") return servicingCase(payload);
    if (typeof apiCall === "function") return apiCall("servicing-case", payload);
    return Promise.reject(new Error("servicing-case transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    // Fast paint from the allowlisted read-model (data-read only projects the
    // legacy columns: id,order_id,member_id,advisor_id,type,status,reason,
    // penalty_inr,refund_inr,points_reversed,sla_due_at,resolved_at,created_at).
    // The FSM-rich fields (case_state, approval_tier, quote_snapshot, detail)
    // are NOT in that projection, so we hydrate each row from the authoritative
    // servicing-case `status` action — which returns the full row and forces
    // member scoping server-side. Hydration is best-effort; if it fails the
    // row still renders off its legacy `status`.
    db("servicing_requests?select=*&order=created_at.desc&limit=120")
      .then((list: any) => {
        const base = Array.isArray(list) ? list : [];
        setRows(base);
        setLoading(false);
        // enrich (only the freshest 40 to bound fan-out)
        base.slice(0, 40).forEach((c: any) => {
          if (!c || !c.id) return;
          callCase({ action: "status", case_id: c.id })
            .then((res: any) => {
              const full = res && (res.case || res.servicing || res.request);
              if (!full) return;
              setRows((prev: any) => (prev || []).map((x: any) => (x.id === c.id ? Object.assign({}, x, full) : x)));
            })
            .catch(() => {
              /* keep the legacy row */
            });
        });
      })
      .catch((e: any) => {
        setErr(errText(e));
        setRows([]);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function stateOf(c: any) {
    if (c.case_state) return String(c.case_state).toUpperCase();
    const legacy = String(c.status || "").toLowerCase();
    return LEGACY_TO_STATE[legacy] || "DRAFT";
  }
  function isTerminal(c: any) {
    return !!TERMINAL_CASE[stateOf(c)];
  }
  function snoozeUntil(c: any) {
    const m = rowMeta(c.id);
    const raw = m.snooze_until || (c.detail && c.detail.snooze_until) || null;
    const t = raw ? new Date(raw).getTime() : 0;
    return isFinite(t) ? t : 0;
  }
  function isSnoozed(c: any) {
    const t = snoozeUntil(c);
    return t > Date.now();
  }
  function snoozeReason(c: any) {
    const m = rowMeta(c.id);
    return m.snooze_reason || (c.detail && c.detail.snooze_reason) || "";
  }

  function transferOwner(c: any, toAdvisorId: any) {
    if (!toAdvisorId) return;
    const who = advisors.filter((a: any) => a.id === toAdvisorId)[0];
    setRowMeta(c.id, {
      owner_advisor_id: toAdvisorId,
      owner_transferred_at: new Date().toISOString(),
      owner_transferred_by: advisorId || null,
    });
    toast("Case " + shortId(c.id) + " assigned to " + (who ? who.name : "advisor"), "success");
  }

  function snooze(c: any, hours: any) {
    let reason = typeof window !== "undefined" && window.prompt ? window.prompt("Snooze reason (required for the audit trail):", "") : "";
    if (reason == null) return; // cancelled the prompt
    reason = String(reason).trim();
    if (!reason) {
      toast("A snooze reason is required.", "error");
      return;
    }
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    setRowMeta(c.id, { snooze_until: until, snooze_reason: reason, snoozed_by: advisorId || null });
    toast("Snoozed " + hours + "h · " + reason, "success");
  }
  function unsnooze(c: any) {
    setRowMeta(c.id, { snooze_until: null, snooze_reason: null });
    toast("Snooze cleared", "info");
  }

  // Low-risk auto-resolve (SVC-075): only enabled for cases the engine has
  // already quoted into the AUTO approval tier and that are still in a pre-
  // execute state. We drive the SAME servicing-case actions (approve→execute)
  // the panel uses — never a bespoke money path, never an LLM-issued amount.
  function autoResolvable(c: any) {
    const st = stateOf(c);
    const tier = String(c.approval_tier || "").toLowerCase();
    const hasQuote = !!(c.quote_snapshot || (c.detail && c.detail.quote_snapshot));
    return tier === "auto" && hasQuote && (st === "QUOTED" || st === "APPROVED");
  }
  function autoResolve(c: any) {
    if (!advisorId) {
      toast("Select an advisor to action cases.", "error");
      return;
    }
    setRowBusy(c.id, true);
    const common = { order_id: c.order_id, case_id: c.id, type: c.type, advisor_id: advisorId };
    // approve (auto self-approves) then execute — replay-safe on the backend.
    callCase(Object.assign({ action: "approve" }, common))
      .then(() => callCase(Object.assign({ action: "execute" }, common)))
      .then((res: any) => {
        setRowBusy(c.id, false);
        const cs = (res && res.case_state) || "";
        toast("Auto-resolved " + shortId(c.id) + (cs ? " → " + cs : ""), "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(c.id, false);
        toast("Auto-resolve failed: " + errText(e), "error");
      });
  }

  // Named-approver sign-off (AW-005 / SVC-066). The advisor's role gates
  // whether the backend will clear the tier; we pass approver_role so the
  // engine (not the client) decides. A rejected sign-off keeps the case
  // AWAITING_APPROVAL and surfaces the required tier.
  function approve(c: any) {
    if (!advisorId) {
      toast("Select an advisor to approve.", "error");
      return;
    }
    const role = (props.advisorRole || "").toLowerCase();
    setRowBusy(c.id, true);
    callCase({
      action: "approve",
      order_id: c.order_id,
      case_id: c.id,
      type: c.type,
      advisor_id: advisorId,
      approver_id: advisorId,
      approver_role: role,
    })
      .then((res: any) => {
        setRowBusy(c.id, false);
        if (res && res.approved) toast("Approved " + shortId(c.id) + " (" + (res.approval_tier || "auto") + ")", "success");
        else toast("Still awaiting " + ((res && res.required_tier) || "approval") + " sign-off", "info");
        load();
      })
      .catch((e: any) => {
        setRowBusy(c.id, false);
        toast("Approval failed: " + errText(e), "error");
      });
  }

  function ownerId(c: any) {
    return rowMeta(c.id).owner_advisor_id || (c.detail && c.detail.owner_advisor_id) || c.advisor_id || null;
  }
  function ownerName(c: any) {
    const oid = ownerId(c);
    const a = advisors.filter((x: any) => x.id === oid)[0];
    return a ? a.name : oid ? shortId(oid) : "Unassigned";
  }

  // Apply the filter.
  const visible = (rows || []).filter((c: any) => {
    if (filter === "all") return true;
    if (filter === "approval") return stateOf(c) === "AWAITING_APPROVAL" || stateOf(c) === "ESCALATED";
    if (filter === "mine") return advisorId && ownerId(c) === advisorId;
    // "open" — anything not terminal and not currently snoozed.
    return !isTerminal(c) && !isSnoozed(c);
  });

  const counts = {
    open: (rows || []).filter((c: any) => !isTerminal(c) && !isSnoozed(c)).length,
    approval: (rows || []).filter((c: any) => stateOf(c) === "AWAITING_APPROVAL" || stateOf(c) === "ESCALATED").length,
    mine: (rows || []).filter((c: any) => advisorId && ownerId(c) === advisorId).length,
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

  function Badge(c: any) {
    const ApprovalBadge: any = svc.mod && (svc.mod as any).ApprovalBadge;
    if (c.approval_tier && ApprovalBadge) return <ApprovalBadge tier={c.approval_tier} state={stateOf(c)} />;
    if (c.approval_tier) return <span className="taw-qbadge">{String(c.approval_tier).replace(/_/g, " ")}</span>;
    return null;
  }

  return (
    <div className="taw-queue taw-fade-in">
      <Card
        title="Servicing & Escalation Queue"
        icon={<Icon name="shield" size={18} />}
        sub={counts.open ? counts.open + " open" : ""}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh queue">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 16 }}>
          <div className="taw-qfilters" role="tablist" aria-label="Queue filter">
            {FilterBtn("open", "Open")}
            {FilterBtn("approval", "Approvals")}
            {FilterBtn("mine", "Mine")}
            {FilterBtn("all", "All")}
          </div>
          {err ? (
            <div className="taw-banner taw-banner--err" style={{ marginTop: 12 }}>
              <Icon name="alert" size={16} />
              {err}
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
                const st = stateOf(c);
                const sla = queueSla(c.sla_due_at);
                const rowBusy = !!busy[c.id];
                const snoozed = isSnoozed(c);
                const mem = c.member_id ? membersById[c.member_id] : null;
                return (
                  <div key={c.id} className={cx("taw-qrow", snoozed && "is-snoozed")}>
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        <button className="taw-qlink" onClick={() => onOpenOrder(c.order_id)} title={"Open order " + shortId(c.order_id)}>
                          <Icon name="luggage" size={13} />#{shortId(c.order_id)}
                        </button>
                        <span className="taw-qtype">{String(c.type || "case").replace(/_/g, " ")}</span>
                        <span className={cx("taw-qstate", caseStateClass(st))}>{st.replace(/_/g, " ")}</span>
                        {Badge(c)}
                        {snoozed ? <span className="taw-qstate warn">Snoozed</span> : null}
                      </div>
                      <div className="taw-qrow-meta">
                        {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                        {roundInr(c.refund_inr) ? <span className="ta-num">Refund {inr(c.refund_inr)}</span> : null}
                        {roundInr(c.penalty_inr) ? <span className="ta-num">Penalty {inr(c.penalty_inr)}</span> : null}
                        <span className={cx("taw-qsla", sla.cls)}>
                          <Icon name="clock" size={11} />
                          {sla.label}
                        </span>
                        <span className="taw-muted">Owner: {ownerName(c)}</span>
                        {snoozed && snoozeReason(c) ? <span className="taw-muted">“{snoozeReason(c)}”</span> : null}
                      </div>
                    </div>
                    {/* actions */}
                    <div className="taw-qrow-actions">
                      {st === "AWAITING_APPROVAL" || st === "ESCALATED" ? (
                        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={rowBusy} onClick={() => approve(c)}>
                          {rowBusy ? <Spinner /> : <Icon name="check" size={13} />}
                          Approve
                        </button>
                      ) : null}
                      {autoResolvable(c) ? (
                        <button className="taw-btn taw-btn--sm" disabled={rowBusy} onClick={() => autoResolve(c)} title="Low-risk · auto tier">
                          {rowBusy ? <Spinner /> : <Icon name="sliders" size={13} />}
                          Auto-resolve
                        </button>
                      ) : null}
                      {!isTerminal(c) ? (
                        snoozed ? (
                          <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => unsnooze(c)}>
                            <Icon name="clock" size={13} />
                            Wake
                          </button>
                        ) : (
                          <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => snooze(c, 24)} title="Snooze 24h with reason">
                            <Icon name="clock" size={13} />
                            Snooze
                          </button>
                        )
                      ) : null}
                      {!isTerminal(c) && advisors.length ? (
                        <select
                          className="taw-sel taw-sel--sm"
                          aria-label="Reassign owner"
                          value=""
                          disabled={rowBusy}
                          onChange={(e) => {
                            if (e.target.value) transferOwner(c, e.target.value);
                          }}
                        >
                          <option value="">Reassign…</option>
                          {advisors.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => onOpenOrder(c.order_id)}>
                        <Icon name="compass" size={13} />
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Icon name="inbox-check" size={28} />}>
              {filter === "open"
                ? "Queue is clear — no open servicing cases."
                : filter === "approval"
                ? "Nothing awaiting approval."
                : filter === "mine"
                ? "No cases assigned to you."
                : "No servicing cases yet."}
            </Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
