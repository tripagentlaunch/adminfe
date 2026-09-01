/* =============================================================================
 * TripAgent — src/lib/mockEnquiries.ts
 * Demo/seed data ONLY — not a Supabase table, not persisted anywhere. Three
 * enquiries built 2026-08-31 per the "AI draft vs. what was actually asked"
 * discussion: one clean baseline, one with a catchable hotel mismatch, one
 * with a catchable flight mismatch. Ground transfers/commute explicitly out
 * of scope for now (per that discussion); visas parked too.
 *
 * Shape matches what EnquiryInbox/Member360/WorkbenchTab already expect —
 * see their own files. `ai_draft` is the one NEW field, read directly by
 * WorkbenchTab's Itinerary Builder card: if the selected enquiry has one,
 * it renders the drafted flight/hotel instead of the "Not yet built" empty
 * state. `mismatch: true` on a segment is what flags it as needing advisor
 * action — it does NOT mean "wrong data type," it means "the AI's pick
 * contradicts what the enquiry itself asked for."
 * ===========================================================================*/

export const MOCK_MEMBERS_BY_ID: Record<string, any> = {
  "mock-mem-1": {
    id: "mock-mem-1",
    name: "Arjun Mehta",
    tier: "INFINIA",
    email: "arjun.mehta@example.com",
    phone: "+91 98200 11122",
    nationality: "IN",
    passport_number: "P1234567",
    passport_expiry: "2031-04-12",
    preferences: { cabin: "Business", seat: "Aisle", meal: "Vegetarian", hotel_tier: "4-star", airlines: ["Singapore Airlines"] },
  },
  "mock-mem-2": {
    id: "mock-mem-2",
    name: "Priya Kapoor",
    tier: "STANDARD",
    email: "priya.kapoor@example.com",
    phone: "+91 98100 33344",
    nationality: "IN",
    passport_number: "P7654321",
    passport_expiry: "2029-11-03",
    preferences: { cabin: "Economy", hotel_tier: "Family resort" },
  },
  "mock-mem-3": {
    id: "mock-mem-3",
    name: "Kabir Shah",
    tier: "EMERALDE",
    email: "kabir.shah@example.com",
    phone: "+91 98900 55566",
    nationality: "IN",
    passport_number: "P2468101",
    passport_expiry: "2030-07-22",
    preferences: { cabin: "Business", hotel_tier: "Standard business" },
  },
};

export const MOCK_ENQUIRIES: any[] = [
  // 1 — Solo, correct: the AI draft matches everything the enquiry asked
  // for. Nothing for the advisor to fix — just review and confirm.
  {
    id: "mock-enq-1",
    member_id: "mock-mem-1",
    channel: "web",
    status: "open",
    created_at: "2026-08-29T09:15:00Z",
    message: "Solo business trip to Singapore — need business class and a 4-star hotel near the CBD, 3 nights.",
    intent: { destinations: ["Singapore"], services: ["flight", "hotel"] },
    // The full "ask," beyond what fits in EnquiryInbox's summary line —
    // kept here for when Itinerary Builder needs to show it in detail.
    ask: {
      persons: [{ name: "Arjun Mehta", gender: "M", age: 34 }],
      groupType: "Solo",
      from: "Delhi (DEL)",
      destinations: ["Singapore"],
      dates: { nights: 3, month: "October", season: "Autumn" },
      purpose: "Business",
      flight: { class: "Business", seat: "Aisle", meal: "Vegetarian", stops: "Direct", airline: "Singapore Airlines" },
      hotel: { stars: 4, location: "CBD", checkIn: "14:00", checkOut: "12:00" },
    },
    ai_draft: {
      flight: {
        carrier: "Singapore Airlines",
        route: "DEL → SIN",
        cabin: "Business",
        dates: "14–17 Oct",
        reasoning: "Matches his Business-class and Singapore Airlines preference, direct routing.",
      },
      hotel: {
        name: "Oasia Hotel Novena",
        type: "4-star, CBD-adjacent",
        nights: 3,
        reasoning: "4-star and CBD-adjacent as requested, 3 nights matching his dates.",
      },
    },
  },

  // 2 — Wrong for hotels: flight matches the ask; the hotel pick doesn't
  // (no adjoining rooms, no elevator access, despite both being asked for).
  {
    id: "mock-enq-2",
    member_id: "mock-mem-2",
    channel: "web",
    status: "open",
    created_at: "2026-08-29T11:40:00Z",
    message: "Family trip to Goa with the kids — need adjoining rooms, ground floor or elevator access. Economy flights are fine for this short trip.",
    intent: { destinations: ["Goa"], services: ["flight", "hotel"] },
    ask: {
      persons: [
        { name: "Priya Kapoor", gender: "F", age: 37 },
        { name: "Dev Kapoor", gender: "M", age: 39 },
        { name: "Aanya Kapoor", gender: "F", age: 7 },
      ],
      groupType: "Family",
      from: "Mumbai (BOM)",
      destinations: ["Goa"],
      dates: { nights: 4, month: "November", season: "Winter" },
      purpose: "Vacation",
      flight: { class: "Economy", stops: "Direct" },
      hotel: { stars: 5, location: "Candolim", checkIn: "14:00", checkOut: "11:00", roomConfig: "Adjoining rooms, elevator access" },
    },
    ai_draft: {
      flight: {
        carrier: "IndiGo",
        route: "BOM → GOI",
        cabin: "Economy",
        dates: "18–22 Nov",
        reasoning: "Economy as requested — short domestic hop.",
      },
      hotel: {
        name: "Taj Exotica Goa",
        type: "2 separate rooms, not adjoining — one accessible by stairs only",
        nights: 4,
        reasoning: "Best-rated family resort in Candolim for these dates.",
        mismatch: true,
        mismatchNote: "Enquiry asked for adjoining rooms with elevator access — neither is true of this pick.",
      },
    },
  },

  // 3 — Wrong for flights: hotel matches the ask; the flight pick doesn't
  // (routed through a layover despite "direct only" being explicit).
  {
    id: "mock-enq-3",
    member_id: "mock-mem-3",
    channel: "whatsapp",
    status: "open",
    created_at: "2026-08-29T14:05:00Z",
    message: "Important meeting in Singapore — direct flights only, no layovers. A standard business hotel is fine.",
    intent: { destinations: ["Singapore"], services: ["flight", "hotel"] },
    ask: {
      persons: [{ name: "Kabir Shah", gender: "M", age: 41 }],
      groupType: "Solo",
      from: "Mumbai (BOM)",
      destinations: ["Singapore"],
      dates: { nights: 2, month: "September", season: "Autumn" },
      purpose: "Business",
      flight: { class: "Business", stops: "Direct" },
      hotel: { stars: 4, location: "Business district", checkIn: "14:00", checkOut: "12:00" },
    },
    ai_draft: {
      flight: {
        carrier: "Malaysia Airlines",
        route: "BOM → KUL → SIN",
        cabin: "Business",
        dates: "9–11 Sep",
        reasoning: "Best fare available for these dates.",
        mismatch: true,
        mismatchNote: "Enquiry asked for direct flights only — this routes through a Kuala Lumpur layover.",
      },
      hotel: {
        name: "Holiday Inn Express Singapore",
        type: "Standard business hotel",
        nights: 2,
        reasoning: "Standard business hotel as requested, near his meeting.",
      },
    },
  },
];
