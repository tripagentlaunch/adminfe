"use client";
/* =============================================================================
 * TripAgent — src/components/panels/DeliveryPanel.tsx
 * Ported from web/js/advisor.js: DeliveryPanel (line ~6238). Comms delivery
 * receipts (status) + preferred-channel directory. NON-money; margin-free by
 * construction.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { commsDelivery, commsPreferences, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, shortId, fmtTime, softNotice } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner, OrderScopeBar } from "../ui";

function delState(s: any) {
  return /deliver/i.test(s) ? "ok" : /fail|bounce|reject/i.test(s) ? "err" : /fallback|queued|sent/i.test(s) ? "warn" : "info";
}

export function DeliveryPanel(props: any) {
  props = props || {};
  const membersById = props.membersById || {};

  const [sub, setSub] = useState("delivery"); // delivery|directory
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState<any>(null);
  const [dir, setDir] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function callDel(payload: any) {
    if (typeof commsDelivery === "function") return commsDelivery(payload);
    if (typeof apiCall === "function") return apiCall("comms-delivery", payload);
    return Promise.reject(new Error("comms-delivery transport unavailable"));
  }
  function callPref(payload: any) {
    if (typeof commsPreferences === "function") return commsPreferences(payload);
    if (typeof apiCall === "function") return apiCall("comms-preferences", payload);
    return Promise.reject(new Error("comms-preferences transport unavailable"));
  }

  function loadDelivery() {
    if (!ref) {
      setNotice("Enter an order id or correlation id to check delivery.");
      return;
    }
    setLoading(true);
    setErr(null);
    setNotice(null);
    callDel({ action: "status", order_id: ref, correlation_id: ref })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("Delivery receipts aren't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.deliveries)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("Delivery receipts aren't live yet.");
          setRows(null);
        } else setErr(m);
      });
  }

  const loadDir = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callPref({ action: "directory" })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The preferences directory isn't live yet (" + (r.error || "unavailable") + ").");
          setDir(null);
          return;
        }
        setDir((r && (r.items || r.rows || r.directory)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The preferences directory isn't live yet.");
          setDir(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sub === "directory") loadDir();
  }, [sub, loadDir]);

  function SubBtn(key: any, icon: any, label: any) {
    return (
      <button className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => setSub(key)}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card title="Delivery" icon={<Icon name="bell" size={18} />} sub="Receipts · preferred-channel directory">
        <div className="taw-desk-tabs" role="tablist" aria-label="Delivery view" style={{ marginBottom: 16 }}>
          {SubBtn("delivery", "bell", "Delivery receipts")}
          {SubBtn("directory", "compass", "Preferences directory")}
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

        {sub === "delivery" ? (
          <div>
            <OrderScopeBar value={ref} onChange={setRef} onLoad={loadDelivery} busy={loading} placeholder="Order id or correlation id…" />
            {rows && rows.length ? (
              <div className="taw-qlist">
                {rows.map((row: any, i: number) => {
                  const st = String(row.status || row.state || "—");
                  return (
                    <div key={row.id || i} className="taw-qrow">
                      <div className="taw-qrow-main">
                        <div className="taw-qrow-top">
                          <span className="taw-qtype taw-icrow">
                            <Icon name="bell" size={13} />
                            {(row.channel || "channel").toUpperCase()}
                          </span>
                          <span className={cx("taw-qstate", delState(st))}>{st}</span>
                        </div>
                        <div className="taw-qrow-meta">
                          {row.template_key ? <span>{row.template_key}</span> : null}
                          {row.to ? <span className="taw-muted">{row.to}</span> : null}
                          {row.delivered_at ? <span className="taw-muted">{fmtTime(row.delivered_at)}</span> : null}
                          <span className="taw-muted">Ref {shortId(row.id || row.correlation_id)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : rows ? (
              <Empty icon={<Icon name="bell" size={28} />}>No delivery records for that reference.</Empty>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="taw-qfilters" style={{ marginBottom: 12 }}>
              <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={loadDir} disabled={loading} aria-label="Refresh directory">
                {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
                Refresh
              </button>
            </div>
            {dir && dir.length ? (
              <div className="taw-recon-tablewrap">
                <table className="taw-recon-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Channel</th>
                      <th>Language</th>
                      <th>Quiet hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dir.map((row: any, i: number) => {
                      const mem = row.member_id ? membersById[row.member_id] : null;
                      return (
                        <tr key={row.member_id || i}>
                          <td>{(mem && mem.name) || row.name || shortId(row.member_id)}</td>
                          <td>
                            <span className="taw-chip taw-chip--dom">{row.channel || row.preferred_channel || "—"}</span>
                          </td>
                          <td>{row.language || row.preferred_language || "—"}</td>
                          <td className="taw-recon-ref">{row.quiet_hours ? row.quiet_hours.start_hour + ":00–" + row.quiet_hours.end_hour + ":00" : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : dir ? (
              <Empty icon={<Icon name="compass" size={28} />}>The preferences directory is empty.</Empty>
            ) : null}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
          Delivery and preference data only — no money, margin-free by construction. Member scope is enforced server-side.
        </div>
      </Card>
    </div>
  );
}
