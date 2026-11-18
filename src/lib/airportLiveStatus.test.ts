import { describe, expect, it } from "vitest";
import { meansTripsureIsDown } from "./airportLiveStatus";

describe("meansTripsureIsDown", () => {
  it("treats no answer, a 5xx and a 429 as TripSure being unavailable", () => {
    expect(meansTripsureIsDown({ status: 0 })).toBe(true);
    expect(meansTripsureIsDown(new Error("network"))).toBe(true);
    expect(meansTripsureIsDown({ status: 500 })).toBe(true);
    expect(meansTripsureIsDown({ status: 502 })).toBe(true);
    expect(meansTripsureIsDown({ status: 429 })).toBe(true);
  });
  it("does not blame TripSure for a problem with the request itself", () => {
    for (const status of [400, 401, 404, 409, 422]) expect(meansTripsureIsDown({ status })).toBe(false);
  });
});
