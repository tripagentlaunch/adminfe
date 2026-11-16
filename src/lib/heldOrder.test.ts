import { describe, expect, it } from "vitest";
import { canReuseHold } from "./heldOrder";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const base = { payBy: "2026-11-16T12:10:00Z", heldFor: "A", key: "A", now: NOW };

describe("canReuseHold", () => {
  it("reuses a running hold for the same details", () => {
    expect(canReuseHold(base)).toBe(true);
  });
  it("checks again when the details changed", () => {
    expect(canReuseHold({ ...base, key: "B" })).toBe(false);
  });
  it("checks again when the hold has run out, or is about to", () => {
    expect(canReuseHold({ ...base, payBy: "2026-11-16T11:59:00Z" })).toBe(false);
    expect(canReuseHold({ ...base, payBy: "2026-11-16T12:00:03Z" })).toBe(false);
  });
  it("checks when nothing is held yet or the time is unusable", () => {
    expect(canReuseHold({ ...base, payBy: null })).toBe(false);
    expect(canReuseHold({ ...base, heldFor: "", key: "" })).toBe(false);
    expect(canReuseHold({ ...base, payBy: "garbage" })).toBe(false);
  });
});
