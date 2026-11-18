"use client";
/* Budget line of the Itinerary Builder header: what the customer said they can spend, how much of it the plan
   uses, and what is left. It also shows how that splits between flights, stays and the part TripSure does not
   price (cars, sightseeing, meals). */
import { useState } from "react";
import { BudgetFields } from "./BudgetFields";
import { BUDGET_SHARES, budgetRange, budgetStatus, normalizeBudget, shortMoney, spendable, spentBy, type Budget } from "../lib/tripBudget";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function BudgetBar({ data, budget, pax, spent, onSave }: { data: any; budget: Budget | null; pax: number; spent: number; onSave: (b: Budget | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Budget | null>(budget);
  const [showSplit, setShowSplit] = useState(false);

  if (editing) {
    return (
      <div className="taw-budget taw-budget--edit">
        <div className="taw-budget-title">Customer&apos;s budget</div>
        <BudgetFields initial={budget} defaultPax={pax || 2} onChange={setDraft} />
        <div className="taw-budget-actions">
          <button type="button" className="taw-btn taw-btn--primary taw-btn--sm" disabled={!draft} onClick={() => { onSave(draft); setEditing(false); }}>Save budget</button>
          <button type="button" className="taw-btn taw-btn--sm" onClick={() => { setDraft(budget); setEditing(false); }}>Cancel</button>
          {budget ? <button type="button" className="taw-btn taw-btn--sm" onClick={() => { onSave(null); setEditing(false); }}>Remove budget</button> : null}
        </div>
      </div>
    );
  }
  const r = budgetRange(normalizeBudget(budget));
  if (!r) {
    return (
      <div className="taw-budget taw-budget--empty">
        <button type="button" className="taw-linkbtn" onClick={() => { setDraft(null); setEditing(true); }}>+ Set the customer&apos;s budget</button>
      </div>
    );
  }
  const st = budgetStatus(spent, r);
  const sp = spendable(r);
  const by = spentBy(data);
  const range = r.min && r.min !== r.max ? shortMoney(r.min) + "–" + shortMoney(r.max) : "up to " + shortMoney(r.max);
  const note = budget && budget.per === "person" ? " (" + shortMoney(budget.min * 1) + "–" + shortMoney(budget.max) + " × " + budget.pax + " each)" : "";
  const label = st.state === "over" ? inr(st.over) + " over" : inr(st.left) + " left";
  return (
    <div className={"taw-budget is-" + st.state}>
      <div className="taw-budget-top">
        <div className="taw-budget-title">
          Budget <b>{range}</b>{budget && budget.per === "person" ? <span className="taw-muted">{note}</span> : null}
        </div>
        <div className="taw-budget-state" role="status">{inr(st.spent)} of {shortMoney(r.max)} · <b>{label}</b></div>
        <button type="button" className="taw-linkbtn" onClick={() => { setDraft(budget); setEditing(true); }}>Edit</button>
      </div>
      <div className="taw-budget-bar" aria-hidden="true">
        <div className="taw-budget-fill" style={{ width: Math.min(100, st.pct) + "%" }} />
        {r.min > 0 && r.min < r.max ? <div className="taw-budget-min" style={{ left: st.minPct + "%" }} title={"Bottom of the range: " + shortMoney(r.min)} /> : null}
      </div>
      <button type="button" className="taw-linkbtn taw-budget-more" aria-expanded={showSplit} onClick={() => setShowSplit((v) => !v)}>
        {showSplit ? "Hide" : "How to split it"}
      </button>
      {showSplit ? (
        <div className="taw-budget-split">
          <div><span>Flights</span><b>{inr(by.flights)}</b><small>of about {shortMoney(sp.flights)} ({Math.round(BUDGET_SHARES.flights * 100)}%)</small></div>
          <div><span>Stays</span><b>{inr(by.stays)}</b><small>of about {shortMoney(sp.stays)} ({Math.round(BUDGET_SHARES.stays * 100)}%)</small></div>
          <div><span>On the ground</span><b>{shortMoney(sp.ground)}</b><small>({Math.round(BUDGET_SHARES.ground * 100)}%) cars, sightseeing, meals — not priced here; add them as manual lines</small></div>
        </div>
      ) : null}
    </div>
  );
}
