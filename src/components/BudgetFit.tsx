"use client";
/* Lets Search's flight and hotel results say whether each option fits the customer's budget, without every desk
   having to know about the itinerary. SearchDesksPanel provides the budget and the itinerary; the desks ask. */
import { createContext, useContext, useMemo } from "react";
import { budgetRange, flightFit, hotelFit, normalizeBudget, type Fit } from "../lib/tripBudget";

type Api = { active: boolean; hotel: (perNight: number) => Fit | null; flight: (total: number) => Fit | null };
const OFF: Api = { active: false, hotel: () => null, flight: () => null };
const Ctx = createContext<Api>(OFF);

export function BudgetFitProvider({ itinerary, children }: { itinerary: any; children: React.ReactNode }) {
  const api = useMemo<Api>(() => {
    const r = budgetRange(normalizeBudget(itinerary && itinerary.budget));
    if (!r) return OFF;
    return { active: true, hotel: (n) => hotelFit(n, r, itinerary), flight: (t) => flightFit(t, r, itinerary) };
  }, [itinerary]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export const useBudgetFit = () => useContext(Ctx);

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** The small chip on a result: "Fits budget" or "₹X over". Renders nothing without a budget. */
export function FitChip({ fit, what }: { fit: Fit | null; what: string }) {
  if (!fit) return null;
  return fit.fits
    ? <span className="taw-chip taw-chip--fit" title={"Within " + inr(fit.cap) + " " + what + " that is left in the customer's budget"}>Fits budget</span>
    : <span className="taw-chip taw-chip--over" title={"The customer's budget leaves about " + inr(fit.cap) + " " + what}>{inr(fit.over)} over</span>;
}
