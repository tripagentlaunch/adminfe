/* An itinerary proposal link in a message: .../trips/<key>. The customer's Tara chat
 * (chatbot-fe MessageBubble) takes these links out of the text and draws a card for each;
 * the advisor's Conversation tab does the same, with this same matching, so both sides
 * read the same message the same way. */

const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
// Punctuation that ends a sentence, not the URL ("…/trips/abc." or "(…/trips/abc)").
const TRAILING_RE = /[.,;:!?'")\]*_]+$/;
const TRIP_PATH_RE = /^\/trips\/([A-Za-z0-9_-]+)\/?$/;

export type TripLink = { key: string; url: string };

function tripKeyOf(href: string): string | null {
  try {
    const m = TRIP_PATH_RE.exec(new URL(href).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** The message without its itinerary links, and those links (in order, once each). */
export function pullTripLinks(text: string): { rest: string; links: TripLink[] } {
  const links: TripLink[] = [];
  let rest = "";
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    let href = m[2] ?? m[3];
    let tail = "";
    if (!m[2]) {
      const t = href.match(TRAILING_RE);
      tail = t ? t[0] : "";
      href = href.slice(0, href.length - tail.length);
    }
    const key = tripKeyOf(href);
    if (!key) continue;
    if (!links.some((l) => l.key === key)) links.push({ key, url: href });
    rest += text.slice(last, start) + tail;
    last = start + m[0].length;
  }
  rest += text.slice(last);
  return { rest: rest.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), links };
}

const nightsText = (n: number) => n + " night" + (n === 1 ? "" : "s");

/** "4 – 7 Dec", "28 Nov – 3 Dec", or "4 Dec" for a one-day trip; the year only when it is not this year's. */
export function datesText(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const a = new Date(start + "T00:00:00");
  if (isNaN(a.getTime())) return "";
  const withYear = a.getFullYear() !== new Date().getFullYear();
  const d = (x: Date, o: Intl.DateTimeFormatOptions) => x.toLocaleDateString("en-GB", o);
  const full = (x: Date) => d(x, Object.assign({ day: "numeric", month: "short" } as Intl.DateTimeFormatOptions, withYear ? { year: "numeric" } : {}));
  const b = end ? new Date(end + "T00:00:00") : null;
  if (!b || isNaN(b.getTime()) || b.getTime() === a.getTime()) return full(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return d(a, { day: "numeric" }) + " – " + full(b);
  return d(a, { day: "numeric", month: "short" }) + " – " + full(b);
}

/** The card's second line: "1 – 10 Dec · 9 nights", or "Itinerary proposal" when the plan has neither. */
export function cardMeta(start?: string | null, end?: string | null, nights?: number | null): string {
  const parts = [datesText(start, end), nights ? nightsText(nights) : ""].filter(Boolean);
  return parts.join(" · ") || "Itinerary proposal";
}

/** Places are shown when there are several, or one the title does not already name. */
export function cardPlaces(title: string, places?: string[] | null): string {
  const list = places || [];
  return list.length > 1 || (list.length === 1 && !title.toLowerCase().includes(list[0].toLowerCase())) ? list.join(" · ") : "";
}
