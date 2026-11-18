/* Multi-city trips (flight guide 6.2: trip_type MULTI_CITY, 2+ segments): the legs the advisor enters, what is wrong with
 * them, how the search answer is split back into legs, and the trip's title. Plain data and pure functions. */
import { offsetDateStr } from "./searchDates";
import { tripIsInternational } from "./airports";

export interface McLeg {
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  fromName: string;
  toName: string;
  /** YYYY-MM-DD */
  date: string;
}

export const MC_MIN_LEGS = 2;
export const MC_MAX_LEGS = 5;
/** A new leg is offered this many days after the one before it. */
const NEXT_LEG_GAP_DAYS = 3;

export const blankLeg = (from = "", date = ""): McLeg => ({ from, to: "", fromCity: "", toCity: "", fromName: "", toName: "", date });

/** The legs to start from when the advisor switches to multi-city: leg 1 is what the one-way form already holds. */
export function seedLegs(form: { from: string; to: string; fromCity: string; toCity: string; fromName: string; toName: string; date: string }): McLeg[] {
  const first: McLeg = { from: form.from, to: form.to, fromCity: form.fromCity, toCity: form.toCity, fromName: form.fromName, toName: form.toName, date: form.date };
  return [first, followOn(first)];
}

/** A leg that starts where `prev` ended, a few days later. */
export function followOn(prev: McLeg): McLeg {
  const l = blankLeg(prev.to, prev.date ? offsetDateStr(prev.date, NEXT_LEG_GAP_DAYS) : "");
  l.fromCity = prev.toCity;
  l.fromName = prev.toName;
  return l;
}

export function addLeg(legs: McLeg[]): McLeg[] {
  return legs.length >= MC_MAX_LEGS ? legs : [...legs, followOn(legs[legs.length - 1])];
}

export function removeLeg(legs: McLeg[], i: number): McLeg[] {
  return legs.length <= MC_MIN_LEGS ? legs : legs.filter((_, j) => j !== i);
}

/** The tag a leg's flights carry in the results ("ONWARD" / "RETURN" are the round-trip ones). */
export const legKey = (i: number) => `LEG_${i + 1}`;

/** The first thing wrong with the legs, in words, or null when the search can be run. */
export function multiCityProblem(legs: McLeg[], today: string): string | null {
  if (legs.length < MC_MIN_LEGS) return `A multi-city trip has at least ${MC_MIN_LEGS} flights.`;
  if (legs.length > MC_MAX_LEGS) return `A multi-city trip has at most ${MC_MAX_LEGS} flights.`;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i], n = i + 1;
    if (l.from.length !== 3) return `Flight ${n}: pick a From airport from the suggestions.`;
    if (l.to.length !== 3) return `Flight ${n}: pick a To airport from the suggestions.`;
    if (l.from === l.to) return `Flight ${n}: From and To must differ.`;
    if (!l.date) return `Flight ${n}: pick a date.`;
    if (l.date < today) return `Flight ${n}: that date has passed — pick today or a later date.`;
    if (i > 0 && l.date < legs[i - 1].date) return `Flight ${n} can't be before flight ${i}.`;
  }
  return null;
}

/** The search's segments, as the backend takes them. */
export function segmentsOf(legs: McLeg[]) {
  return legs.map((l) => ({ origin: l.from.toUpperCase(), destination: l.to.toUpperCase(), departure_date: l.date }));
}

/** Split the offers of ONE multi-city search back into legs. TripSure groups them by leg, but how the groups are named is not
 *  documented, so they are taken in the order they come, and only when there is one group per leg. Anything else (a single
 *  group, a different count, nothing) is null: the caller then searches each leg on its own. */
export function regroupByLeg<T extends { leg?: string }>(offers: T[], legCount: number): T[] | null {
  const order: string[] = [];
  for (const o of offers) {
    const k = o.leg || "";
    if (!order.includes(k)) order.push(k);
  }
  if (!offers.length || order.length !== legCount) return null;
  return offers.map((o) => ({ ...o, leg: legKey(order.indexOf(o.leg || "")) }));
}

/** DEL → BOM → GOI → DEL for legs that follow on; DEL → BOM · GOI → DEL when a leg starts somewhere else. */
export function multiCityTitle(legs: Pick<McLeg, "from" | "to">[]): string {
  const parts: string[][] = [];
  for (const l of legs) {
    const last = parts[parts.length - 1];
    if (last && last[last.length - 1] === l.from) last.push(l.to);
    else parts.push([l.from, l.to]);
  }
  return parts.map((p) => p.join(" → ")).join(" · ");
}

/** Whether any leg leaves India or lands outside it; null when an airport isn't in the built-in list (the server decides). */
export function multiIsInternational(legs: Pick<McLeg, "from" | "to">[]): boolean | null {
  const each = legs.map((l) => tripIsInternational(l.from, l.to));
  if (each.some((x) => x === true)) return true;
  return each.every((x) => x === false) ? false : null;
}
