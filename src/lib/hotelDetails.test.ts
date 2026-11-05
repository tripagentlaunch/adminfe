import { describe, expect, it } from "vitest";
import { detailsProblem, rateBookingCode, rateRequirements } from "./hotelDetails";

describe("detailsProblem", () => {
  it("is null for a good, empty or missing response", () => {
    expect(detailsProblem(null)).toBeNull();
    expect(detailsProblem({})).toBeNull();
    expect(detailsProblem({ validResponse: true })).toBeNull();
  });
  it("relays the supplier's message, else a default", () => {
    expect(detailsProblem({ validResponse: false, partnerErrorMsg: "Session expired." })).toBe("TripSure says: Session expired.");
    expect(detailsProblem({ validResponse: false })).toMatch(/no details/);
  });
});

describe("rateBookingCode", () => {
  it("prefers roomType.bookingCode, falls back to recommendationId", () => {
    expect(rateBookingCode({ recommendationId: "REC" }, { bookingCode: "BK" })).toBe("BK");
    expect(rateBookingCode({ recommendationId: "REC" }, { bookingCode: "" })).toBe("REC");
    expect(rateBookingCode({ recommendationId: "REC" }, undefined)).toBe("REC");
  });
});

describe("rateRequirements", () => {
  it("lists PAN and passport only when mandatory", () => {
    expect(rateRequirements({ isPANMandatory: true, isPassportMandatory: true })).toEqual(["PAN required", "Passport required"]);
    expect(rateRequirements({ isPANMandatory: false })).toEqual([]);
    expect(rateRequirements(undefined)).toEqual([]);
  });
});

import { freeUntilOf, liveCheckChanges } from "./hotelDetails";

const rules = (end: string) => [{ rules: [{ value: 0, valueType: "Amount", end }, { value: 100, valueType: "Percentage" }] }];

describe("freeUntilOf", () => {
  it("finds the end of the zero-charge window", () => {
    expect(freeUntilOf(rules("2026-08-03T00:00:00+00:00"))).toBe("2026-08-03T00:00:00+00:00");
    expect(freeUntilOf([{ rules: [{ value: 100, valueType: "Percentage" }] }])).toBeNull();
    expect(freeUntilOf(null)).toBeNull();
  });
});

describe("liveCheckChanges", () => {
  const opt = { title: "Superior Room", refundable: true, freeUntil: "2026-08-03T00:00:00+00:00", cancellation: "Free cancellation until 2026-08-03T00:00:00+00:00." };
  const same = { roomType: { roomTitle: "Superior Room", refundable: true }, cancellationRules: rules("2026-08-03T12:00:00.000Z"), cancellation: "Free cancellation until 2026-08-03T12:00:00.000Z." };
  it("reports nothing when only timestamps differ", () => {
    expect(liveCheckChanges({ liveHotelName: "Hotel A", wasHotelName: "hotel a", rate: same, opt })).toEqual([]);
  });
  it("reports hotel, room, refundable, free-until and wording changes", () => {
    const rate = { roomType: { roomTitle: "Deluxe Room", refundable: false }, cancellationRules: rules("2026-08-01T00:00:00Z"), cancellation: "Non-refundable." };
    const c = liveCheckChanges({ liveHotelName: "Hotel B", wasHotelName: "Hotel A", rate, opt });
    expect(c).toEqual([
      'Hotel is now named "Hotel B" (was "Hotel A")',
      'Room is now "Deluxe Room"',
      "Now non-refundable",
      "Free cancellation now ends 2026-08-01 (was 2026-08-03)",
      "Cancellation terms have changed - read the updated terms",
    ]);
  });
  it("ignores wording when either side has none", () => {
    expect(liveCheckChanges({ rate: { ...same, cancellation: "" }, opt })).toEqual([]);
    expect(liveCheckChanges({ rate: same, opt: { ...opt, cancellation: "" } })).toEqual([]);
  });
});
