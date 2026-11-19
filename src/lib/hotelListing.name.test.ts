import { describe, expect, it } from "vitest";
import { DEFAULT_HOTEL_VIEW, activeFilterCount, filterHotels } from "./hotelListing";

const offers = [
  { id: "a", detail: { hotelName: "Taj Cidade de Goa Horizon", address: "Vainguinim Beach", stars: 5 } },
  { id: "b", detail: { hotelName: "Metropolis Business Hotel", address: "Panaji", stars: 3 } },
];

describe("hotel name search", () => {
  it("finds a hotel by any part of its name, ignoring case and accents", () => {
    const v = { ...DEFAULT_HOTEL_VIEW, name: "metropolis" };
    expect(filterHotels(offers, v).map((o) => o.id)).toEqual(["b"]);
    expect(filterHotels(offers, { ...DEFAULT_HOTEL_VIEW, name: "TAJ goa" }).map((o) => o.id)).toEqual(["a"]);
  });
  it("still finds a 3-star hotel while the 5-star pool filter is on", () => {
    const v = { ...DEFAULT_HOTEL_VIEW, luxury: true, name: "metropolis" };
    expect(filterHotels(offers, v).map((o) => o.id)).toEqual(["b"]);
  });
  it("counts as a filter so Reset appears", () => {
    expect(activeFilterCount({ ...DEFAULT_HOTEL_VIEW, name: "taj" })).toBe(1);
    expect(activeFilterCount(DEFAULT_HOTEL_VIEW)).toBe(0);
  });
});
