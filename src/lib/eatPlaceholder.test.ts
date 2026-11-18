import { describe, expect, it } from "vitest";
import { eatPlaceholder } from "./eatPlaceholder";

describe("eatPlaceholder", () => {
  it("is an inline SVG picture, the same for the same restaurant", () => {
    const a = eatPlaceholder("Farmlore");
    expect(a.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(decodeURIComponent(a)).toContain("<svg");
    expect(eatPlaceholder("Farmlore")).toBe(a);
  });
  it("differs between restaurants and copes with an empty name", () => {
    expect(eatPlaceholder("Karavalli")).not.toBe(eatPlaceholder("Farmlore"));
    expect(eatPlaceholder("")).toContain("svg");
  });
});
