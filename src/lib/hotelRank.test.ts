import { describe, expect, it } from "vitest";
import { luxuryBrand, luxuryPool, rankHotels } from "./hotelRank";
import { DEFAULT_HOTEL_VIEW, filterHotels, sortHotels } from "./hotelListing";

const QUAY = { lat: -33.8611, lon: 151.2108 };
const offer = (id: string, name: string, stars: number, perNight: number, lat: number, lng: number, o: any = {}) => ({
  id, base_net: perNight * 3, detail: { hotelName: name, stars, lat, lng, refundable: true, freeBreakfast: false, board: null, ...o },
});
const LIST = [
  offer("A", "Capella Sydney", 5, 78000, -33.8617, 151.2102, { freeBreakfast: true }),
  offer("B", "Harbour Palace", 5, 52000, -33.862, 151.21),
  offer("C", "Tired Grand", 5, 40000, -33.86, 151.209),
  offer("D", "Quay Boutique", 4, 30000, -33.861, 151.21),
  offer("E", "Far Five", 5, 60000, -33.946, 151.177),
  offer("F", "No Price Inn", 5, 0, -33.8612, 151.2107),
];
const ctx = { ...QUAY, where: "Sydney", nights: 3, rooms: 1, luxury: true };
const RATINGS = {
  "Capella Sydney": { rating: 4.8, reviews: 2400 }, "Harbour Palace": { rating: 4.6, reviews: 900 }, "Tired Grand": { rating: 3.9, reviews: 1200 },
  "Quay Boutique": { rating: 4.9, reviews: 800 }, "Far Five": { rating: 4.7, reviews: 500 },
};

describe("luxury pool", () => {
  it("keeps 5-star hotels only, and drops one guests rate under 4.3 once 50+ have rated it", () => {
    const ids = luxuryPool(LIST, RATINGS).map((o) => o.id);
    expect(ids).not.toContain("D");   // 4-star, however well rated
    expect(ids).not.toContain("C");   // 5-star rated 3.9 by 1,200 guests
    expect(ids).toEqual(expect.arrayContaining(["A", "B", "E", "F"]));
  });
  it("falls back to 4-star hotels rated 4.5+ (or unrated) where there is no 5-star", () => {
    const four = [offer("A", "Fine Four", 4, 40000, 0, 0), offer("B", "Ok Four", 4, 30000, 0, 0), offer("C", "Three", 3, 9000, 0, 0)];
    const ids = luxuryPool(four, { "Fine Four": { rating: 4.7, reviews: 900 }, "Ok Four": { rating: 4.0, reviews: 900 } }).map((o) => o.id);
    expect(ids).toEqual(["A"]);
    expect(luxuryPool(four, {}).map((o) => o.id).sort()).toEqual(["A", "B"]);
  });
});

describe("recommended order", () => {
  it("puts the close, top-rated, guide-listed hotel first and says why", () => {
    const out = rankHotels(luxuryPool(LIST, RATINGS), { ...ctx, ratings: RATINGS, guide: [{ name: "Capella Sydney", tier: "Ultra", credentials: ["World's 50 Best Hotels 2025 (No. 12)"] }] });
    expect(out[0].id).toBe("A");
    expect(out[0]._rec.rank).toBe(1);
    expect(out[0]._rec.reasons.join(" | ")).toMatch(/5-star.*rated 4\.8.*on our city guide: World's 50 Best.*km from Sydney.*breakfast included/);
    expect(out[out.length - 1].id).toBe("E");   // 10 km away
  });
  it("never lets a hotel with no listed price drop out, scoring its price neutrally", () => {
    const out = rankHotels(luxuryPool(LIST, RATINGS), { ...ctx, ratings: RATINGS });
    expect(out.map((o) => o.id)).toContain("F");
  });
  it("is what the 'recommended' sort and the luxury filter produce together", () => {
    const view = { ...DEFAULT_HOTEL_VIEW, sort: "recommended", luxury: true };
    const c = { ...ctx, ratings: RATINGS };
    const out = sortHotels(filterHotels(LIST, view, c), view, c);
    expect(out.map((o) => o.id)).not.toContain("D");
    expect(out.map((o) => o.id)).not.toContain("C");
    expect(out[0]._rec).toBeTruthy();
    // switched off: every hotel is there again
    const off = { ...view, luxury: false };
    expect(filterHotels(LIST, off, c)).toHaveLength(LIST.length);
  });
});

describe("brand names", () => {
  it("match whole words only", () => {
    expect(luxuryBrand("The Taj Mahal Palace")).toBe("taj");
    expect(luxuryBrand("Aman Tokyo")).toBe("aman");
    expect(luxuryBrand("Tajmahal Residency")).toBeNull();
    expect(luxuryBrand("Romance Inn")).toBeNull();
  });
});
