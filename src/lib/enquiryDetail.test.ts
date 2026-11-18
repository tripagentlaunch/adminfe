import { describe, expect, it } from "vitest";
import { detailOf, EMPTY_NOTE, isWebsiteQuery } from "./enquiryDetail";

describe("detailOf", () => {
  it("reads the website form's labeled text as fields", () => {
    expect(detailOf("Destination: Nice\nDates: 5 Nov 2026 to 12 Nov 2026\nTravellers: 2\nTrip type: Family\nCabin: Business\nBudget: ₹5–10 lakh")).toEqual({
      source: "website_enquiry_form", destination: "Nice", travel_window: "5 Nov 2026 to 12 Nov 2026",
      travelers_count: "2", trip_type: "Family", flight_preference: "Business", budget_total: "₹5–10 lakh",
    });
  });
  it("counts a form sent with every field empty", () => {
    expect(detailOf("No trip details provided.").source).toBe("website_enquiry_form");
  });
  it("keeps an object as is and reads nothing from empty input", () => {
    const d = { destination: "Tokyo" };
    expect(detailOf(d)).toBe(d);
    expect(detailOf(null)).toEqual({});
    expect(detailOf("  ")).toEqual({});
  });
});

describe("isWebsiteQuery", () => {
  it("is a web enquiry with the form's text detail", () => {
    expect(isWebsiteQuery({ channel: "web", detail: "No trip details provided." })).toBe(true);
    expect(isWebsiteQuery({ channel: "web", detail: "Destination: Goa" })).toBe(true);
  });
  it("is not a Tara / WhatsApp enquiry", () => {
    expect(isWebsiteQuery({ channel: "web", detail: { destination: "Goa" } })).toBe(false);
    expect(isWebsiteQuery({ channel: "whatsapp", detail: "Destination: Goa" })).toBe(false);
    expect(isWebsiteQuery(null)).toBe(false);
  });
  it("exposes the empty-note default customerbe stores", () => {
    expect(EMPTY_NOTE).toMatch(/website/);
  });
});
