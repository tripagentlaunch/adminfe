"use client";
/* =============================================================================
 * TripAgent — src/components/panels/DisputeDesk.tsx
 * Ported from web/js/advisor.js: DisputeDesk (line ~5924). Dispute desk
 * (chargeback / ADM).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { disputeCase, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner, SellNote } from "../ui";

export function DisputeDesk(props: any) {
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});
  const [newOrder, setNewOrder] = useState("");
  function setRB(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  function callDisp(payload: any) {
    if (typeof disputeCase === "function") return disputeCase(payload);
    if (typeof apiCall === "function") return apiCall("dispute-case", payload);
    return Promise.reject(new Error("dispute-case transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callDisp({ action: "list", advisor_id: advisorId || undefined })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The dispute desk isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.cases)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The dispute desk isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);
  useEffect(() => {
    load();
  }, [load]);

  function openCase() {
    if (!advisorId) {
      toast("Select an advisor to open a dispute.", "error");
      return;
    }
    if (!newOrder) {
      toast("Enter the order id to dispute.", "error");
      return;
    }
    callDisp({ action: "open", advisor_id: advisorId, order_id: newOrder })
      .then((r: any) => {
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The dispute desk isn't live yet.");
          else toast("Open failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("Dispute opened", "success");
        setNewOrder("");
        load();
      })
      .catch((e: any) => {
        const m = errText(e);
        if (softNotice(m)) setNotice("The dispute desk isn't live yet.");
        else toast("Open failed: " + m, "error");
      });
  }

  function act(row: any, action: any) {
    if (!advisorId) {
      toast("Select an advisor to action disputes.", "error");
      return;
    }
    const id = row.case_id || row.id;
    const extra: any = {};
    if (action === "evidence") {
      const note = typeof window !== "undefined" && window.prompt ? window.prompt("Evidence note:", "") : "";
      if (note == null) return;
      extra.note = String(note).trim();
    }
    if (action === "resolve") {
      const outcome = typeof window !== "undefined" && window.prompt ? window.prompt("Outcome (won / lost / partial):", "won") : "won";
      if (outcome == null) return;
      extra.outcome = String(outcome).trim();
    }
    setRB(id, true);
    callDisp(Object.assign({ action: action, advisor_id: advisorId, case_id: id }, extra))
      .then((r: any) => {
        setRB(id, false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The dispute desk isn't live yet.");
          else toast(action + " failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("Dispute " + action + (action === "submit" ? "ted" : action === "resolve" ? "d" : " added"), "success");
        load();
      })
      .catch((e: any) => {
        setRB(id, false);
        const m = errText(e);
        if (softNotice(m)) setNotice("The dispute desk isn't live yet.");
        else toast(action + " failed: " + m, "error");
      });
  }

  return (
    <div>
      <div className="taw-qfilters" style={{ marginBottom: 14, alignItems: "center" }}>
        <input
          className="taw-input"
          style={{ maxWidth: 280 }}
          value={newOrder}
          placeholder="Order id to dispute…"
          aria-label="Order id to dispute"
          onChange={(e) => setNewOrder(e.target.value)}
        />
        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={!newOrder} onClick={openCase} title="Open a dispute case">
          <Icon name="shield" size={13} />
          Open dispute
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
            const id = row.case_id || row.id;
            const rb = !!busy[id];
            const st = String(row.status || row.state || "open");
            const open = /open|evidence|submit/i.test(st);
            const mem = row.member_id ? membersById[row.member_id] : null;
            return (
              <div key={id || i} className={cx("taw-qrow", !open && "is-snoozed")}>
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    {row.order_id ? (
                      <button className="taw-qlink" onClick={() => onOpenOrder(row.order_id)} title="Open order">
                        <Icon name="luggage" size={13} />#{shortId(row.order_id)}
                      </button>
                    ) : null}
                    <span className="taw-qtype taw-icrow">
                      <Icon name="shield" size={13} />
                      {row.kind || "Chargeback"}
                    </span>
                    <span className={cx("taw-qstate", /resolv|won/i.test(st) ? "ok" : /lost/i.test(st) ? "err" : "warn")}>{st}</span>
                  </div>
                  <div className="taw-qrow-meta">
                    {mem ? <span>{mem.name}</span> : null}
                    {row.amount_inr != null ? <span>Disputed {inr(row.amount_inr)}</span> : null}
                    <span className="taw-muted">Ref {shortId(id)}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {open ? (
                    <>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => act(row, "evidence")} title="Attach evidence">
                        {rb ? <Spinner /> : <Icon name="compass" size={13} />}
                        Evidence
                      </button>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => act(row, "submit")} title="Submit to network">
                        <Icon name="check" size={13} />
                        Submit
                      </button>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => act(row, "resolve")} title="Record outcome">
                        <Icon name="shield" size={13} />
                        Resolve
                      </button>
                    </>
                  ) : (
                    <span className="taw-muted">Closed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : rows ? (
        <Empty icon={<Icon name="shield" size={28} />}>No dispute cases.</Empty>
      ) : null}

      <SellNote extra="Disputed amounts are sell-side (the member figure). Adjudication outcomes record posture; settlement stays on the recon path." />
    </div>
  );
}
