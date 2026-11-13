/* Swap options for a hotel added to the itinerary, and the live "from" prices they are ranked by.
   Shared by the Console's Hotels desk and the Add-a-hotel popup (components/orders/HotelItineraryPopup). */
import { hotelFacts, hotelRates } from "../services/api";
import { straightKm } from "./hotelDistance";
import { offerNet } from "./hotelListing";

// TripSure's listing carries no price (priceSummary is empty), so the hotels on
// screen are priced from their cheapest live room (POST /hotels/rates, 5 per
// call), keyed by hotel + search token so it is asked once per search.
// null = TripSure has no bookable room for it.
export const FROM_PRICES = new Map<string, { price: number; board: string | null; refundable: any } | null>();
export const fromKey = (t: any) => t.hotelId + "|" + t.token;

// Three swap options for a hotel, picked automatically: same star rating, the next best by
// the recommendation (else closest price, or nearest by straight line when unpriced). Removable in the builder.
// `_handles` lets addRoom price them live (POST /hotels/rates) — listings are
// often unpriced, which used to save them at ₹0.
// Shape = what swapHotelAlternative / the proposal read.
// Prices come from the listing or, when it has none, the live "from" price on
// screen (FROM_PRICES); hotels TripSure has no rooms for are skipped. Five
// candidates go out so that three still remain if some can't be priced.
const ALT_CANDIDATES = 5;
export function priceOf(x: any): number {
  const t = x._tripsure;
  const known = t && t.hotelId ? FROM_PRICES.get(fromKey(t)) : undefined;
  return offerNet(x) || (known ? known.price : 0);
}
export function hotelAlternatives(shown: any[], o: any): any[] {
  const d0 = o.detail || {};
  const net0 = priceOf(o);
  const dist = (x: any) => {
    const d = x.detail || {};
    if (net0 > 0 && priceOf(x) > 0) return Math.abs(priceOf(x) - net0);
    if (d0.lat != null && d.lat != null) return straightKm(Number(d0.lat), Number(d0.lng), Number(d.lat), Number(d.lng)) * 1000;
    return Infinity;
  };
  return shown
    .filter((x: any) => x.id !== o.id && ((x.detail || {}).stars || 0) === (d0.stars || 0)
      && !(x._tripsure && x._tripsure.hotelId && FROM_PRICES.get(fromKey(x._tripsure)) === null))
    // The next best by the system's recommendation (lib/hotelRank.ts) when the list is ranked, else the closest price.
    .sort((a: any, b: any) => (a._rec && b._rec ? a._rec.rank - b._rec.rank : dist(a) - dist(b)))
    .slice(0, ALT_CANDIDATES)
    .map((x: any) => {
      const d = x.detail || {};
      const t = x._tripsure || {};
      return {
        _handles: t.hotelId && t.docKey && t.token ? { hotelId: String(t.hotelId), docKey: t.docKey, token: t.token } : null,
        hotelKey: String(x.id), name: d.hotelName || "Hotel", image: d.image || null, price: priceOf(x),
        stars: d.stars ?? null, address: d.address || null, board: d.board || null, lat: d.lat ?? null, lng: d.lng ?? null,
        detail: [d.stars ? d.stars + "-star" : null, d.address].filter(Boolean).join(" · "),
      };
    });
}


// The swap options with their live price, room and board (POST /hotels/rates): the priced ones first,
// three kept (unpriceable ones only fill in, as "rates on request"). `_handles` is dropped. Never throws -
// a failed rates call leaves them as they were.
export async function pricedAlternatives(alts: any[]): Promise<any[]> {
  const toPrice = alts.map((a) => a._handles).filter(Boolean);
  let rates: any = {};
  if (toPrice.length) {
    try { rates = (await hotelRates(toPrice)) || {}; } catch { rates = {}; }
  }
  const withRates = alts.map(({ _handles, ...a }) => {
    const r = _handles ? rates[_handles.hotelId] : null;
    const priced = !r ? a : {
      ...a,
      price: r.price,
      board: r.board || a.board,
      image: a.image || (r.images && r.images[0]) || null,
      images: r.images || [],
      roomTitle: r.roomTitle || null,
      detail: [a.stars ? a.stars + "-star" : null, r.roomTitle, r.board].filter(Boolean).join(" · "),
    };
    return { priced, handles: _handles };
  });
  const kept = withRates.filter((x) => x.priced.price > 0).concat(withRates.filter((x) => !(x.priced.price > 0))).slice(0, 3);
  // Each swap option keeps the stay's specifics (highlights, good to know, nearby, check-in window, photos) the way the chosen
  // hotel does, so swapping to it later shows the same content in the proposal. A failed call just leaves that option without.
  const facts = await Promise.all(kept.map((x) => (x.handles ? Promise.resolve(hotelFacts(x.handles)).catch(() => null) : Promise.resolve(null))));
  return kept.map((x, i) => (facts[i] ? { ...x.priced, facts: facts[i] } : x.priced));
}
