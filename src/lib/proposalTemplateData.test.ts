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
