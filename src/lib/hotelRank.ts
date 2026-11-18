// Which hotel to recommend to the advisor (2026-11-13): the system ranks what TripSure lists, so the advisor does not have to
// know the best hotel in every city. Used by the Add-a-hotel popup's "Recommended" sort and its "5-star and top-rated" filter.
//
// Every TripAgent member is HNI / UHNI, so luxury is the default: only 5-star hotels, and of those only ones guests rate very
// highly (Google 4.3+ once 50+ people have rated it). The score weighs quality 45%, closeness to the place searched 25%, price 10%
// (a hotel with no price listed scores neutral), free cancellation 8%, breakfast 7%, a small lift for a flagship luxury name and a
// bigger one for a hotel on our own city guide (by the guide's tier). With luxury switched off the weights are the general ones
// (35 / 25 / 20 / 10 / 10) and no star floor applies. If a place has no 5-star hotel, 4-star hotels rated 4.5+ (or not rated yet)
// are shown instead.
import { offerNet } from "./hotelListing";
import { sameHotelName } from "./livePriceRequest";

export type Rating = { rating: number; reviews: number } | null;
export type GuideStay = { name: string; tier?: string | null; credentials?: string[] };
export type HotelRankCtx = {
  lat?: number | null;
  lon?: number | null;
  where?: string;
  nights: number;
  rooms: number;
  /** Google guest ratings by hotel name (null = looked up, none found; missing = not looked up). */
  ratings?: Record<string, Rating | undefined>;
  /** The website's stay picks for the city. */
  guide?: GuideStay[];
  luxury: boolean;
};
export type HotelRec = { score: number; reasons: string[]; rank: number };

export const LUX_MIN_RATING = 4.3;
export const LUX_MIN_REVIEWS = 50;
export const LUX_FALLBACK_RATING = 4.5;
const NEAR_KM = 6;
const GUIDE_LIFT: Record<string, number> = { Ultra: 0.12, Luxury: 0.08, Grand: 0.03 };
const LUXURY_BRANDS = [
  "aman", "four seasons", "ritz-carlton", "ritz carlton", "st. regis", "st regis", "mandarin oriental", "park hyatt", "peninsula",
  "raffles", "bulgari", "bvlgari", "rosewood", "oberoi", "taj", "leela", "waldorf astoria", "one&only", "one and only", "belmond",
  "six senses", "jw marriott", "conrad", "fairmont", "shangri-la", "w hotel", "armani", "capella", "cheval blanc", "dorchester",
];

const nameOf = (o: any): string => String((o && o.detail && o.detail.hotelName) || "");
const starsOf = (o: any): number => Number((o && o.detail && o.detail.stars) || 0);
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function luxuryBrand(name: string): string | null {
  const n = name.toLowerCase();
  return LUXURY_BRANDS.find((b) => new RegExp("(?<![a-z0-9])" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z0-9])").test(n)) || null;
}

function km(lat1?: number | null, lon1?: number | null, lat2?: number | null, lon2?: number | null): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const r = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const ratingOf = (ctx: Pick<HotelRankCtx, "ratings">, o: any): Rating => (ctx.ratings && ctx.ratings[nameOf(o)]) || null;

/** The offers a luxury view keeps: 5-star (else 4-star rated 4.5+ or unrated), without any that guests rate under 4.3. */
export function luxuryPool(offers: any[], ratings: Record<string, Rating | undefined> = {}): any[] {
  const rated = (o: any) => ratings[nameOf(o)] || null;
  let pool: any[] = [];
  for (let floor = 5; floor >= 1; floor--) {
    pool = offers.filter((o) => starsOf(o) >= floor);
    if (floor < 5) pool = pool.filter((o) => !rated(o) || (rated(o) as any).rating >= LUX_FALLBACK_RATING).length ? pool.filter((o) => !rated(o) || (rated(o) as any).rating >= LUX_FALLBACK_RATING) : pool;
    if (pool.length) break;
  }
  if (!pool.length) return offers;
  const good = pool.filter((o) => !(rated(o) && (rated(o) as any).reviews >= LUX_MIN_REVIEWS && (rated(o) as any).rating < LUX_MIN_RATING));
  return good.length ? good : pool;
}

