"use client";
/* =============================================================================
 * TripAgent — src/components/panels/VisaDeskQueue.tsx
 * Ported from web/js/advisor.js: VisaDeskQueue (line ~2601) — the VISA
 * lifecycle queue (submitted/in_review/decided applications). NOT the same
 * component as VisaDesk (search/create desk, Phase 4a) or VisaAppointmentDesk
 * (scheduling, Phase 4f).
 *
 * Colocated helpers (only ever used by this panel): canDecideVisa (line ~93),
 * VISA_TERMINAL/visaState/visaStateClass (line ~2568-2583), visaDocs
 * (line ~2588).
 *
 * Note: `visaApplication` has no dedicated lib/api.js wrapper — same as the
 * original, which never had a TA_API.visaApplication either; callVisa()
 * always goes through the generic call() transport (mirrors DisruptionQueue,
 * Phase 4b).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { visaQueue, visaDecide, commitDocs as apiCommitDocs } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

// canDecideVisa(role) — web/js/advisor.js line ~93. UX-only gate (the backend
// re-verifies approver_role server-side on every decide call); authorised
// roles: head_of_business, senior advisor, visa desk lead, manager. A
// build/session can force-enable with window.TA_VISA_DECIDE = true.
function canDecideVisa(role: any) {
  if (typeof window !== "undefined" && ((window as any).TA_VISA_DECIDE === true || (window as any).TA_ROLE === "head_of_business")) return true;
  const r = String(role || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return r === "head_of_business" || r === "senior_advisor" || r === "visa_desk_lead" || r === "visa_lead" || r === "manager";
}

// Terminal states per db/014 (valid: draft, docs_pending, submitted, in_review,
// approved, rejected, cancelled). Only these three are end states — ISSUED and
// CLOSED are NOT valid db/014 statuses and must not appear here.
const VISA_TERMINAL: any = { APPROVED: 1, REJECTED: 1, CANCELLED: 1 };

function visaState(a: any) {
  // Prefer the FSM column; fall back to a legacy `status` if that's all the
  // read-model projects. Normalised UPPER for class/branch comparisons.
  const s = a && (a.case_state || a.state || a.status);
  return String(s || "submitted").toUpperCase();
}
function visaStateClass(state: any) {
  const s = String(state || "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected" || s === "cancelled") return "rejected";
  if (s === "in_review") return "in_review";
  if (s === "submitted") return "submitted";
  return "docs_pending";
}

// Pull the document checklist + which are already collected from whatever the
// row exposes (detail.documents / documents, detail.documents_collected /
// documents_collected). Tolerant of array-of-string or array-of-{key,label}.
function visaDocs(a: any) {
  const d = (a && a.detail) || {};
  const raw = d.documents || a.documents || (d.requirement && d.requirement.documents) || [];
  const list = (Array.isArray(raw) ? raw : []).map((x: any, i: number) => {
    if (x && typeof x === "object") return { key: String(x.key || x.id || x.name || i), label: String(x.label || x.name || x.key || x.id || "Document " + (i + 1)) };
    return { key: String(x), label: String(x) };
  });
  const collectedRaw = d.documents_collected || a.documents_collected || d.collected || [];
  const collected: any = {};
  (Array.isArray(collectedRaw) ? collectedRaw : []).forEach((k: any) => {
    collected[String(k && k.key != null ? k.key : k)] = true;
  });
  return { list: list, collected: collected };
}

export function VisaDeskQueue(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const advisorRole = props.advisorRole || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});
  const mayDecide = canDecideVisa(advisorRole);

  const [rows, setRows] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [filter, setFilter] = useState("queue");
  const [busy, setBusy] = useState<any>({});
  // Per-row local checklist edits (which docs the advisor has ticked but not
  // yet committed via submit_docs). Keyed by application id → {docKey:true}.
  const [draft, setDraft] = useState<any>({});

  function setRowBusy(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }
  function toggleDoc(appId: any, docKey: any, base: any) {
    setDraft((m: any) => {
      const n: any = {};
      for (const k in m) n[k] = m[k];
      const cur = n[appId] || {};
      const merged: any = {};
      for (const k2 in cur) merged[k2] = cur[k2];
      // seed from the persisted collected-set the first time we touch a row
      if (!n[appId]) {
        for (const k3 in base || {}) merged[k3] = base[k3];
      }
      merged[docKey] = !merged[docKey];
      n[appId] = merged;
      return n;
    });
  }
  function rowDraft(appId: any, base: any) {
    const d = draft[appId];
    if (d) return d;
    return base || {};
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    // Advisor-facing queue read — migrated off the legacy visa-application
    // edge function's action=queue onto FastAPI's GET /visa/queue (see
    // lib/api.js's visaQueue()). Same role gate and the same cross-member
    // worklist (submitted / in_review / docs_pending) as before; the
    // advisor identity now comes from the session JWT itself rather than
    // an advisor_id in the request, but advisorId is still required here
    // as a proxy for "the login gate has actually resolved a session yet".
    if (!advisorId) {
      setRows([]);
      setNotice("Select an advisor to load the visa desk queue.");
      setLoading(false);
      return;
    }
    visaQueue({})
      .then((res: any) => {
        const list = (res && (res.applications || res.rows)) || [];
        // FastAPI orders ascending (oldest first); the legacy edge function
        // ordered descending (newest first) — re-sort here so this queue's
        // "newest first" UX doesn't change under the new transport.
        const sorted = Array.isArray(list) ? [...list].sort((a: any, b: any) => (new Date(b.created_at) as any) - (new Date(a.created_at) as any)) : [];
        setRows(sorted);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        // A 401/403 here means either no session yet or the advisor lacks
        // desk authority — degrade calmly, never throw. Checking e.status
        // directly (not just message text) since FastAPI's actual 403
        // detail strings ("No advisor record for this session", "Only
        // active advisor-desk roles may perform this action") don't match
        // any of the legacy edge function's own wording below.
        if (e.status === 401 || e.status === 403 || /allowlist|not allowlisted|forbidden|not permitted|advisor_not_found|advisor_inactive/i.test(msg)) {
          setRows([]);
          setNotice("This advisor is not cleared for the visa desk queue, or the visa read-model is not live yet.");
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

  function isTerminal(a: any) {
    return !!VISA_TERMINAL[visaState(a)];
  }

  // ACTION — mark documents collected (advisor-commit-docs). Migrated off the
  // legacy visa-application edge function's action=submit_docs onto FastAPI's
  // POST /visa/applications/{id}/advisor-commit-docs (see lib/api.js's
  // commitDocs()) — same ADVISOR_DESK_ROLES gate as visaQueue()/visaDecide(),
  // re-verified server-side from the session JWT. We send the full checklist
  // (each doc's key + a status reflecting the current toggle state), matching
  // the member-owned submit-docs endpoint's { documents: [...] } contract;
  // the backend merges by key and never wipes untouched entries. We NEVER
  // send a member_id from the UI — it's resolved server-side from the row.
  function commitDocs(a: any) {
    if (!advisorId) {
      toast("Select an advisor to action applications.", "error");
      return;
    }
    const info = visaDocs(a);
    const picks = rowDraft(a.id, info.collected);
    const documents = info.list.map((doc: any) => ({ key: doc.key, status: picks[doc.key] ? "collected" : "required" }));
    setRowBusy(a.id, true);
    apiCommitDocs(a.id, { documents: documents })
      .then((res: any) => {
        setRowBusy(a.id, false);
        const ns = (res && res.status) || "";
        toast("Documents updated for " + shortId(a.id) + (ns ? " → " + String(ns).replace(/_/g, " ") : ""), "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(a.id, false);
        toast("Could not update documents: " + errText(e), "error");
      });
  }

  // ACTION — record a decision (approve / reject). GATED by canDecideVisa.
  // Migrated off the legacy visa-application edge function's action=decide
  // onto FastAPI's POST /visa/applications/{id}/decide (see lib/api.js's
  // visaDecide()) — role/authority are re-verified server-side from the
  // session JWT either way. member_id is resolved server-side from the row.
  function decide(a: any, outcome: any) {
    if (!mayDecide) {
      toast("You do not have visa-decision authority.", "error");
      return;
    }
    if (!advisorId) {
      toast("Select an advisor to record a decision.", "error");
      return;
    }
    let reason = "";
    if (outcome === "reject") {
      reason = typeof window !== "undefined" && window.prompt ? window.prompt("Rejection reason (required, shared with the member):", "") || "" : "";
      if (reason == null) return; // cancelled
      reason = String(reason).trim();
      if (!reason) {
        toast("A rejection reason is required.", "error");
        return;
      }
    }
    setRowBusy(a.id, true);
    visaDecide(a.id, {
      decision: outcome, // "approve" | "reject"
      note: reason || undefined,
    })
      .then((res: any) => {
        setRowBusy(a.id, false);
        // FastAPI returns the flat updated application row (no case_state/
        // state/decided keys — those were already dead under the legacy
        // response too), so the new status is just res.status.
        const ns = (res && res.status) || "";
        toast((outcome === "approve" ? "Approved " : "Rejected ") + shortId(a.id) + (ns ? " → " + String(ns).replace(/_/g, " ") : ""), outcome === "approve" ? "success" : "info");
        load();
      })
      .catch((e: any) => {
        setRowBusy(a.id, false);
        toast("Decision failed: " + errText(e), "error");
      });
  }

  const visible = (rows || []).filter((a: any) => {
    const st = visaState(a);
    if (filter === "all") return true;
    if (filter === "review") return st === "IN_REVIEW";
    if (filter === "decided") return isTerminal(a);
    // "queue" — submitted or in_review (the actionable worklist).
    return st === "SUBMITTED" || st === "IN_REVIEW";
  });

  const counts: any = {
    queue: (rows || []).filter((a: any) => {
      const s = visaState(a);
      return s === "SUBMITTED" || s === "IN_REVIEW";
    }).length,
    review: (rows || []).filter((a: any) => visaState(a) === "IN_REVIEW").length,
    decided: (rows || []).filter(isTerminal).length,
    all: (rows || []).length,
  };

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
        title="Visa Desk"
        icon={<Icon name="visa" size={18} />}
        sub={counts.queue ? counts.queue + " in queue" : ""}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh visa queue">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 16 }}>
          <div className="taw-qfilters" role="tablist" aria-label="Visa queue filter">
            {FilterBtn("queue", "Queue")}
            {FilterBtn("review", "In review")}
            {FilterBtn("decided", "Decided")}
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
          {!mayDecide ? (
            <div className="taw-vgate" style={{ marginTop: 12 }}>
              <Icon name="shield" size={13} />
              Decision sign-off is restricted to authorised roles.
            </div>
          ) : null}

          {loading && rows == null ? (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="taw-skel" style={{ height: 96 }} />
              ))}
            </div>
          ) : visible.length ? (
            <div className="taw-qlist">
              {visible.map((a: any) => {
                const st = visaState(a);
                const rowBusy = !!busy[a.id];
                const terminal = isTerminal(a);
                const mem = a.member_id ? membersById[a.member_id] : null;
                const info = visaDocs(a);
                const picks = rowDraft(a.id, info.collected);
                const collectedCount = info.list.filter((doc: any) => !!picks[doc.key]).length;
                const allCollected = info.list.length > 0 && collectedCount === info.list.length;
                const dest = (a.detail && (a.detail.destination || (a.detail.requirement && a.detail.requirement.destination))) || a.destination || "";
                const vtype = (a.detail && (a.detail.visa_type || (a.detail.requirement && a.detail.requirement.visa_type))) || a.visa_type || "";
                return (
                  <div key={a.id} className="taw-qrow">
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        {a.order_id ? (
                          <button className="taw-qlink" onClick={() => onOpenOrder(a.order_id)} title={"Open order " + shortId(a.order_id)}>
                            <Icon name="luggage" size={13} />#{shortId(a.order_id)}
                          </button>
                        ) : null}
                        <span className="taw-qtype">{(dest || "Visa") + (vtype ? " · " + vtype : "")}</span>
                        <span className={cx("taw-vstate", "taw-vstate--" + visaStateClass(st))}>{st.replace(/_/g, " ")}</span>
                      </div>
                      <div className="taw-qrow-meta">
                        {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                        {a.pax || (a.detail && a.detail.pax) ? <span>{(a.pax || a.detail.pax) + " applicants"}</span> : null}
                        {info.list.length ? (
                          <span className="taw-vdocs">
                            <Icon name="note" size={12} />
                            {collectedCount + " / " + info.list.length + " docs"}
                            <span className="taw-vmeter" aria-hidden="true">
                              <i style={{ width: (info.list.length ? Math.round((collectedCount / info.list.length) * 100) : 0) + "%" }} />
                            </span>
                          </span>
                        ) : (
                          <span className="taw-muted">No checklist on file</span>
                        )}
                        <span className="taw-muted">App {shortId(a.id)}</span>
                      </div>
                      {/* Document checklist (only for actionable, non-terminal apps). */}
                      {!terminal && info.list.length ? (
                        <div className="taw-vchk">
                          <div className="taw-vchk-h">
                            <span className="taw-vchk-lbl taw-icrow">
                              <Icon name="note" size={13} />
                              Document collection
                            </span>
                            <span className="taw-vchk-prog ta-num">{collectedCount + " / " + info.list.length + " collected"}</span>
                          </div>
                          <div className="taw-vchk-list">
                            {info.list.map((doc: any) => {
                              const on = !!picks[doc.key];
                              return (
                                <button
                                  key={doc.key}
                                  type="button"
                                  className={"taw-vchk-item" + (on ? " is-on" : "")}
                                  disabled={rowBusy}
                                  onClick={() => toggleDoc(a.id, doc.key, info.collected)}
                                  aria-pressed={on ? "true" : "false"}
                                >
                                  <span className="taw-vchk-box">{on ? <Icon name="check" size={12} /> : null}</span>
                                  <span className="taw-vchk-txt">{doc.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {/* actions */}
                    <div className="taw-qrow-actions">
                      {!terminal && info.list.length ? (
                        <button className="taw-btn taw-btn--sm" disabled={rowBusy} onClick={() => commitDocs(a)} title="Record collected documents">
                          {rowBusy ? <Spinner /> : <Icon name="check" size={13} />}
                          Mark docs collected
                        </button>
                      ) : null}
                      {!terminal && mayDecide ? (
                        <div className="taw-vdecide">
                          <button
                            className="taw-btn taw-btn--accent taw-btn--sm"
                            disabled={rowBusy || (info.list.length > 0 && !allCollected)}
                            title={info.list.length > 0 && !allCollected ? "Collect all documents before approving" : "Approve this application"}
                            onClick={() => decide(a, "approve")}
                          >
                            {rowBusy ? <Spinner /> : <Icon name="check" size={13} />}
                            Approve
                          </button>
                          <button className="taw-btn taw-btn--danger taw-btn--sm" disabled={rowBusy} onClick={() => decide(a, "reject")}>
                            <Icon name="alert" size={13} />
                            Reject
                          </button>
                        </div>
                      ) : null}
                      {!terminal && !mayDecide ? (
                        <span className="taw-vgate">
                          <Icon name="shield" size={12} />
                          Decision restricted
                        </span>
                      ) : null}
                      {a.order_id ? (
                        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => onOpenOrder(a.order_id)}>
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
            <Empty icon={<Icon name="visa" size={28} />}>
              {filter === "queue"
                ? "Visa queue is clear — nothing submitted or in review."
                : filter === "review"
                ? "Nothing currently in review."
                : filter === "decided"
                ? "No decided applications yet."
                : "No visa applications yet."}
            </Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
