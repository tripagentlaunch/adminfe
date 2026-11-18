import { describe, expect, it } from "vitest";
import { MC_MAX_LEGS, addLeg, blankLeg, legKey, multiCityProblem, multiCityTitle, multiIsInternational, regroupByLeg, removeLeg, seedLegs, segmentsOf, type McLeg } from "./multiCity";

const leg = (from: string, to: string, date: string): McLeg => ({ ...blankLeg(from, date), to });
const TODAY = "2026-11-06";

describe("seedLegs / addLeg / removeLeg", () => {
  it("starts from the one-way form and offers a second leg that starts where the first ended", () => {
    const legs = seedLegs({ from: "DEL", to: "BOM", fromCity: "Delhi", toCity: "Mumbai", fromName: "", toName: "", date: "2026-11-20" });
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ from: "DEL", to: "BOM", date: "2026-11-20" });
    expect(legs[1]).toMatchObject({ from: "BOM", fromCity: "Mumbai", to: "", date: "2026-11-23" });
  });
  it("adds a leg after the last one, up to five", () => {
    let legs = [leg("DEL", "BOM", "2026-11-20"), leg("BOM", "GOI", "2026-11-23")];
    legs = addLeg(legs);
    expect(legs[2]).toMatchObject({ from: "GOI", date: "2026-11-26" });
    while (legs.length < MC_MAX_LEGS) legs = addLeg(legs);
    expect(addLeg(legs)).toHaveLength(MC_MAX_LEGS);
  });
  it("never goes below two legs", () => {
    const two = [leg("DEL", "BOM", "2026-11-20"), leg("BOM", "GOI", "2026-11-23")];
    expect(removeLeg(two, 0)).toHaveLength(2);
    expect(removeLeg([...two, leg("GOI", "DEL", "2026-11-26")], 1).map((l) => l.from)).toEqual(["DEL", "GOI"]);
  });
});

describe("multiCityProblem", () => {
  const ok = [leg("DEL", "BOM", "2026-11-20"), leg("BOM", "GOI", "2026-11-23"), leg("GOI", "DEL", "2026-11-23")];
  it("accepts a good trip, including two legs on the same day", () => {
    expect(multiCityProblem(ok, TODAY)).toBeNull();
  });
  it("needs 2 to 5 flights", () => {
    expect(multiCityProblem([ok[0]], TODAY)).toMatch(/at least 2/);
    expect(multiCityProblem([...ok, ...ok], TODAY)).toMatch(/at most 5/);
  });
  it("names the flight and what is wrong", () => {
    expect(multiCityProblem([ok[0], { ...ok[1], from: "" }], TODAY)).toBe("Flight 2: pick a From airport from the suggestions.");
    expect(multiCityProblem([ok[0], { ...ok[1], to: "BO" }], TODAY)).toBe("Flight 2: pick a To airport from the suggestions.");
    expect(multiCityProblem([ok[0], { ...ok[1], to: "BOM" }], TODAY)).toBe("Flight 2: From and To must differ.");
    expect(multiCityProblem([ok[0], { ...ok[1], date: "" }], TODAY)).toBe("Flight 2: pick a date.");
  });
  it("refuses a date in the past and a leg before the one before it", () => {
    expect(multiCityProblem([{ ...ok[0], date: "2026-11-05" }, ok[1]], TODAY)).toMatch(/Flight 1: that date has passed/);
    expect(multiCityProblem([ok[0], { ...ok[1], date: "2026-11-19" }], TODAY)).toBe("Flight 2 can't be before flight 1.");
  });
});

describe("segmentsOf", () => {
  it("is the backend's segment shape, upper-cased", () => {
    expect(segmentsOf([leg("del", "bom", "2026-11-20")])).toEqual([{ origin: "DEL", destination: "BOM", departure_date: "2026-11-20" }]);
  });
});

describe("regroupByLeg", () => {
  const o = (leg: string, id: number) => ({ id, leg });
  it("tags the groups in the order they come, one group per leg, whatever TripSure calls them", () => {
    const offers = [o("ONWARD", 1), o("ONWARD", 2), o("RETURN", 3)];
    expect(regroupByLeg(offers, 2)!.map((x) => x.leg)).toEqual([legKey(0), legKey(0), legKey(1)]);
    const named = [o("SEG_A", 1), o("SEG_B", 2), o("SEG_C", 3), o("SEG_B", 4)];
    expect(regroupByLeg(named, 3)!.map((x) => x.leg)).toEqual(["LEG_1", "LEG_2", "LEG_3", "LEG_2"]);
  });
  it("is null when the groups don't match the legs, or when there is nothing", () => {
    expect(regroupByLeg([o("ONWARD", 1)], 2)).toBeNull();
    expect(regroupByLeg([o("A", 1), o("B", 2), o("C", 3)], 2)).toBeNull();
    expect(regroupByLeg([], 2)).toBeNull();
  });
  it("does not change the offers it was given", () => {
    const offers = [o("ONWARD", 1), o("RETURN", 2)];
    regroupByLeg(offers, 2);
    expect(offers.map((x) => x.leg)).toEqual(["ONWARD", "RETURN"]);
  });
});

describe("multiCityTitle", () => {
  it("chains legs that follow on, and splits an open-jaw trip", () => {
    expect(multiCityTitle([{ from: "DEL", to: "BOM" }, { from: "BOM", to: "GOI" }, { from: "GOI", to: "DEL" }])).toBe("DEL → BOM → GOI → DEL");
    expect(multiCityTitle([{ from: "DEL", to: "BOM" }, { from: "GOI", to: "DEL" }])).toBe("DEL → BOM · GOI → DEL");
  });
});

describe("multiIsInternational", () => {
  it("is true when any leg leaves India", () => {
    expect(multiIsInternational([{ from: "DEL", to: "BOM" }, { from: "BOM", to: "DXB" }])).toBe(true);
  });
  it("is false when every leg is domestic, null when an airport is unknown", () => {
    expect(multiIsInternational([{ from: "DEL", to: "BOM" }, { from: "BOM", to: "GOI" }])).toBe(false);
    expect(multiIsInternational([{ from: "DEL", to: "BOM" }, { from: "BOM", to: "ZZZ" }])).toBeNull();
  });
});
