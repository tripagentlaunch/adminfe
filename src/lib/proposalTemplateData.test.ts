import { describe, expect, it } from "vitest";
import { buildProposalTemplateData } from "./proposalTemplateData";

const ISO = "2026-11-20";
const mix = { adults: 2, children: 0, infants: 0 };
const livePricing = (fare: number, extras: any[] = []) => ({
  fare, baseFare: fare - 1000, taxes: 1000, fareName: "Saver", refundable: false, checkinKg: 15,
  checkedAt: "2026-11-01T10:00:00Z", extrasTotal: extras.reduce((n, x) => n + x.price, 0), extras,
});
const seg = (no: string, r: string) => [{ flightNo: no, route: r, duration: "2h 45m" }];

const altLive = {
  carrier: "Air India", flightNo: "AI 502", origin: "BLR", dest: "DEL", depTime: "09:00", arrTime: "11:50", stops: 0,
  price: 8800, baggageKg: 20, refundable: true, detail: "Non-stop", segments: [{ flightNo: "AI 0502", from: "BLR", to: "DEL" }],
  pricing: livePricing(8000, [
    { segment: "BLR → DEL", kind: "meal", label: "Veg · Adult 1", price: 400, pax: 1 },
    { segment: "BLR → DEL", kind: "seat", label: "Seat 3A · Adult 1", price: 400, pax: 1 },
  ]),
};
const altLiveNoAddons = { ...altLive, flightNo: "AI 504", depTime: "12:00", segments: [{ flightNo: "AI 504" }], pricing: livePricing(8500) };
const altFareOnly = { ...altLive, flightNo: "AI 506", depTime: "15:00", segments: [{ flightNo: "AI 506" }], pricing: { ...livePricing(7900), fareOnly: true } };
const altUnpriced = { carrier: "Vistara", flightNo: "UK 810", depTime: "13:00", arrTime: "15:40", stops: 1, price: 12000, segments: [{ flightNo: "UK 810" }] };

const flight = (over: any = {}) => ({
  id: "f1", type: "flight", title: "IndiGo 6E 6034 · BLR → DEL", time: "06:00", arrTime: "08:45", duration: "2h 45m",
  carrier: "IndiGo", flightNo: "6E 6034", origin: "BLR", dest: "DEL", stops: 0, price: 9700, cabin: "ECONOMY",
  status: "on_hold", segments: seg("6E 6034", "BLR 06:00 → DEL 08:45"), paxMix: mix,
  pricing: livePricing(9000), alternatives: [altUnpriced, altLive, altFareOnly, altLiveNoAddons],
  ...over,
});
const itin = (f: any) => ({ days: [{ id: "d1", _iso: ISO, route: "BLR → DEL", label: "Day 1", items: [f] }] });

describe("buildProposalTemplateData — flight alternatives", () => {
  it("next to a live-priced main, lists only priced options and keeps altIndex / key", () => {
    const t = buildProposalTemplateData(itin(flight()), null, null, null);
    const f = t.flights[0];
    expect(f.key).toBe("6E 6034");
    expect(f.alternatives.map((a: any) => a.altIndex)).toEqual([1, 2, 3]); // the unpriced UK 810 (index 0) is dropped
    const [live, fareOnly, liveNone] = f.alternatives;
    expect(live).toMatchObject({ flightNo: "AI 502", key: "AI 502", livePriced: true, fareOnly: false, addonsNote: "incl. 1 seat · 1 meal", price: 8800 });
    expect(live.facts).toEqual(["Economy", "20 kg check-in", "Refundable"]);
    expect(fareOnly).toMatchObject({ flightNo: "AI 506", key: "AI 506", livePriced: false, fareOnly: true, addonsNote: null });
    expect(liveNone).toMatchObject({ flightNo: "AI 504", livePriced: true, fareOnly: false, addonsNote: "no add-ons" });
  });

  it("next to an unpriced main, lists every option (none fareOnly unless main is priced)", () => {
    const t = buildProposalTemplateData(itin(flight({ pricing: null })), null, null, null);
    const alts = t.flights[0].alternatives;
    expect(alts.map((a: any) => a.altIndex)).toEqual([0, 1, 2, 3]);
    expect(alts[0]).toMatchObject({ flightNo: "UK 810", key: "UK 810", livePriced: false, fareOnly: false, addonsNote: null, stops: 1 });
    expect(alts.every((a: any) => a.fareOnly === false)).toBe(true);
    expect(t.flights[0].fareLine).toBeNull();
  });

  it("without a quote, cost lines fall back to item prices and total matches them", () => {
    const t = buildProposalTemplateData(itin(flight()), null, null, null);
    expect(t.costLines).toHaveLength(1);
    expect(t.costLines[0].sell).toBe(9700);
    expect(t.grandTotal).toBe(9700);
  });

  it("with a quote, scales the flight and its alternatives to the customer price", () => {
    const pricing = { lines: [{ type: "flight", label: "Flight", sell: 11640 }], grandTotal: 11640 };
    const t = buildProposalTemplateData(itin(flight()), pricing, null, null);
    const f = t.flights[0];
    expect(f.price).toBe(11640);
    const ratio = 11640 / 9700;
    expect(f.alternatives[0].price).toBe(Math.round(8800 * ratio));
    expect(t.grandTotal).toBe(11640);
  });
});

