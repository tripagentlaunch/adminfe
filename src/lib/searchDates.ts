/* Dates for flight search (guide 6.2: "departure dates must be today or later"). Plain YYYY-MM-DD strings,
 * worked out in UTC so the advisor's timezone can't shift them by a day. */

/** The date `days` away from `dateStr` (YYYY-MM-DD). */
export function offsetDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The ±`spread`-day window around `dateStr` for a "nearby dates" search, without the days before `today`
 *  (TripSure refuses those). The date asked for is always kept. */
export function nearbyDates(dateStr: string, today: string, spread = 3): string[] {
  const out: string[] = [];
  for (let n = -spread; n <= spread; n++) {
    const d = offsetDateStr(dateStr, n);
    if (d >= today || d === dateStr) out.push(d);
  }
  return out;
}
