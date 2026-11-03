import { beforeEach, describe, expect, it, vi } from "vitest";

const priceMock = vi.fn();
vi.mock("../services/api", () => ({ price: (...a: any[]) => priceMock(...a) }));

import { applyFlightChoices, buildFlightOptions, type FlightOption } from "./proposalFlightOptions";

const line = (label: string, sell: number) => ({ label, sell });
const opt = (key: string, id: string, flightSell: number, total: number, label = "Flight " + key): FlightOption => ({
  key, flight: { id, key }, costLines: [line(label, flightSell), line("Hotel", 5000), line("GST", 100)], grandTotal: total,
});

function data() {
  const f1 = [opt("6E 6034", "f1", 10000, 15100), opt("AI 502", "f1", 9000, 14050), opt("UK 810", "f1", 12000, 17200)];
  const f2 = [opt("6E 100", "f2", 4000, 15100, "Return 6E 100"), opt("AI 900", "f2", 4500, 15650, "Return AI 900")];
  return {
    flights: [{ id: "f1", key: "6E 6034" }, { id: "f2", key: "6E 100" }],
    // a two-flight trip: lines as [f1 flight, hotel, GST] — f2's options shift the same rows
    costLines: [line("Flight 6E 6034", 10000), line("Hotel", 5000), line("GST", 100)],
    grandTotal: 15100,
    _flightOptions: { f1, f2 },
  };
}

describe("applyFlightChoices", () => {
  it("returns the same object with no (or no effective) choice", () => {
    const d = data();
    expect(applyFlightChoices(d, null)).toBe(d);
    expect(applyFlightChoices(d, {})).toBe(d);
    expect(applyFlightChoices(d, { f1: "6E 6034" })).toBe(d); // the base option
    expect(applyFlightChoices(d, { f1: "XX 1" })).toBe(d); // unknown key
    expect(applyFlightChoices(d, { nope: "AI 502" })).toBe(d); // unknown flight
  });

  it("one choice: that option's flight, cost lines and total", () => {
    const d = data();
    const out = applyFlightChoices(d, { f1: "AI 502" });
    expect(out).not.toBe(d);
    expect(out.flights[0]).toEqual({ id: "f1", key: "AI 502" });
    expect(out.flights[1]).toBe(d.flights[1]);
    expect(out.costLines).toEqual([line("Flight AI 502", 9000), line("Hotel", 5000), line("GST", 100)]);
    expect(out.grandTotal).toBe(14050);
    expect(d.grandTotal).toBe(15100); // input not mutated
  });

  it("two flights chosen: deltas against each base are summed", () => {
    const out = applyFlightChoices(data(), { f1: "UK 810", f2: "AI 900" });
    expect(out.flights.map((f: any) => f.key)).toEqual(["UK 810", "AI 900"]);
    // row 0: 10000 + (12000-10000) + (4500-4000) = 12500
    expect(out.costLines.map((l: any) => l.sell)).toEqual([12500, 5000, 100]);
    // 15100 + (17200-15100) + (15650-15100)
    expect(out.grandTotal).toBe(17750);
  });

  it("an unknown key on one flight is ignored while the other applies", () => {
    const out = applyFlightChoices(data(), { f1: "nope", f2: "AI 900" });
    expect(out.flights.map((f: any) => f.key)).toEqual(["6E 6034", "AI 900"]);
    expect(out.grandTotal).toBe(15650);
  });

  it("falls back to the last option's lines when the shape differs", () => {
    const d = data();
    d._flightOptions.f1[1] = { ...d._flightOptions.f1[1], costLines: [line("Only", 1)], grandTotal: 1 };
    const out = applyFlightChoices(d, { f1: "AI 502" });
    expect(out.costLines).toEqual([line("Only", 1)]);
    expect(out.grandTotal).toBe(1);
  });
});

describe("buildFlightOptions (price mocked)", () => {
  beforeEach(() => { priceMock.mockReset(); });

  const pricing = (fare: number) => ({ fare, extras: [], checkedAt: "2026-11-01T10:00:00Z" });
  const itinerary = {
    days: [{
      id: "d1", _iso: "2026-11-20", route: "BLR → DEL", items: [
        {
          id: "f1", type: "flight", title: "IndiGo 6E 6034 · BLR → DEL", time: "06:00", carrier: "IndiGo", flightNo: "6E 6034",
          origin: "BLR", dest: "DEL", price: 9700, segments: [{ flightNo: "6E 6034", route: "BLR 06:00 → DEL 08:45" }],
          pricing: pricing(9700),
          alternatives: [
            { carrier: "Vistara", flightNo: "UK 810", origin: "BLR", dest: "DEL", depTime: "13:00", price: 12000, segments: [{ flightNo: "UK 810" }] },
            { carrier: "Air India", flightNo: "AI 502", origin: "BLR", dest: "DEL", depTime: "09:00", price: 8800, segments: [{ flightNo: "AI 502" }], pricing: pricing(8800) },
          ],
        },
        { id: "f2", type: "flight", title: "Unpriced · DEL → BLR", flightNo: "6E 1", price: 5000, alternatives: [{ flightNo: "AI 1", price: 4000, pricing: pricing(4000) }] },
      ],
    }],
  };
  const base = { flights: [{ id: "f1", key: "6E 6034" }], costLines: [{ label: "Flight", sell: 9700 }], grandTotal: 9700 };

  it("prices each live-priced alternative of a live-priced flight with that flight swapped in", async () => {
    priceMock.mockImplementation(async (req: any) => {
      const sell = req.cart.items[0].baseNet;
      return { pricing: { lines: [{ type: "flight", label: "Flight", sell }], grandTotal: sell + 100 } };
    });
    const out = await buildFlightOptions(itinerary, base, { id: "m1" }, "adv1", true, null, {});
    expect(priceMock).toHaveBeenCalledTimes(1); // only AI 502 (the unpriced UK 810 and unpriced f2 are skipped)
    const req = priceMock.mock.calls[0][0];
    expect(req).toMatchObject({ member_id: "m1", advisor_id: "adv1", cart: { inclusive: true } });
    expect(req.cart.items[0]).toMatchObject({ type: "flight", baseNet: 8800 });
    expect(req.cart.items.every((it: any) => Object.keys(it).every((k) => !k.startsWith("_")))).toBe(true);
    expect(Object.keys(out)).toEqual(["f1"]);
    expect(out.f1.map((o) => o.key)).toEqual(["6E 6034", "AI 502"]);
    expect(out.f1[0].flight).toBe(base.flights[0]);
    expect(out.f1[1].grandTotal).toBe(8900);
    expect(out.f1[1].flight.flightNo).toBe("AI 502");
    expect(out.f1[1].costLines[0].sell).toBe(8800);
  });

  it("drops an option whose quote fails, and the flight when none is left", async () => {
    priceMock.mockResolvedValue({ pricing: null });
    const out = await buildFlightOptions(itinerary, base, null, null, false, null, {});
    expect(out).toEqual({});
    const req = priceMock.mock.calls[0][0];
    expect("member_id" in req).toBe(false);
    expect("advisor_id" in req).toBe(false);
  });
});
