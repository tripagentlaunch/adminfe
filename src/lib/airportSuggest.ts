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

// ---------------------------------------------------------------------------
// Grouped suggestions for New booking (Paytm-style): a city with several airports
// gets a heading ("London, United Kingdom · 6 airports") and its airports under it,
// busiest first, each with its distance from the city centre; other places with
// the same name follow ("London, Canada", "East London"). Distances come from the
// coordinates TripSure returns with each airport, remembered for the session so
// results can also say how far a flight's airport is from the one searched.

type Loc = { lat: number; lon: number };
const AIRPORT_LOC = new Map<string, Loc & { city: string; cc: string; name: string }>();

// Centres of cities with several airports, so "24 km from London city centre" is
// measured from the city itself. Anywhere else, distances are from its busiest airport.
const CITY_CENTRES: Record<string, Loc> = {
  "london|GB": { lat: 51.5074, lon: -0.1278 }, "paris|FR": { lat: 48.8566, lon: 2.3522 },
  "new york|US": { lat: 40.7128, lon: -74.006 }, "tokyo|JP": { lat: 35.6762, lon: 139.6503 },
  "milan|IT": { lat: 45.4642, lon: 9.19 }, "rome|IT": { lat: 41.9028, lon: 12.4964 },
  "moscow|RU": { lat: 55.7558, lon: 37.6173 }, "istanbul|TR": { lat: 41.0082, lon: 28.9784 },
  "dubai|AE": { lat: 25.2048, lon: 55.2708 }, "mumbai|IN": { lat: 19.076, lon: 72.8777 },
  "new delhi|IN": { lat: 28.6139, lon: 77.209 }, "bangkok|TH": { lat: 13.7563, lon: 100.5018 },
  "shanghai|CN": { lat: 31.2304, lon: 121.4737 }, "beijing|CN": { lat: 39.9042, lon: 116.4074 },
  "seoul|KR": { lat: 37.5665, lon: 126.978 }, "osaka|JP": { lat: 34.6937, lon: 135.5023 },
  "washington|US": { lat: 38.9072, lon: -77.0369 }, "chicago|US": { lat: 41.8781, lon: -87.6298 },
  "los angeles|US": { lat: 34.0522, lon: -118.2437 }, "san francisco|US": { lat: 37.7749, lon: -122.4194 },
  "houston|US": { lat: 29.7604, lon: -95.3698 }, "dallas|US": { lat: 32.7767, lon: -96.797 },
  "miami|US": { lat: 25.7617, lon: -80.1918 }, "toronto|CA": { lat: 43.6532, lon: -79.3832 },
  "montreal|CA": { lat: 45.5019, lon: -73.5674 }, "sao paulo|BR": { lat: -23.5505, lon: -46.6333 },
  "rio de janeiro|BR": { lat: -22.9068, lon: -43.1729 }, "buenos aires|AR": { lat: -34.6037, lon: -58.3816 },
  "stockholm|SE": { lat: 59.3293, lon: 18.0686 }, "oslo|NO": { lat: 59.9139, lon: 10.7522 },
  "berlin|DE": { lat: 52.52, lon: 13.405 }, "brussels|BE": { lat: 50.8503, lon: 4.3517 },
  "venice|IT": { lat: 45.4408, lon: 12.3155 }, "glasgow|GB": { lat: 55.8642, lon: -4.2518 },
  "kuala lumpur|MY": { lat: 3.139, lon: 101.6869 }, "jakarta|ID": { lat: -6.2088, lon: 106.8456 },
  "taipei|TW": { lat: 25.033, lon: 121.5654 }, "bengaluru|IN": { lat: 12.9716, lon: 77.5946 },
};

const fold = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function km(a: Loc, b: Loc): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

function locOf(row: any): Loc | null {
  const l = row && row.location;
  const lat = Number(l?.lat), lon = Number(l?.lon ?? l?.lng);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
}

export type AirportItem = any & {
  heading?: boolean; key?: string; count?: number; nested?: boolean; distance?: { km: number; from: string } | null;
};

export function groupedAirportSuggest(query: string): Promise<AirportItem[]> {
  return airportAutosuggest(query, 15).then((rows) => {
    rows.forEach((r: any) => {
      const l = locOf(r);
      if (l && r.airport_code) AIRPORT_LOC.set(r.airport_code, { ...l, city: r.city, cc: r.country_code, name: r.airport_name });
    });
    const q = fold(query);
    const groups = new Map<string, { rows: any[]; first: number }>();
    rows.forEach((r: any, i: number) => {
      const key = `${fold(r.city)}|${String(r.country_code || r.country || "").toUpperCase()}`;
      const g = groups.get(key) || { rows: [], first: i };
      g.rows.push({ ...r, _i: i });
      groups.set(key, g);
    });
    const pop = (r: any) => Number(r.popularity_score) || 0;
    const ordered = Array.from(groups.entries()).sort(([ka, a], [kb, b]) => {
      // A city named exactly what was typed first, then the busier city, then TripSure's order.
      const ea = ka.split("|")[0] === q ? 1 : 0, eb = kb.split("|")[0] === q ? 1 : 0;
      return eb - ea || Math.max(...b.rows.map(pop)) - Math.max(...a.rows.map(pop)) || a.first - b.first;
    });
    const out: AirportItem[] = [];
    for (const [key, g] of ordered) {
      const list = g.rows.sort((a, b) => pop(b) - pop(a) || a._i - b._i);
      if (list.length === 1) {
        out.push(list[0]);
        continue;
      }
      const top = list[0];
      const centre = CITY_CENTRES[`${fold(top.city)}|${String(top.country_code || "").toUpperCase()}`];
      const from = centre ? { loc: centre, label: `${top.city} city centre` } : (locOf(top) ? { loc: locOf(top) as Loc, label: top.airport_code } : null);
      out.push({ heading: true, key: `h|${key}`, city: top.city, country: top.country, count: list.length });
      list.forEach((r, i) => {
        const l = locOf(r);
        const distance = from && l && !(i === 0 && !centre) ? { km: km(from.loc, l), from: from.label } : null;
        out.push({ ...r, nested: true, distance });
      });
    }
    return out;
  });
}

/** Distance in km between two airports seen in this session's suggestions, if both are known. */
export function airportDistance(a: string, b: string): number | null {
  const x = AIRPORT_LOC.get(a), y = AIRPORT_LOC.get(b);
  return x && y ? km(x, y) : null;
}

/** Other airports within `maxKm` of this one (same city or close by), nearest first. */
export function nearbyAirports(code: string, maxKm = 150): { code: string; name: string; city: string; km: number }[] {
  const me = AIRPORT_LOC.get(code);
  if (!me) return [];
  return Array.from(AIRPORT_LOC.entries())
    .filter(([c]) => c !== code)
    .map(([c, v]) => ({ code: c, name: v.name, city: v.city, km: km(me, v) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km);
}
