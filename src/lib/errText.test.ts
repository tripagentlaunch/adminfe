import { describe, expect, it } from "vitest";
import { errText, readableError } from "./errText";

const PAGE = 'TripJack SSR failed (HTTP 502): <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> '
  + "<head><title>tripjack.com | 502: Bad gateway</title></head><body><h1>Bad gateway</h1></body></html>";

describe("errText with a supplier's HTML error page", () => {
  it("keeps who failed and the status, drops the markup", () => {
    for (const out of [errText(new Error(PAGE)), errText(PAGE), errText({ detail: PAGE }), readableError(PAGE)]) {
      expect(out.startsWith("TripJack SSR failed (HTTP 502): ")).toBe(true);
      expect(out).toContain("502: Bad gateway");
      expect(out).toContain("try again in a minute");
      expect(out).not.toMatch(/[<>]|DOCTYPE/);
    }
  });
  it("handles a bare page, and leaves ordinary messages untouched", () => {
    expect(readableError("<html><head><title>503 Service Unavailable</title></head></html>"))
      .toMatch(/^The supplier's server answered with an error page \(503 Service Unavailable\)/);
    for (const ok of ["The selected room(s) are sold out.", "a < b and c > d", "Price changed to 4500.00"]) expect(errText(ok)).toBe(ok);
    expect(errText(null)).toBe("Something went wrong.");
    expect(errText({ detail: [{ loc: ["body", "x"], msg: "bad" }] })).toBe("x: bad");
  });
});
