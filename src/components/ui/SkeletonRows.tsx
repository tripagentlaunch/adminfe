"use client";
// Generic shaped skeleton for a stacked list / detail pane / table-like area
// — plain bars at a caller-supplied height, built on the existing .taw-skel
// shimmer. For anything that isn't KPI-tile- or card-shaped.
export function SkeletonRows({ count = 3, height = 16 }: { count?: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="taw-skel" style={{ height, borderRadius: 8 }} />
      ))}
    </div>
  );
}
