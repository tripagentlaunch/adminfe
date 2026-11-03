import { describe, expect, it, vi } from "vitest";

// Only the pure helpers are under test: keep the React / API imports out of the node run.
vi.mock("../ui", () => ({ Icon: () => null }));
vi.mock("./SeatMap", () => ({ SeatMap: () => null }));
vi.mock("../../services/api", () => ({ inr: (n: number) => `₹${n}` }));

import {
  NO_PICK, emptySel, extrasCounts, extrasList, extrasSum, paxSlots, selSegments, withPick,
  type Pick,
} from "./FlightExtras";

const seat = (code: string, price = 300): Pick => ({ code, label: `Seat ${code}`, price });
const meal: Pick = { code: "VGML", label: "Veg Meal", price: 400 };
const bag: Pick = { code: "XB5", label: "Extra 5 kg", price: 1500 };

describe("paxSlots", () => {
  it("is a single 'Traveller' for one adult (and for nonsense input)", () => {
    expect(paxSlots(1, 0)).toEqual([{ n: 1, label: "Traveller" }]);
    expect(paxSlots()).toEqual([{ n: 1, label: "Traveller" }]);
    expect(paxSlots(0, -2)).toEqual([{ n: 1, label: "Traveller" }]);
  });

  it("lists adults then children with the lead labelled, numbered as pax_index", () => {
    expect(paxSlots(2, 1)).toEqual([
      { n: 1, label: "Adult 1 (lead)" },
      { n: 2, label: "Adult 2" },
      { n: 3, label: "Child 1" },
    ]);
  });

  it("labels the lead when the only other traveller is a child", () => {
    expect(paxSlots(1, 2).map((p) => p.label)).toEqual(["Adult 1 (lead)", "Child 1", "Child 2"]);
  });

  it("has no infant slots (infants take no add-ons; the signature has no infants)", () => {
    expect(paxSlots(2, 0)).toHaveLength(2);
  });
});

describe("emptySel / withPick", () => {
  it("builds segments × travellers of NO_PICK, at least 1×1", () => {
    const s = emptySel(2, 3);
    expect(s).toHaveLength(2);
    expect(s.every((r) => r.length === 3 && r.every((p) => p === NO_PICK))).toBe(true);
    expect(emptySel(0, 0)).toEqual([[NO_PICK]]);
  });

  it("sets one cell without mutating the input or NO_PICK", () => {
    const s0 = emptySel(2, 2);
    const s1 = withPick(s0, 1, 0, "seat", seat("6A"));
    expect(s0[1][0]).toBe(NO_PICK);
    expect(NO_PICK).toEqual({ seat: null, baggage: null, meal: null });
    expect(s1[1][0]).toEqual({ seat: seat("6A"), baggage: null, meal: null });
    expect(s1[0]).toBe(s0[0]); // untouched segment row reused
    expect(s1[1][1]).toBe(NO_PICK);
    const s2 = withPick(s1, 1, 0, "meal", meal);
    expect(s2[1][0]).toEqual({ seat: seat("6A"), baggage: null, meal });
    const s3 = withPick(s2, 1, 0, "seat", null);
    expect(s3[1][0].seat).toBeNull();
    expect(s3[1][0].meal).toEqual(meal);
  });
});

describe("extrasList / selSegments / extrasSum / extrasCounts", () => {
  const pax = paxSlots(2, 1);
  let sel = emptySel(2, 3);
  sel = withPick(sel, 0, 0, "seat", seat("6A"));
  sel = withPick(sel, 0, 0, "meal", meal);
  sel = withPick(sel, 0, 2, "baggage", bag);
  sel = withPick(sel, 1, 1, "seat", seat("9C", 250));

  it("extrasList: every pick with its segment and traveller, baggage/seat/meal order", () => {
    const l = extrasList(sel, pax);
    expect(l.map((x) => [x.seg, x.pax.label, x.kind, x.pick.code])).toEqual([
      [0, "Adult 1 (lead)", "seat", "6A"],
      [0, "Adult 1 (lead)", "meal", "VGML"],
      [0, "Child 1", "baggage", "XB5"],
      [1, "Adult 2", "seat", "9C"],
    ]);
  });

  it("extrasList falls back to 'Traveller n' when the pax list is short", () => {
    const l = extrasList(sel, [{ n: 1, label: "Traveller" }]);
    expect(l.find((x) => x.kind === "baggage")!.pax).toEqual({ n: 3, label: "Traveller 3" });
  });

  it("selSegments: one entry per segment × traveller with something, 1-based", () => {
    expect(selSegments(sel)).toEqual([
      { segment_order: 1, pax_index: 1, seat: { code: "6A", label: "Seat 6A", price: 300 }, baggage: null, meal: { code: "VGML", label: "Veg Meal", price: 400 } },
      { segment_order: 1, pax_index: 3, seat: null, baggage: { code: "XB5", label: "Extra 5 kg", price: 1500 }, meal: null },
      { segment_order: 2, pax_index: 2, seat: { code: "9C", label: "Seat 9C", price: 250 }, baggage: null, meal: null },
    ]);
    expect(selSegments(emptySel(2, 2))).toEqual([]);
  });

  it("extrasSum adds every price; extrasCounts counts and words them", () => {
    expect(extrasSum(sel)).toBe(300 + 400 + 1500 + 250);
    expect(extrasSum(emptySel(1, 1))).toBe(0);
    expect(extrasCounts(sel)).toEqual({ bag: 1, seat: 2, meal: 1, text: "1 baggage, 2 seats, 1 meal" });
    expect(extrasCounts(emptySel(1, 1)).text).toBe("");
  });
});
