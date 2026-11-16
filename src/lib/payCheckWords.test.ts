import { describe, expect, it } from "vitest";
import { payCheckWords } from "./payCheckWords";

const flight = { id: "f" };
const stay = { id: "s" };
const offHotel = { items: [{ type: "hotel" }], valid_until: "2026-11-17T12:30:00Z", expired: false };

describe("payCheckWords", () => {
  it("a live flight with a vendor-quoted hotel: checks the flight and says the hotel does not change", () => {
    const w = payCheckWords({ flights: [flight], stays: [], offline: offHotel });
    expect(w.buttonChecking).toBe("Checking live flight prices…");
    expect(w.checking).toBe("Checking live flight prices with the airline…");
    expect(w.ready).toBe("✓ Live flight prices confirmed");
    expect(w.idle).toContain("flight prices are re-checked with the airline");
    expect(w.liveRow).toBe("Flights (checked live)");
    expect(w.offlineLine).toBe("The hotel price is quoted by our vendor, so it doesn't change when you pay: held until Tue, 17 Nov, 6:00 PM IST.");
    expect(w.offlineUnchanged).toBe("Your hotel price hasn't changed: it's quoted by our vendor and held until Tue, 17 Nov, 6:00 PM IST.");
    expect(w.changedIntro).toBe("Since your proposal was prepared, the airline has changed the flight price.");
    expect(w.otherRow).toBe("Hotel (quoted by our vendor, not re-checked)");
  });
  it("live flight and hotel: both are checked, nothing is vendor-quoted", () => {
    const w = payCheckWords({ flights: [flight], stays: [stay], offline: null });
    expect(w.buttonChecking).toBe("Checking live flight and hotel prices…");
    expect(w.checking).toBe("Checking live flight and hotel prices with the airline and hotel…");
    expect(w.liveRow).toBe("Airline & hotel");
    expect(w.offlineLine).toBeNull();
    expect(w.offlineUnchanged).toBeNull();
    expect(w.otherRow).toBe("Quoted offline & other items, confirmed by your advisor");
  });
  it("a live hotel with a vendor-quoted flight, and several vendor-quoted items", () => {
    const w = payCheckWords({ flights: [], stays: [stay], offline: { items: [{ type: "flight" }, { type: "hotel" }, { type: "flight" }], valid_until: null } });
    expect(w.buttonChecking).toBe("Checking live hotel prices…");
    expect(w.offlineLine).toBe("The hotel and flight prices are quoted by our vendor, so they don't change when you pay.");
  });
  it("does not offer a held-until time once the offline price has expired, and copes with no quote yet", () => {
    expect(payCheckWords({ flights: [flight], offline: { ...offHotel, expired: true } }).offlineLine).toBe("The hotel price is quoted by our vendor, so it doesn't change when you pay.");
    const none = payCheckWords(null);
    expect(none.buttonChecking).toBe("Checking live flight and hotel prices…");
    expect(none.offlineLine).toBeNull();
  });
});
