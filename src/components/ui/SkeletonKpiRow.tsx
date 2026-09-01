"use client";
// Shaped skeleton for a KPI/stat tile grid (matches .taw-recon-stat/.taw-recon-grid's
// real shape: an eyebrow-height label, a large serif value, a small sub-line) —
// built on the existing .taw-skel shimmer, not a new animation.
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="taw-recon-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="taw-recon-stat">
          <div className="taw-skel" style={{ height: 9, width: "55%", borderRadius: 4 }} />
          <div className="taw-skel" style={{ height: 22, width: "75%", borderRadius: 6, marginTop: 8 }} />
          <div className="taw-skel" style={{ height: 10, width: "40%", borderRadius: 4, marginTop: 7 }} />
        </div>
      ))}
    </div>
  );
}
