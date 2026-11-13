import { describe, expect, it } from "vitest";
import { carrierScore, legCodes, rankFlightOffers, withoutBudgetCarriers } from "./flightRank";

const f = (id: string, segs: string[], stops: number, durationMin: number, dep: string, arr: string, fare: number, kg = 40, refundable = true, airlineName = "") => ({
  id, base_net: fare,
  detail: { airline: segs[0].split(" ")[0], airlineName, segments: segs.map((no, i) => ({ flightNo: no, to: i < segs.length - 1 ? "SIN" : "SYD" })),
    stops, durationMin, duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`, depTime: dep, arrTime: arr, baggageKg: kg, refundable },
});
const LIST = [
  f("indigo", ["6E 1163", "6E 4610"], 1, 1305, "08:50", "06:35", 510666, 15, false, "IndiGo"),   // the budget carrier from the screenshot
  f("emirates", ["EK 507", "EK 412"], 1, 1180, "03:10", "04:50", 1180000),                       // red-eye both ends
  f("sq", ["SQ 423", "SQ 231"], 1, 1040, "09:15", "22:35", 1260000),
  f("qf", ["QF 68"], 0, 790, "21:30", "12:40", 1420000),
];

describe("flight recommendation", () => {
  it("reads the airline of every leg", () => {
    expect(legCodes(LIST[0])).toEqual(["6E", "6E"]);
    expect(carrierScore(LIST[0])).toBe(0);
    expect(carrierScore(LIST[2])).toBe(1);
    expect(carrierScore({ detail: { airline: "ZZ" } })).toBe(0.4);
    expect(carrierScore({ detail: {} })).toBe(0.4);
  });
  it("hides budget carriers while a full-service one flies the route, and shows them when it is all there is", () => {
    expect(withoutBudgetCarriers(LIST).map((o) => o.id)).not.toContain("indigo");
    expect(withoutBudgetCarriers([LIST[0]]).map((o) => o.id)).toEqual(["indigo"]);
  });
  it("puts the non-stop first, the red-eye last, and says why", () => {
    const out = rankFlightOffers(withoutBudgetCarriers(LIST));
    expect(out[0].id).toBe("qf");                       // dearest, but non-stop
    expect(out[out.length - 1].id).toBe("emirates");    // departs 03:10 and lands 04:50
    expect(out[0]._rec.reasons).toEqual(expect.arrayContaining(["non-stop", "full-service airline"]));
    expect(out[1]._rec.reasons.join(" | ")).toMatch(/1 stop via SIN/);
    expect(out.map((o) => o._rec.rank)).toEqual([1, 2, 3]);
  });
  it("beats the cheapest budget fare even with it left in", () => {
    const out = rankFlightOffers(LIST);
    expect(out.map((o) => o.id).indexOf("indigo")).toBeGreaterThan(out.map((o) => o.id).indexOf("sq"));
  });
});
