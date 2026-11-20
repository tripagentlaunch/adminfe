import { describe, expect, it } from "vitest";
import { blankItinerary, withTripSummary } from "./itineraryFromCart";
import { adjustedShares, airportCodeFor, arrivalCodeFor, budgetShares, knownCity, normalizePlan, estimateTotals, parseBudgetText, parseDestination, roomsFor, splitNights, stayBases } from "./scratchPlan";

describe("parseDestination", () => {
  it("keeps the half of Goa and searches Goa", () => {
    expect(parseDestination("south goa")).toEqual({ city: "Goa", region: "south", label: "South Goa" });
    expect(parseDestination("Goa South")).toEqual({ city: "Goa", region: "south", label: "South Goa" });
    expect(parseDestination("North Goa").region).toBe("north");
  });
  it("finds a place typed without its spaces", () => {
    expect(parseDestination("newyork")).toEqual({ city: "New York", region: null, label: "New York" });
    expect(parseDestination("NEW DELHI").city).toBe("New Delhi");
    expect(knownCity("Bengaluru")).toBe("Bengaluru");
    expect(knownCity("zzzz nowhere")).toBeNull();
  });
  it("leaves any other place as typed", () => {
    expect(parseDestination("Goa")).toEqual({ city: "Goa", region: null, label: "Goa" });
    expect(parseDestination("  Dubai ")).toEqual({ city: "Dubai", region: null, label: "Dubai" });
    expect(parseDestination("South Africa").region).toBeNull();
  });
});

describe("parseBudgetText", () => {
  it("reads lakhs, thousands and per person", () => {
    expect(parseBudgetText("2.5 lakh", 7)).toMatchObject({ max: 250000, per: "total", pax: 7 });
    expect(parseBudgetText("50k per person", 4)).toMatchObject({ max: 50000, per: "person", pax: 4 });
    expect(parseBudgetText("₹3,00,000 total", 2)).toMatchObject({ max: 300000, per: "total" });
  });
  it("is null when there is no amount", () => {
    expect(parseBudgetText("flexible", 2)).toBeNull();
    expect(parseBudgetText("", 2)).toBeNull();
  });
});

describe("stays and shares", () => {
  it("splits the nights in two stays, back to back", () => {
    expect(splitNights(5)).toEqual([3, 2]);
    expect(splitNights(1)).toEqual([1]);
    const b = stayBases({ destination: "South Goa", startIso: "2026-12-24", nights: 4 });
    expect(b).toEqual([
      { city: "South Goa", checkIn: "2026-12-24", checkOut: "2026-12-26", nights: 2 },
      { city: "South Goa", checkIn: "2026-12-26", checkOut: "2026-12-28", nights: 2 },
    ]);
  });
  it("gives each part its 15 / 60 / 25 share, flights per leg, stays by nights", () => {
    const s = budgetShares(200000, 5, true);
    expect(s).toMatchObject({ flights: 30000, stays: 120000, ground: 50000, perLeg: 15000 });
    expect(s.perStay).toEqual([72000, 48000]);
    expect(budgetShares(200000, 4, false).perLeg).toBe(30000);
  });
  it("puts two to a room", () => {
    expect(roomsFor(7)).toBe(4);
    expect(roomsFor(2)).toBe(1);
    expect(roomsFor(0)).toBe(1);
  });
});

describe("airports and estimates", () => {
  it("flies into Goa's airport for the half asked for", () => {
    const none = () => null;
    expect(arrivalCodeFor("Goa", "south", none)).toBe("GOI");
    expect(arrivalCodeFor("Goa", null, none)).toBe("GOI");
    expect(arrivalCodeFor("Goa", "north", none)).toBe("GOX");
    expect(arrivalCodeFor("Dubai", null, () => "DXB")).toBe("DXB");
  });
  it("adds up the estimates of what was ticked", () => {
    expect(estimateTotals([{ est: { totalLow: 100, totalHigh: 300 } }, { est: { totalLow: 50, totalHigh: 80 } }, {}])).toEqual({ low: 150, high: 380 });
  });
});

describe("a plan's trip keeps the place the customer asked for", () => {
  it("is not renamed after the stay's locality once a hotel is added", () => {
    const seed: any = { ...blankItinerary(), scratchPlan: { destination: "South Goa" }, destination: "South Goa", cities: ["South Goa"], startIso: "2026-12-24", endIso: "2026-12-28", nights: 4 };
    const day = { id: "d1", _iso: "2026-12-24", label: "Day 1", date: "Thu, 24 Dec", route: "South Goa", items: [{ id: "h1", type: "hotel", city: "Arpora", sub: "Arpora · 4★", duration: "2 nights" }] };
    const out = withTripSummary({ ...seed, days: [day] });
    expect(out.destination).toBe("South Goa");
    expect(out.nights).toBe(4);
  });
});

describe("a plan saved before the place was understood", () => {
  const old: any = { destination: "newyork", city: "newyork", region: null, from: "Delhi", fromCode: "DEL", toCode: null, startIso: "2026-12-24", endIso: "2026-12-27", nights: 3, adults: 2, rooms: 1, budgetTotal: 50000 };
  it("is repaired when opened: the city, the airport, nothing else", () => {
    const p = normalizePlan(old);
    expect(p).toMatchObject({ destination: "New York", city: "New York", fromCode: "DEL", budgetTotal: 50000, nights: 3 });
    expect(["JFK", "EWR", "LGA", "NYC"]).toContain(p.toCode);
  });
  it("is returned as it is when it needs no repair", () => {
    const good: any = { ...old, destination: "South Goa", city: "Goa", region: "south", toCode: "GOI" };
    expect(normalizePlan(good)).toBe(good);
  });
  it("reads an airport from a name or a code", () => {
    expect(airportCodeFor("del")).toBe("DEL");
    expect(airportCodeFor("")).toBeNull();
  });
});

describe("the budget split follows the real fares", () => {
  it("keeps the usual split when the fares fit it", () => {
    const a = adjustedShares(200000, 4, true, [9000, 9000]);
    expect(a).toMatchObject({ raised: false, tooLow: false, flights: 30000, need: 18000 });
  });
  it("raises the flights share to the fares, and the rest keeps its 60:25", () => {
    const a = adjustedShares(300000, 4, true, [40000, 45000]);
    expect(a.need).toBe(85000);
    expect(a).toMatchObject({ raised: true, tooLow: false, flights: Math.round(85000 * 1.25), usual: 45000 });
    expect(a.flights + a.stays + a.ground).toBe(300000);
    expect(a.perStay.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(a.perLeg).toBe(Math.round(a.flights / 2));
  });
  it("says the budget is too low when the cheapest fares pass 60% of it", () => {
    const a = adjustedShares(50000, 3, true, [127197, 129584]);
    expect(a.tooLow).toBe(true);
    expect(a.flights).toBe(30000);   // capped at 60%: it never takes the whole budget
    expect(a.flights + a.stays + a.ground).toBe(50000);
  });
  it("estimates the way back from the way out until it is known", () => {
    expect(adjustedShares(100000, 3, true, [20000]).need).toBe(40000);
    expect(adjustedShares(100000, 3, false, [20000]).need).toBe(20000);
    expect(adjustedShares(100000, 3, true, []).need).toBe(0);
  });
});
