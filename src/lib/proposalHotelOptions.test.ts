import { beforeEach, describe, expect, it, vi } from "vitest";

const priceMock = vi.fn();
vi.mock("../services/api", () => ({ price: (...a: any[]) => priceMock(...a) }));

import { applyHotelChoices, buildHotelOptions, hotelKeysOf, swappable, type HotelOption } from "./proposalHotelOptions";

const line = (label: string, sell: number) => ({ label, sell });
const opt = (key: string, id: string, stay: number, total: number, label = "Stay " + key): HotelOption => ({
  key, stay: { id, hotelKey: key }, costLines: [line("Flight", 8000), line(label, stay), line("GST", 100)], grandTotal: total,
});

function data() {
  const h1 = [opt("OWN", "s1", 36000, 44100), opt("ALT-A", "s1", 70000, 78100), opt("ALT-B", "s1", 30000, 38100)];
  const h2 = [opt("OWN2", "s2", 20000, 44100, "Stay OWN2"), opt("ALT-C", "s2", 25000, 49100, "Stay ALT-C")];
  return {
    stays: [{ id: "s1", hotelKey: "OWN" }, { id: "s2", hotelKey: "OWN2" }],
    costLines: [line("Flight", 8000), line("Stay OWN", 36000), line("GST", 100)],
    grandTotal: 44100,
    _hotelOptions: { s1: h1, s2: h2 },
  };
}

describe("applyHotelChoices", () => {
  it("returns the same object with no (or no effective) choice", () => {
    const d = data();
    expect(applyHotelChoices(d, null)).toBe(d);
    expect(applyHotelChoices(d, {})).toBe(d);
    expect(applyHotelChoices(d, { s1: "OWN" })).toBe(d); // the advisor's own pick
    expect(applyHotelChoices(d, { s1: "NOPE" })).toBe(d); // not offered
    expect(applyHotelChoices(d, { nope: "ALT-A" })).toBe(d); // unknown stay
  });

  it("one choice: that hotel's stay, cost lines and total", () => {
    const d = data();
    const out = applyHotelChoices(d, { s1: "ALT-A" });
    expect(out.stays[0]).toEqual({ id: "s1", hotelKey: "ALT-A" });
    expect(out.stays[1]).toBe(d.stays[1]);
    expect(out.costLines.map((l: any) => l.sell)).toEqual([8000, 70000, 100]);
    expect(out.grandTotal).toBe(78100);
    expect(d.grandTotal).toBe(44100); // input not mutated
  });

  it("two stays chosen: the differences add up", () => {
    const out = applyHotelChoices(data(), { s1: "ALT-B", s2: "ALT-C" });
    expect(out.stays.map((s: any) => s.hotelKey)).toEqual(["ALT-B", "ALT-C"]);
    expect(out.grandTotal).toBe(44100 + (38100 - 44100) + (49100 - 44100));
  });

  it("sits on top of a flight choice: its total is kept and the hotel's difference added", () => {
    const d = { ...data(), grandTotal: 46100 }; // flight choice already moved the total by +2000
    expect(applyHotelChoices(d, { s1: "ALT-A" }).grandTotal).toBe(46100 + (78100 - 44100));
  });

  it("falls back to the option's own lines when the shape differs", () => {
    const d = data();
    d._hotelOptions.s1[1] = { ...d._hotelOptions.s1[1], costLines: [line("Only", 1)], grandTotal: 1 };
    const out = applyHotelChoices(d, { s1: "ALT-A" });
    expect(out.costLines).toEqual([line("Only", 1)]);
    expect(out.grandTotal).toBe(1);
  });
});

describe("hotelKeysOf", () => {
  it("lists a stay's offered hotels, none for a stay without options", () => {
    expect(hotelKeysOf(data(), "s1")).toEqual(["OWN", "ALT-A", "ALT-B"]);
    expect(hotelKeysOf(data(), "s9")).toEqual([]);
    expect(hotelKeysOf({}, "s1")).toEqual([]);
  });
});

describe("swappable", () => {
  const cur = { hotelKey: "OWN" };
  const ok = { hotelKey: "A", price: 5000, roomTitle: "Family Suite" };
  it("needs a real other hotel, a live price and the room it was priced for", () => {
    expect(swappable(ok, cur)).toBe(true);
    expect(swappable({ ...ok, hotelKey: "OWN" }, cur)).toBe(false);
    expect(swappable({ ...ok, hotelKey: "MOCK-1" }, cur)).toBe(false);
    expect(swappable({ ...ok, price: 0 }, cur)).toBe(false);
    expect(swappable({ ...ok, roomTitle: null }, cur)).toBe(false);
    expect(swappable({ ...ok, manualPrice: { vendor: "x" } }, cur)).toBe(false);
  });
});

describe("buildHotelOptions (price mocked)", () => {
  beforeEach(() => { priceMock.mockReset(); });

  const itinerary = {
    days: [{
      id: "d1", _iso: "2026-12-24", items: [
        {
          id: "s1", type: "hotel", title: "Grandeur De Sanchi", hotelKey: "OWN", price: 36000, roomType: "Deluxe", duration: "2 nights",
          alternatives: [
            { hotelKey: "ALT-A", name: "Vagator Downtown", price: 70000, roomTitle: "Family Rooms" },
            { hotelKey: "ALT-NOROOM", name: "No room", price: 50000 },
            { hotelKey: "MOCK-9", name: "Mock", price: 40000, roomTitle: "x" },
          ],
        },
        { id: "s2", type: "hotel", title: "Lonely", hotelKey: "ONLY", price: 1000, alternatives: [{ hotelKey: "B", name: "B", price: 900 }] },
      ],
    }],
  };
  const base = { stays: [{ id: "s1", hotelKey: "OWN" }, { id: "s2", hotelKey: "ONLY" }], costLines: [{ label: "Stay", sell: 36000 }], grandTotal: 36100 };

  it("prices each bookable alternative with that hotel swapped in, and skips the rest", async () => {
    priceMock.mockImplementation(async (req: any) => {
      const sell = req.cart.items[0].baseNet;
      return { pricing: { lines: [{ type: "hotel", label: "Stay", sell }], grandTotal: sell + 100 } };
    });
    const out = await buildHotelOptions(itinerary, base, { id: "m1" }, "adv1", true, null, {});
    expect(priceMock).toHaveBeenCalledTimes(1); // only ALT-A: no room / mock / a stay with no bookable alternative are skipped
    expect(priceMock.mock.calls[0][0].cart.items[0]).toMatchObject({ type: "hotel", baseNet: 70000 });
    expect(Object.keys(out)).toEqual(["s1"]);
    expect(out.s1.map((o) => o.key)).toEqual(["OWN", "ALT-A"]);
    expect(out.s1[0].stay).toBe(base.stays[0]);
    expect(out.s1[1].grandTotal).toBeGreaterThan(0);
  });

  it("drops an option whose quote fails, and the stay when none is left", async () => {
    priceMock.mockResolvedValue({ pricing: null });
    expect(await buildHotelOptions(itinerary, base, null, null, false, null, {})).toEqual({});
  });
});
