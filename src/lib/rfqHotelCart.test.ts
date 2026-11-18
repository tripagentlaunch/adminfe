import { describe, expect, it } from "vitest";
import { awardToHotelOffer, boardOf, nightsOf, refundableOf } from "./rfqHotelCart";

const award = {
  supplier: { name: "Oasis Hotels DMC", code: "OASIS" },
  offer: {
    id: 90125, base_net: 84000, international: true,
    detail: {
      total_amount: 84000, net_inr: 84000, cancellation: "free cancellation until 7 days", inclusions: ["breakfast", "airport transfer"],
      source: "rfq-award", rfq_id: "r1", quote_id: "q1",
    },
  },
};
const spec = { destination: "Dubai", check_in: "2030-03-10", check_out: "2030-03-14", rooms: 1, guests: 2 };

describe("nightsOf", () => {
  it("prefers an explicit count, then falls back to the dates", () => {
    expect(nightsOf({ nights: 5 })).toBe(5);
    expect(nightsOf({ los: "3" })).toBe(3);
    expect(nightsOf(spec)).toBe(4);
  });
  it("is null when it can't be known (or the dates run backwards)", () => {
    expect(nightsOf({})).toBeNull();
    expect(nightsOf({ check_in: "2030-03-14", check_out: "2030-03-10" })).toBeNull();
    expect(nightsOf({ check_in: "soon", check_out: "later" })).toBeNull();
    expect(nightsOf({ nights: 0 })).toBeNull();
  });
});

describe("boardOf", () => {
  it("picks the strongest meal plan named", () => {
    expect(boardOf(["breakfast"])).toBe("Breakfast Included");
    expect(boardOf(["breakfast", "half board"])).toBe("Half Board");
    expect(boardOf(["Full Board"])).toBe("Full Board");
    expect(boardOf(["all-inclusive", "breakfast"])).toBe("All Inclusive");
  });
  it("is Room Only when nothing is named", () => {
    expect(boardOf([])).toBe("Room Only");
    expect(boardOf(undefined)).toBe("Room Only");
    expect(boardOf(["airport transfer"])).toBe("Room Only");
  });
});

describe("refundableOf", () => {
  it("reads the bid's own words", () => {
    expect(refundableOf("free cancellation")).toBe(true);
    expect(refundableOf("Non-refundable")).toBe(false);
    expect(refundableOf("non refundable rate")).toBe(false);
    expect(refundableOf("No refund after booking")).toBe(false);
  });
  it("is null when the bid said nothing", () => {
    expect(refundableOf("")).toBeNull();
    expect(refundableOf(undefined)).toBeNull();
  });
});

describe("awardToHotelOffer", () => {
  it("maps an awarded bid into the offer shape the cart expects", () => {
    const o = awardToHotelOffer(award, spec);
    expect(o.base_net).toBe(84000);
    expect(o.international).toBe(true);
    expect(o.detail).toMatchObject({
      hotelName: "Oasis Hotels DMC", cityName: "Dubai", nights: 4, board: "Breakfast Included", refundable: true,
      source: "rfq-award", rfq_id: "r1", quote_id: "q1",
    });
  });
  it("never carries the offers-row id (it would become a fake public hotel link)", () => {
    expect(awardToHotelOffer(award, spec)).not.toHaveProperty("id");
  });
  it("treats unknown or non-refundable terms as not refundable", () => {
    const none = { ...award, offer: { ...award.offer, detail: { ...award.offer.detail, cancellation: undefined } } };
    expect(awardToHotelOffer(none, spec).detail.refundable).toBe(false);
    const nr = { ...award, offer: { ...award.offer, detail: { ...award.offer.detail, cancellation: "non-refundable" } } };
    expect(awardToHotelOffer(nr, spec).detail.refundable).toBe(false);
  });
  it("falls back to net_inr, and survives an empty award and no spec", () => {
    const o = awardToHotelOffer({ offer: { detail: { net_inr: 5000 } } }, null);
    expect(o.base_net).toBe(5000);
    expect(o.detail.hotelName).toBe("Hotel (RFQ)");
    expect(o.detail.nights).toBeUndefined();
    expect(awardToHotelOffer(undefined, undefined).base_net).toBe(0);
  });
});
