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

/** "AI 2402" / "AI2402" / "2402" → "2402": compare flight numbers whatever their spelling. */
export const flightNum = (s: string) => String(s || "").replace(/^[A-Z0-9]{2}\s*-?\s*(?=\d)/i, "").replace(/^0+/, "").trim();
