import { describe, expect, it } from "vitest";
import { neededFlightLegs } from "./flightLegs";

const day = (iso: string, items: any[] = []) => ({ _iso: iso, items });
describe("neededFlightLegs", () => {
  it("an empty itinerary needs both legs of the trip", () => {
    const d = { startIso: "2026-12-23", endIso: "2026-12-28", days: [] };
    expect(neededFlightLegs(d, "BLR", "JAI")).toEqual([
      { key: "BLR-JAI-2026-12-23", kind: "outbound", origin: "BLR", dest: "JAI", date: "2026-12-23" },
      { key: "JAI-BLR-2026-12-28", kind: "return", origin: "JAI", dest: "BLR", date: "2026-12-28" },
    ]);
  });
  it("with only the outbound flight in, only the return is missing, from where that flight landed", () => {
    const d = { startIso: "2026-12-23", endIso: "2026-12-28", days: [day("2026-12-23", [{ type: "flight", origin: "BLR", dest: "JAI" }])] };
    expect(neededFlightLegs(d, "BLR", "UDR")).toEqual([{ key: "JAI-BLR-2026-12-28", kind: "return", origin: "JAI", dest: "BLR", date: "2026-12-28" }]);
  });
  it("with both flights in, nothing is missing", () => {
    const d = { startIso: "2026-12-23", endIso: "2026-12-28", days: [day("2026-12-23", [{ type: "flight", origin: "BLR", dest: "JAI" }]), day("2026-12-28", [{ type: "flight", origin: "UDR", dest: "BLR" }])] };
    expect(neededFlightLegs(d, "BLR", "JAI")).toEqual([]);
  });
  it("a one-way trip (no end date) needs only the outbound; no origin or destination, nothing to search", () => {
    expect(neededFlightLegs({ startIso: "2026-12-23", days: [] }, "BLR", "JAI")).toHaveLength(1);
    expect(neededFlightLegs({ startIso: "2026-12-23", endIso: "2026-12-28", days: [] }, "", "JAI")).toEqual([]);
    expect(neededFlightLegs({ startIso: "2026-12-23", endIso: "2026-12-28", days: [] }, "BLR", "")).toEqual([]);
  });
  it("falls back to the first day when the trip has no start date", () => {
    expect(neededFlightLegs({ days: [day("2026-12-24")] }, "BLR", "JAI")[0].date).toBe("2026-12-24");
  });
});
