"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelChangeQueue.tsx
 * Ported from web/js/advisor.js: HotelChangeQueue (line ~5815). Hotel change
 * queue — modify-orchestrate + stay-deviation HITL.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { hotelModifyOrchestrate, hotelStayDeviation, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner, SellNote } from "../ui";

const FN_BY_KIND: any = { modify: hotelModifyOrchestrate, deviation: hotelStayDeviation };
const FN_NAME_BY_KIND: any = { modify: "hotel-modify-orchestrate", deviation: "hotel-stay-deviation" };

export function HotelChangeQueue(props: any) {
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [kind, setKind] = useState("modify"); // modify|deviation
  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});
  function setRB(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  function callFn(payload: any) {
    const fn = FN_BY_KIND[kind];
    if (typeof fn === "function") return fn(payload);
    if (typeof apiCall === "function") return apiCall(FN_NAME_BY_KIND[kind], payload);
    return Promise.reject(new Error(FN_NAME_BY_KIND[kind] + " transport unavailable"));
  }

  const label = kind === "modify" ? "hotel change" : "in-stay deviation";

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callFn({ action: "queue", advisor_id: advisorId || undefined })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The " + label + " queue isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.queue || r.proposals)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The " + label + " queue isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId, kind]);
  useEffect(() => {
    load();
  }, [load]);

  function decide(row: any, action: any) {
    if (!advisorId) {
      toast("Select an advisor to action " + label + "s.", "error");
      return;
    }
    const id = row.id || row.proposal_id || row.deviation_id;
    let reason = "";
    if (action === "reject") {
      reason = typeof window !== "undefined" && window.prompt ? window.prompt("Reject reason (kept on the trail):", "") || "" : "";
      if (reason == null) return;
      reason = String(reason).trim();
    }
    setRB(id, true);
    const payload: any = { action: action, advisor_id: advisorId };
    if (kind === "modify") payload.proposal_id = id;
    else payload.deviation_id = id;
    payload.id = id;
    if (reason) payload.reason = reason;
    callFn(payload)
      .then((r: any) => {
        setRB(id, false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The " + label + " queue isn't live yet.");
          else toast(action + " failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast(label.charAt(0).toUpperCase() + label.slice(1) + " " + (action === "approve" ? "approved" : "rejected"), "success");
        load();
      })
      .catch((e: any) => {
        setRB(id, false);
        const m = errText(e);
        if (softNotice(m)) setNotice("The " + label + " queue isn't live yet.");
        else toast(action + " failed: " + m, "error");
      });
  }

  return (
    <div>
      <div className="taw-qfilters" style={{ marginBottom: 14 }}>
        <button className={cx("taw-qfilter", kind === "modify" && "is-active")} onClick={() => setKind("modify")}>
          Date / room changes
        </button>
        <button className={cx("taw-qfilter", kind === "deviation" && "is-active")} onClick={() => setKind("deviation")}>
          In-stay deviations
        </button>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" style={{ marginLeft: "auto" }} onClick={load} disabled={loading} aria-label="Refresh">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="bell" size={16} />
          {notice}
        </div>
      ) : null}

      {loading && !rows ? (
        <div className="taw-skel" style={{ height: 140 }} />
      ) : rows && rows.length ? (
        <div className="taw-qlist">
          {rows.map((row: any, i: number) => {
            const id = row.id || row.proposal_id || row.deviation_id;
            const rb = !!busy[id];
            const mem = row.member_id ? membersById[row.member_id] : null;
            const st = String(row.status || row.state || "queued");
            const pending = /queue|pending|propos/i.test(st);
            const net = row.member_refund_inr != null ? row.member_refund_inr : row.member_pay_inr != null ? row.member_pay_inr : row.amount_inr != null ? row.amount_inr : null;
            const netLabel = row.member_refund_inr != null ? "Refund " : row.member_pay_inr != null ? "Member pays " : "Amount ";
            return (
              <div key={id || i} className={cx("taw-qrow", !pending && "is-snoozed")}>
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    {row.order_id ? (
                      <button className="taw-qlink" onClick={() => onOpenOrder(row.order_id)} title="Open order">
                        <Icon name="luggage" size={13} />#{shortId(row.order_id)}
                      </button>
                    ) : null}
                    <span className="taw-qtype taw-icrow">
                      <Icon name="hotel" size={13} />
                      {row.summary || label}
                    </span>
                    <span className={cx("taw-qstate", pending ? "warn" : /approv/i.test(st) ? "ok" : "info")}>{st}</span>
                  </div>
                  <div className="taw-qrow-meta">
                    {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                    {net != null ? <span>{netLabel + inr(net)}</span> : null}
                    {row.penalty_inr != null ? <span className="taw-muted">Penalty {inr(row.penalty_inr)}</span> : null}
                    <span className="taw-muted">Ref {shortId(id)}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions" style={{ display: "flex", gap: 8 }}>
                  {pending ? (
                    <>
                      <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={rb} onClick={() => decide(row, "approve")} title="Approve this change">
                        {rb ? <Spinner /> : <Icon name="check" size={13} />}
                        Approve
                      </button>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => decide(row, "reject")} title="Reject this change">
                        <Icon name="alert" size={13} />
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="taw-muted">Decided</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : rows ? (
        <Empty icon={<Icon name="hotel" size={28} />}>No {label}s waiting on approval.</Empty>
      ) : null}

      <SellNote extra="Approving a queued change authorises it; the refund/penalty stays on the servicing path. Net/margin is never shown here." />
    </div>
  );
}
