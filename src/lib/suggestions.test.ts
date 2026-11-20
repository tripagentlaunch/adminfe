import { describe, expect, it } from "vitest";
import { suggestionCost, suggestionKinds } from "./suggestions";

const data = {
  whereToEat: [{ city: "Bengaluru", url: "u", picks: [{ id: "e1", est: { low: 3000, high: 5000, totalLow: 6000, totalHigh: 10000, pax: 2 } }, { id: "e2" }] }],
  placesToGo: [
    { kind: "do", city: "Bengaluru", picks: [{ id: "d1", est: { low: 0, high: 0, totalLow: 0, totalHigh: 0, pax: 2 } }] },
    { kind: "party", city: "Bengaluru", picks: [{ id: "p1", est: { low: 2500, high: 5000, totalLow: 5000, totalHigh: 10000, pax: 2 } }] },
  ],
};

describe("suggestions", () => {
  it("lists only the kinds that have something, with counts, in the same order as the plan", () => {
    expect(suggestionKinds(data).map((k) => [k.key, k.count])).toEqual([["eat", 2], ["do", 1], ["party", 1]]);
    expect(suggestionKinds({ whereToEat: [], placesToGo: [] })).toEqual([]);
    expect(suggestionKinds({ placesToGo: data.placesToGo.slice(1) }).map((k) => k.key)).toEqual(["party"]);
  });
  it("adds up the estimates for the whole party and says how many suggestions had one", () => {
    expect(suggestionCost(suggestionKinds(data))).toEqual({ low: 11000, high: 20000, pax: 2, counted: 3, total: 4 });
  });
  it("no estimates, no cost line", () => {
    expect(suggestionCost(suggestionKinds({ whereToEat: [{ city: "X", picks: [{ id: "a" }] }] }))).toBeNull();
  });
});
