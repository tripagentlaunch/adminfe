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
