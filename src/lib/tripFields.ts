/* =============================================================================
 * TripAgent — src/lib/tripFields.ts
 *
 * One place that turns an enquiry's `ask` object (adminbe's
 * enquiry_service.get_traveller_profile) into the labelled trip fields shown
 * in BOTH the Traveller Profile (Member360, column 1) and the Key
 * Requirements card (ConversationSummaryPanel, column 2), so the two columns
 * can't drift apart. Only reads fields that exist on `ask`.
 *
 * Empty state is "—" for every field except Special Requests ("None").
 * ===========================================================================*/
import { capLabel } from "./advisorHelpers";

export interface TripField {
  key: string;
  icon: string;
  label: string;
  value: string | null;
  tag?: string | null;
}

// ask.hotel.* / ask.flight.* arrive as {state, value} objects (or a bare
// string for hotel.style) — only a real "value" state counts as data.
function prefValue(field: any): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field || null;
  return field.state === "value" && field.value ? String(field.value) : null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function paxLabel(persons: any[]): string | null {
  if (!persons || !persons.length) return null;
  const adults = persons.filter((p: any) => p.age == null || p.age >= 12).length;
  const children = persons.length - adults;
  let label = adults + " adult" + (adults === 1 ? "" : "s");
  if (children) label += ", " + children + " child" + (children === 1 ? "" : "ren");
  return label;
}

export function buildTripFields(ask: any): TripField[] {
  const a = ask || {};

  const hotelStars = prefValue(a.hotel && a.hotel.stars);
  const hotelStyle = prefValue(a.hotel && a.hotel.style);
  const accommodation = [hotelStars ? hotelStars + "-star minimum" : null, hotelStyle].filter(Boolean).join(" / ") || null;
  const budgetStay = hotelStyle && /budget|value|economy|affordable|cheap/i.test(hotelStyle) ? "Budget" : null;

  // Flight Preference shows the free-text preference; the cabin class rides
  // along as the tag chip. With no free-text preference, the cabin class
  // becomes the value itself (no tag, so it isn't printed twice).
  // ask.flightPreference (adbe, filled by "Analyze Conversation") wins over
  // the flow-collected ask.flight.prefs.
  const flightPrefs = a.flightPreference || prefValue(a.flight && a.flight.prefs);
  const flightClass = prefValue(a.flight && a.flight.class);
  const flightValue = flightPrefs || flightClass;
  const flightTag = flightPrefs && flightClass ? cap(flightClass) : null;

  const groupType = a.groupType
    ? cap(String(a.groupType)) + (/trip$/i.test(a.groupType) ? "" : " Trip")
    : null;

  const budget = a.budgetPerPerson
    ? capLabel(a.budgetPerPerson) + " per person"
    : a.budgetCap
    ? capLabel(a.budgetCap)
    : null;

  return [
    { key: "tripType", icon: "luggage", label: "Trip Type", value: groupType },
    { key: "travellers", icon: "user", label: "Travellers", value: paxLabel(a.persons) },
    { key: "origin", icon: "compass", label: "Origin", value: a.from || null },
    { key: "destination", icon: "compass", label: "Destination", value: (a.destinations && a.destinations[0]) || null },
    {
      key: "dates",
      icon: "calendar",
      label: "Travel Dates",
      value: a.dateRange ? a.dateRange + (a.tripLength ? " (" + a.tripLength + ")" : "") : null,
    },
    { key: "budget", icon: "tag", label: "Budget", value: budget },
    { key: "accommodation", icon: "hotel", label: "Accommodation", value: accommodation, tag: budgetStay },
    { key: "flight", icon: "flight", label: "Flight Preference", value: flightValue, tag: flightTag },
    { key: "interests", icon: "heart", label: "Interests", value: a.purpose || null },
    // ask.specialRequests (adbe) first; ask.mustHaves is the nearest field the
    // chat flow fills.
    { key: "special", icon: "sparkle", label: "Special Requests", value: a.specialRequests || a.mustHaves || null },
  ];
}

export interface RequirementRow {
  key: string;
  icon: string;
  label: string;
  value: string | null;
  sub: string | null;
  tag?: string | null;
}

// Column 2's "Requirements to Build Itinerary" rows: the same fields as
// buildTripFields, merged (Destination + Dates, Travellers + Trip Type), each
// with a one-line sub-description assembled ONLY from other real `ask`
// values — null when there's nothing real to say.
export function buildRequirementRows(ask: any): RequirementRow[] {
  const a = ask || {};
  const f: Record<string, TripField> = {};
  buildTripFields(a).forEach((x) => { f[x.key] = x; });
  const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;

  const flightExtras = a.flight
    ? [
        prefValue(a.flight.airline) ? "Airline: " + prefValue(a.flight.airline) : null,
        prefValue(a.flight.seat) ? "Seat: " + prefValue(a.flight.seat) : null,
        prefValue(a.flight.meal) ? "Meal: " + prefValue(a.flight.meal) : null,
      ]
    : [];
  const hotelLocation = prefValue(a.hotel && a.hotel.location);
  const budgetOther = a.budgetPerPerson && a.budgetCap ? "Total cap " + capLabel(a.budgetCap) : null;

  return [
    {
      key: "destination",
      icon: "compass",
      label: "Destination & Duration",
      value: f.destination.value,
      sub: join([
        f.origin.value ? "From " + f.origin.value : null,
        f.dates.value,
        f.interests.value ? "Interests: " + f.interests.value : null,
      ]),
    },
    {
      key: "travellers",
      icon: "user",
      label: "Travellers",
      value: f.travellers.value,
      sub: f.tripType.value,
    },
    { key: "budget", icon: "tag", label: "Budget", value: f.budget.value, sub: budgetOther },
    {
      key: "accommodation",
      icon: "hotel",
      label: "Accommodation",
      value: f.accommodation.value,
      sub: join([hotelLocation ? "Preferred area: " + hotelLocation : null, a.hotelSource ? "Source: " + a.hotelSource : null]),
      tag: f.accommodation.tag,
    },
    {
      key: "flight",
      icon: "flight",
      label: "Flight Preference",
      value: f.flight.value,
      sub: join(flightExtras),
      tag: f.flight.tag,
    },
    {
      key: "special",
      icon: "sparkle",
      label: "Special Requests",
      value: f.special.value,
      sub: join([
        a.dealBreakers ? "Deal-breakers: " + a.dealBreakers : null,
        a.fixedCommitments ? "Fixed commitments: " + a.fixedCommitments : null,
      ]),
    },
  ];
}

export function emptyLabel(field: TripField): string {
  return field.key === "special" ? "None" : "—";
}


// Rooms to search for, read the same way as the backend's _rooms_from_detail (itinerary_service.py):
// an explicit "N rooms" in the enquiry's special requests / stay style ("2 rooms for 2 couples" -> 2),
// never more than there are travellers, else 1. "2 bedroom apartment" is not a room count.
const ROOM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const ROOMS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight)\s+(?:separate\s+|hotel\s+|adjoining\s+|connecting\s+|double\s+|twin\s+)?rooms?\b/i;

export function roomCountFromAsk(ask: any, travellers: number): number {
  const a = ask || {};
  const texts = [a.specialRequests, a.hotel && a.hotel.style, a.mustHaves, a.purpose];
  for (const t of texts) {
    const m = typeof t === "string" ? ROOMS_RE.exec(t) : null;
    if (m) {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : ROOM_WORDS[raw];
      return Math.max(1, Math.min(n, Math.max(1, travellers)));
    }
  }
  return 1;
}
