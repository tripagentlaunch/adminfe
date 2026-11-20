import { describe, expect, it } from "vitest";
import { DEFAULT_HOTEL_VIEW, activeFilterCount, filterHotels, sortHotels, viewKey } from "./hotelListing";

const offer = (id: string, stars: number, stayType: string, base = 0) => ({ id, base_net: base, detail: { hotelName: "H" + id, stars, stayType, amenities: [] } });
const offers = [offer("a", 5, "Resort"), offer("b", 4, "Hotel"), offer("c", 3, "Hotel"), offer("d", 3, "Villa")];

describe("Filters panel: exact stars and property types", () => {
  it("keeps only the star levels ticked", () => {
    const got = filterHotels(offers, { ...DEFAULT_HOTEL_VIEW, starSet: ["5", "3"] }).map((o) => o.id);
    expect(got).toEqual(["a", "c", "d"]);
  });
  it("keeps only the property types ticked", () => {
    const got = filterHotels(offers, { ...DEFAULT_HOTEL_VIEW, stayTypes: ["Hotel"] }).map((o) => o.id);
    expect(got).toEqual(["b", "c"]);
  });
  it("counts them as filters and changes the view key", () => {
    const v = { ...DEFAULT_HOTEL_VIEW, starSet: ["5"], stayTypes: ["Hotel", "Villa"] };
    expect(activeFilterCount(v)).toBe(3);
    expect(viewKey(v)).not.toBe(viewKey(DEFAULT_HOTEL_VIEW));
  });
  it("an older view without the new fields still filters as before", () => {
    expect(filterHotels(offers, DEFAULT_HOTEL_VIEW)).toHaveLength(4);
  });
});

describe("Sort: guest rating", () => {
  it("puts the best guest-rated first and the unrated after, by stars", () => {
    const ctx: any = { ratings: { Hb: { rating: 4.8, reviews: 100 }, Hc: { rating: 4.1, reviews: 50 }, Hd: null } };
    const got = sortHotels(offers, { ...DEFAULT_HOTEL_VIEW, sort: "guest" }, ctx).map((o) => o.id);
    expect(got).toEqual(["b", "c", "a", "d"]);
  });
});
