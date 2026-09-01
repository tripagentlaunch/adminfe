"use client";
// Hand-rolled donut chart for proportion-of-whole data (product mix, etc.) —
// pure SVG, no charting library. Built from stacked <circle> strokes using
// stroke-dasharray/stroke-dashoffset (accumulating offset per segment,
// whole SVG rotated -90deg so the first segment starts at 12 o'clock) rather
// than hand-computed arc paths — same visual result, no arc-trigonometry
// bugs to get wrong.
const DEFAULT_COLORS = ["var(--gold)", "var(--cognac)", "var(--gold-deep)", "var(--taupe)", "var(--info)"];

export function Donut({ data, size = 120, thickness = 18, formatValue, emptyText }: any) {
  const rows = Array.isArray(data) ? data.filter((d: any) => d && Number(d.value) > 0) : [];
  const total = rows.reduce((s: number, d: any) => s + Number(d.value), 0);
  if (!rows.length || total <= 0) {
    return <p className="taw-muted" style={{ fontSize: "12px" }}>{emptyText || "No data yet."}</p>;
  }
  const fmt = formatValue || ((v: any) => Number(v).toLocaleString("en-IN"));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  let offsetAcc = 0;
  const segments = rows.map((d: any, i: number) => {
    const frac = Number(d.value) / total;
    const dash = frac * circumference;
    const seg = { d, i, dash, offset: offsetAcc, color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
    offsetAcc += dash;
    return seg;
  });

  return (
    <div className="taw-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", flex: "none" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bone)" strokeWidth={thickness} />
        {segments.map((seg: any) => (
          <circle
            key={seg.d.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="taw-donut-legend">
        {segments.map((seg: any) => (
          <div key={seg.d.label} className="taw-donut-legend-row">
            <span className="taw-donut-dot" style={{ background: seg.color }} />
            <span>{seg.d.label}</span>
            <span className="taw-donut-legend-value ta-num">{fmt(seg.d.value)} · {Math.round((100 * Number(seg.d.value)) / total)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
