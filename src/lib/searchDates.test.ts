import { describe, expect, it } from "vitest";
import { nearbyDates, offsetDateStr } from "./searchDates";

describe("offsetDateStr", () => {
  it("moves by whole days whatever the timezone", () => {
    expect(offsetDateStr("2026-11-06", 0)).toBe("2026-11-06");
    expect(offsetDateStr("2026-11-06", 3)).toBe("2026-11-09");
    expect(offsetDateStr("2026-11-06", -3)).toBe("2026-11-03");
  });
  it("crosses month and year ends", () => {
    expect(offsetDateStr("2026-12-30", 3)).toBe("2027-01-02");
    expect(offsetDateStr("2026-03-02", -3)).toBe("2026-02-27");
  });
});

describe("nearbyDates", () => {
  it("is seven days centred on the date asked for", () => {
    expect(nearbyDates("2026-11-20", "2026-11-06")).toEqual([
      "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23",
    ]);
  });
  it("leaves out days before today", () => {
    expect(nearbyDates("2026-11-06", "2026-11-06")).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(nearbyDates("2026-11-07", "2026-11-06")[0]).toBe("2026-11-06");
  });
  it("keeps the date asked for even if it is already past", () => {
    expect(nearbyDates("2026-11-01", "2026-11-06")).toContain("2026-11-01");
  });
});
