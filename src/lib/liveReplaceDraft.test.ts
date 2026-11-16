import { describe, expect, it } from "vitest";
import { addCartItemToItinerary, applyManualPrice, clearManualPrice, itineraryTotals, manualPriceState, offlineNoticeOf, refreshManualPrices, replacesExisting } from "./itineraryFromCart";
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

describe("offline price: held for 12 hours, never a live price", () => {
  const live = { id: "f-1", type: "flight", status: "on_hold", price: 18000, pricing: { source: "tripsure_live", total: 18000 } };
  const T0 = "2026-11-17T06:00:00Z";
  it("drops the TripSure live price details, and clearing brings them back", () => {
    const m = applyManualPrice(live, { amount: 64500 }, T0);
    expect(m.pricing).toBeUndefined();
    expect(clearManualPrice(m).pricing).toEqual({ source: "tripsure_live", total: 18000 });
  });
  it("is held until 12 hours after it was entered", () => {
    const now = Date.parse("2026-11-17T08:00:00Z");
    const s = manualPriceState({ at: T0 }, now);
    expect(s.validUntil).toBe("2026-11-17T18:00:00.000Z");
    expect(s.expired).toBe(false);
    expect(s.msLeft).toBe(10 * 3_600_000);
    expect(manualPriceState({ at: T0 }, Date.parse("2026-11-17T18:00:00Z")).expired).toBe(true);
    expect(manualPriceState({ at: "2026-11-17T09:00:00Z" }, now).validUntil).toBe("2026-11-17T20:00:00.000Z"); // an entry time ahead of the clock counts as now
    expect(manualPriceState({}, now).expired).toBe(true);
  });
  it("the banner uses the earliest expiry among the offline items and ignores live ones", () => {
    const a = applyManualPrice({ id: "a", type: "hotel", status: "on_hold" }, { amount: 105000 }, "2026-11-17T05:00:00Z");
    const b = applyManualPrice(live, { amount: 9000 }, "2026-11-17T08:00:00Z");
    const c = { id: "c", type: "flight", status: "on_hold", price: 1 };
    const n = offlineNoticeOf([{ items: [a, b, c] }], Date.parse("2026-11-17T09:00:00Z"));
    expect(n).toEqual({ hours: 12, validUntil: "2026-11-17T17:00:00.000Z", expired: false, count: 2 });
    expect(offlineNoticeOf([{ items: [c] }])).toBeNull();
    expect(offlineNoticeOf([{ items: [a] }], Date.parse("2026-11-18T09:00:00Z"))!.expired).toBe(true);
  });
  it("refreshing restarts the 12 hours for every unconfirmed offline item", () => {
    const a = applyManualPrice({ id: "a", type: "hotel", status: "on_hold" }, { amount: 105000, vendor: "V" }, T0);
    const done = { ...applyManualPrice({ id: "z", type: "hotel", status: "on_hold" }, { amount: 5 }, T0), status: "confirmed" };
    const r = refreshManualPrices({ days: [{ items: [a, done, { id: "n", type: "flight" }] }] }, "2026-11-17T20:00:00Z");
    const [ra, rz, rn] = r.days[0].items;
    expect(ra.manualPrice.at).toBe("2026-11-17T20:00:00Z");
    expect(ra.manualPrice.amount).toBe(105000);
    expect(ra.manualPrice.vendor).toBe("V");
    expect(rz.manualPrice.at).toBe(T0);
    expect(rn.manualPrice).toBeUndefined();
  });
});
