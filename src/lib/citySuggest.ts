/* =============================================================================
 * TripAgent — src/lib/citySuggest.ts
 * City suggestions for the hotel Search panel's City field, built the same way
 * as the flight From/To suggestions (lib/airportSuggest.ts).
 *
 * GET /hotels/locations proxies to TripSure's hotel host, which can be slow or
 * unreachable from some deployments, so every keystroke used to wait on it.
 * Now: 1 letter is answered at once from the built-in directory (lib/airports.ts,
 * its cities and aliases). From 2 letters the live TripSure result wins only when
 * it answers within LIVE_WAIT_MS; after a failure or timeout it isn't retried for
 * LIVE_RETRY_MS, and the directory fills in so the dropdown always shows something.
 * ===========================================================================*/
import { hotelAutosuggestV2 } from "../services/api";
import { searchAirports } from "./airports";

const LIVE_MIN_CHARS = 2;
// 4s, not 2.5s: TripSure's live list is the only one with areas and single hotels
// (search by hotel name), and it often needs a retry or two to answer.
const LIVE_WAIT_MS = 4000;
const LIVE_RETRY_MS = 60_000;
let liveDownUntil = 0;

// Live TripSure location rows, or null when TripSure is down/slow/empty.
export function liveCities(query: string): Promise<any[] | null> {
  if (Date.now() < liveDownUntil) return Promise.resolve(null);
  const markDown = () => {
    liveDownUntil = Date.now() + LIVE_RETRY_MS;
    return null;
  };
  const live = hotelAutosuggestV2(query)
    .then((r: any) => {
      const rows = (r && r.locationSuggestions) || [];
      return rows.length ? rows : null;
    })
    .catch(markDown);
  // Cleared once the live call settles: an unconditional timer would still fire
  // after a good answer and mark a healthy TripSure as down.
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(markDown()), LIVE_WAIT_MS);
  });
  return Promise.race([live, timeout]).finally(() => clearTimeout(timer));
}

// Cities from the built-in directory, shaped like a locationSuggestions[] entry.
// `_isFallbackDefault` tells the City field there is no real TripSure id behind it,
// so Search resolves the city live, exactly as if it had been typed by hand.
export function directoryCities(query: string, limit = 8): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const a of searchAirports(query, 40)) {
    const key = (a.city + "|" + a.country_code).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: "_dir-" + key,
      name: a.city,
      type: "city",
      state: "",
      country: a.country_code,
      _isFallbackDefault: true,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// Live rows (ranked by the caller) when available, otherwise the directory.
export function citySuggest(query: string, rank: (q: string, rows: any[]) => any[], limit = 8): Promise<any[]> {
  if (!query) return Promise.resolve([]);
  if (query.trim().length < LIVE_MIN_CHARS) return Promise.resolve(directoryCities(query, limit));
  return liveCities(query).then((rows) => (rows ? rank(query, rows) : directoryCities(query, limit)));
}
