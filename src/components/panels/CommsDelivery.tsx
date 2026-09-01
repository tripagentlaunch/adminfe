"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsDelivery.tsx
 * Ported from web/js/advisor.js: CommsDelivery (line ~4078). Delivery
 * sub-view: the per-order / per-member outbox.
 * ===========================================================================*/
import { useCallback, useState } from "react";
import { cx } from "../../lib/cx";
import { errText, shortId, fmtDate, fmtTime, commsChannelClass, deliveryStateClass } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner } from "../ui";

export function CommsDelivery(props: any) {
  const member = props.member || null;
  const callComms = props.callComms;

  const [orderId, setOrderId] = useState("");
  const [rows, setRows] = useState<any>(null);
  const [, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  const lookup = useCallback(() => {
    const oid = String(orderId || "").trim();
    const payload: any = { action: "delivery_status", limit: 100 };
    if (oid) payload.order_id = oid;
    else if (member && member.id) payload.member_id = member.id;
    else {
      setNotice("Enter an order id, or pick a member in the Workbench.");
      setRows(null);
      setSummary(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setNotice(null);
    callComms(payload)
      .then((res: any) => {
        setRows((res && res.outbox) || []);
        setSummary((res && res.summary) || null);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setRows([]);
          setNotice("No delivery records available for this lookup.");
        } else {
          setErr(msg);
          setRows([]);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, member]);

  const visible = rows || [];

  return (
    <div>
      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="taw-input"
          style={{ maxWidth: 260 }}
          value={orderId}
          placeholder="Order id (or use selected member)"
          aria-label="Order id"
          onChange={(e) => setOrderId(e.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") lookup();
          }}
        />
        <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={lookup} disabled={loading}>
          {loading ? <Spinner /> : <Icon name="search" size={13} />}
          Look up
        </button>
      </div>
      {member ? (
        <div className="taw-muted" style={{ marginBottom: 10, fontSize: 11.5 }}>
          Leave the order id blank to read delivery for {member.name}.
        </div>
      ) : null}

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

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="taw-skel" style={{ height: 44 }} />
          ))}
        </div>
      ) : rows == null ? (
        <Empty icon={<Icon name="shield" size={28} />}>Look up an order id (or member) to read its delivery outbox.</Empty>
      ) : visible.length ? (
        <div className="taw-qlist">
          {visible.map((o: any, i: number) => (
            <div key={i} className="taw-qrow">
              <div className="taw-qrow-main">
                <div className="taw-qrow-top">
                  {o.channel ? <span className={cx("taw-qstate", commsChannelClass(o.channel))}>{String(o.channel)}</span> : null}
                  {o.status ? <span className={cx("taw-qstate", deliveryStateClass(o.status))}>{String(o.status)}</span> : null}
                  {o.template ? (
                    <span className="taw-icrow">
                      <Icon name="note" size={13} />
                      {String(o.template)}
                    </span>
                  ) : null}
                </div>
                <div className="taw-qrow-meta">
                  {o.to_address ? <span>{String(o.to_address)}</span> : null}
                  {o.consent_basis ? <span className="taw-muted">Consent: {String(o.consent_basis)}</span> : null}
                  {o.suppressed_reason ? <span className="taw-qstate warn">Suppressed: {String(o.suppressed_reason)}</span> : null}
                  {o.sent_at ? (
                    <span className="taw-muted">
                      Sent {fmtDate(o.sent_at)} {fmtTime(o.sent_at)}
                    </span>
                  ) : null}
                  {o.provider_ref ? <span className="taw-muted">Ref {shortId(o.provider_ref)}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Icon name="shield" size={28} />}>No delivery records for this lookup.</Empty>
      )}
    </div>
  );
}
