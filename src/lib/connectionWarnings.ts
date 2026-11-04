/* =============================================================================
 * TripAgent — src/lib/connectionWarnings.ts
 *
 * What an advisor should know about a connecting flight before choosing it, from its segments alone:
 * a connection that is too tight to make, a very long or overnight layover, and a change of airport (the bags
 * have to be collected and checked in again). From the reference platform's fare-construction advisory,
 * limited to what TripSure's search results actually give (airports and local times per segment).
 * Advice only: it never blocks a booking.
 * ===========================================================================*/
export type Seg = { departureAirport?: string; arrivalAirport?: string; departureDateTime?: string; arrivalDateTime?: string };
export type ConnectionWarning = { code: "tight" | "long" | "overnight" | "airport_change"; severity: "warn" | "info"; short: string; text: string };

const TIGHT_DOMESTIC_MIN = 60;
const TIGHT_INTERNATIONAL_MIN = 90;
const LONG_LAYOVER_MIN = 6 * 60;
const OVERNIGHT_MIN = 4 * 60;

const when = (iso?: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};
const hm = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;

export function connectionWarnings(segs: Seg[], international: boolean): ConnectionWarning[] {
  const out: ConnectionWarning[] = [];
  for (let i = 0; i + 1 < (segs || []).length; i++) {
    const a = segs[i], b = segs[i + 1];
    if (!a.arrivalAirport || !b.departureAirport) continue;
    if (a.arrivalAirport !== b.departureAirport) {
      out.push({ code: "airport_change", severity: "warn", short: `Changes airport ${a.arrivalAirport}→${b.departureAirport}`,
        text: `Arrives at ${a.arrivalAirport} but the next flight leaves from ${b.departureAirport}: bags must be collected and checked in again, with time to cross town.` });
      continue;
    }
    const arr = when(a.arrivalDateTime), dep = when(b.departureDateTime);
    if (arr == null || dep == null || dep < arr) continue;
    const min = Math.round((dep - arr) / 60000);
    const at = a.arrivalAirport;
    if (min < (international ? TIGHT_INTERNATIONAL_MIN : TIGHT_DOMESTIC_MIN)) {
      out.push({ code: "tight", severity: "warn", short: `Tight connection ${min} min`, text: `Only ${min} minutes to change flights at ${at}: a late arrival would miss the connection.` });
    } else if (min >= OVERNIGHT_MIN && String(a.arrivalDateTime).slice(0, 10) !== String(b.departureDateTime).slice(0, 10)) {
      out.push({ code: "overnight", severity: "info", short: `Overnight at ${at}`, text: `${hm(min)} at ${at}, overnight: the customer may need a hotel.` });
    } else if (min >= LONG_LAYOVER_MIN) {
      out.push({ code: "long", severity: "info", short: `Long layover ${hm(min)}`, text: `${hm(min)} waiting at ${at}.` });
    }
  }
  return out;
}
