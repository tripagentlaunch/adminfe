"use client";
/* =============================================================================
 * TripAgent — src/components/panels/EarningsPanel.tsx
 * Ported from web/js/advisor.js: EarningsPanel (line ~6131). Advisor
 * book-of-business (ADVISOR-INTERNAL). Commission/net is allowed here because
 * the backend hard-gates it on advisor_id server-side and a member build can
 * never reach this tab. SELL never; this is the ONE economics surface.
 *
 * GATING: mounted ONLY when canSeeMargin() at the ROUTE level (App.jsx),
 * exactly mirroring the original's `(tab === "earnings" && canSeeMargin())`
 * double-gate — see App.jsx for the gate itself; this file does not
 * re-implement or loosen it.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { advisorBookOfBusiness, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, softNotice } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

export function EarningsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;

  const [sub, setSub] = useState("scorecard"); // scorecard|earnings|statement
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function callBob(payload: any) {
    if (typeof advisorBookOfBusiness === "function") return advisorBookOfBusiness(payload);
    if (typeof apiCall === "function") return apiCall("advisor-book-of-business", payload);
    return Promise.reject(new Error("advisor-book-of-business transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    if (!advisorId) {
      setData(null);
      setNotice("Select an advisor to load earnings.");
      setLoading(false);
      return;
    }
    callBob({ action: sub, advisor_id: advisorId })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The earnings book isn't live yet (" + (r.error || "unavailable") + ").");
          setData(null);
          return;
        }
        setData(r || {});
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The earnings book isn't live yet for this advisor.");
          setData(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId, sub]);
  useEffect(() => {
    load();
  }, [load]);

  function setGoal() {
    if (!advisorId) {
      toast("Select an advisor.", "error");
      return;
    }
    const v = typeof window !== "undefined" && window.prompt ? window.prompt("Set monthly earnings goal (INR):", "") : "";
    if (v == null) return;
    const n = Math.round(Number(String(v).replace(/[^0-9.]/g, "")) || 0);
    if (!n) {
      toast("Enter a number.", "error");
      return;
    }
    callBob({ action: "set_goal", advisor_id: advisorId, goal_inr: n })
      .then((r: any) => {
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The earnings book isn't live yet.");
          else toast("Set goal failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("Goal set — " + inr(n), "success");
        load();
      })
      .catch((e: any) => {
        const m = errText(e);
        if (softNotice(m)) setNotice("The earnings book isn't live yet.");
        else toast("Set goal failed: " + m, "error");
      });
  }

  function SubBtn(key: string, icon: string, label: string) {
    return (
      <button className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => setSub(key)}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }
  function Tile(k: any, v: any, sub2?: any, cls?: any) {
    return (
      <div className="taw-recon-stat">
        <div className="k">{k}</div>
        <div className={cx("v ta-num", cls)}>{v}</div>
        {sub2 ? <div className="sub">{sub2}</div> : null}
      </div>
    );
  }

  function render() {
    if (!data) return <Empty icon={<Icon name="sliders" size={28} />}>No earnings data for this advisor yet.</Empty>;
    const sc = data.scorecard || data;
    const goal = data.goal_inr != null ? data.goal_inr : sc && sc.goal_inr;
    const earned = data.earned_inr != null ? data.earned_inr : sc && (sc.earned_inr != null ? sc.earned_inr : sc.commission_inr);
    const lines = data.lines || data.earnings || data.statement_lines || [];
    return (
      <div>
        <div className="taw-recon-grid">
          {Tile("Earned", earned != null ? inr(earned) : "—", "this period")}
          {Tile("Goal", goal != null ? inr(goal) : "—", "monthly target")}
          {Tile("Bookings", sc && sc.bookings != null ? Number(sc.bookings).toLocaleString("en-IN") : "—", "this period")}
          {Tile("Attainment", goal && earned != null ? Math.round((earned / goal) * 100) + "%" : "—", "of goal", goal && earned != null && earned >= goal ? "is-good" : "")}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={setGoal} title="Set your earnings goal">
            <Icon name="sliders" size={13} />
            Set goal
          </button>
        </div>

        {Array.isArray(lines) && lines.length ? (
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl">
                <Icon name="luggage" size={16} />
                {sub === "statement" ? "Statement lines" : "Earnings"}
              </span>
              <span className="ct">{lines.length} lines</span>
            </div>
            <div className="taw-recon-tablewrap">
              <table className="taw-recon-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Product</th>
                    <th>Date</th>
                    <th className="num">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln: any, i: number) => (
                    <tr key={ln.id || i}>
                      <td className="taw-recon-ref">{ln.order_id ? "#" + shortId(ln.order_id) : "—"}</td>
                      <td>{ln.product || ln.kind || "—"}</td>
                      <td className="taw-recon-ref">{fmtDate(ln.created_at || ln.date)}</td>
                      <td className="num ta-num">{inr(ln.commission_inr != null ? ln.commission_inr : ln.amount_inr || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card
        title="Earnings"
        icon={<Icon name="sliders" size={18} />}
        sub="Your book of business · advisor-internal"
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh earnings">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div className="taw-desk-tabs" role="tablist" aria-label="Earnings view" style={{ marginBottom: 16 }}>
          {SubBtn("scorecard", "sliders", "Scorecard")}
          {SubBtn("earnings", "luggage", "Earnings")}
          {SubBtn("statement", "compass", "Statement")}
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

        {loading && !data ? <div className="taw-skel" style={{ height: 160 }} /> : render()}

        <div style={{ marginTop: 14, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
          Advisor-internal: commission and earnings are keyed to this advisor and hard-gated server-side on advisor_id. This surface is never reachable from a member build.
        </div>
      </Card>
    </div>
  );
}
