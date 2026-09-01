"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HoldsQueue.tsx
 * Ported from web/js/advisor.js: HoldsQueue (line ~5548). Hold lifecycle
 * (inspect / list / extend / release / lapse) — NON-money.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { holdServicing, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner, SellNote } from "../ui";

export function HoldsQueue(props: any) {
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});

  function setRowBusy(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  function callHold(payload: any) {
    if (typeof holdServicing === "function") return holdServicing(payload);
    if (typeof apiCall === "function") return apiCall("hold-servicing", payload);
    return Promise.reject(new Error("hold-servicing transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callHold({ action: "list" })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The holds queue isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.holds)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The holds queue isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);
  useEffect(() => {
    load();
  }, [load]);

  function act(row: any, action: any) {
    if (!advisorId) {
      toast("Select an advisor to action holds.", "error");
      return;
    }
    const id = row.order_id || row.id;
    const payload: any = { action: action, order_id: id, advisor_id: advisorId };
    if (action === "extend") payload.extend_minutes = 30;
    if (action === "release" || action === "lapse") {
      const reason = typeof window !== "undefined" && window.prompt ? window.prompt((action === "release" ? "Release" : "Lapse") + " reason (kept on the trail):", "") : "";
      if (reason == null) return;
      if (action === "release") payload.reason = String(reason).trim();
    }
    setRowBusy(id, true);
    callHold(payload)
      .then((r: any) => {
        setRowBusy(id, false);
        if (r && r.ok === false) {
          if (r.error === "ILLEGAL_TRANSITION") toast("Can't " + action + " — hold is " + (r.live_status || "no longer held") + ".", "error");
          else if (softNotice(JSON.stringify(r))) setNotice("The holds queue isn't live yet.");
          else toast(action + " failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("Hold " + action + (action === "extend" ? "ed (+30m)" : "d"), "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(id, false);
        const m = errText(e);
        if (softNotice(m)) setNotice("The holds queue isn't live yet.");
        else toast(action + " failed: " + m, "error");
      });
  }

  return (
    <div>
      <div className="taw-qfilters" style={{ marginBottom: 0 }}>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh holds">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          Refresh
        </button>
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

      {loading && !rows ? (
        <div className="taw-skel" style={{ height: 140, marginTop: 12 }} />
      ) : rows && rows.length ? (
        <div className="taw-qlist">
          {rows.map((row: any, i: number) => {
            const id = row.order_id || row.id;
            const mem = row.member_id ? membersById[row.member_id] : null;
            const rowBusy = !!busy[id];
            const ttl = row.minutes_to_expiry != null ? row.minutes_to_expiry : row.ttl_minutes != null ? row.ttl_minutes : null;
            const ttlCls = ttl == null ? "" : ttl <= 0 ? "err" : ttl <= 30 ? "warn" : "ok";
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
                      <Icon name="clock" size={13} />
                      Hold
                    </span>
                    <span className={cx("taw-qstate", /held/i.test(row.status || "HELD") ? "info" : "warn")}>{row.status || "HELD"}</span>
                    {ttl != null ? (
                      <span className={cx("taw-qsla", ttlCls)}>
                        <Icon name="clock" size={11} />
                        {ttl <= 0 ? "Expired" : "TTL " + ttl + "m"}
                      </span>
                    ) : null}
                  </div>
                  <div className="taw-qrow-meta">
                    {mem ? <span>{mem.name + (mem.tier ? " · " + mem.tier : "")}</span> : null}
                    <span className="taw-muted">Ref {shortId(id)}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => act(row, "extend")} title="Courtesy +30m (no money)">
                    {rowBusy ? <Spinner /> : <Icon name="clock" size={13} />}
                    Extend
                  </button>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => act(row, "release")} title="Voluntary release (no money)">
                    <Icon name="alert" size={13} />
                    Release
                  </button>
                  <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => act(row, "lapse")} title="Lapse the TTL now">
                    <Icon name="clock" size={13} />
                    Lapse
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : rows ? (
        <Empty icon={<Icon name="clock" size={28} />}>No active holds — nothing pre-issue waiting.</Empty>
      ) : null}

      <SellNote extra="A hold is pre-pay: extend / release / lapse move no money. A post-pay cancel/refund stays on the servicing case path." />
    </div>
  );
}
