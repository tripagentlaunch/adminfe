import { describe, expect, it } from "vitest";
import {
  buildAmendDetail, changedFields, describeDelta, rateDelta, seedForm, validateAmend, type HotelBefore,
} from "./hotelAmend";

const before: HotelBefore = {
  leg_id: "leg-1", hotelName: "Taj Test", checkIn: "2030-03-10", checkOut: "2030-03-13",
  roomType: "Deluxe Room", board: "Room Only", boardCode: "RO", pax: 2, sell: 80000,
};

describe("seedForm", () => {
  it("starts from what is booked, with no new price", () => {
    expect(seedForm(before)).toEqual({
      checkIn: "2030-03-10", checkOut: "2030-03-13", roomType: "Deluxe Room", board: "RO", pax: "2", newSell: "",
    });
  });
  it("copes with a booking that has gaps", () => {
    expect(seedForm({ sell: 0 })).toEqual({ checkIn: "", checkOut: "", roomType: "", board: "", pax: "", newSell: "" });
  });
});

describe("rate difference", () => {
  const f = (newSell: string) => ({ ...seedForm(before), newSell });
  it("is positive when the new stay costs more (add-collect)", () => {
    expect(rateDelta(before, f("95000"))).toBe(15000);
    expect(describeDelta(before, f("95000"))).toEqual({ kind: "collect", amount: 15000 });
  });
  it("is negative when it costs less (refund)", () => {
    expect(rateDelta(before, f("70000"))).toBe(-10000);
    expect(describeDelta(before, f("70000"))).toEqual({ kind: "refund", amount: 10000 });
  });
  it("is 'none' at the same price and 'pending' with no price entered", () => {
    expect(describeDelta(before, f("80000"))).toEqual({ kind: "none", amount: 0 });
    expect(describeDelta(before, f(""))).toEqual({ kind: "pending", amount: 0 });
    expect(rateDelta(before, f(""))).toBe(0);
  });
  it("rounds a fractional price to whole rupees", () => {
    expect(rateDelta(before, f("80000.6"))).toBe(1);
  });
});

describe("changedFields", () => {
  it("is empty for an untouched form", () => {
    expect(changedFields(before, seedForm(before))).toEqual([]);
  });
  it("names exactly what changed, using the backend's field names", () => {
    const form = { ...seedForm(before), checkOut: "2030-03-14", board: "BB", pax: "3", roomType: "Suite", newSell: "90000" };
    expect(changedFields(before, form)).toEqual(["checkOut", "roomType", "boardCode", "pax", "sell"]);
  });
  it("ignores whitespace-only room edits and an unchanged price", () => {
    expect(changedFields(before, { ...seedForm(before), roomType: "  Deluxe Room ", newSell: "80000" })).toEqual([]);
  });
});

describe("validateAmend", () => {
  const ok = { ...seedForm(before), roomType: "Suite" };
  it("accepts a real change", () => expect(validateAmend(before, ok)).toBeNull());
  it("refuses a form with nothing changed", () => {
    expect(validateAmend(before, seedForm(before))).toMatch(/at least one/i);
  });
  it("refuses check-out on or before check-in", () => {
    expect(validateAmend(before, { ...ok, checkOut: "2030-03-10" })).toMatch(/after check-in/i);
    expect(validateAmend(before, { ...ok, checkIn: "2030-03-20" })).toMatch(/after check-in/i);
  });
  it("refuses unreadable dates", () => {
    expect(validateAmend(before, { ...ok, checkIn: "soon" })).toMatch(/valid date/i);
  });
  it("refuses bad guest counts", () => {
    for (const pax of ["0", "21", "1.5", "two"]) expect(validateAmend(before, { ...ok, pax })).toMatch(/guests/i);
  });
  it("refuses a negative or non-numeric price", () => {
    expect(validateAmend(before, { ...ok, newSell: "-1" })).toMatch(/price/i);
    expect(validateAmend(before, { ...ok, newSell: "lots" })).toMatch(/price/i);
  });
});

describe("buildAmendDetail", () => {
  it("builds the case detail and never sends a rate difference", () => {
    const d = buildAmendDetail(before, { ...seedForm(before), roomType: " Suite ", pax: "3", newSell: "95000.4" });
    expect(d).toEqual({
      amend_kind: "hotel", leg_id: "leg-1",
      after: { checkIn: "2030-03-10", checkOut: "2030-03-13", roomType: "Suite", board: "RO", pax: 3, sell: 95000 },
    });
    expect(d).not.toHaveProperty("fare_diff_inr");
  });
  it("leaves out fields that are blank", () => {
    const d = buildAmendDetail({ sell: 100 }, { checkIn: "", checkOut: "", roomType: "", board: "", pax: "", newSell: "" });
    expect(d.after).toEqual({});
  });
});
