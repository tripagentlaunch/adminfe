import { describe, expect, it } from "vitest";
import { supportDetails } from "./supportDetails";

const NOW = new Date("2026-11-06T08:30:00.000Z");

describe("supportDetails", () => {
  it("has everything TripSure asks for: trace id, step, time, and the itinerary and booking ids", () => {
    const text = supportDetails({
      title: "DEL → BOM", status: "check_required", error: "TripSure's answer was unclear (timed out).",
      trace_id: "adm-0123456789abcdef0123456789abcdef", tripsure_itinerary_id: "itn_9f2c1a7b3d4e",
      supplier_booking_ids: ["1234567890"], pnrs: ["ABC12D"],
    }, "TA-1042", NOW);
    expect(text.split("\n")).toEqual([
      "TripSure flight support request",
      "Time: 2026-11-06T08:30:00.000Z",
      "Order: TA-1042",
      "Flight: DEL → BOM",
      "Trace id (x-trace-id): adm-0123456789abcdef0123456789abcdef",
      "Itinerary id: itn_9f2c1a7b3d4e",
      "Supplier booking id: 1234567890",
      "PNR: ABC12D",
      "Step: ticketing: the result was unclear (Book / Ticket, then Booking Details)",
      "Problem: TripSure's answer was unclear (timed out).",
    ]);
  });

  it("leaves out what is not known yet, e.g. before anything is booked", () => {
    const text = supportDetails({ status: "fare_locked", trace_id: "adm-abc123", tripsure_itinerary_id: "itn_1", supplier_booking_ids: [], pnrs: [] }, null, NOW);
    expect(text).toBe(["TripSure flight support request", "Time: 2026-11-06T08:30:00.000Z", "Trace id (x-trace-id): adm-abc123", "Itinerary id: itn_1",
      "Step: fare locked, not yet ticketed"].join("\n"));
    expect(text).not.toMatch(/booking id|PNR|Problem|Order:/);
  });

  it("gives several booking ids of a return ticket, and an unknown status as it is", () => {
    const text = supportDetails({ status: "odd_state", supplier_booking_ids: ["BK1", "BK2"] }, "TA-1", NOW);
    expect(text).toContain("Supplier booking id: BK1, BK2");
    expect(text).toContain("Step: odd_state");
  });

  it("uses the current time when none is given", () => {
    expect(supportDetails({}, null)).toMatch(/^TripSure flight support request\nTime: \d{4}-\d{2}-\d{2}T/);
  });
});
