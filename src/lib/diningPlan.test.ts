import { describe, expect, it } from "vitest";
import { diningEntry, isBar, isMealDay, suggestDining, whereToEatByCity, type DiningGuide } from "./diningPlan";

const BLR: DiningGuide = {
  city: "Bengaluru", slug: "bengaluru", url: "https://www.tripagent.vip/city-bengaluru",
  eat: [
    { name: "Farmlore", area: "North Bengaluru", tier: "Destination", credentials: ["Asia's 50 Best Restaurants 2025: No. 68"], description: "A farm table." },
    { name: "Karavalli", area: "Residency Road", tier: "Fine", credentials: ["The World's 50 Best Discovery"], description: "Coastal food." },
    { name: "Copitas", area: "Bellary Road", tier: "Fine", credentials: ["Asia's 50 Best Bars (No. 38, 2023)"], description: "A bar." },
    { name: "Wabi Sabi", area: "MG Road", tier: "Fine", credentials: [], description: "Japanese." },
    { name: "Bar Spirit Forward", area: "Lavelle Road", tier: "Smart", credentials: ["Asia's 50 Best Bars 2025: No. 37"], description: "Cocktails." },
    { name: "MTR", area: "Lalbagh", tier: "Casual", credentials: [], description: "Idli." },
  ],
};
const guideFor = (t: string) => (/bengaluru|bangalore/i.test(t) ? BLR : undefined);
const day = (id: string, iso: string, extra: any = {}) => ({ id, _iso: iso, route: "Bengaluru", items: [{ type: "hotel", city: "Bengaluru" }], ...extra });

describe("isBar", () => {
  it("knows a bar from a restaurant", () => {
    expect(isBar(BLR.eat![2])).toBe(true);   // credential: Best Bars
    expect(isBar(BLR.eat![4])).toBe(true);   // name starts with "Bar"
    expect(isBar(BLR.eat![0])).toBe(false);
  });
});

describe("isMealDay", () => {
  it("is a dated day that is not flight-only", () => {
    expect(isMealDay(day("a", "2026-12-07"))).toBe(true);
    expect(isMealDay({ id: "a", _iso: "unscheduled", items: [] })).toBe(false);
    expect(isMealDay({ id: "a", _iso: "2026-12-07", items: [{ type: "flight" }] })).toBe(false);
    expect(isMealDay({ id: "a", _iso: "2026-12-07", items: [{ type: "flight" }, { type: "hotel" }] })).toBe(true);
  });
});

describe("suggestDining", () => {
  it("gives each day a dinner from the best tier, a lunch when a casual pick is left, no bars, no repeats", () => {
    const days = [day("d1", "2026-12-07"), day("d2", "2026-12-08"), day("d3", "2026-12-09"), day("d4", "2026-12-10")];
    const out = suggestDining(days, guideFor);
    expect(out.d1.map((e) => [e.meal, e.name])).toEqual([["lunch", "MTR"], ["dinner", "Farmlore"]]);
    expect(out.d2.map((e) => [e.meal, e.name])).toEqual([["dinner", "Karavalli"]]);
    expect(out.d3.map((e) => e.name)).toEqual(["Wabi Sabi"]);
    expect(out.d4).toBeUndefined();                       // the picks ran out: nothing invented
    const names = Object.values(out).flat().map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("Copitas");
  });
  it("leaves a day the advisor already filled, and does not suggest its restaurant again", () => {
    const kept = diningEntry(BLR.eat![0], BLR, "dinner");
    const out = suggestDining([day("d1", "2026-12-07", { dining: [kept] }), day("d2", "2026-12-08")], guideFor);
    expect(out.d1).toBeUndefined();
    expect(out.d2.some((e) => e.name === "Farmlore")).toBe(false);
  });
  it("skips travel days and cities without a guide", () => {
    const out = suggestDining([{ id: "t", _iso: "2026-12-07", route: "Bengaluru", items: [{ type: "flight" }] }, day("x", "2026-12-08", { route: "Atlantis", items: [] })], guideFor);
    expect(out).toEqual({});
  });
  it("uses casual picks as dinners when a city has nothing better", () => {
    const g: DiningGuide = { city: "Hampi", slug: "hampi", eat: [{ name: "Mango Tree", tier: "Casual" }] };
    expect(suggestDining([day("d1", "2026-12-07")], () => g).d1.map((e) => [e.meal, e.name])).toEqual([["dinner", "Mango Tree"]]);
  });
});

describe("whereToEatByCity", () => {
  it("groups the trip's dining by city, each restaurant once", () => {
    const e = diningEntry(BLR.eat![0], BLR, "dinner");
    const g = whereToEatByCity([{ dining: [e] }, { dining: [e, diningEntry(BLR.eat![1], BLR, "dinner")] }]);
    expect(g).toHaveLength(1);
    expect(g[0].city).toBe("Bengaluru");
    expect(g[0].picks.map((p) => p.name)).toEqual(["Farmlore", "Karavalli"]);
    expect(g[0].url).toBe("https://www.tripagent.vip/city-bengaluru");
  });
});
