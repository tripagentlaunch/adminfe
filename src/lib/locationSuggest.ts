/* =============================================================================
 * TripAgent — src/lib/locationSuggest.ts
 * Re-rank for hotel destination suggestions (GET /hotels/locations).
 *
 * TripSure caps the list at 5 and orders it by its own relevance score, which
 * for a 1-2 letter query puts alias/loose matches (e.g. "c" -> Madikeri,
 * Kolkata) among or above places whose name actually starts with the letters.
 * For short queries only, a stable sort floats name-prefix matches, then
 * word-prefix matches, above the rest; TripSure's order is kept within each
 * group. Longer queries are returned untouched.
 * ===========================================================================*/

const SHORT_QUERY_MAX = 2;

function fold(s: string): string {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function rankLocationSuggestions(query: string, rows: any[]): any[] {
  const q = fold(query).trim();
  if (!q || q.length > SHORT_QUERY_MAX || !Array.isArray(rows)) return rows;
  const tier = (r: any) => {
    const name = fold(r.name);
    if (name.startsWith(q)) return 0;
    if (name.split(/[\s,-]+/).some((w) => w.startsWith(q))) return 1;
    return 2;
  };
  return rows
    .map((r, i) => ({ r, i, t: tier(r) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.r);
}

/* ---------------------------------------------------------------------------
 * Drill-downs. A TripSure location suggestion also carries popular_locations /
 * popular_poi / popular_hotels: places inside the picked destination. The hotel
 * search form shows them as chips under the City field so the advisor can narrow
 * "Goa" to "North Goa", "Calangute Beach" or a single hotel in one click.
 * ------------------------------------------------------------------------- */

export type DrillGroup = {
  key: "popular_locations" | "popular_poi" | "popular_hotels";
  label: string;
  /** TripSure location type used when the entry has none of its own. */
  type: string;
  items: any[];
};

const DRILL_GROUPS: Omit<DrillGroup, "items">[] = [
  { key: "popular_locations", label: "Popular areas", type: "City" },
  { key: "popular_poi", label: "Nearby attractions", type: "PointOfInterest" },
  { key: "popular_hotels", label: "Popular hotels", type: "Hotel" },
];

/** The non-empty drill-down groups of a picked location (entries without a name or id are dropped, duplicates merged). */
export function popularDrilldowns(loc: any, perGroup = 8): DrillGroup[] {
  if (!loc) return [];
  const out: DrillGroup[] = [];
  for (const g of DRILL_GROUPS) {
    const rows = Array.isArray(loc[g.key]) ? loc[g.key] : [];
    const seen = new Set<string>();
    const items: any[] = [];
    for (const r of rows) {
      if (!r || !r.name || r.id == null || r.id === "") continue;
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(r);
      if (items.length >= perGroup) break;
    }
    if (items.length) out.push({ ...g, items });
  }
  return out;
}

/**
 * The location to search when a drill-down entry is clicked, shaped like a
 * locationSuggestions[] entry (state/country come from the parent when the entry has none).
 * Null when the entry has no usable coordinates: the listing call needs lat/lon, so the
 * caller then leaves the location empty and Search resolves the typed name live, the same
 * as if the advisor had typed it.
 */
export function drilldownLocation(parent: any, item: any, group: Pick<DrillGroup, "type">): any | null {
  const c = item && item.coordinates;
  const lat = c && c.lat != null && c.lat !== "" ? Number(c.lat) : NaN;
  const lon = c && c.lon != null && c.lon !== "" ? Number(c.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = parent || {};
  return {
    ...item,
    id: String(item.id),
    type: item.type || group.type,
    state: item.state || p.state || "",
    country: item.country || p.country || "",
    coordinates: { lat, lon },
  };
}
