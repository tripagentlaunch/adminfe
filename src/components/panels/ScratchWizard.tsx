"use client";
/* "Start from scratch", asked as a short conversation instead of a blank itinerary: where, how many, how much, when.
   What the advisor already knows from the enquiry is filled in (press Enter to accept it). No LLM: the answers are the search —
   the planner (ScratchPlanner) lists where to eat, things to do and a night out from the city page. */
import { useMemo, useRef, useState } from "react";
import { Icon } from "../ui";
import { boundFromDateRange, addDaysIso } from "../../lib/itineraryFromCart";
import { budgetBasisIn, budgetOnBasis, parseBudgetText, parseDestination } from "../../lib/scratchPlan";
import { budgetRange, shortMoney, type Budget } from "../../lib/tripBudget";
import { todayISO } from "../../lib/advisorHelpers";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export type ScratchAnswers = { destination: string; budget: Budget | null; from: string; startIso: string; nights: number; adults: number };

type StepKey = "destination" | "adults" | "budget" | "dates";

export function ScratchWizard({ ask, initialBudget, busy, onDone, onCancel }: {
  ask: any;
  initialBudget?: Budget | null;
  busy?: boolean;
  onDone: (a: ScratchAnswers) => void;
  onCancel: () => void;
}) {
  const known = useMemo(() => {
    const a = ask || {};
    const bound = boundFromDateRange(typeof a.dateRange === "string" ? a.dateRange : undefined);
    const nights = Number(a.dates && a.dates.nights) || (bound && bound.startIso && bound.endIso ? Math.round((Date.parse(bound.endIso) - Date.parse(bound.startIso)) / 86_400_000) : 0);
    const pax = Number(a.pax) || (Array.isArray(a.persons) ? a.persons.length : 0);
    return {
      destination: String((Array.isArray(a.destinations) && a.destinations[0]) || ""),
      from: String(a.from || ""),
      startIso: bound && bound.startIso ? bound.startIso : "",
      nights,
      adults: pax || 2,
    };
  }, [ask]);

  const [step, setStep] = useState<StepKey>("destination");
  const [destination, setDestination] = useState(known.destination);
  const [budgetText, setBudgetText] = useState(initialBudget ? String(initialBudget.max) : "");
  // Whether the figure is for each traveller or for the whole trip: "20k" for seven people is 20k or 1.4 lakh, so it is asked, not guessed.
  const [per, setPer] = useState<"total" | "person">(initialBudget ? initialBudget.per : "total");
  const [startIso, setStartIso] = useState(known.startIso);
  const [nights, setNights] = useState(known.nights ? String(known.nights) : "");
  const [adults, setAdults] = useState(String(known.adults));
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef<Set<StepKey>>(new Set());

  const adultsN = Math.max(1, parseInt(adults, 10) || 1);
  const budget = budgetOnBasis(parseBudgetText(budgetText, adultsN), per, adultsN);
  const place = parseDestination(destination);
  const nightsN = parseInt(nights, 10) || 0;

  const order: StepKey[] = ["destination", "adults", "budget", "dates"];
  const answers: Record<StepKey, string> = {
    destination: place.label,
    budget: budget ? (budget.per === "person" ? `${shortMoney(budget.max)} per person × ${budget.pax} = ${shortMoney(budgetRange(budget)!.max)}` : `${shortMoney(budget.max)} for the whole trip`) : "",
    dates: startIso && nightsN ? `${startIso} · ${nightsN} night${nightsN === 1 ? "" : "s"}` : "",
    adults: `${adultsN} traveller${adultsN === 1 ? "" : "s"}`,
  };
  const questions: Record<StepKey, string> = {
    destination: "Where is the customer going? (Type the part too, like “South Goa”.)",
    budget: "What is the customer's budget? Type the amount, then choose whether it is for each traveller or for the whole trip.",
    dates: "When do they travel? Pick the first day and the number of nights.",
    adults: "How many travellers?",
  };

  function check(k: StepKey): string | null {
    if (k === "destination") return place.label ? null : "Enter the place the customer is going to.";
    if (k === "budget") return budget ? null : "Enter an amount, like 2.5 lakh or 40k per person.";
    if (k === "dates") {
      if (!startIso) return "Pick the first day of the trip.";
      if (startIso < todayISO()) return "That day has passed — pick a later one.";
      return nightsN >= 1 && nightsN <= 30 ? null : "Enter the number of nights (1 to 30).";
    }
    return adultsN >= 1 && adultsN <= 30 ? null : "Enter how many travellers (1 to 30).";
  }
  function next() {
    const why = check(step);
    setProblem(why);
    if (why) return;
    done.current.add(step);
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1]);
    else finish();
  }
  function finish() {
    for (const k of order) {
      const why = check(k);
      if (why) { setStep(k); setProblem(why); return; }
    }
    onDone({ destination, budget, from: known.from, startIso, nights: nightsN, adults: adultsN });
  }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); next(); } };

  const input = (() => {
    switch (step) {
      case "destination":
        return <input className="taw-input" autoFocus value={destination} onChange={(e) => setDestination(e.target.value)} onKeyDown={onKey} placeholder="e.g. South Goa" />;
      case "budget":
        return (
          <>
            <input className="taw-input" autoFocus value={budgetText} placeholder="e.g. 20k or 2.5 lakh" onKeyDown={onKey}
              onChange={(e) => { setBudgetText(e.target.value); const named = budgetBasisIn(e.target.value); if (named) setPer(named); }} />
            <div className="taw-sw-basis" role="radiogroup" aria-label="What the amount is for">
              <button type="button" role="radio" aria-checked={per === "person"} className={"taw-sw-basis-btn" + (per === "person" ? " is-on" : "")} onClick={() => setPer("person")}>Per person</button>
              <button type="button" role="radio" aria-checked={per === "total"} className={"taw-sw-basis-btn" + (per === "total" ? " is-on" : "")} onClick={() => setPer("total")}>Whole trip</button>
            </div>
            {budget ? (
              <div className="taw-sw-note taw-muted">
                {budget.per === "person" ? `${inr(budget.max)} each × ${adultsN} traveller${adultsN === 1 ? "" : "s"} = ` : "The whole trip: "}<b>{inr(budgetRange(budget)!.max)}</b>
              </div>
            ) : null}
          </>
        );
      case "dates":
        return (
          <div className="taw-sw-pair">
            <input className="taw-input" type="date" autoFocus min={todayISO()} value={startIso} onChange={(e) => setStartIso(e.target.value)} onKeyDown={onKey} />
            <input className="taw-input" type="number" min={1} max={30} value={nights} onChange={(e) => setNights(e.target.value)} onKeyDown={onKey} placeholder="nights" />
          </div>
        );
      default:
        return <input className="taw-input" type="number" min={1} max={30} autoFocus value={adults} onChange={(e) => setAdults(e.target.value)} onKeyDown={onKey} />;
    }
  })();

  return (
    <div className="taw-sw">
      <div className="taw-sw-head">
        <Icon name="sparkle" size={20} />
        <div>
          <div className="title">Plan this trip</div>
          <div className="taw-muted">A few answers, then where to eat, what to do and where to go out are listed from the city guide, within your budget — no AI guesswork. Flights and hotels you search on the right, as always.</div>
        </div>
      </div>
      <div className="taw-sw-done">
        {order.filter((k) => done.current.has(k) && k !== step).map((k) => (
          <button key={k} type="button" className="taw-sw-chip" onClick={() => { setStep(k); setProblem(null); }} title="Change this answer">
            <span>{k === "destination" ? "Going to" : k === "budget" ? "Budget" : k === "dates" ? "Travel" : "Travellers"}</span>
            <b>{answers[k]}</b>
            <Icon name="edit" size={11} />
          </button>
        ))}
      </div>
      <div className="taw-sw-q">{questions[step]}</div>
      {input}
      {problem ? <div className="taw-sw-problem" role="alert">{problem}</div> : null}
      {step === "dates" && startIso && nightsN ? <div className="taw-muted taw-sw-note">Back on {addDaysIso(startIso, nightsN)}.</div> : null}
      <div className="taw-sw-actions">
        <button type="button" className="taw-btn" onClick={onCancel} disabled={busy}>Back</button>
        <button type="button" className="taw-btn taw-btn--primary" onClick={next} disabled={busy}>
          {busy ? "Starting…" : step === "adults" ? "Start planning" : "Continue"}
        </button>
      </div>
    </div>
  );
}
