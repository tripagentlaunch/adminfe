/* "Get live price" on an itinerary flight that isn't live-priced yet (typically Tara's draft):
   the Itinerary Builder asks the Search panel to search that exact route / day / cabin and open
   the pricing drawer on the same flight. Kept here (not only as an event) so the request survives
   the Flights desk mounting after the Search panel switches to it. */
export type LivePriceRequest = {
  origin: string; dest: string; date: string; cabin?: string | null;
  /** "AI 414", "AI 2863" — the flight to open the drawer on, when the results carry it. */
  flightNos: string[];
  pax?: { adults: number; children: number; infants: number } | null;
};

export const LIVE_PRICE_EVENT = "ta:price-flight";
let pending: LivePriceRequest | null = null;

export function requestLivePrice(r: LivePriceRequest) {
  pending = r;
  window.dispatchEvent(new CustomEvent(LIVE_PRICE_EVENT, { detail: r }));
}

/** The request waiting for the Flights desk, taken once. */
export function takeLivePriceRequest(): LivePriceRequest | null {
  const r = pending;
  pending = null;
  return r;
}

/** "AI 2402" / "AI2402" / "2402" → "2402": compare flight numbers whatever their spelling (the airline prefix always has a letter, so a bare number is left whole). */
export const flightNum = (s: string) => String(s || "").trim().replace(/^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2}\s*-?\s*(?=\d)/i, "").replace(/^0+/, "").trim();

/* The same for a hotel stay that isn't live-priced (Tara's draft): the Hotels desk opens its Add-a-hotel popup on that city /
   check-in / nights and goes straight to the draft's hotel, so the advisor only picks the room. Whatever is added replaces
   the draft (`itemId`). */
export type LiveHotelRequest = {
  itemId: string; name: string; city: string; checkIn: string; nights: number; n: number;
};
export const LIVE_HOTEL_EVENT = "ta:price-hotel";
let pendingHotel: LiveHotelRequest | null = null;
let hotelSeq = 0;

export function requestLiveHotelPrice(r: Omit<LiveHotelRequest, "n">) {
  pendingHotel = { ...r, n: ++hotelSeq };
  window.dispatchEvent(new CustomEvent(LIVE_HOTEL_EVENT));
}

export function takeLiveHotelRequest(): LiveHotelRequest | null {
  const r = pendingHotel;
  pendingHotel = null;
  return r;
}

/** Does a TripSure hotel name mean the hotel the draft names? Case, punctuation and filler words ("Hotel", "The", "&") ignored. */
export function sameHotelName(a: string, b: string): boolean {
  const toks = (x: string) => String(x || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((t) => t && !["hotel", "the", "and", "by", "resort", "resorts", "hotels"].includes(t));
  const x = toks(a), y = toks(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((t) => long.includes(t));
}
