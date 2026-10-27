// Hotel results: what the filters and sort order work from (2026-10-27).
//
// Kept apart from HotelDesk.tsx so it can be read and tested on its own. The filters follow
// TripSure's own hotel site: stars, price, free cancellation, breakfast, amenities, stay type,
// all applied in the browser over the hotels loaded so far (the list keeps growing while the
// rest of the city loads, see HotelDesk's loadMoreHotels).
//
// TripSure does not always price a listing: a hotel with no price is shown as "Rates on
// selection" and its rates come from opening it. So every price rule here leaves unpriced
// hotels alone until a price filter is chosen, and the price filter is offered only when some
// hotel has a price.

export type HotelView = {
  sort: string;
  stars: string;
  refundable: boolean; // free cancellation
  board: string;
  breakfast: boolean;
  price: string; // "any" or "<min>:<max>" (either side may be empty)
  amenities: string[];
  stayType: string;
};

export const DEFAULT_HOTEL_VIEW: HotelView = {
  sort: "best",
  stars: "any",
  refundable: false,
  board: "all",
  breakfast: false,
  price: "any",
  amenities: [],
  stayType: "all",
};

// The amenity flags TripSure sends (hotelInfo.amenity) worth filtering on, in the order offered.
export const AMENITY_LABELS: Record<string, string> = {
  freeWiFi: "Free WiFi",
  swimming: "Pool",
  spa: "Spa",
  gym: "Gym",
  parking: "Parking",
  restaurant: "Restaurant",
  bar: "Bar",
  roomService: "Room service",
  airConditioner: "Air conditioning",
  laundryServices: "Laundry",
  concierge: "Concierge",
  wheelchairAccessible: "Accessible",
};

export type HotelFacets = {
  hasPrices: boolean;
  priceBands: { key: string; label: string }[];
  boards: string[];
  stayTypes: string[];
  amenities: { key: string; label: string; count: number }[];
};

export function offerNet(o: any): number {
  return Number(o && (o.base_net != null ? o.base_net : o.baseNet)) || 0;
}

function hasBreakfast(d: any): boolean {
  return !!(d && (d.freeBreakfast || /breakfast/i.test(String(d.board || ""))));
}

function niceStep(max: number): number {
  if (max < 5000) return 500;
  if (max < 20000) return 1000;
  if (max < 100000) return 5000;
  return 10000;
}

function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

/** Price bands cut at the quartiles of the prices seen, so each band holds about a quarter of the hotels. */
export function priceBands(prices: number[], money: (n: number) => string): { key: string; label: string }[] {
  if (prices.length < 4) return [];
  const sorted = prices.slice().sort((a, b) => a - b);
  const step = niceStep(sorted[sorted.length - 1]);
  const cuts: number[] = [];
  [0.25, 0.5, 0.75].forEach((q) => {
    const c = roundTo(sorted[Math.floor((sorted.length - 1) * q)], step);
    if (!cuts.length || c > cuts[cuts.length - 1]) cuts.push(c);
  });
  if (!cuts.length) return [];
  const bands = [{ key: ":" + cuts[0], label: "Under " + money(cuts[0]) }];
  for (let i = 1; i < cuts.length; i++) bands.push({ key: cuts[i - 1] + ":" + cuts[i], label: money(cuts[i - 1]) + " – " + money(cuts[i]) });
  bands.push({ key: cuts[cuts.length - 1] + ":", label: money(cuts[cuts.length - 1]) + " and above" });
  return bands;
}

