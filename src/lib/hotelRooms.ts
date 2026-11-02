/* Who sleeps in which room, for the New Booking hotel search.
   Tripsure takes occupancy PER ROOM (listing / create-itinerary `rooms[]`: numberOfAdults,
   numberOfChildren, childrenAge). The screen used to keep three totals (rooms, adults, children) and
   guess the split; here each room has its own guests and the totals are derived from them.
   The limits mirror adbe's services/hotel_rooms.py, which re-checks everything server-side. */

export type RoomGuests = { adults: number; childAges: number[] };

export const MAX_ROOMS = 9;
export const MAX_ADULTS_PER_ROOM = 6;
export const MAX_CHILDREN_PER_ROOM = 4;
export const DEFAULT_CHILD_AGE = 5;

export const defaultRooms = (): RoomGuests[] => [{ adults: 2, childAges: [] }];

export const roomParty = (r: RoomGuests): number => r.adults + r.childAges.length;

export function totals(rooms: RoomGuests[]) {
  const childAges = rooms.flatMap((r) => r.childAges);
  return { rooms: rooms.length, adults: rooms.reduce((n, r) => n + r.adults, 0), children: childAges.length, childAges };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "5 Guests · 2 Rooms" - the search bar pill. */
export function guestsPill(rooms: RoomGuests[]): string {
  const t = totals(rooms);
  return `${plural(t.adults + t.children, "Guest", "Guests")} · ${plural(t.rooms, "Room", "Rooms")}`;
}

/** "2 adults, 1 child (5 yrs)" for one room. */
export function roomText(r: RoomGuests): string {
  const kids = r.childAges.length
    ? `, ${plural(r.childAges.length, "child", "children")} (${r.childAges.map((a) => (a === 0 ? "<1 yr" : `${a} yr${a === 1 ? "" : "s"}`)).join(", ")})`
    : "";
  return `${plural(r.adults, "adult", "adults")}${kids}`;
}

/** What the search / stay call send: one object per room, in Tripsure's own (string) shape. */
export const tripsureRooms = (rooms: RoomGuests[]) =>
  rooms.map((r) => ({ numberOfAdults: String(r.adults), numberOfChildren: String(r.childAges.length), childrenAge: r.childAges.join(",") }));

/** The server's per-room list (children_ages, snake_case). */
export const roomGuestsPayload = (rooms: RoomGuests[]) => rooms.map((r) => ({ adults: r.adults, children_ages: r.childAges.slice() }));

/** A cache key that changes when anyone moves between rooms, not only when the totals change. */
export const roomsKey = (rooms: RoomGuests[]) => rooms.map((r) => `${r.adults}:${r.childAges.join(",")}`).join("|");

/** The first thing wrong with the layout, in words the advisor can act on; null when it is fine. */
export function roomsProblem(rooms: RoomGuests[]): string | null {
  if (!rooms.length) return "Add at least one room.";
  if (rooms.length > MAX_ROOMS) return `At most ${MAX_ROOMS} rooms.`;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.adults < 1) return `Room ${i + 1} needs at least one adult (18+).`;
    if (r.adults > MAX_ADULTS_PER_ROOM) return `Room ${i + 1} has ${r.adults} adults - at most ${MAX_ADULTS_PER_ROOM} fit in one room.`;
    if (r.childAges.length > MAX_CHILDREN_PER_ROOM) return `Room ${i + 1} has ${r.childAges.length} children - at most ${MAX_CHILDREN_PER_ROOM} per room.`;
  }
  return null;
}

/** Rooms whose party is bigger than what a room type sleeps (Tripsure's maxGuestCount); 0 sleeps = unknown. */
export function overCapacity(rooms: RoomGuests[], sleeps: number): number[] {
  if (!(sleeps > 0)) return [];
  return rooms.map((r, i) => (roomParty(r) > sleeps ? i : -1)).filter((i) => i >= 0);
}

/** Rooms grouped by identical guests: "Room 1 and 2: 2 adults" - so a long list stays one line each. */
export function roomLines(rooms: RoomGuests[]): { label: string; text: string }[] {
  const groups: { text: string; idx: number[] }[] = [];
  rooms.forEach((r, i) => {
    const text = roomText(r);
    const g = groups.find((x) => x.text === text);
    if (g) g.idx.push(i + 1); else groups.push({ text, idx: [i + 1] });
  });
  return groups.map((g) => ({
    label: g.idx.length === 1 ? `Room ${g.idx[0]}` : `Rooms ${g.idx.slice(0, -1).join(", ")} and ${g.idx[g.idx.length - 1]}`,
    text: g.text,
  }));
}
