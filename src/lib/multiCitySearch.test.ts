import { describe, expect, it } from "vitest";
import { blankLeg, type McLeg } from "./multiCity";
import { searchTrip, type SearchDeps } from "./multiCitySearch";

const leg = (from: string, to: string, date: string): McLeg => ({ ...blankLeg(from, date), to });
const LEGS = [leg("DEL", "BOM", "2026-11-20"), leg("BOM", "GOI", "2026-11-23"), leg("GOI", "DEL", "2026-11-26")];
const P = { pax: 2, children: 0, infants: 0, cabin: "economy" };
const o = (id: string, leg?: string) => ({ id, leg });

function deps(over: Partial<SearchDeps> = {}) {
  const log = { multi: 0, single: [] as any[], cleared: 0 };
  const d: SearchDeps = {
    multi: async () => { log.multi++; return { offers: [o("a", "ONWARD"), o("b", "RETURN"), o("c", "SEG3")], errors: [{ e: 1 }] }; },
    single: async (p) => { log.single.push(p); return { offers: [o(`${p.originCode}${p.destCode}`)], errors: [] }; },
    clearCache: () => { log.cleared++; },
    ...over,
  };
  return { d, log };
}

describe("searchTrip", () => {
  it("uses the one multi-city search when it gives one group per leg, tagging them LEG_1..", async () => {
    const { d, log } = deps();
    const r = await searchTrip(LEGS, P, d);
    expect(r.viaMulti).toBe(true);
    expect(r.offers.map((x) => [x.id, x.leg])).toEqual([["a", "LEG_1"], ["b", "LEG_2"], ["c", "LEG_3"]]);
    expect(r.errors).toEqual([{ e: 1 }]);
    expect(log.multi).toBe(1);
    expect(log.single).toEqual([]);
    expect(log.cleared).toBe(0);
  });

  it("sends the legs and the party to the multi-city search", async () => {
    let seen: any;
    const { d } = deps({ multi: async (p) => { seen = p; return { offers: [o("a", "A"), o("b", "B"), o("c", "C")] }; } });
    await searchTrip(LEGS, P, d);
    expect(seen.legs).toEqual([{ from: "DEL", to: "BOM", date: "2026-11-20" }, { from: "BOM", to: "GOI", date: "2026-11-23" }, { from: "GOI", to: "DEL", date: "2026-11-26" }]);
    expect(seen.pax).toBe(2);
    expect(seen.cabin).toBe("economy");
  });

  it("searches each leg on its own when the groups don't match the legs", async () => {
    const { d, log } = deps({ multi: async () => ({ offers: [o("a", "ONWARD"), o("b", "RETURN")] }) });   // 2 groups for 3 legs
    const r = await searchTrip(LEGS, P, d);
    expect(r.viaMulti).toBe(false);
    expect(log.cleared).toBe(1);
    expect(log.single.map((p) => [p.originCode, p.destCode, p.date, p.keepCache])).toEqual([["DEL", "BOM", "2026-11-20", true], ["BOM", "GOI", "2026-11-23", true], ["GOI", "DEL", "2026-11-26", true]]);
    expect(r.offers.map((x) => [x.id, x.leg])).toEqual([["DELBOM", "LEG_1"], ["BOMGOI", "LEG_2"], ["GOIDEL", "LEG_3"]]);
  });

  it("searches each leg on its own when the multi-city search finds nothing or is refused", async () => {
    for (const multi of [async () => ({ offers: [] }), async () => { throw Object.assign(new Error("no"), { status: 422 }); }]) {
      const { d, log } = deps({ multi });
      const r = await searchTrip(LEGS, P, d);
      expect(r.viaMulti).toBe(false);
      expect(log.single).toHaveLength(3);
    }
  });

  it("keeps each leg's own errors and offers apart", async () => {
    const { d } = deps({
      multi: async () => ({ offers: [] }),
      single: async (p) => ({ offers: p.originCode === "BOM" ? [] : [o(p.originCode)], errors: p.originCode === "GOI" ? [{ e: "src" }] : [] }),
    });
    const r = await searchTrip(LEGS, P, d);
    expect(r.offers.map((x) => [x.id, x.leg])).toEqual([["DEL", "LEG_1"], ["GOI", "LEG_3"]]);
    expect(r.errors).toEqual([{ e: "src" }]);
  });

  it("says which flight failed when a leg's search fails", async () => {
    const { d } = deps({ multi: async () => ({ offers: [] }), single: async (p) => { if (p.originCode === "BOM") throw new Error("TripSure is busy"); return { offers: [] }; } });
    await expect(searchTrip(LEGS, P, d)).rejects.toThrow("Flight 2 (BOM → GOI): TripSure is busy");
  });

  it("passes a cancelled search straight through, without falling back", async () => {
    const { d, log } = deps({ multi: async () => { throw Object.assign(new Error("aborted"), { aborted: true }); } });
    await expect(searchTrip(LEGS, P, d)).rejects.toMatchObject({ aborted: true });
    expect(log.single).toEqual([]);
  });
});
