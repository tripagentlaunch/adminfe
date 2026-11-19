import { describe, expect, it } from "vitest";
import { keepWithinBudget } from "./hotelListing";

const hotels = [{ id: "a", t: 30000 }, { id: "b", t: 50000 }, { id: "c", t: 80000 }, { id: "d", t: null, gone: false }, { id: "e", t: null, gone: true }];
const price = (o: any) => o.t;
const gone = (o: any) => !!o.gone;

describe("stay budget filter", () => {
  it("keeps hotels up to the budget (the budget itself fits)", () => {
    expect(keepWithinBudget(hotels, 50000, price, gone).map((o) => o.id)).toEqual(["a", "b", "d"]);
  });
  it("a hotel still being priced stays; one with no rooms goes", () => {
    const ids = keepWithinBudget(hotels, 10000, price, gone).map((o) => o.id);
    expect(ids).toContain("d");
    expect(ids).not.toContain("e");
    expect(ids).not.toContain("a");
  });
  it("no budget keeps everything", () => {
    expect(keepWithinBudget(hotels, 0, price, gone)).toHaveLength(5);
  });
});
