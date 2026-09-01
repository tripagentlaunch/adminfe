"use client";
/* =============================================================================
 * TripAgent — src/components/panels/PlatformAnalyticsPanel.tsx
 * The platform-wide Analytics dashboard — GMV, revenue & tax, conversion
 * funnel, RFQ engine performance, lifecycle care, Pulse & demand, bookings
 * by product, members by tier. Consumes the new, separate
 * GET /analytics/platform-summary (backend/app/routers/analytics_router.py).
 *
 * Distinct from the existing per-advisor AnalyticsPanel.jsx (self/peer
 * ranking, nested inside WorkbenchShell, still on the legacy
 * analytics-summary edge function) — same "Analytics" word, different
 * surface, different data, different transport. Named PlatformAnalyticsPanel
 * specifically so the file and the export never collide with that one.
 *
 * margin_visible (server-derived from advisor.role == "admin") gates
 * whether net_revenue_inr/avg_net_yield_pct are even present in the
 * response — rendered here by checking that one explicit flag, not by
 * probing for the fields' presence.
 *
 * Lifecycle/Pulse/feedback sections render an honest empty state when
 * their OWN actual values are zero (not off a static "known gaps" flag in
 * the response) — the moment those tables get real data, these sections
 * render for real with no frontend change needed.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { getPlatformSummary, inr } from "../../services/api";
import { errText } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner, SkeletonKpiRow, SkeletonRows, BarChart, Donut } from "../ui";

function toChartData(obj: any) {
  return Object.entries(obj || {}).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
}

function StatTile({ label, value, sub, style }: any) {
  return (
    <div className="taw-recon-stat" style={style}>
      <div className="k">{label}</div>
      <div className="v ta-num">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

function CountRows({ obj, emptyText }: any) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return <p className="taw-muted" style={{ fontSize: "12px" }}>{emptyText || "No data yet."}</p>;
  return (
    <div>
      {entries.map(([k, v]: any) => (
        <div key={k} className="taw-anl-funnel-row">
          <span className="lbl">{k.replace(/_/g, " ")}</span>
          <span className="n ta-num">{Number(v).toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}

export function PlatformAnalyticsPanel(props: any) {
  void props;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    getPlatformSummary()
      .then((res: any) => setData(res))
      .catch((e: any) => setErr(errText(e)))
      .then(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshBtn = (
    <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh analytics">
      {loading ? <Spinner /> : <Icon name="refresh" size={14} />} {loading ? "Refreshing…" : "Refresh"}
    </button>
  );

  if (loading && !data) {
    return (
      <div className="taw-fade-in">
        <Card title="Analytics" sub="Platform-wide performance" actions={refreshBtn}>
          <SkeletonKpiRow count={4} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "18px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="taw-recon-sec">
                <SkeletonRows count={3} height={14} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (err) {
    return (
      <div className="taw-fade-in">
        <Card title="Analytics" sub="Platform-wide performance" actions={refreshBtn}>
          <div className="taw-banner taw-banner--err" role="alert">
            <Icon name="alert" size={16} />
            <span style={{ flex: 1 }}>{err}</span>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const H = data.headline || {};
  const R = data.revenue || {};
  const F = data.funnel || {};
  const Q = data.rfq_engine || {};
  const L = data.lifecycle || {};
  const P = data.pulse || {};
  const M = data.members || {};
  const PR = data.products || {};
  const FB = data.feedback || {};
  const marginVisible = !!data.margin_visible;

  const lifecycleEmpty = !L.active_journeys && !L.touchpoints_sent && !Object.keys(L.journeys_by_stage || {}).length;
  const pulseEmpty = !P.live_deals && !P.trending_signals;
  const feedbackEmpty = !FB.surveys;

  return (
    <div className="taw-fade-in">
      <Card title="Analytics" sub="Platform-wide performance — computed live from the transactional ledger" actions={refreshBtn}>
        {data.meta && data.meta.data_truncated ? (
          <div className="taw-banner taw-banner--info" style={{ marginBottom: 12 }}>
            <Icon name="bell" size={16} />
            Some figures are partial — {data.meta.truncated_tables.join(", ")} hit the read cap.
          </div>
        ) : null}

        {/* --- Hero KPIs ------------------------------------------------- */}
        <div className="taw-recon-grid taw-stagger">
          <StatTile label="Gross Booking Value" value={inr(H.gmv_inr || 0)} sub={(H.booked_orders || 0) + " booked orders"} style={{ "--i": 0 }} />
          {marginVisible ? <StatTile label="Net Revenue" value={inr(H.net_revenue_inr || 0)} sub="margin + planning fees" style={{ "--i": 1 }} /> : null}
          {marginVisible ? <StatTile label="Avg Net Yield" value={(H.avg_net_yield_pct || 0) + "%"} sub="advisor take-rate" style={{ "--i": 2 }} /> : null}
          <StatTile label="Quote → Book" value={(H.conversion_pct || 0) + "%"} sub={(F.quotes || 0) + " quotes"} style={{ "--i": 3 }} />
        </div>

        <div className="taw-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "18px" }}>
          {/* --- Revenue & tax --------------------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="sliders" size={16} /> Revenue & tax</span>
            </div>
            <CountRows
              obj={{
                "Gross Booking Value": inr(R.gmv_inr || 0),
                "GST collected": inr(R.gst_collected_inr || 0),
                "TCS collected": inr(R.tcs_collected_inr || 0),
                "Overseas (TCS) orders": R.orders_with_tcs || 0,
                ...(marginVisible ? { "Net revenue": inr(R.net_revenue_inr || 0), "Avg net yield": (R.avg_net_yield_pct || 0) + "%" } : {}),
              }}
            />
          </div>

          {/* --- Conversion funnel ------------------------------------------ */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="compass" size={16} /> Conversion funnel</span>
            </div>
            <BarChart
              data={[
                { label: "Quotes sent", value: F.quotes || 0 },
                { label: "Orders (quote-traced)", value: F.orders_total || 0 },
                { label: "Booked (quote-traced)", value: F.booked || 0, color: "var(--gold-deep)" },
              ]}
            />
            <p className="taw-muted" style={{ fontSize: "11px", marginTop: "10px" }}>
              Conversion <b>{F.conversion_pct || 0}%</b>. Funnel stages are quote-traced (a strict subset) — the
              platform also has {F.all_orders || 0} total orders and {F.all_booked || 0} total booked orders, some
              not traceable to a quote.
            </p>
          </div>

          {/* --- RFQ engine -------------------------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="send" size={16} /> Supplier-broadcast engine</span>
            </div>
            <CountRows
              obj={{
                "RFQs broadcast": Q.total_rfqs || 0,
                Awarded: Q.awarded || 0,
                "Award rate": (Q.award_rate_pct || 0) + "%",
                "Supplier response rate": (Q.supplier_response_rate_pct || 0) + "%",
                "Avg suppliers / RFQ": Q.avg_suppliers_per_rfq || 0,
                "Supplier quotes parsed": Q.total_supplier_quotes || 0,
                "Avg quoted net": inr(Q.avg_quoted_net_inr || 0),
              }}
            />
          </div>

          {/* --- Lifecycle care ---------------------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="bell" size={16} /> Lifecycle care</span>
            </div>
            {lifecycleEmpty ? (
              <Empty icon={<Icon name="bell" size={24} />}>No lifecycle activity yet.</Empty>
            ) : (
              <>
                <CountRows
                  obj={{
                    "Active journeys": L.active_journeys || 0,
                    "Touchpoints delivered": L.touchpoints_sent || 0,
                    "Post-trip follow-ups sent": L.post_trip_followups_sent || 0,
                  }}
                />
                <div style={{ marginTop: "10px" }}>
                  <CountRows obj={L.journeys_by_stage} />
                </div>
              </>
            )}
          </div>

          {/* --- Pulse & demand ------------------------------------------------ */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="sparkle" size={16} /> Pulse & demand</span>
            </div>
            {pulseEmpty ? (
              <Empty icon={<Icon name="radar" size={24} />}>No live Pulse signals or deals yet.</Empty>
            ) : (
              <CountRows
                obj={{
                  "Live Great Deals": P.live_deals || 0,
                  "Trending signals": P.trending_signals || 0,
                  "Avg hotness": (P.avg_hotness || 0) + "°",
                }}
              />
            )}
          </div>

          {/* --- Post-trip feedback (NPS/CSAT) ---------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="shield" size={16} /> Post-trip feedback</span>
            </div>
            {feedbackEmpty ? (
              <Empty icon={<Icon name="shield" size={24} />}>No post-trip surveys yet.</Empty>
            ) : (
              <CountRows
                obj={{
                  "NPS score": FB.nps_score || 0,
                  "Promoters (9–10)": FB.promoters || 0,
                  "Passives (7–8)": FB.passives || 0,
                  "Detractors (0–6)": FB.detractors || 0,
                  "Avg CSAT": FB.avg_csat ? FB.avg_csat + " / 5" : "—",
                }}
              />
            )}
          </div>

          {/* --- Bookings by product --------------------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="compass" size={16} /> Bookings by product</span>
            </div>
            <Donut data={toChartData(PR.bookings_by_product)} emptyText="No bookings yet." />
          </div>

          {/* --- Members by tier --------------------------------------------------- */}
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl"><Icon name="shield" size={16} /> Members</span>
              <span className="ct">{M.total || 0} members</span>
            </div>
            <BarChart data={toChartData(M.by_tier)} emptyText="No members yet." />
          </div>
        </div>

        <p className="taw-muted" style={{ fontSize: "11px", marginTop: "14px", textAlign: "right" }}>
          Generated {data.generated_at ? new Date(data.generated_at).toLocaleString("en-IN") : "now"} · live data
        </p>
      </Card>
    </div>
  );
}
