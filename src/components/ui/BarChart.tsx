"use client";
// Hand-rolled horizontal bar chart for categorical/magnitude data (orders by
// status, bookings by product, members by tier, funnel stages) — no charting
// library, matching this codebase's existing house style (see the legacy
// web/js/analytics.js's own "No chart library — inline SVG/CSS bars").
//
// One consistent fill color per chart (--gold by default) rather than an
// auto-rotating palette — a ranked-magnitude bar chart conventionally reads
// in one color; per-row override (`color`) exists for the one case that
// needs emphasis (e.g. a funnel's final stage in --gold-deep).
export function BarChart({ data, formatValue, emptyText }: any) {
  const rows = Array.isArray(data) ? data.filter((d: any) => d && d.value != null) : [];
  if (!rows.length) {
    return <p className="taw-muted" style={{ fontSize: "12px" }}>{emptyText || "No data yet."}</p>;
  }
  const max = Math.max(...rows.map((d: any) => Number(d.value) || 0), 1);
  const fmt = formatValue || ((v: any) => Number(v).toLocaleString("en-IN"));
  return (
    <div className="taw-barchart">
      {rows.map((d: any) => (
        <div key={d.label} className="taw-barchart-row">
          <span className="taw-barchart-label">{d.label}</span>
          <span className="taw-barchart-track">
            <span
              className="taw-barchart-fill"
              style={{ width: Math.max(3, (100 * (Number(d.value) || 0)) / max) + "%", background: d.color || "var(--gold)" }}
            />
          </span>
          <span className="taw-barchart-value ta-num">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
