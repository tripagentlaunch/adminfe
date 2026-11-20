import { describe, expect, it } from "vitest";
import { buildDayCards, fmtDayLabel, stayPhotoFor } from "./proposalDayCards";

const data: any = {
  destination: "Goa",
  calendarDays: [{ iso: "2026-12-23", dow: "Wed", dom: "23" }, { iso: "2026-12-24", dow: "Thu", dom: "24" }, { iso: "2026-12-25", dow: "Fri", dom: "25" }],
  calendarBlocks: [
    { startIdx: 0, span: 1, label: "Travel day", sub: "", isHome: true },
    { startIdx: 1, span: 2, label: "ARPORA", sub: "Felix Homes 2BHK With Pool · 2 nights" },
  ],
  calendarCaptions: { 0: "Arrive 18:25" },
  dayPlan: [{ iso: "2026-12-24", date: "Thu, 24 Dec", title: "Beach day", description: "Slow morning, then Baga.", photoQuery: "Baga beach Goa", dining: [{ id: "a", city: "Goa" }] }],
};

describe("proposal day cards", () => {
  const cards = buildDayCards(data);
  it("one card per calendar day, numbered from 1", () => {
    expect(cards.map((c) => c.n)).toEqual([1, 2, 3]);
    expect(cards[0].dateLabel).toBe("Wed, 23 Dec");
  });
  it("a planned day keeps its title, text, photo and restaurants", () => {
    expect(cards[1]).toMatchObject({ title: "Beach day", description: "Slow morning, then Baga.", photoQuery: "Baga beach Goa" });
    expect(cards[1].dining).toHaveLength(1);
  });
  it("a day with no plan still says where the traveller stays and takes its photo from that place", () => {
    expect(cards[2].title).toBe("Arpora");
    expect(cards[2].facts).toEqual(["Felix Homes 2BHK With Pool · 2 nights"]);
    expect(cards[2].photoQuery).toBe("Arpora");
  });
  it("a travel day shows the arrival time and falls back to the destination for its photo", () => {
    expect(cards[0].title).toBe("Travel day");
    expect(cards[0].facts).toEqual(["Arrive 18:25"]);
    expect(cards[0].photoQuery).toBe("Goa");
  });
  it("with no calendar it lists the plan's days in order", () => {
    const out = buildDayCards({ dayPlan: [{ title: "A", date: "Mon" }, { title: "B", date: "Tue" }] });
    expect(out.map((c) => c.title)).toEqual(["A", "B"]);
  });
  it("formats a date like the rest of the page", () => {
    expect(fmtDayLabel("2026-12-24")).toBe("Thu, 24 Dec");
  });
});

describe("hotel photos on the day cards", () => {
  const stays = [
    { name: "Felix Homes 2BHK, Arpora", checkIn: "2026-12-24", checkOut: "2026-12-26", image: "proxy.jpg", facts: { images: ["t1.jpg", "t2.jpg", "t3.jpg"] } },
    { name: "Taj Goa", checkIn: "2026-12-26", checkOut: "2026-12-27", image: "taj.jpg" },
  ];
  it("uses TripSure's gallery for the hotel, a different picture each night", () => {
    expect(stayPhotoFor(stays, "2026-12-24")).toEqual({ url: "t1.jpg", hotel: "Felix Homes 2BHK" });
    expect(stayPhotoFor(stays, "2026-12-25")?.url).toBe("t2.jpg");
  });
  it("falls back to the stay's own image, and to the hotel left that morning on a departure day", () => {
    expect(stayPhotoFor(stays, "2026-12-26")?.url).toBe("taj.jpg");
    expect(stayPhotoFor(stays, "2026-12-27")?.url).toBe("taj.jpg");
  });
  it("no hotel that day, no hotel photo", () => {
    expect(stayPhotoFor(stays, "2026-12-23")).toBeNull();
    expect(stayPhotoFor([], "2026-12-24")).toBeNull();
  });
  it("the cards carry it", () => {
    const cards = buildDayCards(data, stays);
    expect(cards[1].stayPhoto?.url).toBe("t1.jpg");
    expect(cards[0].stayPhoto).toBeNull();
  });
});

describe("proposal day cards: what to do", () => {
  it("carries the day's activities, with their estimates", () => {
    const withTodo: any = { ...data, dayPlan: [{ ...data.dayPlan[0], activities: [{ id: "goa:cruise", name: "Sal River cruise", est: { low: 600, high: 1500, totalLow: 4200, totalHigh: 10500, pax: 7 } }] }] };
    const cards = buildDayCards(withTodo);
    expect(cards[1].activities.map((a: any) => a.name)).toEqual(["Sal River cruise"]);
    expect(cards[0].activities).toEqual([]);
  });
});
