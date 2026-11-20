/* The auto-plan for an itinerary started from scratch: what the advisor typed (place, budget, dates, travellers), turned into the
   searches to run and the money each part may use. Pure helpers, no LLM and no network; the screens call the backend with these.

   "South Goa" is a place with a half: the search city is Goa and the half is kept, so hotels, restaurants and activities are
   looked for south of the Zuari river only. Goa's airports follow the half (Dabolim in the south, Mopa in the north). */
import { budgetRange, normalizeBudget, parseMoney, spendable, type Budget } from "./tripBudget";
import { addDaysIso } from "./itineraryFromCart";
import { AIRPORTS } from "./airports";

export type ScratchPlan = {
  /** As typed and shown to the customer: "South Goa". */
  destination: string;
  /** What the searches use: "Goa". */
  city: string;
  region: "south" | "north" | null;
  from: string;
  fromCode: string | null;
  toCode: string | null;
  startIso: string;
  endIso: string;
  nights: number;
  adults: number;
  rooms: number;
  /** The whole-trip budget in rupees (the top of the range). */
  budgetTotal: number;
};

const cap = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
let CITY_BY_SQUASH: Map<string, string> | null = null;

/** A place typed without its spaces or in any case ("newyork", "NEW DELHI") -> its proper name ("New York"), when the airport
 *  directory knows it; null otherwise. Without this "newyork" is a hotel in Thane to the hotel search. */
export function knownCity(text: string): string | null {
  if (!CITY_BY_SQUASH) {
    CITY_BY_SQUASH = new Map();
    for (const a of AIRPORTS) if (a.city && !CITY_BY_SQUASH.has(squash(a.city))) CITY_BY_SQUASH.set(squash(a.city), a.city);
  }
  return CITY_BY_SQUASH.get(squash(text)) || null;
}

/** "South Goa" -> {city: "Goa", region: "south", label: "South Goa"}. A half is only read for Goa. */
export function parseDestination(text: string): { city: string; region: "south" | "north" | null; label: string } {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  const half = /\b(south|north)\b/i.exec(raw);
  const rest = raw.replace(/\b(south|north)\b/i, "").replace(/\s+/g, " ").trim();
  if (half && /\bgoa\b/i.test(rest)) {
    const region = half[1].toLowerCase() as "south" | "north";
    return { city: "Goa", region, label: `${cap(region)} Goa` };
  }
  const city = knownCity(raw) || raw;
  return { city, region: null, label: city };
}

/** "2.5 lakh", "50k per person", "₹3,00,000 total" -> a Budget (a single figure is both ends of the range). */
export function parseBudgetText(text: string, pax: number): Budget | null {
  const s = String(text || "").toLowerCase();
  const per = /(per\s*(person|head|pax|traveller|traveler)|\/\s*(person|head|pax)|\bpp\b|each)/.test(s) ? "person" : "total";
  const figure = s.replace(/(per\s*(person|head|pax|traveller|traveler)|\/\s*(person|head|pax)|\bpp\b|each|total|in all|overall|inr|rs\.?|rupees)/g, " ").replace(/\s+/g, " ").trim();
  const n = parseMoney(figure.replace(/\s+(?=lakhs?|lacs?|lk|crores?|cr|k\b)/, ""));
  if (!(n > 0)) return null;
  return normalizeBudget({ min: n, max: n, per, pax });
}

/** The trip's nights as one or two stays: 5 -> [3, 2], 4 -> [2, 2], 1 -> [1]. */
export function splitNights(nights: number): number[] {
  const n = Math.max(1, Math.floor(nights || 1));
  if (n === 1) return [1];
  const first = Math.ceil(n / 2);
  return [first, n - first];
}

export type StayBase = { city: string; checkIn: string; checkOut: string; nights: number };

/** The stays to search: the nights split in two, back to back from the first day. `city` is the label the customer reads. */
export function stayBases(plan: Pick<ScratchPlan, "destination" | "startIso" | "nights">): StayBase[] {
  let at = plan.startIso;
  return splitNights(plan.nights).map((nights) => {
    const base = { city: plan.destination, checkIn: at, checkOut: addDaysIso(at, nights), nights };
    at = base.checkOut;
    return base;
  });
}

export type Shares = { flights: number; stays: number; ground: number; perLeg: number; perStay: number[] };

/** What each part of the trip may use: the 15 / 60 / 25 split of the budget, flights per leg, stays by their nights. */
export function budgetShares(total: number, nights: number, roundTrip: boolean): Shares {
  const s = spendable({ min: total, max: total });
  const parts = splitNights(nights);
  const all = parts.reduce((a, b) => a + b, 0) || 1;
  return {
    flights: s.flights,
    stays: s.stays,
    ground: s.ground,
    perLeg: Math.round(s.flights / (roundTrip ? 2 : 1)),
    perStay: parts.map((n) => Math.round((s.stays * n) / all)),
  };
}

/** Rooms for a party: two to a room unless told otherwise. */
export const roomsFor = (adults: number) => Math.max(1, Math.ceil(Math.max(1, adults) / 2));

/** The airport the plan flies into: Goa's follows the half asked for; any other place takes the directory's best match. */
export function arrivalCodeFor(city: string, region: "south" | "north" | null, lookup: (name: string) => string | null): string | null {
  if (/^goa$/i.test(city.trim())) return region === "north" ? "GOX" : "GOI";
  return lookup(city);
}

/** A plan's total ground spend for what the advisor ticked: the low and high of the estimates (each already for the whole party). */
export function estimateTotals(picks: { est?: { totalLow: number; totalHigh: number } }[]): { low: number; high: number } {
  return picks.reduce((t, p) => ({ low: t.low + (p.est?.totalLow || 0), high: t.high + (p.est?.totalHigh || 0) }), { low: 0, high: 0 });
}

export { budgetRange };
