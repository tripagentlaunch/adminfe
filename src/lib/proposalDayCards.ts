/* The proposal's Days tab: one card per calendar day of the trip (photo, "DAY 1", "Thu, 24 Dec · title", what is planned, what is
   booked that day, where to eat). Built only from what the proposal data already holds; nothing is invented. */

export type DayCard = {
  n: number;
  /** "Thu, 24 Dec" */
  dateLabel: string;
  title: string;
  description: string | null;
  /** What is booked that day: the stay ("Felix Homes · 2 nights"), arrival and departure times. */
  facts: string[];
  /** What to look the day's photo up by; null when the day has no place to show. */
  photoQuery: string | null;
  /** The photo of the hotel the traveller sleeps at that night (TripSure's own gallery for the hotel), when there is one. */
  stayPhoto: { url: string; hotel: string } | null;
  dining: any[];
  /** What to do / a night out that day, each with a per-person estimate. */
  activities: any[];
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, a, b) => a + b.toUpperCase());

export function fmtDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/^(\w+) /, "$1, ");
}

const dayNo = (iso: string) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);

/** The photo for a day: the hotel the traveller wakes up in (check-in <= day < check-out), else the hotel they leave that morning.
 *  TripSure's gallery for the hotel (facts.images) first, one picture per night so a long stay does not repeat itself, then the stay's
 *  own image. null when no hotel covers the day or none has a photo. */
export function stayPhotoFor(stays: any[] | undefined, iso: string): { url: string; hotel: string } | null {
  if (!iso || !stays || !stays.length) return null;
  const stay = stays.find((s) => s.checkIn && s.checkOut && iso >= s.checkIn && iso < s.checkOut) || stays.find((s) => s.checkOut === iso);
  if (!stay) return null;
  const gallery = Array.from(new Set([...(((stay.facts && stay.facts.images) || []) as any[]), stay.image].filter((u) => typeof u === "string" && u))) as string[];
  if (!gallery.length) return null;
  const night = Math.max(0, dayNo(iso) - dayNo(stay.checkIn));
  return { url: gallery[night % gallery.length], hotel: String(stay.name || "").split(",")[0] };
}

export function buildDayCards(data: any, stays?: any[]): DayCard[] {
  const cal: any[] = data.calendarDays || [];
  const plan: any[] = data.dayPlan || [];
  const blocks: any[] = data.calendarBlocks || [];
  const captions: Record<number, string> = data.calendarCaptions || {};
  const place = (b: any) => (b && !b.isHome && b.label ? titleCase(String(b.label)) : null);

  if (cal.length) {
    return cal.map((c, i) => {
      const p = plan.find((x) => x.iso && x.iso === c.iso) || plan.find((x) => !x.iso && plan.length === cal.length && plan.indexOf(x) === i) || null;
      const b = blocks.find((x) => i >= x.startIdx && i < x.startIdx + x.span) || null;
      const facts = [b && !b.isHome && b.sub ? b.sub : null, captions[i] || null].filter(Boolean) as string[];
      const dining = (p && p.dining) || [];
      return {
        n: i + 1,
        dateLabel: (p && p.date) || fmtDayLabel(c.iso),
        title: (p && p.title) || (b && b.label ? (place(b) || String(b.label)) : ""),
        description: (p && p.description) || null,
        facts,
        photoQuery: (p && p.photoQuery) || place(b) || (dining[0] && dining[0].city) || data.destination || null,
        stayPhoto: stayPhotoFor(stays || data.stays, c.iso),
        dining,
        activities: (p && p.activities) || [],
      };
    });
  }
  // No dated calendar (a plan with no dates yet): the days of the plan, in order.
  return plan.map((p, i) => ({
    n: i + 1,
    dateLabel: p.date || "",
    title: p.title || p.label || "",
    description: p.description || null,
    facts: [],
    photoQuery: p.photoQuery || (p.dining && p.dining[0] && p.dining[0].city) || data.destination || null,
    stayPhoto: stayPhotoFor(stays || data.stays, p.iso || ""),
    dining: p.dining || [],
    activities: p.activities || [],
  }));
}