/** `offers` best first, each with `_rec` { score, reasons, rank }. */
export function rankHotels(offers: any[], ctx: HotelRankCtx): any[] {
  const nights = Math.max(1, ctx.nights || 1), rooms = Math.max(1, ctx.rooms || 1);
  const pn = (o: any) => (offerNet(o) > 0 ? offerNet(o) / nights / rooms : null);
  const prices = offers.map(pn).filter((x): x is number => x != null);
  const lo = prices.length ? Math.min(...prices) : 0, hi = prices.length ? Math.max(...prices) : 0;
  const [wq, wl, wv, wc, wb] = ctx.luxury ? [0.45, 0.25, 0.1, 0.08, 0.07] : [0.35, 0.25, 0.2, 0.1, 0.1];
  const scored = offers.map((o) => {
    const d = o.detail || {};
    const stars = starsOf(o);
    const r = ratingOf(ctx, o);
    let quality: number;
    if (r && r.rating) {
      const conf = Math.min(1, (r.reviews || 0) / 200);
      const guest = Math.min(1, Math.max(0, (r.rating - 3) / 2));
      quality = guest * conf + (stars ? stars / 5 : 0.6) * (1 - conf);
    } else quality = stars ? stars / 5 : 0.6;
    const dist = km(ctx.lat, ctx.lon, d.lat, d.lng);
    const location = dist == null ? 0.4 : Math.max(0, 1 - dist / NEAR_KM);
    const p = pn(o);
    const value = p == null ? 0.5 : 1 - (p - lo) / (hi - lo + 1);
    const refundable = !!(d.refundable || d.freeCancellation);
    const breakfast = !!(d.freeBreakfast || /breakfast|half|full|all inclusive/i.test(String(d.board || "")));
    const brand = ctx.luxury ? luxuryBrand(nameOf(o)) : null;
    const onGuide = ctx.luxury ? (ctx.guide || []).find((g) => g.name && sameHotelName(g.name, nameOf(o))) : undefined;
    const lift = onGuide ? GUIDE_LIFT[onGuide.tier || ""] || 0 : 0;
    const score = wq * quality + wl * location + wv * value + wc * (refundable ? 1 : 0) + wb * (breakfast ? 1 : 0.3) + (brand ? 0.05 : 0) + lift;
    const reasons: string[] = [];
    if (stars) reasons.push(`${stars}-star`);
    if (r && r.rating) reasons.push(r.reviews ? `rated ${r.rating.toFixed(1)} by ${r.reviews.toLocaleString("en-IN")} guests` : `rated ${r.rating.toFixed(1)}`);
    if (onGuide) reasons.push("on our city guide" + (onGuide.credentials && onGuide.credentials[0] ? `: ${onGuide.credentials[0]}` : onGuide.tier ? ` (${onGuide.tier})` : ""));
    else if (brand) reasons.push("flagship luxury name");
    if (dist != null) reasons.push(`${dist.toFixed(1)} km from ${ctx.where || "the centre you asked for"}`);
    if (refundable) reasons.push("free cancellation");
    if (breakfast) reasons.push("breakfast included");
    if (p != null) reasons.push(`about ${inr(p)} a night`);
    return { o, score, reasons };
  });
  scored.sort((a, b) => b.score - a.score || offerNet(a.o) - offerNet(b.o) || nameOf(a.o).localeCompare(nameOf(b.o)));
  return scored.map((s, i) => ({ ...s.o, _rec: { score: Math.round(s.score * 1e4) / 1e4, reasons: s.reasons, rank: i + 1 } as HotelRec }));
}
