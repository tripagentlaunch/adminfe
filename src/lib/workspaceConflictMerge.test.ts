import { describe, expect, it } from "vitest";
import { mergeRefreshedItinerary } from "./itineraryFromCart";

// The save-conflict case: another window saved first. Our hotel (added since our last save) must survive.
const mk = (items: any[]) => ({ days: [{ id: "d2", _iso: "2026-12-24", items }], totals: { grand: 0, held: 0 } });
const felix = { id: "h-felix", type: "hotel", title: "Felix Homes", price: 100 };
const added = { id: "h-new", type: "hotel", title: "New hotel", price: 50 };
const theirs = { id: "f-1", type: "flight", title: "IndiGo 194", price: 10 };

describe("save conflict keeps the hotel just added", () => {
  it("our new hotel is kept on top of what the other window saved", () => {
    const base = mk([felix]);
    const mine = mk([felix, added]);
    const server = mk([felix, theirs]);
    const out = mergeRefreshedItinerary(base, mine, server);
    expect(out.days[0].items.map((i: any) => i.id).sort()).toEqual(["f-1", "h-felix", "h-new"]);
  });
  it("a hotel we added on a day the other window never had is kept too", () => {
    const base = mk([felix]);
    const mine = { ...mk([felix]), days: [...mk([felix]).days, { id: "d9", _iso: "2026-12-27", items: [added] }] };
    const out = mergeRefreshedItinerary(base, mine, mk([felix, theirs]));
    expect(out.days.flatMap((d: any) => d.items.map((i: any) => i.id))).toContain("h-new");
  });
});
