"use client";
/* =============================================================================
 * TripAgent — src/components/panels/RefundPreviewPanel.tsx
 * Ported from web/js/advisor.js: RefundPreviewPanel (line ~5735).
 * READ-ONLY, money-safe: computes the member refund figure only and posts
 * nothing to the ledger. The authoritative refund execution stays behind the
 * servicing case.
 * ===========================================================================*/
import { useState } from "react";
import { payRefundPreview, call as apiCall, inr } from "../../services/api";
import { errText, toast, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, OrderScopeBar } from "../ui";

export function RefundPreviewPanel(props: any) {
  const advisorId = props.advisorId || null;
  const orderId = props.orderId || "";
  const setOrderId = props.setOrderId;

  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function callPrev(payload: any) {
    if (typeof payRefundPreview === "function") return payRefundPreview(payload);
    if (typeof apiCall === "function") return apiCall("pay-refund-preview", payload);
    return Promise.reject(new Error("pay-refund-preview transport unavailable"));
  }

  function preview() {
    if (!orderId) {
      toast("Enter an order id.", "error");
      return;
    }
    setBusy(true);
    setErr(null);
    setNotice(null);
    setRes(null);
    callPrev({ action: "preview", order_id: orderId, advisor_id: advisorId || undefined })
      .then((r: any) => {
        setBusy(false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("Refund preview isn't live yet (" + (r.error || "unavailable") + ").");
          return;
        }
        setRes(r || {});
      })
      .catch((e: any) => {
        setBusy(false);
        const m = errText(e);
        if (softNotice(m)) setNotice("Refund preview isn't live yet.");
        else setErr(m);
      });
  }

  const amount = res ? (res.refund_inr != null ? res.refund_inr : res.amount_inr != null ? res.amount_inr : res.preview && res.preview.refund_inr) : null;
  const penalty = res ? (res.penalty_inr != null ? res.penalty_inr : res.preview && res.preview.penalty_inr) : null;
  const route = res ? res.route || res.method || (res.preview && res.preview.route) : null;
  const timeline = res ? res.timeline || res.eta || (res.preview && res.preview.timeline) : null;

  return (
    <div>
      <OrderScopeBar value={orderId} onChange={setOrderId} onLoad={preview} busy={busy} placeholder="Order id to preview…" />
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

      {res ? (
        <div className="taw-recon-grid">
          <div className="taw-recon-stat">
            <div className="k">Member refund</div>
            <div className="v ta-num">{amount != null ? inr(amount) : "—"}</div>
            <div className="sub">sell-side</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Penalty</div>
            <div className="v ta-num">{penalty != null ? inr(penalty) : "—"}</div>
            <div className="sub">supplier/fare</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Route</div>
            <div className="v" style={{ fontSize: 15 }}>
              {route || "—"}
            </div>
            <div className="sub">refund method</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Timeline</div>
            <div className="v" style={{ fontSize: 15 }}>
              {timeline || "—"}
            </div>
            <div className="sub">estimated ETA</div>
          </div>
        </div>
      ) : (
        <Empty icon={<Icon name="compass" size={28} />}>Enter an order id and preview a refund.</Empty>
      )}

      <div className="taw-recon-notice" style={{ marginTop: 14 }}>
        Read-only &amp; money-safe: this computes the member refund figure only and posts nothing to the ledger. The
        authoritative refund execution stays behind the servicing case.
      </div>
    </div>
  );
}
