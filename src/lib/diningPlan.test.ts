import { describe, expect, it } from "vitest";
import { cardTags, diningEntry, distanceText, hotelForDay, tiersOf, whereToEatByCity, type EatItem } from "./diningPlan";

const FARM: EatItem = {
  id: "bengaluru:farmlore", name: "Farmlore", tier: "Fine", area: "Raju Layout", tag: "Condé Nast Traveller India",
  credentials: ["Condé Nast Traveller India Top Restaurant Awards 2024: No. 17", "b", "c", "d"], description: " A farm table. ", photo: "https://x/p.jpg", place_id: "ChIJ1",
};
const GUIDE = { city: "Bengaluru", url: "https://www.tripagent.vip/city-bengaluru" };
const HOTEL = { name: "Taj West End", city: "Bengaluru", lat: 12.98, lng: 77.58 };

describe("diningEntry", () => {
  it("copies the card and the distance from the hotel it was added for", () => {
    const e = diningEntry(FARM, GUIDE, { km: 3.24, minutes: 11, approx: false }, HOTEL);
    expect(e).toMatchObject({ id: "bengaluru:farmlore", name: "Farmlore", tier: "Fine", tag: "Condé Nast Traveller India", photo: "https://x/p.jpg", city: "Bengaluru", description: "A farm table.", url: GUIDE.url });
    expect(e.credentials).toHaveLength(4);                                       // every award is kept, as the city page lists them
    expect(e.distance).toEqual({ km: 3.24, minutes: 11, approx: false, hotel: "Taj West End" });
  });
  it("has no distance when it is not known, or there is no hotel to measure from", () => {
    expect(diningEntry(FARM, GUIDE).distance).toBeNull();
    expect(diningEntry(FARM, GUIDE, { km: 3, minutes: null, approx: true }, null).distance).toBeNull();
  });
});

describe("distanceText", () => {
  it("names the hotel and says how it was measured", () => {
    expect(distanceText({ km: 3.24, minutes: 11, approx: false, hotel: "Taj West End" })).toBe("3.2 km from Taj West End · 11 min drive");
    expect(distanceText({ km: 12.4, minutes: null, approx: false, hotel: "Taj West End" })).toBe("12 km from Taj West End");
    expect(distanceText({ km: 7.14, minutes: null, approx: true, hotel: "Taj West End" })).toBe("about 7.1 km (straight line) from Taj West End");
    expect(distanceText(null)).toBe("");
  });
});

describe("hotelForDay", () => {
  const stay = (iso: string, title: string, nights: string, lat: any = 12.9, lng: any = 77.6) => ({ id: "d" + iso, _iso: iso, items: [{ type: "hotel", title, duration: nights, lat, lng, city: "Bengaluru" }] });
  const days = [stay("2026-12-07", "Taj West End", "2"), { id: "d2026-12-08", _iso: "2026-12-08", items: [] }, { id: "d2026-12-09", _iso: "2026-12-09", items: [] }, stay("2026-12-10", "The Leela", "1", 13, 77.7)];
  it("is the stay whose nights cover the day", () => {
    expect(hotelForDay(days, "d2026-12-08")!.name).toBe("Taj West End");
  });
  it("falls back to the trip's first hotel for a day no stay covers", () => {
    expect(hotelForDay(days, "d2026-12-09")!.name).toBe("Taj West End"); // the Taj's two nights are the 7th and 8th; nothing starts on the 9th
  });
  it("is the hotel on the day itself", () => {
    expect(hotelForDay(days, "d2026-12-10")!.name).toBe("The Leela");
  });
  it("ignores hotels without a map position, and is null when none has one", () => {
    expect(hotelForDay([stay("2026-12-07", "No coords", "1", null, null)], "d2026-12-07")).toBeNull();
    expect(hotelForDay([{ id: "a", _iso: "2026-12-07", items: [] }], "a")).toBeNull();
  });
});

describe("whereToEatByCity", () => {
  it("groups the trip's dining by city, each restaurant once", () => {
    const e = diningEntry(FARM, GUIDE);
    const g = whereToEatByCity([{ dining: [e] }, { dining: [e, diningEntry({ ...FARM, id: "bengaluru:karavalli", name: "Karavalli" }, GUIDE)] }]);
    expect(g).toHaveLength(1);
    expect(g[0].picks.map((p) => p.name)).toEqual(["Farmlore", "Karavalli"]);
    expect(g[0].url).toBe(GUIDE.url);
  });
});

describe("cardTags", () => {
  it("uses the guide's own tag and lists every award under it", () => {
    const e = diningEntry(FARM, GUIDE);
    expect(cardTags(e)).toEqual({ headline: "Condé Nast Traveller India", rest: e.credentials });
  });
  it("without a tag, shortens the first award and lists the rest", () => {
    const t = cardTags({ tag: null, credentials: ["Condé Nast Traveller India Top Restaurant Awards 2024: No. 17 in the whole of the country", "La Liste 2026"] });
    expect(t.headline).toBe("No. 17 in the whole of the country");   // as the website does: the shorter half that fits in 40 characters
    expect(t.rest).toEqual(["La Liste 2026"]);
    expect(cardTags({ tag: null, credentials: [] })).toEqual({ headline: null, rest: [] });
  });
});

describe("tiersOf", () => {
  it("lists the tiers present in the page's order, unknown ones last", () => {
    expect(tiersOf([{ tier: "Smart" }, { tier: "Fine" }, { tier: "Fine" }, { tier: null }, { tier: "Odd" }])).toEqual(["Fine", "Smart", "Picks", "Odd"]);
    expect(tiersOf([])).toEqual([]);
  });
});
