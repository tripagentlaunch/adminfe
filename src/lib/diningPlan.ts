/* "Where to eat" in an itinerary. The restaurants are the ones our website's city page lists (GET /hotels/where-to-eat); the advisor
   adds one to a day with the "+" on its card, and nothing is ever added for them. An added restaurant is copied onto the day as a
   `dining` entry, with how far it is from the hotel the advisor was looking at (a snapshot: a proposal that was already sent does
   not change when the guide does). */

export type EatItem = {
  id: string; name: string; tier?: string | null; area?: string | null; tag?: string | null; credentials?: string[];
  description?: string | null; photo?: string | null; place_id?: string | null;
};
export type EatGuide = { city: string; slug: string; url: string; source?: string; items: EatItem[] };
export type EatDistance = { km: number; minutes: number | null; approx: boolean };

export type DiningEntry = {
  id: string;
  name: string;
  area: string | null;
  tier: string | null;
  tag: string | null;
  credentials: string[];
  description: string | null;
  photo: string | null;
  city: string;
  /** The website's page for the city. */
  url: string | null;
  /** How far it is from the hotel the advisor added it for; null when that is not known. */
  distance: { km: number; minutes: number | null; approx: boolean; hotel: string } | null;
  /** Older entries (before 2026-11-17) carried the meal. */
  meal?: "lunch" | "dinner" | null;
};

export type DayHotel = { name: string; city: string; lat: number; lng: number };

/** A card of the city page as a day's dining entry. */
export function diningEntry(item: EatItem, guide: Pick<EatGuide, "city" | "url">, distance?: EatDistance | null, hotel?: DayHotel | null): DiningEntry {
  return {
    id: item.id,
    name: item.name,
    area: item.area || null,
    tier: item.tier || null,
    tag: item.tag || null,
    credentials: (item.credentials || []).filter((c) => typeof c === "string" && c.trim()),
    description: item.description ? String(item.description).trim() : null,
    photo: item.photo || null,
    city: guide.city,
    url: guide.url || null,
    distance: distance && hotel ? { km: distance.km, minutes: distance.minutes, approx: distance.approx, hotel: hotel.name } : null,
  };
}

// Where the customer site lives in THIS environment. The guide's own URLs say www.tripagent.vip (the live site); on the
// dev / preprod deployment they must open the preprod site instead. NEXT_PUBLIC_CUSTOMER_SITE_URL (else NEXT_PUBLIC_SITE_BASE_URL)
// sets it per deployment; without either, the dev admin (adminfe-delta) falls back to customerfe-dev, and everything else keeps the guide's URL.
const DEV_ADMIN_HOSTS = ["adminfe-delta.vercel.app"];
const DEV_CUSTOMER_SITE = "https://customerfe-dev.vercel.app";
function customerSiteBase(): string | null {
  const set = (process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_SITE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (set) return set;
  if (typeof window !== "undefined" && DEV_ADMIN_HOSTS.includes(window.location.hostname)) return DEV_CUSTOMER_SITE;
  return null;
}

/** The website's city page opened on its "Where to eat" tab and scrolled to it (the page reads ?guide=eat), instead of its top.
 *  A tripagent.vip address is pointed at this environment's customer site (see customerSiteBase). */
export function eatGuideUrl(url: string | null | undefined, tab: "eat" | "do" | "party" = "eat"): string {
  if (!url) return "";
  const site = customerSiteBase();
  if (site) {
    const m = url.match(/^https?:\/\/(?:[\w-]+\.)*tripagent\.vip(?=[/?#]|$)/i);
    if (m) url = site + url.slice(m[0].length);
  }
  if (/[?&]guide=/.test(url)) return url;
  const [base, hash] = url.split("#");
  return base + (base.includes("?") ? "&" : "?") + "guide=" + tab + (hash ? "#" + hash : "");
}

/** "3.2 km from Taj West End · 11 min drive", or "about 7.1 km (straight line) from ..." when there is no road answer. */
export function distanceText(d: DiningEntry["distance"] | (EatDistance & { hotel?: string }) | null | undefined, hotelName?: string): string {
  if (!d) return "";
  const hotel = (d as any).hotel || hotelName || "the hotel";
  const km = d.km < 10 ? d.km.toFixed(1) : String(Math.round(d.km));
  return d.approx ? `about ${km} km (straight line) from ${hotel}` : `${km} km from ${hotel}${d.minutes ? ` · ${d.minutes} min drive` : ""}`;
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

const addDays = (iso: string, n: number) => {
  const t = Date.parse(iso + "T00:00:00Z");
  return Number.isNaN(t) ? iso : new Date(t + n * 86_400_000).toISOString().slice(0, 10);
};

/**
 * The hotel a restaurant is measured from for one day of the trip: the hotel on that day, else the stay whose nights cover it,
 * else the trip's first hotel. Only hotels with a map position count (never a guessed one). null when there is none.
 */
export function hotelForDay(days: any[], dayId: string): DayHotel | null {
  const stays: { from: string; to: string; hotel: DayHotel }[] = [];
  for (const d of days || []) {
    for (const it of d.items || []) {
      const lat = Number(it.lat), lng = Number(it.lng);
      if (it.type !== "hotel" || it.lat == null || it.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(d._iso || "") ? d._iso : "";
      const nights = parseInt(String(it.duration || "1"), 10) || 1;
      stays.push({ from: iso, to: iso ? addDays(iso, nights) : "", hotel: { name: String(it.title || "Your hotel"), city: String(it.city || it.cityName || ""), lat, lng } });
    }
  }
  if (!stays.length) return null;
  const day = (days || []).find((d) => d.id === dayId);
  const iso = day && /^\d{4}-\d{2}-\d{2}$/.test(day._iso || "") ? day._iso : "";
  const cover = iso ? stays.find((s) => s.from && iso >= s.from && iso < s.to) || stays.find((s) => s.from === iso) : null;
  return (cover || stays[0]).hotel;
}

/** The trip-wide "Where to eat" summary for the proposal's Plan tab: the dining entries of all days, grouped by city, once each. */
export function whereToEatByCity(days: any[], perCity = 60): { city: string; url: string | null; picks: DiningEntry[] }[] {
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

/* The card the website's city page draws for a restaurant (pages/CityPage.tsx): one headline tag, then every award in its own box. */
const TAG_MAX = 40;

// "Established 1916 - a living institution" -> its shorter half, or the whole when it already fits.
function headlineTag(full: string): string {
  if (full.length <= TAG_MAX) return full;
  const halves = full.split(/\s+[—–-]\s+|:\s+/).map((h) => h.trim()).filter((h) => h.length >= 6);
  const fits = halves.filter((h) => h.length <= TAG_MAX).sort((a, b) => a.length - b.length);
  return fits[0] ?? full;
}

/** The headline tag (the guide's own tag, else the first award shortened) and the awards listed under it. */
export function cardTags(e: Pick<DiningEntry, "tag" | "credentials">): { headline: string | null; rest: string[] } {
  const creds = e.credentials || [];
  return { headline: e.tag || (creds[0] ? headlineTag(creds[0]) : null), rest: e.tag ? creds : creds.slice(1) };
}

/** The tiers present among restaurants, in the page's order (Destination, Fine, Smart, Casual, then any other). */
export function tiersOf(entries: Pick<DiningEntry, "tier">[]): string[] {
  const order = ["Destination", "Fine", "Smart", "Casual"];
  const present = Array.from(new Set(entries.map((e) => e.tier || "Picks")));
  return present.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
}
