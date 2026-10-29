/* =============================================================================
 * TripAgent — src/lib/airportSuggest.ts
 * Shared From/To airport suggestions for every flight field (FlightDesk's
 * Search panel and the order page's "Add flight itinerary" modal).
 *
 * GET /flights/autosuggest requires a real advisor session and proxies to
 * TripSure's flight host, which is IP-restricted and unreachable from some
 * deployments (it blocks Render) — there the backend waits out its own 10s
 * timeout before failing. So live results win only when TripSure answers
 * within LIVE_WAIT_MS; after a failure or timeout it isn't retried for
 * LIVE_RETRY_MS, and the built-in directory (lib/airports.ts) fills in so the
 * dropdown always shows something while typing.
 * ===========================================================================*/
import { fastapiFlightAutosuggest } from "../services/api";
import { searchAirports } from "./airports";

// TripSure's flight autosuggest returns nothing for a 1-character query and
// GET /flights/autosuggest rejects q shorter than 2 (422, which would also trip
// the 60s breaker below) — so 1 letter is answered from the directory alone.
const LIVE_MIN_CHARS = 2;
const LIVE_WAIT_MS = 2500;
const LIVE_RETRY_MS = 60_000;
let liveAutosuggestDownUntil = 0;

// Answers already fetched this session, by query: airports don't change, so retyping "BL" or
// reopening the booking modal never asks TripSure twice. Only real answers are kept.
const liveCache = new Map<string, any[]>();

// Live TripSure rows, or null when TripSure is down/slow/empty.
export function liveAirports(query: string, limit: number): Promise<any[] | null> {
  const key = `${query.trim().toLowerCase()}|${limit}`;
  const hit = liveCache.get(key);
  if (hit) return Promise.resolve(hit);
  if (Date.now() < liveAutosuggestDownUntil) return Promise.resolve(null);
  const markDown = () => {
    liveAutosuggestDownUntil = Date.now() + LIVE_RETRY_MS;
    return null;
  };
  const live = fastapiFlightAutosuggest(query, limit)
    .then((r: any) => {
      const rows = Array.isArray(r) ? r : (r && r.data) || [];
      if (rows.length) liveCache.set(key, rows);
      return rows.length ? rows : null;
    })
    .catch(markDown);
  // Cleared once the live call settles — an unconditional timer would still
  // fire after a successful answer and mark a healthy TripSure as down.
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(markDown()), LIVE_WAIT_MS);
  });
  return Promise.race([live, timeout]).finally(() => clearTimeout(timer));
}

// Live rows when available, otherwise the built-in directory. Empty query -> [].
export function airportAutosuggest(query: string, limit = 8): Promise<any[]> {
  if (!query) return Promise.resolve([]);
  if (query.trim().length < LIVE_MIN_CHARS) return Promise.resolve(searchAirports(query, limit));
  return liveAirports(query, limit).then((rows) => rows || searchAirports(query, limit));
}
