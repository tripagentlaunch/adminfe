import { expect, it } from "vitest";
import { itineraryCityTexts } from "./cityGuideText";

it("a hotel in a small place still gives the city that was searched", () => {
  const data = { days: [{ route: "Arpora", items: [{ type: "hotel", city: "Arpora", sub: "Arpora · 4★", searchCity: "Goa" }] }] };
  expect(itineraryCityTexts(data)).toContain("Goa");
});
