"use client";
// Ported from web/js/advisor.js (line ~1464). Shared loading placeholder for
// the search-desk result lists (Flight/Hotel/Visa desks).
export function SkeletonResults() {
  const rows = [0, 1, 2];
  return (
    <div className="taw-results">
      {rows.map((i) => (
        <div key={i} className="taw-skel" style={{ height: 78 }} />
      ))}
    </div>
  );
}
