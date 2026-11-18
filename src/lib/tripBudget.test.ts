import { describe, expect, it } from "vitest";
import { budgetRange, budgetStatus, flightFit, hotelFit, normalizeBudget, parseMoney, shortMoney, spendable, spentBy } from "./tripBudget";

describe("parseMoney", () => {
  it("reads lakh, thousand, crore and plain amounts", () => {
    expect(parseMoney("3l")).toBe(300000);
    expect(parseMoney("3.5 Lakh")).toBe(350000);
    expect(parseMoney("4 L")).toBe(400000);
    expect(parseMoney("75k")).toBe(75000);
    expect(parseMoney("1cr")).toBe(10000000);
    expect(parseMoney("₹3,00,000")).toBe(300000);
    expect(parseMoney("300000")).toBe(300000);
  });
  it("is 0 for anything that isn't an amount", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
    expect(parseMoney("3 to 4")).toBe(0);
    expect(parseMoney(null)).toBe(0);
  });
});

describe("shortMoney", () => {
  it("writes lakh-friendly amounts", () => {
    expect(shortMoney(300000)).toBe("₹3L");
    expect(shortMoney(350000)).toBe("₹3.5L");
    expect(shortMoney(75000)).toBe("₹75k");
    expect(shortMoney(950)).toBe("₹950");
    expect(shortMoney(12345678)).toBe("₹1.23Cr");
  });
});

describe("normalizeBudget / budgetRange", () => {
  it("swaps a reversed range, treats one amount as 'up to', and rejects empty", () => {
    expect(normalizeBudget({ min: 400000, max: 300000 })).toMatchObject({ min: 300000, max: 400000, per: "total" });
    expect(normalizeBudget({ max: 350000 })).toMatchObject({ min: 0, max: 350000 });
    expect(normalizeBudget({ min: 0, max: 0 })).toBeNull();
    expect(normalizeBudget(null)).toBeNull();
  });
  it("multiplies a per-person budget by the travellers", () => {
    expect(budgetRange(normalizeBudget({ min: 150000, max: 200000, per: "person", pax: 2 }))).toEqual({ min: 300000, max: 400000 });
    expect(budgetRange(normalizeBudget({ min: 300000, max: 400000, per: "total", pax: 2 }))).toEqual({ min: 300000, max: 400000 });
    expect(budgetRange(null)).toBeNull();
  });
});

describe("budgetStatus", () => {
  const r = { min: 300000, max: 400000 };
  it("is building, near the top, then over", () => {
    expect(budgetStatus(100000, r).state).toBe("building");
    expect(budgetStatus(370000, r)).toMatchObject({ state: "near", inRange: true, left: 30000, over: 0 });
    expect(budgetStatus(450000, r)).toMatchObject({ state: "over", over: 50000, left: 0, inRange: false });
    expect(budgetStatus(400000, r).state).toBe("near");
  });
  it("places the bottom of the range on the bar", () => {
    expect(budgetStatus(0, r).minPct).toBe(75);
  });
});

describe("spend split and the fits check", () => {
  const r = { min: 300000, max: 400000 };
  const data = (items: any[], nights = 4) => ({ nights, days: [{ items }] });
  it("holds 25% back for the ground and shares the rest", () => {
    expect(spendable(r)).toEqual({ flights: 60000, stays: 240000, ground: 100000 });
  });
  it("counts flights, stays (with nights) and other priced items; skips 'from' prices", () => {
    const d = data([
      { type: "flight", price: 10000 },
      { type: "hotel", price: 50000, duration: "2 nights" },
      { type: "hotel", price: 9999, priceIsFrom: true },
      { type: "visa", price: 3000 },
    ]);
    expect(spentBy(d)).toEqual({ flights: 10000, stays: 50000, other: 3000, flightCount: 1, stayNights: 2 });
  });
  it("hotel: cap per night is what is left for stays over the nights still to book", () => {
    expect(hotelFit(50000, r, data([]))).toEqual({ fits: true, over: 0, cap: 60000 });
    expect(hotelFit(70000, r, data([]))).toEqual({ fits: false, over: 10000, cap: 60000 });
    const afterOne = data([{ type: "hotel", price: 120000, duration: "2 nights" }]);
    expect(hotelFit(60000, r, afterOne)).toEqual({ fits: true, over: 0, cap: 60000 });
    expect(hotelFit(0, r, data([]))).toBeNull();
  });
  it("flight: cap is what is left for flights over the legs still to book", () => {
    expect(flightFit(25000, r, data([]))).toEqual({ fits: true, over: 0, cap: 30000 });
    expect(flightFit(35000, r, data([]))).toEqual({ fits: false, over: 5000, cap: 30000 });
    expect(flightFit(35000, r, data([{ type: "flight", price: 20000 }]))).toEqual({ fits: true, over: 0, cap: 40000 });
  });
});