describe("buildProposalTemplateData — where to eat", () => {
  const eat = (id: string, name: string, meal: "lunch" | "dinner") => ({
    id, name, area: "MG Road", tier: "Fine", credentials: ["Asia's 50 Best Restaurants 2025: No. 68"], description: "A farm table.",
    city: "Bengaluru", url: "https://www.tripagent.vip/city-bengaluru", meal,
  });
  const trip = () => ({
    days: [
      { id: "d1", _iso: "2026-12-07", route: "Bengaluru", label: "Day 1", items: [], dining: [eat("bengaluru:farmlore", "Farmlore", "dinner")] },
      { id: "d2", _iso: "2026-12-08", route: "Bengaluru", label: "Day 2", items: [], dining: [eat("bengaluru:farmlore", "Farmlore", "dinner"), eat("bengaluru:karavalli", "Karavalli", "lunch")] },
      { id: "d3", _iso: "2026-12-09", route: "Bengaluru", label: "Day 3", items: [] },
    ],
  });

  it("puts each day's restaurants in the day plan, even for a day with no other text", () => {
    const t = buildProposalTemplateData(trip(), null, null, null);
    expect(t.dayPlan.map((d: any) => [d.label, d.dining.map((e: any) => e.name)])).toEqual([
      ["Day 1", ["Farmlore"]],
      ["Day 2", ["Farmlore", "Karavalli"]],
    ]);
  });

  it("groups the trip's restaurants by city, once each, with the website's city page", () => {
    const t = buildProposalTemplateData(trip(), null, null, null);
    expect(t.whereToEat).toHaveLength(1);
    expect(t.whereToEat[0]).toMatchObject({ city: "Bengaluru", url: "https://www.tripagent.vip/city-bengaluru" });
    expect(t.whereToEat[0].picks.map((p: any) => p.name)).toEqual(["Farmlore", "Karavalli"]);
  });

  it("shows nothing when no day has a restaurant", () => {
    const t = buildProposalTemplateData({ days: [{ id: "d1", _iso: "2026-12-07", route: "Bengaluru", label: "Day 1", items: [] }] }, null, null, null);
    expect(t.whereToEat).toEqual([]);
    expect(t.dayPlan).toEqual([]);
  });
});

describe("buildProposalTemplateData — offline prices", () => {
  const T = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const manual = (amount: number, hoursAgo: number) => ({ amount, vendor: "Secret DMC", note: "internal", at: T(hoursAgo) });
  const trip = () => ({
    days: [{ id: "d1", _iso: "2026-12-07", route: "DEL → BLR", label: "Day 1", items: [
      { id: "h1", type: "hotel", title: "Taj West End", price: 105000, status: "on_hold", manualPrice: manual(105000, 3), hotelKey: "123", checkIn: "2026-12-07", checkOut: "2026-12-11" },
      { id: "f1", type: "flight", title: "Air India 427", price: 18000, status: "on_hold", origin: "DEL", dest: "BLR", segments: [{ flightNo: "AI 427" }] },
    ] }],
  });

  it("flags the offline stay and its cost line, not the live flight", () => {
    const t: any = buildProposalTemplateData(trip(), null, null, null);
    expect(t.stays[0].offline).toBe(true);
    expect(t.flights[0].offline).toBe(false);
    expect(t.costLines.find((l: any) => /Taj/.test(l.label)).offline).toBe(true);
    expect(t.costLines.find((l: any) => /Air India/.test(l.label)).offline).toBe(false);
  });
  it("carries the banner's facts and never the vendor or the note", () => {
    const t: any = buildProposalTemplateData(trip(), null, null, null);
    expect(t.offlineNotice).toMatchObject({ hours: 12, expired: false, count: 1 });
    expect(Date.parse(t.offlineNotice.validUntil) - Date.now()).toBeGreaterThan(8.9 * 3_600_000);
    expect(Date.parse(t.offlineNotice.validUntil) - Date.now()).toBeLessThan(9.1 * 3_600_000);
    expect(JSON.stringify(t)).not.toContain("Secret DMC");
    expect(JSON.stringify(t)).not.toContain("internal");
    expect(typeof t.preparedAt).toBe("string");
  });
  it("has no notice when nothing is offline, and marks an old one expired", () => {
    const live = { days: [{ id: "d1", _iso: "2026-12-07", route: "DEL → BLR", label: "Day 1", items: [{ id: "f1", type: "flight", title: "AI", price: 1, status: "on_hold", origin: "DEL", dest: "BLR" }] }] };
    expect((buildProposalTemplateData(live, null, null, null) as any).offlineNotice).toBeNull();
    const old = trip(); old.days[0].items[0].manualPrice = manual(105000, 14);
    expect((buildProposalTemplateData(old, null, null, null) as any).offlineNotice.expired).toBe(true);
  });

  it("gives an offline-priced flight no swap options, and keeps them for a live one", () => {
    const alt = { carrier: "Air India", flightNo: "AI 2819", depTime: "15:00", arrTime: "17:45", stops: 0, price: 14557, pricing: { source: "tripsure_live", total: 14557 } };
    const live = { id: "f1", type: "flight", title: "AI 427", price: 18000, status: "on_hold", origin: "DEL", dest: "BLR", segments: [{ flightNo: "AI 427" }], pricing: { source: "tripsure_live", total: 18000 }, alternatives: [alt] };
    const mk = (f: any) => buildProposalTemplateData({ days: [{ id: "d1", _iso: "2026-12-07", route: "DEL → BLR", label: "Day 1", items: [f] }] }, null, null, null) as any;
    expect(mk(live).flights[0].alternatives).toHaveLength(1);
    const off = { ...live, price: 15500, pricing: undefined, manualPrice: manual(15500, 1) };
    expect(mk(off).flights[0].alternatives).toEqual([]);
    expect(mk(off).flights[0].offline).toBe(true);
  });
});
