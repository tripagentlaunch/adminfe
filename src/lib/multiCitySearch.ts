/* Searching a multi-city trip. TripSure's MULTI_CITY search is asked first (guide 6.2: one search, 2+ segments, results
 * grouped by leg). How it names the groups isn't documented, so the offers are only used when there is exactly one group per
 * leg; otherwise (or if that search is refused) each leg is searched on its own as a one-way search. Either way the offers
 * come back tagged LEG_1 .. LEG_n. The two search calls are passed in, so this stays testable. */
import { legKey, regroupByLeg, type McLeg } from "./multiCity";

export interface TripSearchParams {
  pax: number;
  children: number;
  infants: number;
  cabin: string;
  nationality?: string;
  maxStops?: string;
  refundable?: boolean;
  preferredAirlines?: string[];
  excludedAirlines?: string[];
  signal?: AbortSignal;
}

export interface SearchResult {
  offers: any[];
  errors?: any[];
  /** the answer was empty and no airline supplier answered at all (lib/searchOutage.ts) */
  noSuppliers?: boolean;
  searchKey?: string | null;
}

export interface SearchDeps {
  /** one MULTI_CITY search over all the legs */
  multi: (p: TripSearchParams & { legs: { from: string; to: string; date: string }[] }) => Promise<SearchResult>;
  /** a one-way search of one leg; `keepCache` keeps the offers of the legs answered before it */
  single: (p: TripSearchParams & { originCode: string; destCode: string; date: string; keepCache: boolean }) => Promise<SearchResult>;
  /** forget earlier searches' offers, once, before the legs are searched one by one */
  clearCache: () => void;
}

export interface TripSearchAnswer extends SearchResult {
  /** true when TripSure's single multi-city search answered; false when each leg was searched on its own */
  viaMulti: boolean;
}

const isAbort = (e: any) => !!(e && (e.aborted || e.name === "AbortError"));

export async function searchTrip(legs: McLeg[], p: TripSearchParams, deps: SearchDeps): Promise<TripSearchAnswer> {
  try {
    const r = await deps.multi({ ...p, legs: legs.map((l) => ({ from: l.from, to: l.to, date: l.date })) });
    const tagged = regroupByLeg(r.offers || [], legs.length);
    if (tagged) return { offers: tagged, errors: r.errors || [], viaMulti: true, noSuppliers: !!r.noSuppliers && tagged.length === 0, searchKey: r.searchKey || null };
  } catch (e) {
    if (isAbort(e)) throw e;
    // refused or unreachable: the legs are searched one by one below, which reports its own error if it fails too
  }
  deps.clearCache();
  const answers = await Promise.all(legs.map(async (l, i) => {
    try {
      return await deps.single({ ...p, originCode: l.from, destCode: l.to, date: l.date, keepCache: true });
    } catch (e: any) {
      if (isAbort(e)) throw e;
      e.message = `Flight ${i + 1} (${l.from} → ${l.to}): ${e.message || "the search failed"}`;
      throw e;
    }
  }));
  return {
    offers: answers.flatMap((a, i) => (a.offers || []).map((o) => ({ ...o, leg: legKey(i) }))),
    errors: answers.flatMap((a) => a.errors || []),
    viaMulti: false,
    // Only an outage when EVERY leg came back empty with no supplier answering.
    noSuppliers: answers.length > 0 && answers.every((a) => !!a.noSuppliers),
    searchKey: answers.find((a) => a.searchKey)?.searchKey || null,
  };
}
