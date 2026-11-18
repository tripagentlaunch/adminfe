"use client";

/* The guest's nationality for a hotel search (Tripsure listing `nationalityCode`, ISO 3166-1 alpha-2).
   Rates and rules can differ by nationality, so it is chosen with the search rather than assumed. */

import { useMemo } from "react";

const CODES = [
  "IN", "US", "GB", "AE", "SG", "AU", "CA", "DE", "FR", "IT", "ES", "NL", "CH", "JP", "KR", "CN", "HK", "TH", "MY", "ID",
  "LK", "NP", "BT", "BD", "MV", "QA", "SA", "OM", "KW", "BH", "ZA", "NZ", "IE", "SE", "NO", "DK", "RU", "TR", "EG", "BR",
];

export function nationalityName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
}

export function GuestNationality({ value, onChange, disabled }: { value: string; onChange: (code: string) => void; disabled?: boolean }) {
  const options = useMemo(() => CODES.map((c) => ({ code: c, name: nationalityName(c) })).sort((a, b) => (a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name))), []);
  return (
    <label className="ow-sub" style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
      Guest nationality
      <select className="taw-input" style={{ width: "auto" }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Guest nationality">
        {options.map((o) => <option key={o.code} value={o.code}>{o.name} ({o.code})</option>)}
      </select>
    </label>
  );
}
