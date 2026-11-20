import { describe, expect, it } from "vitest";
import { placesToGoOf } from "./proposalTemplateData";
import { eatGuideUrl, fullTag } from "./diningPlan";

const days = [
  { activities: [
    { id: "a1", kind: "do", name: "Cubbon Park walk", area: "Central", city: "Bengaluru", url: "https://www.tripagent.vip/city-bengaluru", est: { low: 0, high: 0 }, photo: "p.jpg" },
    { id: "b1", kind: "party", name: "Soka", area: "Indiranagar", tier: "Landmark bars", city: "Bengaluru", url: "https://www.tripagent.vip/city-bengaluru" },
  ] },
  { activities: [{ id: "a1", kind: "do", name: "Cubbon Park walk", city: "Bengaluru" }, { id: "a2", kind: "do", name: "Lalbagh", city: "Bengaluru" }] },
];

describe("things to do and a night out in the proposal", () => {
  const g = placesToGoOf(days, "Bengaluru");
  it("groups by kind and city, once each", () => {
    expect(g.map((x) => [x.kind, x.city, x.picks.map((p) => p.id)])).toEqual([["do", "Bengaluru", ["a1", "a2"]], ["party", "Bengaluru", ["b1"]]]);
  });
  it("carries what the cards draw: photo, area, estimate, and the kind of place as the headline", () => {
    expect(g[0].picks[0]).toMatchObject({ name: "Cubbon Park walk", photo: "p.jpg", area: "Central", est: { high: 0 } });
    expect(g[1].picks[0].tag).toBe("Landmark bars");
  });
  it("nothing added, nothing shown", () => {
    expect(placesToGoOf([{ activities: [] }, {}], "X")).toEqual([]);
  });
  it("links open the matching tab of the city page", () => {
    expect(eatGuideUrl("https://x.vip/city-goa", "do")).toBe("https://x.vip/city-goa?guide=do");
    expect(eatGuideUrl("https://x.vip/city-goa", "party")).toBe("https://x.vip/city-goa?guide=party");
    expect(eatGuideUrl("https://x.vip/city-goa")).toBe("https://x.vip/city-goa?guide=eat");
  });

  it("a tag the website cut short is completed from the credentials, and the kind of place is the headline", () => {
    const d = [{ activities: [{ id: "c1", kind: "do", name: "St Mary's Basilica", tier: "Icons & views", tag: "The first church in", credentials: ["The first church in Karnataka to be elevated to a minor basilica"], city: "Bengaluru" }] }];
    const [grp] = placesToGoOf(d, "Bengaluru");
    expect(grp.picks[0].tag).toBe("Icons & views");
    expect(grp.picks[0].credentials).toEqual(["The first church in Karnataka to be elevated to a minor basilica"]);
    expect(fullTag("The Bombay Canteen /", ["The Bombay Canteen / Bombay Sweet Shop group: recognised hospitality house"])).toBe("The Bombay Canteen / Bombay Sweet Shop group: recognised hospitality house");
    expect(fullTag("Condé Nast Traveller India", ["Condé Nast Traveller India: New restaurants in 2026"])).toBe("Condé Nast Traveller India: New restaurants in 2026");
    expect(fullTag(null, [])).toBeNull();
  });
});
