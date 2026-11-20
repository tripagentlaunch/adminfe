/* The proposal's Suggestions tab: which kinds of places there are (where to eat, things to do, a night out), and what they add up to.
   Built from what the advisor added; nothing is invented. */

export type SuggestionKind = { key: "eat" | "do" | "party"; label: string; count: number; groups: { city: string; url: string | null; picks: any[] }[] };

export function suggestionKinds(data: any): SuggestionKind[] {
  const out: SuggestionKind[] = [];
  const eat = (data && data.whereToEat) || [];
  const eatCount = eat.reduce((n: number, g: any) => n + ((g.picks || []).length), 0);
  if (eatCount) out.push({ key: "eat", label: "Where to eat", count: eatCount, groups: eat.map((g: any) => ({ city: g.city, url: g.url || null, picks: g.picks || [] })) });
  for (const [key, label] of [["do", "Things to do"], ["party", "A night out"]] as const) {
    const groups = ((data && data.placesToGo) || []).filter((g: any) => g.kind === key);
    const count = groups.reduce((n: number, g: any) => n + ((g.picks || []).length), 0);
    if (count) out.push({ key, label, count, groups: groups.map((g: any) => ({ city: g.city, url: g.url || null, picks: g.picks || [] })) });
  }
  return out;
}

/** What the suggestions add up to on the ground: the sum of the estimates that came with them (for the whole party), with how many of the
 *  suggestions had one. null when none did. Free places count as 0. */
export function suggestionCost(kinds: SuggestionKind[]): { low: number; high: number; pax: number; counted: number; total: number } | null {
  let low = 0, high = 0, pax = 0, counted = 0, total = 0;
  for (const k of kinds) for (const g of k.groups) for (const p of g.picks) {
    total++;
    const e = p && p.est;
    if (!e) continue;
    const tl = Number(e.totalLow != null ? e.totalLow : e.low), th = Number(e.totalHigh != null ? e.totalHigh : e.high);
    if (!Number.isFinite(tl) || !Number.isFinite(th)) continue;
    low += tl; high += th; counted++;
    pax = Math.max(pax, Number(e.pax) || 0);
  }
  return counted ? { low, high, pax, counted, total } : null;
}
