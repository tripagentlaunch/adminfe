import { describe, expect, it } from "vitest";
import { fareLockNote, reconcileSummary } from "./fareLock";

const AT = "2026-11-06T09:15:00.000Z";
const T = (iso: string) => new Date(iso).getTime();

describe("fareLockNote", () => {
  it("counts the minutes left to the pay-by time", () => {
    const n = fareLockNote(AT, T("2026-11-06T09:03:00.000Z"))!;
    expect(n.minsLeft).toBe(12);
    expect(n.expired).toBe(false);
    expect(n.soon).toBe(false);
    expect(n.clock).toMatch(/^\d{2}:\d{2}$/);
  });
  it("says so when five minutes or fewer are left", () => {
    expect(fareLockNote(AT, T("2026-11-06T09:10:30.000Z"))!.soon).toBe(true);
    expect(fareLockNote(AT, T("2026-11-06T09:11:00.000Z"))!.minsLeft).toBe(4);
  });
  it("is expired at and after the pay-by time, with no negative minutes", () => {
    const n = fareLockNote(AT, T("2026-11-06T09:20:00.000Z"))!;
    expect(n.expired).toBe(true);
    expect(n.minsLeft).toBe(0);
    expect(fareLockNote(AT, T(AT))!.expired).toBe(true);
  });
  it("is null when there is no usable time", () => {
    expect(fareLockNote(null)).toBeNull();
    expect(fareLockNote(undefined)).toBeNull();
    expect(fareLockNote("soon")).toBeNull();
  });
});

describe("reconcileSummary", () => {
  it("adds flights and hotels together", () => {
    expect(reconcileSummary({ checked: 2, settled: 1, still_open: 1 }, { checked: 1, settled: 1 })).toBe("Checked 3 with TripSure: 2 settled, 1 still open.");
  });
  it("mentions what could not be checked", () => {
    expect(reconcileSummary({ checked: 1, settled: 1, failed: 2 }, null)).toBe("Checked 1 with TripSure: 1 settled, 2 could not be checked.");
  });
  it("says when nothing was waiting", () => {
    expect(reconcileSummary({}, {})).toBe("Nothing is waiting for a check.");
    expect(reconcileSummary(null, undefined)).toBe("Nothing is waiting for a check.");
  });
  it("says why when everything was skipped", () => {
    expect(reconcileSummary({ skipped: 2 }, { skipped: 1 })).toContain("Nothing could be checked (3 skipped");
  });
});
