import { describe, expect, it } from "vitest";
import { drilldownLocation, popularDrilldowns } from "./locationSuggest";

const GOA = {
  id: "328959", name: "Goa", type: "State", state: "Goa", country: "IN", coordinates: { lat: 15.49, lon: 73.82 },
  popular_locations: [{ id: "334152", name: "North Goa", coordinates: { lat: 15.6, lon: 73.8 } }, { id: "334152", name: "North Goa (dup)" }],
  popular_poi: [{ id: "329890", name: "Calangute Beach" }, { name: "no id" }, { id: "1" }],
  popular_hotels: [],
};

describe("popularDrilldowns", () => {
  it("returns nothing without a location or without popular lists", () => {
    expect(popularDrilldowns(null)).toEqual([]);
    expect(popularDrilldowns({ id: "1", name: "x" })).toEqual([]);
  });
  it("keeps non-empty groups in order, dropping nameless/id-less and duplicate entries", () => {
    const g = popularDrilldowns(GOA);
    expect(g.map((x) => x.key)).toEqual(["popular_locations", "popular_poi"]);
    expect(g[0].items.map((i) => i.name)).toEqual(["North Goa"]);
    expect(g[1].items.map((i) => i.name)).toEqual(["Calangute Beach"]);
  });
  it("caps each group", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: "h" + i }));
    expect(popularDrilldowns({ popular_hotels: many }, 5)[0].items).toHaveLength(5);
  });
});

describe("drilldownLocation", () => {
  it("builds a location with parent state/country and the group's type", () => {
    const l = drilldownLocation(GOA, GOA.popular_locations[0], { type: "City" });
    expect(l).toMatchObject({ id: "334152", name: "North Goa", type: "City", state: "Goa", country: "IN", coordinates: { lat: 15.6, lon: 73.8 } });
  });
  it("returns null without usable coordinates so Search resolves the name live", () => {
    expect(drilldownLocation(GOA, GOA.popular_poi[0], { type: "PointOfInterest" })).toBeNull();
    expect(drilldownLocation(GOA, { id: "1", name: "x", coordinates: { lat: "", lon: null } }, { type: "Hotel" })).toBeNull();
  });
});
