/* "Where to eat" in an itinerary (2026-11-16). The restaurants come from our own city guides (GET /hotels/city-guide, the website's
   city pages), never from anywhere else. A pick is copied onto the day as a `dining` entry (name, area, tier, credentials, one line),
   so a proposal that was already sent does not change when the guide does. suggestDining() spreads a city's picks over its days. */
import type { Pick } from "./cityGuideText";

export type DiningEntry = {
  id: string;
  name: string;
  area: string | null;
  tier: string | null;
  credentials: string[];
  description: string | null;
  city: string;
  /** The website's page for the city. */
  url: string | null;
  meal: "lunch" | "dinner" | null;
};

export type DiningGuide = { city: string; slug: string; url?: string | null; eat?: Pick[] };

const slugOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A bar rather than a place to eat: the guide lists a few of them among its restaurants. */
export function isBar(p: Pick): boolean {
  const name = String(p.name || "");
  return /^bar\b/i.test(name) || /\bbar$/i.test(name) || (p.credentials || []).some((c) => /best bars?/i.test(c));
}

const lunchTier = (p: Pick) => p.tier === "Smart" || p.tier === "Casual";

/** One guide pick as a day's dining entry. */
export function diningEntry(p: Pick, guide: DiningGuide, meal: DiningEntry["meal"] = null): DiningEntry {
  return {
    id: `${guide.slug}:${slugOf(p.name)}`,
    name: p.name,
    area: p.area || null,
    tier: p.tier || null,
    credentials: (p.credentials || []).slice(0, 3),
    description: p.description ? String(p.description).trim() : null,
    city: guide.city,
    url: guide.url || null,
    meal,
  };
}

/** The texts that can name a day's city: its own city, its route, and the cities of its hotels. */
export function dayCityTexts(day: any): string[] {
  const out: string[] = [];
  const add = (v: any) => { if (typeof v === "string" && v.trim() && v.trim().length <= 160) out.push(v.trim()); };
  add(day && day.city);
  add(day && day.route);
  ((day && day.items) || []).forEach((it: any) => { if (it.type === "hotel") { add(it.city); add(it.sub); } });
  return out;
}

/** Days a restaurant suggestion makes sense for: a dated day that is not a flight-only travel day. */
export function isMealDay(day: any): boolean {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(String(day._iso || ""))) return false;
  const items: any[] = day.items || [];
  return !(items.some((it) => it.type === "flight") && !items.some((it) => it.type === "hotel"));
}

/**
 * Restaurants for the days that have none yet: day by day, one dinner from the city's best-tier picks, and a lunch when the
 * guide has a Smart / Casual pick left. Nothing repeats and nothing is invented: when a city's picks run out, its later days
 * get no suggestion. A day that already has dining is left exactly as the advisor set it. `guideFor(text)` is the guide a city
 * text names (or undefined). Returns dayId -> entries (only days that got some).
 */
export function suggestDining(days: any[], guideFor: (text: string) => DiningGuide | undefined): Record<string, DiningEntry[]> {
  const used = new Set<string>();
  (days || []).forEach((d) => (d.dining || []).forEach((e: DiningEntry) => used.add(e.id)));
  const pools = new Map<string, { dinner: Pick[]; lunch: Pick[] }>();
  const poolOf = (g: DiningGuide) => {
    let p = pools.get(g.slug);
    if (!p) {
      const food = (g.eat || []).filter((x) => !isBar(x) && !used.has(`${g.slug}:${slugOf(x.name)}`));
      const lunch = food.filter(lunchTier);
      const dinner = food.filter((x) => !lunchTier(x));
      p = dinner.length ? { dinner, lunch } : { dinner: lunch.slice(), lunch: [] }; // a city with only casual picks: they are the dinners
      pools.set(g.slug, p);
    }
    return p;
  };
  const out: Record<string, DiningEntry[]> = {};
  for (const day of days || []) {
    if ((day.dining && day.dining.length) || !isMealDay(day)) continue;
    let guide: DiningGuide | undefined;
    for (const t of dayCityTexts(day)) { guide = guideFor(t); if (guide) break; }
    if (!guide) continue;
    const pool = poolOf(guide);
    const picks: DiningEntry[] = [];
    const lunch = pool.lunch.shift();
    if (lunch) picks.push(diningEntry(lunch, guide, "lunch"));
    const dinner = pool.dinner.shift();
    if (dinner) picks.push(diningEntry(dinner, guide, "dinner"));
    if (picks.length) out[day.id] = picks;
  }
  return out;
}

/** The trip-wide "Where to eat" summary for the proposal's Plan tab: the dining entries of all days, grouped by city, once each. */
export function whereToEatByCity(days: any[], perCity = 5): { city: string; url: string | null; picks: DiningEntry[] }[] {
  const byCity = new Map<string, { city: string; url: string | null; picks: DiningEntry[] }>();
  for (const day of days || []) {
    for (const e of (day.dining || []) as DiningEntry[]) {
      let g = byCity.get(e.city);
      if (!g) byCity.set(e.city, (g = { city: e.city, url: e.url || null, picks: [] }));
      if (!g.picks.some((p) => p.id === e.id) && g.picks.length < perCity) g.picks.push(e);
    }
  }
  return Array.from(byCity.values());
}
