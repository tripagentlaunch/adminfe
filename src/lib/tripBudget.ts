/* The customer's budget for a trip ("3 to 4 lakh for 5 days in Rajasthan"), kept on the itinerary as
   `budget: { min, max, per: "total" | "person", pax }`. Pure helpers: reading what an advisor types, the
   range as a total, how far the plan is through it, and the soft "fits the budget" check for Search.

   TripSure only prices flights and hotels. A trip also costs cars, sightseeing and meals, which are not in the
   plan unless entered by hand, so only part of the budget is spendable on flights + stays; the rest is held back
   as "on the ground". The split is a guide, not a rule. */

export type Budget = { min: number; max: number; per: "total" | "person"; pax: number };
export type BudgetRange = { min: number; max: number };

// Share of the budget for each part of the trip.
export const BUDGET_SHARES = { flights: 0.15, stays: 0.6, ground: 0.25 } as const;

/** "3l", "3.5 lakh", "4 L", "75k", "1cr", "3,00,000", "₹300000" -> rupees; 0 when it isn't an amount. */
export function parseMoney(raw: unknown): number {
  const s = String(raw ?? "").toLowerCase().replace(/[₹,\s]/g, "").replace(/^rs\.?/, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(lakhs?|lacs?|lk|l|crores?|cr|k|thousand)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2] || "";
  const mult = /^(lakhs?|lacs?|lk|l)$/.test(unit) ? 1e5 : /^(crores?|cr)$/.test(unit) ? 1e7 : /^(k|thousand)$/.test(unit) ? 1e3 : 1;
  return Math.round(n * mult);
}

/** A tidy Indian amount: 300000 -> "₹3L", 350000 -> "₹3.5L", 75000 -> "₹75k", 12345678 -> "₹1.23Cr". */
export function shortMoney(n: number): string {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e7) return "₹" + trim(v / 1e7, 2) + "Cr";
  if (v >= 1e5) return "₹" + trim(v / 1e5, 2) + "L";
  if (v >= 1e3) return "₹" + trim(v / 1e3, 1) + "k";
  return "₹" + v;
}
const trim = (x: number, d: number) => String(parseFloat(x.toFixed(d)));

/** A saved or half-typed budget as a clean one, or null when there is no usable amount. A single amount means "up to". */
export function normalizeBudget(b: any): Budget | null {
  if (!b || typeof b !== "object") return null;
  let min = Math.max(0, Math.round(Number(b.min) || 0));
  let max = Math.max(0, Math.round(Number(b.max) || 0));
  if (!min && !max) return null;
  if (!max) max = min;
  if (min > max) [min, max] = [max, min];
  const pax = Math.max(1, Math.round(Number(b.pax) || 1));
  return { min: min || 0, max, per: b.per === "person" ? "person" : "total", pax };
}

/** The whole-trip range: a per-person budget is multiplied by the travellers. */
export function budgetRange(b: Budget | null): BudgetRange | null {
  if (!b) return null;
  const k = b.per === "person" ? b.pax : 1;
  return { min: b.min * k, max: b.max * k };
}

export type BudgetState = "building" | "near" | "over";
export type BudgetStatus = {
  state: BudgetState;
  spent: number;
  left: number;            // what is left up to the top of the range (0 when over)
  over: number;            // how far past the top of the range (0 when not over)
  inRange: boolean;        // spent is inside min..max
  pct: number;             // spent as a share of max, 0..100+
  minPct: number;          // where the bottom of the range sits on the bar, 0..100
};

export function budgetStatus(spent: number, r: BudgetRange): BudgetStatus {
  const s = Math.max(0, Math.round(spent) || 0);
  const pct = r.max > 0 ? (s / r.max) * 100 : 0;
  const state: BudgetState = s > r.max ? "over" : pct >= 90 ? "near" : "building";
  return {
    state, spent: s, left: Math.max(0, r.max - s), over: Math.max(0, s - r.max),
    inRange: s >= r.min && s <= r.max, pct, minPct: r.max > 0 ? (r.min / r.max) * 100 : 0,
  };
}

/** What the plan has so far in each bucket (flights and stays are the priced ones). */
export function spentBy(data: any): { flights: number; stays: number; other: number; flightCount: number; stayNights: number } {
  const out = { flights: 0, stays: 0, other: 0, flightCount: 0, stayNights: 0 };
  const items = [...((data?.days || []) as any[]).flatMap((d: any) => d.items || []), ...(data?.visa ? [data.visa] : [])];
  for (const it of items) {
    const p = Number(it?.price) || 0;
    if (!(p > 0) || it.priceIsFrom) continue;
    if (it.type === "flight") { out.flights += p; out.flightCount++; }
    else if (it.type === "hotel") {
      out.stays += p;
      const n = parseInt(String(it.duration || ""), 10);
      if (n > 0) out.stayNights += n;
    } else out.other += p;
  }
  return out;
}

/** The part of the budget flights + stays may use (the rest is for cars, sightseeing and meals). */
export const spendable = (r: BudgetRange) => ({
  flights: Math.round(r.max * BUDGET_SHARES.flights),
  stays: Math.round(r.max * BUDGET_SHARES.stays),
  ground: Math.round(r.max * BUDGET_SHARES.ground),
});

export type Fit = { fits: boolean; over: number; cap: number };

/** A hotel's price per night against what is left for stays, shared over the nights still to book. */
export function hotelFit(perNight: number, r: BudgetRange, data: any): Fit | null {
  if (!(perNight > 0)) return null;
  const sp = spentBy(data);
  const nights = Math.max(1, Number(data?.nights) || 1);
  const toBook = Math.max(1, nights - sp.stayNights);
  const cap = Math.max(0, Math.round((spendable(r).stays - sp.stays) / toBook));
  return { fits: perNight <= cap, over: Math.max(0, Math.round(perNight - cap)), cap };
}

/** A flight's total against what is left for flights, shared over the legs still to book (a round trip has two). */
export function flightFit(price: number, r: BudgetRange, data: any, legs = 2): Fit | null {
  if (!(price > 0)) return null;
  const sp = spentBy(data);
  const toBook = Math.max(1, legs - sp.flightCount);
  const cap = Math.max(0, Math.round((spendable(r).flights - sp.flights) / toBook));
  return { fits: price <= cap, over: Math.max(0, Math.round(price - cap)), cap };
}
