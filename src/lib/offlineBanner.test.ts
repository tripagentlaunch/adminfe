import { describe, expect, it } from "vitest";
import { leftText, untilText } from "./offlineBanner";

describe("untilText", () => {
  it("shows the time in IST whatever the computer's zone is", () => {
    expect(untilText("2026-11-17T12:30:00Z")).toBe("Tue, 17 Nov, 6:00 PM IST");
    expect(untilText("2026-11-17T18:00:00Z")).toBe("Tue, 17 Nov, 11:30 PM IST");
  });
  it("is empty for nothing usable", () => {
    expect(untilText(null)).toBe("");
    expect(untilText("garbage")).toBe("");
  });
});

describe("leftText", () => {
  it("counts down in hours and minutes", () => {
    expect(leftText(11 * 3_600_000 + 42 * 60_000)).toBe("11h 42m left");
    expect(leftText(42 * 60_000)).toBe("42m left");
    expect(leftText(2 * 3_600_000)).toBe("2h 0m left");
    expect(leftText(30_000)).toBe("under a minute left");
    expect(leftText(0)).toBe("expired");
    expect(leftText(-5)).toBe("expired");
  });
});
