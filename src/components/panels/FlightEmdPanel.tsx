"use client";
/* =============================================================================
 * TripAgent — src/components/panels/FlightEmdPanel.tsx
 * Ported from web/js/advisor.js: FlightEmdPanel (line ~5657). Flight EMD
 * (ancillary) fulfilment — issue / reconcile / residual / list.
 * ===========================================================================*/
import { useState } from "react";
import { flightEmd, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner, OrderScopeBar, SellNote } from "../ui";

export function FlightEmdPanel(props: any) {
  const advisorId = props.advisorId || null;
  const orderId = props.orderId || "";
  const setOrderId = props.setOrderId;

  const [rows, setRows] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<any>({});
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function setRB(id: any, on: any) {
    setRowBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }
  function callEmd(payload: any) {
    if (typeof flightEmd === "function") return flightEmd(payload);
    if (typeof apiCall === "function") return apiCall("flight-emd", payload);
    return Promise.reject(new Error("flight-emd transport unavailable"));
  }

  function load() {
    if (!orderId) {
      setNotice("Enter an order id to list its EMDs.");
      return;
    }
    setBusy(true);
    setErr(null);
    setNotice(null);
    callEmd({ action: "list", order_id: orderId })
      .then((r: any) => {
        setBusy(false);
        if (r && r.ok === false) {
          setNotice("EMD fulfilment isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.emds)) || []);
      })
      .catch((e: any) => {
        setBusy(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("EMD fulfilment isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
  }

  function act(row: any, action: any) {
    if (!advisorId) {
      toast("Select an advisor to action EMDs.", "error");
      return;
    }
    const id = row.emd_id || row.id;
    setRB(id, true);
    callEmd({ action: action, order_id: orderId, advisor_id: advisorId, emd_id: id })
      .then((r: any) => {
        setRB(id, false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("EMD fulfilment isn't live yet.");
          else toast(action + " failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("EMD " + action + (action === "residual" ? " computed" : "d"), "success");
        load();
      })
      .catch((e: any) => {
        setRB(id, false);
        const m = errText(e);
        if (softNotice(m)) setNotice("EMD fulfilment isn't live yet.");
        else toast(action + " failed: " + m, "error");
      });
  }

  return (
    <div>
      <OrderScopeBar value={orderId} onChange={setOrderId} onLoad={load} busy={busy} placeholder="Flight order id…" />
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

      {rows && rows.length ? (
        <div className="taw-qlist">
          {rows.map((row: any, i: number) => {
            const id = row.emd_id || row.id;
            const rb = !!rowBusy[id];
            const st = String(row.status || "issued");
            return (
              <div key={id || i} className="taw-qrow">
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="luggage" size={13} />
                      {row.code || row.ancillary || "EMD"}
                    </span>
                    <span className={cx("taw-qstate", /reconcil|issued/i.test(st) ? "info" : /void/i.test(st) ? "warn" : "ok")}>{st}</span>
                  </div>
                  <div className="taw-qrow-meta">
                    {row.amount_inr != null ? <span>Amount {inr(row.amount_inr)}</span> : null}
                    {row.residual_inr != null ? <span className="taw-muted">Residual {inr(row.residual_inr)}</span> : null}
                    <span className="taw-muted">Ref {shortId(id)}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => act(row, "reconcile")} title="Reconcile vs supplier">
                    {rb ? <Spinner /> : <Icon name="refresh" size={13} />}
                    Reconcile
                  </button>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => act(row, "residual")} title="Compute residual">
                    <Icon name="compass" size={13} />
                    Residual
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : rows ? (
        <Empty icon={<Icon name="luggage" size={28} />}>No EMDs on this order.</Empty>
      ) : null}

      <SellNote extra="EMD amounts are the member's ancillary price; reconcile/residual record supplier posture only." />
    </div>
  );
}
