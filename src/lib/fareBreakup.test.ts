import { describe, expect, it } from "vitest";
import { fareBreakup } from "./fareBreakup";

describe("fareBreakup", () => {
  it("splits a fare into base, taxes, other charges and total that add up", () => {
    const b = fareBreakup({ baseFare: 4070, totalTax: 1781, totalFare: 6301 })!;
    expect(b.lines.map((l) => [l.key, l.amount])).toEqual([["base", 4070], ["taxes", 1781], ["other", 450], ["total", 6301]]);
    const parts = b.lines.filter((l) => l.key !== "total").reduce((n, l) => n + l.amount, 0);
    expect(parts).toBe(b.total);
  });
  it("leaves out Other charges when base + taxes already make the total (or differ by rounding)", () => {
    expect(fareBreakup({ baseFare: 3350, totalTax: 1299, totalFare: 4649 })!.lines.map((l) => l.key)).toEqual(["base", "taxes", "total"]);
    expect(fareBreakup({ baseFare: 3350.4, totalTax: 1299, totalFare: 4649 })!.lines.map((l) => l.key)).toEqual(["base", "taxes", "total"]);
  });
  it("reads numbers sent as strings and the older `taxes` name", () => {
    const b = fareBreakup({ baseFare: "1000", taxes: "200", totalFare: "1200" })!;
    expect(b.total).toBe(1200);
    expect(b.lines.find((l) => l.key === "taxes")!.amount).toBe(200);
  });
  it("is null when it cannot be broken up honestly", () => {
    for (const bad of [null, undefined, {}, "x", { totalFare: 5000 }, { baseFare: 100, totalFare: 5000 },
      { baseFare: 100, totalTax: 50, totalFare: 0 }, { baseFare: -5, totalTax: 50, totalFare: 100 },
      { baseFare: 4000, totalTax: 2000, totalFare: 5000 }, { baseFare: "", totalTax: "", totalFare: 100 }]) {
      expect(fareBreakup(bad)).toBeNull();
    }
  });
});
