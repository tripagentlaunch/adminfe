/* Flight traveller mix + customer requests, shared by the Console's
   FlightDesk (search / Add panel), the Itinerary Builder item and the
   "Book this trip" handoff. */

export type PaxMix = { adults: number; children: number; infants: number };

export function paxText(p: PaxMix) {
  const part = (n: number, one: string, many: string) => (n ? n + " " + (n === 1 ? one : many) : "");
  return [part(p.adults, "adult", "adults"), part(p.children, "child", "children"), part(p.infants, "infant", "infants")].filter(Boolean).join(", ");
}

// What the customer asked for on a flight (recorded when it is added to the
// itinerary). Extras are priced and bought at booking, after the fare lock.
export const BAG_OPTIONS = [0, 5, 10, 15, 20, 25, 30];
export const SEAT_OPTIONS = [
  { key: "", label: "No preference" }, { key: "window", label: "Window" }, { key: "aisle", label: "Aisle" },
  { key: "together", label: "Seats together" }, { key: "extra_legroom", label: "Extra legroom" },
];
export const MEAL_OPTIONS = [
  { key: "", label: "No preference" }, { key: "veg", label: "Vegetarian" }, { key: "non_veg", label: "Non-vegetarian" },
  { key: "jain", label: "Jain" }, { key: "vegan", label: "Vegan" }, { key: "diabetic", label: "Diabetic" }, { key: "child", label: "Child meal" },
];
export type FlightRequests = { extraBaggageKg: number; seat: string; meal: string; note: string };
export const NO_REQUESTS: FlightRequests = { extraBaggageKg: 0, seat: "", meal: "", note: "" };

export function requestChips(r: FlightRequests | null | undefined): string[] {
  if (!r) return [];
  return [
    r.extraBaggageKg ? "+" + r.extraBaggageKg + " kg bag requested" : "",
    r.seat ? (SEAT_OPTIONS.find((x) => x.key === r.seat) || { label: r.seat }).label + " seat" : "",
    r.meal ? (MEAL_OPTIONS.find((x) => x.key === r.meal) || { label: r.meal }).label + " meal" : "",
  ].filter(Boolean);
}
