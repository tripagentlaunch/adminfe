import { describe, expect, it } from "vitest";
import { MAX_SWAP_OPTIONS, addSwapOption, flightKeyOf, itineraryTotals, swapFlightAlternative } from "./itineraryFromCart";

const ISO = "2026-11-20";
const mix2 = { adults: 2, children: 0, infants: 0 };

const mainPricing = {
  fare: 9000, baseFare: 7000, taxes: 2000, fareName: "Saver", refundable: false, checkinKg: 15,
  checkedAt: "2026-11-01T10:00:00Z", extrasTotal: 700,
  extras: [
    { segment: "BLR → DEL", kind: "seat", label: "Seat 6A · Adult 1", price: 350, pax: 1 },
    { segment: "BLR → DEL", kind: "seat", label: "Seat 6B · Adult 2", price: 350, pax: 2 },
  ],
};
const altPricing = {
  fare: 8000, baseFare: 6500, taxes: 1500, fareName: "Flexi", refundable: true, checkinKg: 20,
  checkedAt: "2026-11-01T11:00:00Z", extrasTotal: 800,
  extras: [
    { segment: "BLR → DEL", kind: "meal", label: "Veg Meal · Adult 1", price: 400, pax: 1 },
    { segment: "BLR → DEL", kind: "meal", label: "Veg Meal · Adult 2", price: 400, pax: 2 },
  ],
};

function flightItem(over: any = {}) {
  return {
    id: "f1", type: "flight", title: "IndiGo 6E 6034 · BLR → DEL", time: "06:00", arrTime: "08:45",
    carrier: "IndiGo", flightNo: "6E 6034", origin: "BLR", dest: "DEL", stops: 0, price: 9700,
    baggageKg: 15, refundable: false, status: "on_hold",
    segments: [{ flightNo: "6E 6034", route: "BLR 06:00 → DEL 08:45", duration: "2h 45m" }],
    pricing: mainPricing, paxMix: mix2, chips: ["Saver"], meta: "Live TripSure price ...",
    alternatives: [] as any[],
    ...over,
  };
}
const itinerary = (item: any, extra: any[] = []) => ({ days: [{ id: "d1", _iso: ISO, route: "BLR → DEL", items: [item, ...extra] }] });

function altCart(over: any = {}) {
  return {
    type: "flight", airlineName: "Air India", flightNo: "AI 502", baseNet: 8800, refundable: true,
    _detail: { date: ISO, originCode: "BLR", destCode: "DEL", depTime: "09:00", arrTime: "11:50", stops: 0, duration: "2h 50m", baggageKg: 20,
      segments: [{ flightNo: "AI 502", from: "BLR", to: "DEL", depTime: "09:00", arrTime: "11:50", durationMin: 170 }] },
    paxMix: mix2,
    ...over,
  };
}

describe("flightKeyOf", () => {
  it("joins segment flight numbers and strips leading zeros", () => {
    expect(flightKeyOf({ segments: [{ flightNo: "IX 2945" }, { flightNo: "ix 01036" }] })).toBe("IX 2945+IX 1036");
    expect(flightKeyOf({ segments: [{ flightNo: " 6E 0603 " }] })).toBe("6E 603");
    expect(flightKeyOf({ segments: [{ flightNo: "AI 000" }] })).toBe("AI 0");
  });

  it("falls back to carrier|flightNo|time without usable segments", () => {
    expect(flightKeyOf({ carrier: "IndiGo", flightNo: "6E 6034", depTime: "06:00", segments: [{ flightNo: "6E6034" }] })).toBe("IndiGo|6E 6034|06:00");
    expect(flightKeyOf({ carrier: "IndiGo", flightNo: "6E 6034", time: "07:00" })).toBe("IndiGo|6E 6034|07:00");
    expect(flightKeyOf(null)).toBe("");
  });
});

describe("addSwapOption", () => {
  it("adds a live-priced alternative and keeps its pricing", () => {
    const r = addSwapOption(itinerary(flightItem()), altCart({ pricing: altPricing }));
    expect(r.ok).toBe(true);
    const alt = r.data.days[0].items[0].alternatives[0];
    expect(alt).toMatchObject({ carrier: "Air India", flightNo: "AI 502", origin: "BLR", dest: "DEL", depTime: "09:00", price: 8800, baggageKg: 20, refundable: true });
    expect(alt.pricing).toBe(altPricing);
    expect(alt.detail).toBe("2h 50m · Non-stop");
  });

  it("an unpriced alternative carries no pricing key", () => {
    const r = addSwapOption(itinerary(flightItem()), altCart());
    expect(r.ok).toBe(true);
    expect("pricing" in r.data.days[0].items[0].alternatives[0]).toBe(false);
  });

  it("refuses an option priced for a different traveller mix", () => {
    const data = itinerary(flightItem());
    const r = addSwapOption(data, altCart({ paxMix: { adults: 1 } }));
    expect(r.ok).toBe(false);
    expect(r.data).toBe(data);
    expect(r.message).toContain("1 adult");
    expect(r.message).toContain("2 adults");
  });

  it("refuses the main flight itself and a duplicate option", () => {
    const main = addSwapOption(itinerary(flightItem()), altCart({ flightNo: "6E 6034", _detail: { ...altCart()._detail, depTime: "06:00" } }));
    expect(main.ok).toBe(false);
    expect(main.message).toMatch(/already the main choice/);
    const once = addSwapOption(itinerary(flightItem()), altCart());
    const twice = addSwapOption(once.data, altCart());
    expect(twice.ok).toBe(false);
    expect(twice.message).toMatch(/Already a swap option/);
  });

  it("refuses beyond MAX_SWAP_OPTIONS", () => {
    let data: any = itinerary(flightItem());
    for (let i = 0; i < MAX_SWAP_OPTIONS; i++) {
      const r = addSwapOption(data, altCart({ flightNo: "AI " + (600 + i) }));
      expect(r.ok).toBe(true);
      data = r.data;
    }
    const r = addSwapOption(data, altCart({ flightNo: "AI 999" }));
    expect(r.ok).toBe(false);
    expect(r.message).toContain(String(MAX_SWAP_OPTIONS));
  });

  it("refuses when there's no matching flight on that day / route", () => {
    expect(addSwapOption(itinerary(flightItem()), altCart({ _detail: { ...altCart()._detail, destCode: "BOM" } })).ok).toBe(false);
    expect(addSwapOption(itinerary(flightItem()), altCart({ _detail: { ...altCart()._detail, date: "2026-12-01" } })).ok).toBe(false);
    expect(addSwapOption(null, altCart()).ok).toBe(false);
  });
});