export function hotelFacets(offers: any[], money: (n: number) => string = (n) => String(n)): HotelFacets {
  const prices: number[] = [];
  const boards: string[] = [];
  const stayTypes: string[] = [];
  const counts: Record<string, number> = {};
  offers.forEach((o) => {
    const d = (o && o.detail) || {};
    const net = offerNet(o);
    if (net > 0) prices.push(net);
    if (d.board && boards.indexOf(d.board) < 0) boards.push(d.board);
    if (d.stayType && stayTypes.indexOf(d.stayType) < 0) stayTypes.push(d.stayType);
    (d.amenities || []).forEach((a: string) => {
      if (AMENITY_LABELS[a]) counts[a] = (counts[a] || 0) + 1;
    });
  });
  const amenities = Object.keys(counts)
    .map((key) => ({ key, label: AMENITY_LABELS[key], count: counts[key] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { hasPrices: prices.length > 0, priceBands: priceBands(prices, money), boards, stayTypes: stayTypes.sort(), amenities };
}

function parsePrice(price: string): { min: number | null; max: number | null } | null {
  if (!price || price === "any") return null;
  const [lo, hi] = price.split(":");
  return { min: lo ? Number(lo) : null, max: hi ? Number(hi) : null };
}

export function filterHotels(offers: any[], view: HotelView): any[] {
  const range = parsePrice(view.price);
  return offers.filter((o) => {
    const d = (o && o.detail) || {};
    const stars = d.stars || 0;
    if (view.stars !== "any" && stars < Number(view.stars)) return false;
    if (view.refundable && !(d.refundable || d.freeCancellation)) return false;
    if (view.breakfast && !hasBreakfast(d)) return false;
    if (view.board !== "all" && d.board !== view.board) return false;
    if (view.stayType !== "all" && d.stayType !== view.stayType) return false;
    if (view.amenities.length && !view.amenities.every((a) => (d.amenities || []).indexOf(a) >= 0)) return false;
    if (range) {
      const net = offerNet(o);
      if (!(net > 0)) return false; // no price to place in the band
      if (range.min != null && net < range.min) return false;
      if (range.max != null && net >= range.max) return false;
    }
    return true;
  });
}

export function sortHotels(offers: any[], view: HotelView): any[] {
  const priced = offers.map(offerNet).filter((n) => n > 0);
  const minNet = priced.length ? Math.min.apply(null, priced) : 0;
  const stars = (o: any) => (o.detail || {}).stars || 0;
  const name = (o: any) => String((o.detail || {}).hotelName || "");
  const byStars = (a: any, b: any) => stars(b) - stars(a) || name(a).localeCompare(name(b));
  // A hotel with no price goes after the priced ones, by stars.
  const pricedFirst = (a: any, b: any, cmp: (x: number, y: number) => number) => {
    const na = offerNet(a), nb = offerNet(b);
    if (na > 0 && nb > 0) return cmp(na, nb) || byStars(a, b);
    if (na > 0) return -1;
    if (nb > 0) return 1;
    return byStars(a, b);
  };
  const out = offers.slice();
  if (view.sort === "cheapest") return out.sort((a, b) => pricedFirst(a, b, (x, y) => x - y));
  if (view.sort === "priceDesc") return out.sort((a, b) => pricedFirst(a, b, (x, y) => y - x));
  if (view.sort === "toprated") return out.sort((a, b) => stars(b) - stars(a) || pricedFirst(a, b, (x, y) => x - y));
  // best value: higher stars and lower price win (stars per rupee over the cheapest price seen)
  return out.sort((a, b) => {
    const na = offerNet(a), nb = offerNet(b);
    if (na > 0 && nb > 0) return (stars(b) || 3) / (nb / minNet) - (stars(a) || 3) / (na / minNet) || byStars(a, b);
    if (na > 0) return -1;
    if (nb > 0) return 1;
    return byStars(a, b);
  });
}

/** Changes whenever the advisor changes a filter or the sort, but not when more hotels arrive. */
export function viewKey(view: HotelView): string {
  return JSON.stringify([view.sort, view.stars, view.refundable, view.board, view.breakfast, view.price, view.amenities.slice().sort(), view.stayType]);
}

/** Number of filters switched on (the sort order is not a filter). */
export function activeFilterCount(view: HotelView): number {
  return (
    (view.stars !== "any" ? 1 : 0) +
    (view.refundable ? 1 : 0) +
    (view.breakfast ? 1 : 0) +
    (view.board !== "all" ? 1 : 0) +
    (view.price !== "any" ? 1 : 0) +
    (view.stayType !== "all" ? 1 : 0) +
    view.amenities.length
  );
}

export const HOTEL_PAGE_SIZE = 40;
