import { describe, expect, it } from "vitest";
import { addonCount, addonLines, addonTable } from "./flightAddons";

const SEG1 = "BLR → DEL";
const SEG2 = "DEL → BOM";

describe("addonTable", () => {
  it("returns an empty table for no extras", () => {
    expect(addonTable(null)).toEqual([]);
    expect(addonTable(undefined)).toEqual([]);
    expect(addonTable([])).toEqual([]);
  });

  it("builds one row per traveller with seat / meal / baggage cells", () => {
    const t = addonTable([
      { segment: SEG1, kind: "seat", code: "6B", label: "Seat 6B · Adult 2", price: 300, pax: 2 },
      { segment: SEG1, kind: "seat", code: "6A", label: "Seat 6A · Adult 1", price: 350, pax: 1 },
      { segment: SEG1, kind: "meal", code: "VGML", label: "Veg Meal · Adult 1", price: 400, pax: 1 },
      { segment: SEG1, kind: "baggage", code: "XB5", label: "Extra 5 kg · Adult 2", price: 1500, pax: 2 },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].segment).toBe(SEG1);
    expect(t[0].kinds).toEqual(["seat", "meal", "baggage"]);
    // sorted by pax index, not insertion order
    expect(t[0].rows.map((r) => r.who)).toEqual(["Adult 1", "Adult 2"]);
    expect(t[0].rows[0]).toEqual({
      who: "Adult 1",
      seat: { label: "6A", price: 350 },
      meal: { label: "Veg Meal", price: 400 },
      baggage: null,
    });
    expect(t[0].rows[1]).toEqual({
      who: "Adult 2",
      seat: { label: "6B", price: 300 },
      meal: null,
      baggage: { label: "Extra 5 kg", price: 1500 },
    });
  });

  it("splits per segment in first-seen order and keeps kinds per segment", () => {
    const t = addonTable([
      { segment: SEG1, kind: "seat", label: "Seat 1A · Adult 1", price: 100, pax: 1 },
      { segment: SEG2, kind: "meal", label: "Snack · Adult 1", price: 200, pax: 1 },
    ]);
    expect(t.map((s) => s.segment)).toEqual([SEG1, SEG2]);
    expect(t[0].kinds).toEqual(["seat"]);
    expect(t[1].kinds).toEqual(["meal"]);
  });

  it("drops NoBaggage / NoMeal at ₹0 but keeps a priced item with the same code", () => {
    const t = addonTable([
      { segment: SEG1, kind: "baggage", code: "NoBaggage", label: "NoBaggage · Adult 1", price: 0, pax: 1 },
      { segment: SEG1, kind: "meal", code: "NoMeal", label: "NoMeal", price: 0 },
      { segment: SEG1, kind: "meal", code: "No Meal", label: "No Meal", price: 0 },
    ]);
    expect(t).toEqual([]);
    const kept = addonTable([{ segment: SEG1, kind: "baggage", code: "NoBaggage", label: "NoBaggage", price: 50 }]);
    expect(kept[0].rows[0].baggage).toEqual({ label: "NoBaggage", price: 50 });
  });

  it("puts old items (no pax, no ' · who' suffix) on the lead traveller", () => {
    const t = addonTable([
      { segment: SEG1, kind: "seat", code: "12C", label: "Seat 12C", price: 250 },
      { segment: SEG1, kind: "meal", code: "VGML", label: "Veg Meal", price: 300 },
    ]);
    expect(t[0].rows).toEqual([
      { who: "Lead traveller", seat: { label: "12C", price: 250 }, meal: { label: "Veg Meal", price: 300 }, baggage: null },
    ]);
  });

  it("names a traveller by index when pax is set but the label carries no suffix", () => {
    const t = addonTable([{ segment: SEG1, kind: "meal", label: "Veg Meal", price: 300, pax: 3 }]);
    expect(t[0].rows[0].who).toBe("Traveller 3");
  });

  it("treats an unknown kind as baggage and a missing segment as ''", () => {
    const t = addonTable([{ kind: "other", label: "Sports kit", price: 999 }]);
    expect(t[0].segment).toBe("");
    expect(t[0].rows[0].baggage).toEqual({ label: "Sports kit", price: 999 });
  });
});

describe("addonLines", () => {
  const meals = Array.from({ length: 5 }, (_, i) => ({
    segment: SEG1, kind: "meal", code: "CMP", label: `Corporate Meal Plan · Adult ${i + 1}`, price: 450, pax: i + 1,
  }));

  it("groups the same meal across travellers into 'Meal × 5' with the summed price", () => {
    expect(addonLines(meals)).toEqual([{ label: `Corporate Meal Plan × 5 · ${SEG1}`, amount: 2250 }]);
  });

  it("omits the segment when withSegment is false", () => {
    expect(addonLines(meals, false)).toEqual([{ label: "Corporate Meal Plan × 5", amount: 2250 }]);
  });

  it("lists seats of one segment on one line", () => {
    const seats = [
      { segment: SEG1, kind: "seat", label: "Seat 6A · Adult 1", price: 300, pax: 1 },
      { segment: SEG1, kind: "seat", label: "Seat 6B · Adult 2", price: 300.5, pax: 2 },
      { segment: SEG2, kind: "seat", label: "Seat 9C · Adult 1", price: 200, pax: 1 },
    ];
    expect(addonLines(seats)).toEqual([
      { label: `Seats 6A, 6B · ${SEG1}`, amount: 600.5 },
      { label: `Seat 9C · ${SEG2}`, amount: 200 },
    ]);
  });

  it("keeps a single item without '× 1' and drops ₹0 'nothing' items", () => {
    expect(addonLines([
      { segment: SEG1, kind: "baggage", label: "Extra 5 kg · Adult 1", price: 1500, pax: 1 },
      { segment: SEG1, kind: "baggage", code: "NoBaggage", label: "NoBaggage · Adult 2", price: 0, pax: 2 },
    ])).toEqual([{ label: `Extra 5 kg · ${SEG1}`, amount: 1500 }]);
  });

  it("keeps different meals on separate lines and handles empty input", () => {
    expect(addonLines([
      { segment: SEG1, kind: "meal", label: "Veg · Adult 1", price: 100, pax: 1 },
      { segment: SEG1, kind: "meal", label: "Non-veg · Adult 2", price: 120, pax: 2 },
    ]).map((l) => l.label)).toEqual([`Veg · ${SEG1}`, `Non-veg · ${SEG1}`]);
    expect(addonLines(null)).toEqual([]);
  });
});

describe("addonCount", () => {
  it("counts seats, meals and extra bags with singular/plural", () => {
    const x = [
      ...Array.from({ length: 9 }, () => ({ kind: "seat", price: 100 })),
      ...Array.from({ length: 5 }, () => ({ kind: "meal", price: 100 })),
      ...Array.from({ length: 2 }, () => ({ kind: "baggage", price: 100 })),
    ];
    expect(addonCount(x)).toBe("9 seats · 5 meals · 2 extra bags");
    expect(addonCount([{ kind: "seat", price: 1 }, { kind: "baggage", price: 1 }])).toBe("1 seat · 1 extra bag");
    expect(addonCount([{ kind: "meal", price: 1 }])).toBe("1 meal");
  });

  it("ignores NoBaggage/NoMeal and returns '' for nothing", () => {
    expect(addonCount([{ kind: "baggage", code: "NoBaggage", price: 0 }, { kind: "meal", code: "NoMeal", price: 0 }])).toBe("");
    expect(addonCount(undefined)).toBe("");
  });
});