describe("swapFlightAlternative", () => {
  const withAlts = () => {
    let data: any = itinerary(flightItem());
    data = addSwapOption(data, altCart({ pricing: altPricing })).data;
    data = addSwapOption(data, altCart({ flightNo: "UK 810", airlineName: "Vistara", baseNet: 12000, _detail: { ...altCart()._detail, depTime: "13:00", arrTime: "15:40", stops: 1 } })).data;
    return data;
  };

  it("makes the live-priced alternative the flight, with its own pricing and add-ons", () => {
    const out = swapFlightAlternative(withAlts(), "f1", 0);
    const it0 = out.days[0].items[0];
    expect(it0.flightNo).toBe("AI 502");
    expect(it0.carrier).toBe("Air India");
    expect(it0.price).toBe(8800);
    expect(it0.time).toBe("09:00");
    expect(it0.pricing).toBe(altPricing);
    expect(it0.title).toBe("Air India AI 502 · BLR → DEL");
    expect(it0.originalFlightNo).toBe("6E 6034");
    expect(flightKeyOf(it0)).toBe("AI 502");
    // chips/meta are rebuilt from the new pricing, never the old flight's
    expect(it0.chips).toContain("Flexi");
    expect(it0.chips).toContain("Refundable");
    expect(it0.chips).toContain("20 kg check-in");
    expect(it0.chips.some((c: string) => c.startsWith("Veg Meal × 2"))).toBe(true);
    expect(it0.chips.some((c: string) => c.includes("6A"))).toBe(false);
    expect(it0.meta).toContain("Live TripSure price for 2 adults");
    expect(it0.meta).toContain("₹800 add-ons");
  });

  it("demotes the previous flight into the slot with its own pricing", () => {
    const out = swapFlightAlternative(withAlts(), "f1", 0);
    const alts = out.days[0].items[0].alternatives;
    expect(alts).toHaveLength(2);
    expect(alts[0]).toMatchObject({ carrier: "IndiGo", flightNo: "6E 6034", origin: "BLR", dest: "DEL", depTime: "06:00", price: 9700 });
    expect(alts[0].pricing).toBe(mainPricing);
    expect(flightKeyOf(alts[0])).toBe("6E 6034");
    // comparisons are rewritten against the new choice's fare (8800)
    expect(alts[0].detail).toBe("Non-stop · ₹900 more than the selected fare");
    expect(alts[1].detail).toBe("1 stop · ₹3,200 more than the selected fare");
  });

  it("swapping back restores the original flight and pricing", () => {
    const once = swapFlightAlternative(withAlts(), "f1", 0);
    const back = swapFlightAlternative(once, "f1", 0).days[0].items[0];
    expect(back.flightNo).toBe("6E 6034");
    expect(back.pricing).toBe(mainPricing);
    expect(back.alternatives[0].pricing).toBe(altPricing);
  });

  it("an unpriced alternative brings no pricing and a 'not checked live' meta", () => {
    const out = swapFlightAlternative(withAlts(), "f1", 1).days[0].items[0];
    expect(out.flightNo).toBe("UK 810");
    expect(out.pricing).toBeNull();
    expect(out.chips).toEqual(["Refundable"]);
    expect(out.meta).toMatch(/not checked live/);
    expect(out.alternatives[1].pricing).toBe(mainPricing);
  });

  it("leaves other items and unknown indices alone", () => {
    const data = withAlts();
    expect(swapFlightAlternative(data, "f1", 9).days[0].items[0]).toBe(data.days[0].items[0]);
    expect(swapFlightAlternative(data, "nope", 0).days[0].items[0]).toBe(data.days[0].items[0]);
    expect(swapFlightAlternative(null, "f1", 0)).toBeNull();
  });
});

describe("itineraryTotals", () => {
  it("sums priced items, excludes 'from' prices, splits confirmed (booked) vs held", () => {
    const data = {
      days: [
        { items: [{ price: 1000, status: "booked" }, { price: 500, status: "on_hold" }, { price: 9999, priceIsFrom: true, status: "on_hold" }] },
        { items: [{ price: 0 }, { price: "250" }, { type: "note" }] },
      ],
      visa: { price: 3000, status: "in_progress" },
      totals: { grand: 123456, held: 6000 }, // stale running totals are ignored
    };
    expect(itineraryTotals(data)).toEqual({ grand: 4750, confirmed: 1000, held: 3750 });
  });

  it("is zero for an empty or missing itinerary", () => {
    expect(itineraryTotals({ days: [], totals: { grand: 6000, held: 6000 } })).toEqual({ grand: 0, confirmed: 0, held: 0 });
    expect(itineraryTotals(null)).toEqual({ grand: 0, confirmed: 0, held: 0 });
  });
});
