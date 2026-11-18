"use client";
/* The customer's budget as the advisor hears it: "3 to 4 lakh", for the whole trip or per person. Amounts can be
   typed the way people say them (3l, 4 lakh, 75k, 3,00,000). Calls onChange with a clean budget, or null while
   there is no usable amount. */
import { useState } from "react";
import { normalizeBudget, parseMoney, shortMoney, type Budget } from "../lib/tripBudget";

const asText = (n: number) => (n > 0 ? String(n) : "");

export function BudgetFields({ initial, defaultPax, onChange }: { initial?: Budget | null; defaultPax?: number; onChange: (b: Budget | null) => void }) {
  const [min, setMin] = useState(asText(initial?.min || 0));
  const [max, setMax] = useState(asText(initial?.max || 0));
  const [per, setPer] = useState<"total" | "person">(initial?.per || "total");
  const [pax, setPax] = useState(String(initial?.pax || defaultPax || 2));

  function push(next: { min?: string; max?: string; per?: "total" | "person"; pax?: string }) {
    const m = { min, max, per, pax, ...next };
    onChange(normalizeBudget({ min: parseMoney(m.min), max: parseMoney(m.max), per: m.per, pax: parseInt(m.pax, 10) || 1 }));
  }
  const shown = (v: string) => { const n = parseMoney(v); return n > 0 ? shortMoney(n) : ""; };

  return (
    <div className="taw-budget-fields">
      <div className="taw-budget-row">
        <label>
          <span>From</span>
          <input inputMode="text" placeholder="3 lakh" value={min} aria-label="Budget from" onChange={(e) => { setMin(e.target.value); push({ min: e.target.value }); }} />
          <small>{shown(min)}</small>
        </label>
        <label>
          <span>To</span>
          <input inputMode="text" placeholder="4 lakh" value={max} aria-label="Budget to" onChange={(e) => { setMax(e.target.value); push({ max: e.target.value }); }} />
          <small>{shown(max)}</small>
        </label>
      </div>
      <div className="taw-budget-row taw-budget-row--per">
        <div className="taw-seg" role="group" aria-label="Budget is for">
          <button type="button" className={per === "total" ? "is-on" : ""} aria-pressed={per === "total"} onClick={() => { setPer("total"); push({ per: "total" }); }}>Whole trip</button>
          <button type="button" className={per === "person" ? "is-on" : ""} aria-pressed={per === "person"} onClick={() => { setPer("person"); push({ per: "person" }); }}>Per person</button>
        </div>
        {per === "person" ? (
          <label className="taw-budget-pax">
            <span>Travellers</span>
            <input inputMode="numeric" value={pax} aria-label="Travellers" onChange={(e) => { setPax(e.target.value.replace(/\D/g, "").slice(0, 2)); push({ pax: e.target.value.replace(/\D/g, "").slice(0, 2) }); }} />
          </label>
        ) : null}
      </div>
    </div>
  );
}
