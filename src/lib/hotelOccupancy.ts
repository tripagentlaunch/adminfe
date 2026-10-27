/* Hotel rooms & guests (per-room adults + children with ages, as TripSure's
   listing takes them) and the guest's room requests. Shared by the Console's
   HotelDesk and the Itinerary Builder item. */

export type RoomOcc = { adults: number; childAges: number[] };

export const MAX_ROOMS = 6;
export const MAX_ADULTS_PER_ROOM = 4;
export const MAX_CHILDREN_PER_ROOM = 3;

export function occText(rooms: RoomOcc[]): string {
  const adults = rooms.reduce((n, r) => n + r.adults, 0);
  const kids = rooms.reduce((n, r) => n + r.childAges.length, 0);
  return [
    rooms.length + " room" + (rooms.length === 1 ? "" : "s"),
    adults + " adult" + (adults === 1 ? "" : "s"),
    kids ? kids + " child" + (kids === 1 ? "" : "ren") : "",
  ].filter(Boolean).join(" · ");
}

export function occGuests(rooms: RoomOcc[]): number {
  return rooms.reduce((n, r) => n + r.adults + r.childAges.length, 0);
}

/** TripSure listing `rooms[]`: string counts and comma-separated child ages. */
export function occToTripsure(rooms: RoomOcc[]) {
  return rooms.map((r) => ({
    numberOfAdults: String(r.adults),
    numberOfChildren: String(r.childAges.length),
    childrenAge: r.childAges.join(","),
  }));
}

/** Rooms for an enquiry's travellers: under-12s are children, 2 adults per room. */
export function occFromPersons(persons: any[] | undefined): RoomOcc[] {
  const ages = (persons || []).map((p: any) => (p && p.age != null && p.age !== "" ? Number(p.age) : null));
  const childAges = ages.filter((a): a is number => a != null && a < 12);
  const adults = Math.max(1, ages.length - childAges.length);
  const roomCount = Math.min(MAX_ROOMS, Math.max(1, Math.ceil(adults / 2)));
  const rooms: RoomOcc[] = Array.from({ length: roomCount }, () => ({ adults: 0, childAges: [] }));
  for (let i = 0; i < adults; i++) rooms[i % roomCount].adults = Math.min(MAX_ADULTS_PER_ROOM, rooms[i % roomCount].adults + 1);
  childAges.forEach((a, i) => { const r = rooms[i % roomCount]; if (r.childAges.length < MAX_CHILDREN_PER_ROOM) r.childAges.push(a); });
  rooms.forEach((r) => { if (!r.adults) r.adults = 1; });
  return rooms;
}

// What the guest asked for. Recorded with the stay; the hotel is told at booking.
export type HotelRequests = { bed: string; earlyCheckIn: boolean; lateCheckOut: boolean; highFloor: boolean; connecting: boolean; note: string };
export const NO_HOTEL_REQUESTS: HotelRequests = { bed: "", earlyCheckIn: false, lateCheckOut: false, highFloor: false, connecting: false, note: "" };
export const BED_OPTIONS = [
  { key: "", label: "No bed preference" }, { key: "king", label: "King / double bed" }, { key: "twin", label: "Twin beds" },
];

export function hotelRequestChips(r: HotelRequests | null | undefined): string[] {
  if (!r) return [];
  return [
    r.bed ? (BED_OPTIONS.find((b) => b.key === r.bed) || { label: r.bed }).label : "",
    r.earlyCheckIn ? "Early check-in requested" : "",
    r.lateCheckOut ? "Late check-out requested" : "",
    r.highFloor ? "High floor" : "",
    r.connecting ? "Connecting rooms" : "",
  ].filter(Boolean);
}
