import { describe, expect, it } from "vitest";
import { finalPriceView } from "./finalPrice";

// The proposal in the advisor's screenshot: a live flight, a vendor-quoted hotel, GST; trip total 3,53,661.
const LINES = [
  { label: "Air India 2779 + 2863 economy, MAA → BLR", sell: 21820, type: "flight" },
  { label: "The Oberoi · ten nights", sell: 315000, type: "hotel", offline: true },
  { label: "GST", sell: 16841, type: "charge" },
];
const sum = (ls: { sell: number }[]) => ls.reduce((n, l) => n + l.sell, 0);

describe("finalPriceView", () => {
  it("no live answer yet: the table is as quoted", () => {
    const v = finalPriceView(LINES, null, 353661, null);
    expect(v.lines.map((l) => l.sell)).toEqual([21820, 315000, 16841]);
    expect(v.total).toBe(353661);
    expect(v.was).toBeNull();
    expect(v.moved).toEqual([]);
  });
  it("nothing moved: the same table, the same total", () => {
    const v = finalPriceView(LINES, [{ kind: "flight", was: 20781, now: 20781, changed: false }], 353661, 353661);
    expect(v.lines.map((l) => l.sell)).toEqual([21820, 315000, 16841]);
    expect(v.lines.some((l) => l.was != null)).toBe(false);
    expect(v.was).toBeNull();
  });
  it("the flight moved: its line shows the new price on the table's own basis and the rows add up to the final total", () => {
    // supplier 20,781 -> 21,781 (+1,000): the table's flight line scales by 21,820 / 20,781; GST takes the rest of the change
    const v = finalPriceView(LINES, [{ kind: "flight", was: 20781, now: 21781, changed: true }], 353661, 355000);
    const flight = v.lines[0];
    expect(flight.was).toBe(21820);
    expect(flight.sell).toBe(Math.round(21820 + 1000 * (21820 / 20781)));
    expect(v.lines[1].sell).toBe(315000);                      // the vendor-quoted hotel never moves
    expect(v.lines[1].was).toBeUndefined();
    expect(sum(v.lines)).toBe(355000);                          // rows add up to the final total
    expect(v.total).toBe(355000);
    expect(v.was).toBe(353661);
    expect(v.moved).toEqual([{ label: LINES[0].label, was: 21820, now: flight.sell }]);
    expect(v.lines[2].was).toBe(16841);                         // GST moved with it
  });
  it("a price that came down", () => {
    const v = finalPriceView(LINES, [{ kind: "flight", was: 20781, now: 20000, changed: true }], 353661, 352700);
    expect(v.lines[0].sell).toBeLessThan(21820);
    expect(sum(v.lines)).toBe(352700);
  });
  it("two flights are matched in order", () => {
    const two = [{ label: "A", sell: 10000, type: "flight" }, { label: "B", sell: 20000, type: "flight" }, { label: "GST", sell: 1500, type: "charge" }];
    const v = finalPriceView(two, [{ kind: "flight", was: 9500, now: 9500 }, { kind: "flight", was: 19000, now: 20000, changed: true }], 31500, 32580);
    expect(v.lines[0].was).toBeUndefined();
    expect(v.lines[1].sell).toBeGreaterThan(20000);
    expect(sum(v.lines)).toBe(32580);
  });
  it("with no GST line the rest of the change is shown as its own row", () => {
    const v = finalPriceView([{ label: "Flight", sell: 10000, type: "flight" }], [{ kind: "flight", was: 9500, now: 9700, changed: true }], 10000, 10300);
    expect(sum(v.lines)).toBe(10300);
    expect(v.lines[v.lines.length - 1].label).toBe("Fees & taxes (updated)");
  });
});
