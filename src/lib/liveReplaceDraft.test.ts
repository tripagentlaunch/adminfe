import { describe, expect, it } from "vitest";
import { addCartItemToItinerary, applyManualPrice, clearManualPrice, itineraryTotals, replacesExisting } from "./itineraryFromCart";
import { sameHotelName } from "./livePriceRequest";

const draftFlight = { id: "f-0", type: "flight", status: "draft", flightNo: "414 + 2863", origin: "BLR", dest: "VIE", price: 50000, title: "Tara draft" };
const draftHotel = { id: "h-0", type: "hotel", status: "draft", hotelKey: null, title: "Hotel Sacher", price: 20000 };
const data: any = {
  days: [
    { id: "d1", _iso: "2026-12-22", route: "BLR → VIE", items: [draftFlight] },
    { id: "d2", _iso: "2026-12-23", route: "Vienna", items: [draftHotel] },
  ],
  totals: { grand: 70000, held: 0 },
};

const liveFlight = {
  type: "flight", _cid: "c1", _title: "Emirates EK 414", baseNet: 61234, flightNo: "AI 414 + AI 2863", originCode: "BLR", destCode: "VIE",
  _searchDate: "2026-12-22", _detail: { date: "2026-12-22", originCode: "BLR", destCode: "VIE", segments: [] },
};
const liveHotel = {
  type: "hotel", _cid: "c2", _title: "Hotel Sacher Wien", baseNet: 33000, hotelKey: "HK1", checkIn: "2026-12-23", _detail: { cityName: "Vienna", nights: 2 },
};

describe("Get live price replaces the Tara draft", () => {
  it("a live flight with 'AI 414 + AI 2863' replaces the draft '414 + 2863' (no duplicate)", () => {
    expect(replacesExisting(data, liveFlight)).toBe(true);
    const out = addCartItemToItinerary(data, liveFlight);
    const items = out.days.flatMap((d: any) => d.items).filter((i: any) => i.type === "flight");
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(61234);
    expect(items[0].id).toBe("f-0");
  });

  it("a live hotel replaces the draft hotel by item id, even with no hotel key", () => {
    const cart = { ...liveHotel, _replaces: "h-0" };
    expect(replacesExisting(data, cart)).toBe(true);
    const out = addCartItemToItinerary(data, cart);
    const hotels = out.days.flatMap((d: any) => d.items).filter((i: any) => i.type === "hotel");
    expect(hotels).toHaveLength(1);
    expect(hotels[0].hotelKey).toBe("HK1");
    expect(hotels[0].id).toBe("h-0");
  });

  it("without _replaces a hotel is added next to the draft (old behaviour)", () => {
    const out = addCartItemToItinerary(data, liveHotel);
    expect(out.days.flatMap((d: any) => d.items).filter((i: any) => i.type === "hotel")).toHaveLength(2);
  });
});

describe("sameHotelName", () => {
  it("ignores case, punctuation and filler words", () => {
    expect(sameHotelName("The Taj Mahal Palace", "Taj Mahal Palace Hotel")).toBe(true);
    expect(sameHotelName("Hotel Sacher", "Hotel Sacher Wien")).toBe(true);
    expect(sameHotelName("Hotel Sacher", "Imperial Riding School")).toBe(false);
    expect(sameHotelName("", "Hotel Sacher")).toBe(false);
  });
});

describe("manual (offline vendor) price", () => {
  const draft = { id: "f-0", type: "flight", status: "draft", price: 18000, priceIsFrom: true, nextStep: "Not yet searched", meta: "From Tara's plan" };
  it("sets a real price, no longer a draft/from, and keeps the old state", () => {
    const m = applyManualPrice(draft, { amount: 64500, vendor: "Acme Travels", note: "valid till Fri" }, "2026-11-12T10:00:00Z");
    expect(m.price).toBe(64500);
    expect(m.priceIsFrom).toBe(false);
    expect(m.status).toBe("on_hold");
    expect(m.meta).toContain("Acme Travels");
    expect(itineraryTotals({ days: [{ items: [m] }] }).grand).toBe(64500);
  });
  it("editing again keeps the ORIGINAL earlier price; clearing restores it", () => {
    const once = applyManualPrice(draft, { amount: 64500 });
    const twice = applyManualPrice(once, { amount: 70000, vendor: "X" });
    expect(twice.price).toBe(70000);
    const back = clearManualPrice(twice);
    expect(back.price).toBe(18000);
    expect(back.priceIsFrom).toBe(true);
    expect(back.status).toBe("draft");
    expect(back.manualPrice).toBeUndefined();
  });
  it("refuses zero / negative / confirmed items", () => {
    expect(applyManualPrice(draft, { amount: 0 })).toBe(draft);
    expect(applyManualPrice(draft, { amount: -5 })).toBe(draft);
    const conf = { ...draft, status: "confirmed" };
    expect(applyManualPrice(conf, { amount: 100 })).toBe(conf);
  });
});
