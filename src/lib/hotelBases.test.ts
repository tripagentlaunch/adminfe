import { describe, expect, it } from "vitest";
import { hotelBasesFromItinerary } from "./itineraryFromCart";

const day = (iso: string, city?: string) => ({ id: iso, _iso: iso, city, items: [{ type: "flight" }] });

describe("the stay the Hotels-tab suggestions are priced for", () => {
  it("runs to the end of the trip when only the first day has been built (the 1-night case of 13 Nov)", () => {
    const b = hotelBasesFromItinerary({ destination: "New Delhi", days: [day("2026-12-08")], startIso: "2026-12-08", endIso: "2026-12-12" });
    expect(b).toEqual([{ city: "New Delhi", checkIn: "2026-12-08", checkOut: "2026-12-12", nights: 4 }]);
  });
  it("is unchanged when the days already cover the trip (the last day is the departure day)", () => {
    const days = ["2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12"].map((d) => day(d));
    const b = hotelBasesFromItinerary({ destination: "New Delhi", days, startIso: "2026-12-08", endIso: "2026-12-12" });
    expect(b).toEqual([{ city: "New Delhi", checkIn: "2026-12-08", checkOut: "2026-12-12", nights: 4 }]);
  });
  it("is one night when the trip has no end date", () => {
    const b = hotelBasesFromItinerary({ destination: "New Delhi", days: [day("2026-12-08")] });
    expect(b).toEqual([{ city: "New Delhi", checkIn: "2026-12-08", checkOut: "2026-12-09", nights: 1 }]);
  });
  it("ignores an end date that is not a date", () => {
    const b = hotelBasesFromItinerary({ destination: "New Delhi", days: [day("2026-12-08")], endIso: "soon" });
    expect(b[0].nights).toBe(1);
  });
});

import { swapHotelAlternative } from "./itineraryFromCart";

describe("swapping a stay for one of its alternatives", () => {
  const facts = { highlights: ["Spa", "Pool"], mustKnow: ["Airport transfers on request"], nearby: ["Khan Market · 0.4 km"], checkIn: "2:00 PM", images: ["a.jpg"] };
  const data: any = { days: [{ id: "d1", _iso: "2026-12-08", items: [{
    id: "h1", type: "hotel", hotelKey: "AMB", title: "Ambassador", price: 97067, roomType: "Deluxe Twin Room with Balcony", duration: "4 nights", occupancy: [{}],
    detailRest: "4 nights · from ₹24,267/night", stars: 5, address: "Sujan Singh Park", facts: { highlights: ["Garden"] },
    alternatives: [{ hotelKey: "TAJ", name: "Taj Mahal, New Delhi", price: 131175, stars: 5, address: "Mansingh Road", roomTitle: "Luxury Room", facts }],
  }] }] };
  const item = (d: any) => d.days[0].items[0];

  it("brings the new hotel's own content, room and per-night price, not the old hotel's", () => {
    const out = swapHotelAlternative(data, "h1", "TAJ");
    expect(item(out).title).toBe("Taj Mahal, New Delhi");
    expect(item(out).facts).toBe(facts);                          // highlights, good to know, nearby, check-in all come along
    expect(item(out).roomType).toBe("Luxury Room");               // the room the proposal and Pay now re-search by, not "5-star"
    expect(item(out).detailRest).toBe("4 nights · from ₹32,794/night");
    expect(item(out).originalHotelKey).toBe("AMB");               // the original is still known, to be labelled Our choice
  });
  it("swapping back restores the original's room and content", () => {
    const back = swapHotelAlternative(swapHotelAlternative(data, "h1", "TAJ"), "h1", "AMB");
    expect(item(back).title).toBe("Ambassador");
    expect(item(back).roomType).toBe("Deluxe Twin Room with Balcony");
    expect(item(back).facts).toEqual({ highlights: ["Garden"] });
    expect(item(back).detailRest).toBe("4 nights · from ₹24,267/night");
  });
});
