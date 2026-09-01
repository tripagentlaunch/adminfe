"use client";
/* =============================================================================
 * TripAgent — src/components/panels/AnalyticsPanel.tsx
 * Ported from web/js/advisor.js: AnalyticsPanel (line ~4334). The advisor's
 * own north-star metrics (bookings + value, median response time, enquiry→
 * quote→order funnel drop-off) PLUS an ANONYMISED rank among peers. Per-
 * advisor MARGIN renders ONLY under canSeeMargin(), exactly like
 * Reconciliation. Degrades calmly; never throws.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { analyticsSummary, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, canSeeMargin } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner, BarChart } from "../ui";

// Defensive clamp: conversion percentages are bounded [0,100] server-side, but
// guard here too so a stale/older analytics-summary deploy can never render a
// nonsensical >100% rate (the bug this panel previously showed).
function pctClamp(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function AnalyticsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const advisorRole = props.advisorRole || null;

  const [data, setData] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  // Transport — generic function call (mirrors MyDay/Recon). The server scopes
  // the self-view and gates margin from the role we pass; it is authoritative.
  function callAnalytics(payload: any) {
    if (typeof analyticsSummary === "function") return analyticsSummary(payload);
    if (typeof apiCall === "function") return apiCall("analytics-summary", payload);
    return Promise.reject(new Error("analytics-summary transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    if (!advisorId) {
      setData(null);
      setNotice("Select an advisor to load their analytics.");
      setLoading(false);
      return;
    }
    // Pass role + the margin flag so the backend can return HOB economics ONLY
    // when permitted — we never rely on the client to redact margin.
    callAnalytics({ advisor_id: advisorId, role: advisorRole || undefined, show_margin: canSeeMargin() || undefined })
      .then((res: any) => {
        const adv = res && res.advisors;
        if (!adv) {
          setData(null);
          setNotice("Per-advisor analytics are not live yet.");
        } else {
          setData(adv);
        }
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/advisor_id_required|403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setData(null);
          setNotice("Per-advisor analytics are not live yet for this advisor.");
        } else {
          setErr(msg);
          setData(null);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId, advisorRole]);

  useEffect(() => {
    load();
  }, [load]);

  const hob = canSeeMargin();
  const self = data && data.self;
  const ranking = (data && data.ranking_anonymised) || [];
  const allAdvisors = (data && data.all_advisors) || null;

  // --- CSV export (AW-191) — client-side, no backend. Gated same as panel;
  // peers stay anonymised UNLESS HOB (then export the full leaderboard). ----
  function exportCsv() {
    if (!data) {
      toast("Nothing to export yet.", "info");
      return;
    }
    const rows: any[] = [];
    if (hob && allAdvisors && allAdvisors.length) {
      rows.push(["Advisor", "Role", "Bookings", "GMV (INR)", "Median response (min)", "Enq→Quote %", "Quote→Book %", "Net revenue (INR)", "Avg net yield %"]);
      allAdvisors.forEach((a: any) => {
        rows.push([
          a.name || "",
          a.role || "",
          a.bookings,
          a.gmv_inr,
          a.median_response_min == null ? "" : a.median_response_min,
          a.funnel ? a.funnel.enquiry_to_quote_pct : "",
          a.funnel ? a.funnel.quote_to_booking_pct : "",
          a.net_revenue_inr == null ? "" : a.net_revenue_inr,
          a.avg_net_yield_pct == null ? "" : a.avg_net_yield_pct,
        ]);
      });
    } else {
      // Anonymised export — self in full, peers as "Advisor #N".
      rows.push(["Advisor", "Bookings", "GMV (INR)", "Median response (min)", "Enq→Book %"]);
      ranking.forEach((a: any) => {
        rows.push([a.label, a.bookings, a.gmv_inr, a.median_response_min == null ? "" : a.median_response_min, a.enquiry_to_booking_pct]);
      });
    }
    const csv = rows
      .map((r) =>
        r
          .map((c: any) => {
            const s = c == null ? "" : String(c);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(",")
      )
      .join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tripagent-analytics-" + (advisorId ? shortId(advisorId) : "advisor") + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("Analytics exported", "success");
    } catch (e) {
      toast("Export failed: " + errText(e), "error");
    }
  }

  function rankLabel(rk: any) {
    if (!rk || !rk.of) return "—";
    return "#" + rk.rank + " of " + rk.of + (rk.percentile != null ? " · top " + rk.percentile + "%" : "");
  }

  function StatTile(k: any, v: any, sub: any, cls?: any, i?: any) {
    return (
      <div className="taw-recon-stat" style={i != null ? ({ "--i": i } as any) : undefined}>
        <div className="k">{k}</div>
        <div className={cx("v ta-num", cls)}>{v}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
    );
  }

  // funnel drop-off bar (enquiry -> quote -> booked) for the self row.
  const refreshBtn = (
    <div style={{ display: "inline-flex", gap: 8 }}>
      {data ? (
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={exportCsv} aria-label="Export analytics as CSV" title="Export CSV">
          <Icon name="compass" size={14} />
          Export
        </button>
      ) : null}
      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh analytics">
        {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
      </button>
    </div>
  );

  return (
    <div className="taw-fade-in">
      <Card title="Analytics" icon={<Icon name="sliders" size={18} />} sub={hob ? "Performance · HOB" : "Your performance"} actions={refreshBtn}>
        {err ? (
          <div className="taw-banner taw-banner--err" style={{ marginBottom: 12 }}>
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        {notice ? (
          <div className="taw-banner taw-banner--info" style={{ marginBottom: 12 }}>
            <Icon name="bell" size={16} />
            {notice}
          </div>
        ) : null}

        {loading && data == null ? (
          <div className="taw-skel" style={{ height: 140 }} />
        ) : self ? (
          <div>
            {/* --- A. North-star tiles (own numbers) ------------------------ */}
            <div className="taw-recon-grid taw-stagger">
              {StatTile("Bookings", Number(self.bookings || 0).toLocaleString("en-IN"), self.rank && self.rank.bookings ? rankLabel(self.rank.bookings) : null, "", 0)}
              {StatTile("Booked value", inr(self.gmv_inr || 0), self.rank && self.rank.gmv ? rankLabel(self.rank.gmv) : null, "", 1)}
              {StatTile(
                "Median response",
                self.median_response_min == null ? "—" : Number(self.median_response_min) >= 60 ? Math.round(self.median_response_min / 6) / 10 + "h" : Math.round(self.median_response_min) + "m",
                self.rank && self.rank.median_response ? rankLabel(self.rank.median_response) : "enquiry → first quote",
                "",
                2
              )}
              {StatTile(
                "Conversion",
                (self.funnel ? pctClamp(self.funnel.enquiry_to_booking_pct) : 0) + "%",
                "enquiry → booking",
                self.funnel && pctClamp(self.funnel.enquiry_to_booking_pct) >= 25 ? "is-good" : "",
                3
              )}
            </div>

            {/* quality flag — calm, only when flagged. */}
            {self.quality_flag && self.quality_flag !== "ok" ? (
              <div className="taw-banner taw-banner--info" style={{ marginTop: 12 }}>
                <Icon name="alert" size={16} />
                Heads up — your booked volume is running below the team average. Worth a look at open enquiries.
              </div>
            ) : null}

            {/* --- B. Funnel drop-off (own) --------------------------------- */}
            <div className="taw-recon-sec">
              <div className="taw-recon-sec-h">
                <span className="ttl">
                  <Icon name="compass" size={16} />
                  Your funnel
                </span>
              </div>
              {self.funnel ? (
                <BarChart
                  data={[
                    { label: "Enquiries assigned", value: self.funnel.enquiries || 0 },
                    { label: `Quotes sent (${pctClamp(self.funnel.enquiry_to_quote_pct)}% of enquiries)`, value: self.funnel.quotes || 0 },
                    { label: `Booked orders (${pctClamp(self.funnel.quote_to_booking_pct)}% of quotes)`, value: self.funnel.booked_orders || 0, color: "var(--gold-deep)" },
                  ]}
                />
              ) : (
                <Empty icon={<Icon name="compass" size={24} />}>No funnel activity yet.</Empty>
              )}
              {/* Conversion rates are over the advisor's ASSIGNED enquiries; raw
                  counts above are their true totals. Footnote when those diverge. */}
              {self.funnel && self.funnel.cohort_incomplete ? (
                <div className="taw-anl-funnel-note" style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "8px", lineHeight: 1.4 }}>
                  Conversion % is measured against enquiries assigned to you. Quotes and bookings also include work not traced to an assigned enquiry, so the counts above can exceed that base.
                </div>
              ) : null}
            </div>

            {/* --- C. Anonymised ranking (peers identity-stripped) ---------- */}
            <div className="taw-recon-sec">
              <div className="taw-recon-sec-h">
                <span className="ttl">
                  <Icon name="shield" size={16} />
                  {hob ? "Team leaderboard" : "Where you rank"}
                </span>
                <span className="ct">{ranking.length ? ranking.length + " advisors" : ""}</span>
              </div>
              {ranking.length ? (
                <div className="taw-recon-tablewrap">
                  <table className="taw-recon-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Advisor</th>
                        <th className="num">Bookings</th>
                        <th className="num">Booked value</th>
                        <th className="num">Median resp.</th>
                        <th className="num">Enq→Book</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((rrow: any, i: number) => (
                        <tr key={i} className={rrow.is_self ? "is-self" : ""}>
                          <td className="ta-num">{i + 1}</td>
                          <td>
                            {rrow.is_self ? (
                              <span className="taw-anl-you">
                                <Icon name="compass" size={12} />
                                You
                              </span>
                            ) : (
                              <span className="taw-muted">{rrow.label}</span>
                            )}
                          </td>
                          <td className="num ta-num">{rrow.bookings == null ? "—" : Number(rrow.bookings).toLocaleString("en-IN")}</td>
                          <td className="num ta-num">{rrow.gmv_inr == null ? "—" : inr(rrow.gmv_inr)}</td>
                          <td className="num ta-num">{rrow.median_response_min == null ? "—" : Math.round(rrow.median_response_min) + "m"}</td>
                          <td className="num ta-num">{rrow.enquiry_to_booking_pct == null ? "—" : pctClamp(rrow.enquiry_to_booking_pct) + "%"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={<Icon name="shield" size={24} />}>No peers to rank against yet.</Empty>
              )}
            </div>

            {/* --- D. MARGIN — HEAD-OF-BUSINESS ONLY ------------------------ */}
            {hob && self && (self.net_revenue_inr != null || self.avg_net_yield_pct != null) ? (
              <div className="taw-recon-sec">
                <div className="taw-recon-sec-h">
                  <span className="ttl">
                    <Icon name="sliders" size={16} />
                    Margin · head of business only
                  </span>
                </div>
                <div className="taw-recon-grid">
                  {StatTile("Net revenue", inr(self.net_revenue_inr || 0), "your contribution")}
                  {StatTile("Avg net yield", (self.avg_net_yield_pct || 0) + "%", "of sell")}
                </div>
              </div>
            ) : null}

            {/* --- E. Full per-advisor economics — HOB ONLY ----------------- */}
            {hob && allAdvisors && allAdvisors.length ? (
              <div className="taw-recon-sec">
                <div className="taw-recon-sec-h">
                  <span className="ttl">
                    <Icon name="sliders" size={16} />
                    Per-advisor economics
                  </span>
                  <span className="ct">{allAdvisors.length} advisors</span>
                </div>
                <div className="taw-recon-tablewrap">
                  <table className="taw-recon-table">
                    <thead>
                      <tr>
                        <th>Advisor</th>
                        <th className="num">Bookings</th>
                        <th className="num">GMV</th>
                        <th className="num">Net revenue</th>
                        <th className="num">Net yield</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAdvisors
                        .slice()
                        .sort((x: any, y: any) => (y.net_revenue_inr || 0) - (x.net_revenue_inr || 0))
                        .map((a: any, i: number) => (
                          <tr key={a.advisor_id || i} className={a.advisor_id === advisorId ? "is-self" : ""}>
                            <td>{a.name || "—"}</td>
                            <td className="num ta-num">{Number(a.bookings || 0).toLocaleString("en-IN")}</td>
                            <td className="num ta-num">{inr(a.gmv_inr || 0)}</td>
                            <td className="num ta-num">{inr(a.net_revenue_inr || 0)}</td>
                            <td className="num ta-num">{(a.avg_net_yield_pct || 0) + "%"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty icon={<Icon name="sliders" size={28} />}>No analytics for this advisor yet.</Empty>
        )}
      </Card>
    </div>
  );
}
