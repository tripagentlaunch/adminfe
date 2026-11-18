import { describe, expect, it } from "vitest";
import { checkCountdown } from "./checkCountdown";

describe("checkCountdown", () => {
  it("counts down from 20", () => {
    expect(checkCountdown(0)).toEqual({ remaining: 20, extra: 0, text: "20 seconds left" });
    expect(checkCountdown(1).remaining).toBe(19);
    expect(checkCountdown(3).remaining).toBe(17);
    expect(checkCountdown(19)).toEqual({ remaining: 1, extra: 0, text: "1 second left" });
  });
  it("does not sit at zero when the check takes longer", () => {
    expect(checkCountdown(20)).toEqual({ remaining: null, extra: 0, text: "Almost there…" });
    expect(checkCountdown(27)).toEqual({ remaining: null, extra: 7, text: "Still checking with the airline and hotel… 7s longer than usual" });
  });
  it("copes with odd input", () => {
    expect(checkCountdown(-4).remaining).toBe(20);
    expect(checkCountdown(2.9).remaining).toBe(18);
    expect(checkCountdown(5, 10).remaining).toBe(5);
  });
});
