import { describe, expect, it } from "vitest";
import { extrasOfferFrom } from "./droppedExtras";

const MSG = "TripSure now prices this booking at ₹5,511.50; the order charged ₹6,161.50 (fare ₹5,511.50 + extras ₹650.00). "
  + "Nothing was booked. The seat/baggage extras may not have reached the airline — check them before ticketing.";

describe("extrasOfferFrom", () => {
  it("reads the extras and the fare out of the backend's message", () => {
    expect(extrasOfferFrom(MSG)).toEqual({ extras: 650, fare: 5511.5 });
    expect(extrasOfferFrom(MSG.replace("₹650.00", "₹1,250.50"))).toEqual({ extras: 1250.5, fare: 5511.5 });
  });
  it("offers nothing for any other message", () => {
    for (const m of ["TripSure now prices this booking at ₹9,000.00; Accept the new fare to continue, or search again.",
      "Nothing was booked.", "", null, undefined, 5]) expect(extrasOfferFrom(m)).toBeNull();
  });
  it("offers nothing when the extras amount is missing or zero", () => {
    expect(extrasOfferFrom("The seat/baggage extras may not have reached the airline — check them before ticketing.")).toBeNull();
    expect(extrasOfferFrom("(fare ₹100.00 + extras ₹0.00). The seat/baggage extras may not have reached the airline")).toBeNull();
  });
});
