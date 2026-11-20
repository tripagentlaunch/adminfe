import { describe, expect, it } from "vitest";
import { tripDatesFor } from "./itineraryFromCart";

const plan = { destination: "New York", city: "New York", startIso: "2026-12-24", endIso: "2026-12-27", adults: 2, rooms: 1, fromCode: "DEL", toCode: "JFK", nights: 3, budgetTotal: 50000 };

describe("the search desks follow the trip plan", () => {
  it("a planned trip opens the desks on its place, dates and travellers (not Dubai for 1 guest)", () => {
    const t = tripDatesFor({ scratchPlan: plan, days: [] }, {});
    expect(t).toMatchObject({ startIso: "2026-12-24", endIso: "2026-12-27", city: "New York" });
    expect(t!.persons).toHaveLength(2);
  });
  it("the priced flight's travellers still win over the plan's head count", () => {
    const flight = { type: "flight", paxMix: { adults: 3, children: 1, infants: 0 } };
    const t = tripDatesFor({ scratchPlan: plan, startIso: "2026-12-24", endIso: "2026-12-27", days: [{ items: [flight] }] }, {});
    expect(t!.persons).toHaveLength(4);
  });
  it("no plan, nothing known: unchanged", () => {
    expect(tripDatesFor({ days: [] }, {})).toBeNull();
  });
  it("a new plan for the same enquiry gets a new signature, so the old plan's saved search is not brought back", () => {
    const a = tripDatesFor({ scratchPlan: plan, days: [] }, {});
    const b = tripDatesFor({ scratchPlan: { ...plan, endIso: "2026-12-28", nights: 4 }, days: [] }, {});
    expect(a!.planSig).toBeTruthy();
    expect(a!.planSig).not.toBe(b!.planSig);
    expect(tripDatesFor({ days: [] , startIso: "2026-12-24", endIso: "2026-12-27" }, {})!.planSig).toBeUndefined();
  });
});
