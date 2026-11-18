"use client";
/* The customer's budget as the advisor hears it: "3 to 4 lakh", for the whole trip or per person. Pick a range
   from the list, or choose "Custom range" and type the amounts the way people say them (3l, 4 lakh, 75k,
   3,00,000). Calls onChange with a clean budget, or null while there is no usable amount. */
import { useState } from "react";
import { Dropdown } from "./ui";
import { normalizeBudget, parseMoney, shortMoney, type Budget } from "../lib/tripBudget";

const L = 100000;
const RANGES: { key: string; label: string; min: number; max: number }[] = [
  { key: "50-100", label: "₹50k – ₹1L", min: 0.5 * L, max: 1 * L },
  { key: "1-2", label: "₹1L – ₹2L", min: 1 * L, max: 2 * L },
  { key: "2-3", label: "₹2L – ₹3L", min: 2 * L, max: 3 * L },
  { key: "3-4", label: "₹3L – ₹4L", min: 3 * L, max: 4 * L },
  { key: "4-5", label: "₹4L – ₹5L", min: 4 * L, max: 5 * L },
  { key: "5-7", label: "₹5L – ₹7L", min: 5 * L, max: 7 * L },
  { key: "7-10", label: "₹7L – ₹10L", min: 7 * L, max: 10 * L },
  { key: "10-15", label: "₹10L – ₹15L", min: 10 * L, max: 15 * L },
  { key: "15-25", label: "₹15L – ₹25L", min: 15 * L, max: 25 * L },
];
const RANGE_OPTIONS = [
  { key: "none", label: "Not decided" },
  ...RANGES.map((r) => ({ key: r.key, label: r.label })),
  { key: "custom", label: "Custom range…" },
];
const FOR_OPTIONS = [{ key: "total", label: "Whole trip" }, { key: "person", label: "Per person" }];
const PAX_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1), label: i === 0 ? "1 traveller" : i + 1 + " travellers" }));

const asText = (n: number) => (n > 0 ? String(n) : "");
function startKey(b?: Budget | null): string {
  if (!b) return "none";
  return RANGES.find((r) => r.min === b.min && r.max === b.max)?.key || "custom";
}

export function BudgetFields({ initial, defaultPax, onChange }: { initial?: Budget | null; defaultPax?: number; onChange: (b: Budget | null) => void }) {
  const [range, setRange] = useState(() => startKey(initial));
  const [min, setMin] = useState(asText(initial?.min || 0));
  const [max, setMax] = useState(asText(initial?.max || 0));
  const [per, setPer] = useState<"total" | "person">(initial?.per || "total");
  const [pax, setPax] = useState(String(initial?.pax || defaultPax || 2));

  type S = { range: string; min: string; max: string; per: "total" | "person"; pax: string };
  function push(next: Partial<S>) {
    const s: S = { range, min, max, per, pax, ...next };
    const preset = RANGES.find((r) => r.key === s.range);
    const lo = s.range === "custom" ? parseMoney(s.min) : preset ? preset.min : 0;
    const hi = s.range === "custom" ? parseMoney(s.max) : preset ? preset.max : 0;
    onChange(normalizeBudget({ min: lo, max: hi, per: s.per, pax: parseInt(s.pax, 10) || 1 }));
  }
  const shown = (v: string) => { const n = parseMoney(v); return n > 0 ? shortMoney(n) : ""; };

  return (
    <div className="taw-budget-fields">
      <div className="taw-budget-grid">
        <div className="taw-budget-field">
          <span>Budget</span>
          <Dropdown value={range} options={RANGE_OPTIONS} ariaLabel="Budget range" triggerClassName="taw-budget-dd" hideOptionIcons
            onChange={(k: string) => {
              setRange(k);
              if (k !== "custom") { const p = RANGES.find((r) => r.key === k); setMin(p ? String(p.min) : ""); setMax(p ? String(p.max) : ""); }
              push({ range: k });
            }} />
        </div>
        <div className="taw-budget-field">
          <span>For</span>
          <Dropdown value={per} options={FOR_OPTIONS} ariaLabel="Budget is for" triggerClassName="taw-budget-dd" hideOptionIcons
            onChange={(k: "total" | "person") => { setPer(k); push({ per: k }); }} />
        </div>
      </div>
      {range === "custom" ? (
        <div className="taw-budget-grid">
          <label className="taw-budget-field">
            <span>From</span>
            <input inputMode="text" placeholder="e.g. 3 lakh" value={min} aria-label="Budget from" onChange={(e) => { setMin(e.target.value); push({ min: e.target.value }); }} />
            <small>{shown(min)}</small>
          </label>
          <label className="taw-budget-field">
            <span>To</span>
            <input inputMode="text" placeholder="e.g. 4 lakh" value={max} aria-label="Budget to" onChange={(e) => { setMax(e.target.value); push({ max: e.target.value }); }} />
            <small>{shown(max)}</small>
          </label>
        </div>
      ) : null}
      {per === "person" ? (
        <div className="taw-budget-grid">
          <div className="taw-budget-field">
            <span>Travellers</span>
            <Dropdown value={pax} options={PAX_OPTIONS} ariaLabel="Travellers" triggerClassName="taw-budget-dd" hideOptionIcons
              onChange={(k: string) => { setPax(k); push({ pax: k }); }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
