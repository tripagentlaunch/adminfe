import { describe, expect, it } from "vitest";
import { firstSentence, itineraryCityTexts, pickLine } from "./cityGuideText";

describe("city guide helpers", () => {
  it("finds the cities an itinerary is about, once each", () => {
    const data = {
      destination: "Sydney", cities: ["Sydney", "Melbourne"],
      days: [{ route: "BOM → SYD", items: [{ type: "hotel", city: "Sydney", sub: "Sydney · 5★" }, { type: "flight", city: "Mumbai" }] }, { route: "Melbourne", city: "Melbourne" }],
    };
    const t = itineraryCityTexts(data);
    expect(t).toEqual(expect.arrayContaining(["Sydney", "Melbourne", "BOM → SYD"]));
    expect(t.filter((x) => x === "Sydney")).toHaveLength(1);
    expect(t).not.toContain("Mumbai");                                  // only a flight item's city, not a stay's
    expect(itineraryCityTexts({})).toEqual([]);
  });
  it("turns a pick into one line for the day's description", () => {
    const p = { name: "Quay", area: "Circular Quay", description: "Peter Gilmore's signature tasting menu. Book weeks ahead." };
    expect(pickLine(p)).toBe("Quay (Circular Quay): Peter Gilmore's signature tasting menu.");
    expect(pickLine({ name: "Bennelong" })).toBe("Bennelong.");
    expect(firstSentence("No full stop here")).toBe("No full stop here");
  });
});
