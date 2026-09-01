"use client";
/* =============================================================================
 * TripAgent — src/components/panels/GroupAirDesk.tsx
 * Ported from web/js/advisor.js: GroupAirDesk (line ~6038). Group air desk
 * (open / name_list / deposit_terms / status).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { flightGroup, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner, SellNote } from "../ui";

export function GroupAirDesk(props: any) {
  const advisorId = props.advisorId || null;
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null);
  const [sel, setSel] = useState<any>(null); // {group, kind, detail}
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function callGrp(payload: any) {
    if (typeof flightGroup === "function") return flightGroup(payload);
    if (typeof apiCall === "function") return apiCall("flight-group", payload);
    return Promise.reject(new Error("flight-group transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callGrp({ action: "status", advisor_id: advisorId || undefined })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The group air desk isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.groups)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The group air desk isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);
  useEffect(() => {
    load();
  }, [load]);

  function openDetail(row: any, action: any) {
    const id = row.group_id || row.id;
    callGrp({ action: action, group_id: id, advisor_id: advisorId || undefined })
      .then((r: any) => {
        if (r && r.ok === false) {
          setNotice("Group detail isn't live yet.");
          return;
        }
        setSel({ group: row, kind: action, detail: r });
      })
      .catch((e: any) => {
        const m = errText(e);
        if (softNotice(m)) setNotice("Group detail isn't live yet.");
        else toast("Load failed: " + m, "error");
      });
  }

  return (
    <div>
      <div className="taw-qfilters" style={{ marginBottom: 14 }}>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          Refresh
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
            const id = row.group_id || row.id;
            const st = String(row.status || row.state || "open");
            return (
              <div key={id || i} className="taw-qrow">
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    {row.order_id ? (
                      <button className="taw-qlink" onClick={() => onOpenOrder(row.order_id)} title="Open order">
                        <Icon name="luggage" size={13} />#{shortId(row.order_id)}
                      </button>
                    ) : null}
                    <span className="taw-qtype taw-icrow">
                      <Icon name="flight" size={13} />
                      {row.route || row.name || "Group"}
                    </span>
                    <span className={cx("taw-qstate", /confirm|ticket/i.test(st) ? "ok" : "info")}>{st}</span>
                  </div>
                  <div className="taw-qrow-meta">
                    {row.pax != null ? <span>{row.pax} pax</span> : null}
                    {row.deposit_inr != null ? <span>Deposit {inr(row.deposit_inr)}</span> : null}
                    <span className="taw-muted">Ref {shortId(id)}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => openDetail(row, "name_list")} title="Passenger name list">
                    <Icon name="compass" size={13} />
                    Names
                  </button>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => openDetail(row, "deposit_terms")} title="Deposit schedule">
                    <Icon name="luggage" size={13} />
                    Deposit terms
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : rows ? (
        <Empty icon={<Icon name="flight" size={28} />}>No group bookings.</Empty>
      ) : null}

      {sel ? (
        <div className="taw-recon-sec">
          <div className="taw-recon-sec-h">
            <span className="ttl">
              <Icon name="flight" size={16} />
              {sel.kind === "name_list" ? "Passenger name list" : "Deposit terms"}
            </span>
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setSel(null)}>
              Close
            </button>
          </div>
          <pre style={{ background: "var(--bone)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, fontSize: 11.5, color: "var(--ink)", overflow: "auto", maxHeight: 320, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(sel.detail, null, 2)}
          </pre>
        </div>
      ) : null}

      <SellNote extra="Deposit schedules and group amounts are sell-side (member figures). Net/commission is never shown here." />
    </div>
  );
}
