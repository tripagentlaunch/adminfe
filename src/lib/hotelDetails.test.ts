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
