"use client";
// Shaped skeleton for a card grid (matches .rfq-bid/.rfq-board's real shape:
// a title + a chip-sized value, a couple of body lines, a pill-shaped action
// button) — built on the existing .taw-skel shimmer.
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="rfq-board">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rfq-bid">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <div className="taw-skel" style={{ height: 14, width: "50%", borderRadius: 4 }} />
            <div className="taw-skel" style={{ height: 18, width: "22%", borderRadius: 4 }} />
          </div>
          <div className="taw-skel" style={{ height: 10, width: "92%", borderRadius: 4, marginBottom: 6 }} />
          <div className="taw-skel" style={{ height: 10, width: "68%", borderRadius: 4, marginBottom: 14 }} />
          <div className="taw-skel" style={{ height: 30, width: "48%", borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}
