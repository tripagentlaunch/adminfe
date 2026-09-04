/* =============================================================================
 * TripAgent — src/lib/mockHotelSearch.ts
 * Same fallback contract as mockFlightSearch.ts (see that file's own
 * docblock) — the real hotel API call (HotelDesk.tsx's runReal(), TripSure's
 * live /hotels/listing) runs first always; only on failure, which is every
 * time in local dev with no backend reachable, does the UI fall back to
 * this. Property tiers/names/price bands based on a REAL captured search
 * (2026-09-03) against the deployed advisor-panel
 * (https://tripagent-admin.vercel.app, Dubai, 3 nights, 1 room) — 10
 * properties split 1×3★/7×4★/2×5★, ₹5.8k/₹12–14k/₹22–26k per-night bands
 * respectively, "Breakfast Included" on every result, room type keyed by
 * star tier (Standard/Deluxe/Superior).
 *
 * buildMockHotelOffers({city, checkIn, checkOut, rooms, pax}) — the city
 * substitutes into every captured property NAME (deterministically, same
 * hash-per-city-and-dates approach as buildMockFlightOffers), so a Dubai
 * search and a Zurich search visibly differ from each other while each
 * stays stable across re-renders of the same query. Returns offers already
 * shaped exactly like HotelDesk.tsx's mapTripSureHotel() output — HotelResults
 * doesn't need to know which path produced them.
 * ===========================================================================*/

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// name, star tier, roomType, refundable, per-night band (captured order/mix).
const MOCK_PROPERTIES = [
  { name: "The Grand Budget {city}", stars: 3, roomType: "Standard Room", refundable: false, band: [5200, 6400] },
  { name: "Sapphire Suites {city}", stars: 4, roomType: "Deluxe Room", refundable: true, band: [11500, 12600] },
  { name: "The Westbrook {city}", stars: 4, roomType: "Deluxe Room", refundable: true, band: [11700, 12700] },
  { name: "Emerald Court {city}", stars: 4, roomType: "Deluxe Room", refundable: false, band: [11900, 12900] },
  { name: "Grand Pavilion {city}", stars: 4, roomType: "Deluxe Room", refundable: true, band: [12000, 13000] },
  { name: "Regal Garden Hotel {city}", stars: 4, roomType: "Deluxe Room", refundable: true, band: [12600, 13700] },
  { name: "Crowne Meridian {city}", stars: 4, roomType: "Deluxe Room", refundable: false, band: [12700, 13800] },
  { name: "Azure Bay Hotel {city}", stars: 4, roomType: "Deluxe Room", refundable: true, band: [13200, 14400] },
  { name: "Aurora Grand {city}", stars: 5, roomType: "Superior Room", refundable: true, band: [21500, 24000] },
  { name: "The Ritz Crescent {city}", stars: 5, roomType: "Superior Room", refundable: true, band: [24500, 27500] },
];

export function buildMockHotelOffers(opts: any) {
  const { city, checkIn, checkOut, rooms = 1, pax = 2, international = true } = opts;
  const searchKey = city + "-" + checkIn + "-" + checkOut + "-" + rooms;
  const seed = hashSeed(searchKey);
  const nights = Math.max(1, Math.round(((new Date(checkOut) as any) - (new Date(checkIn) as any)) / 86400000));
  const cityName = city || "Destination";

  const offers = MOCK_PROPERTIES.map((p, i) => {
    const [lo, hi] = p.band;
    const nightlyFrom = lo + ((seed >> (i + 2)) % (hi - lo));
    const total = nightlyFrom * nights * rooms;
    return {
      id: searchKey + "-hotel-" + i,
      international,
      base_net: total,
      detail: {
        hotelName: p.name.replace("{city}", cityName),
        cityName,
        image: null,
        stars: p.stars,
        board: "Breakfast Included",
        nights,
        rooms,
        nightlyFrom,
        refundable: p.refundable,
      },
    };
  });
  offers.sort((a, b) => a.base_net - b.base_net);
  return { offers, count: offers.length };
}
