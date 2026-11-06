/* TripSure's SSR catalog (guide 6.5) is keyed by sector. Live the key is "{providerId}_ORIGIN$DEST" ("2_DEL$BOM");
 * the guide's sample has the bare "DEL$BOM". Both are the same sector. */

/** Whether a catalog key is the sector `origin` → `dest`. */
export function sectorKeyMatches(key: string, origin?: string, dest?: string): boolean {
  if (!origin || !dest) return false;
  const tail = `${origin}$${dest}`;
  return key === tail || key.endsWith(`_${tail}`);
}

/** The one catalog entry for `origin` → `dest`; null when there is none or several (never a guess). */
export function findSector<T = any>(catalog: Record<string, T> | null | undefined, origin?: string, dest?: string): T | null {
  const data = catalog || {};
  const hits = Object.keys(data).filter((k) => sectorKeyMatches(k, origin, dest));
  return hits.length === 1 ? data[hits[0]] : null;
}
