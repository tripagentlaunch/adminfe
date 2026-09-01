/* =============================================================================
 * TripAgent — src/lib/mockFlightSearch.ts
 * Real captured data (2026-09-01) from the deployed advisor-panel
 * (https://tripagent-admin.vercel.app, DEL→DXB, 2 pax, economy,
 * 2026-09-22), which has a working backend — this local dev environment
 * doesn't. Captured by monkey-patching window.fetch on the live site and
 * running an actual search + opening every fare-detail sub-tab (fare
 * families, fare rules, ancillaries, seat map), so the shapes below are
 * exactly what flight-search/flight-fares return, not guessed.
 *
 * Used as a fallback in FlightDesk.tsx: the real API call runs first always
 * (this is NOT a toggle/shortcut around it), and only on failure — which is
 * every time here, since there's no backend to reach locally — does the UI
 * fall back to this so the Search Desks flow is still fully browsable in
 * local dev. mockFlightFares() answers for ANY offer_id (not just the one
 * it was captured against): one real captured fixture is enough to make
 * every "Fare detail" expander look and behave right locally, without
 * pretending to model each of the 9 offers individually.
 *
 * Seat map trimmed from the captured 32 rows to the first 16 — FlightDesk's
 * own seatmap renderer only ever shows `rows.slice(0, 16)` anyway (see
 * FlightFareDetail's seatmap case), so nothing visible is lost.
 * ===========================================================================*/

export const MOCK_FLIGHT_SEARCH_RESPONSE = {
  session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
  product: "flight",
  tripType: "one_way",
  international: true,
  query: {
    tripType: "one_way",
    slices: [{ from: "DEL", to: "DXB", date: "2026-09-22" }],
    originCode: "DEL",
    destCode: "DXB",
    date: "2026-09-22",
    returnDate: null,
    cabin: "economy",
    pax: 2,
    paxMix: { adults: 2, children: 0, infants: 0, headcount: 2 },
    international: true,
  },
  count: 9,
  offers: [
    {
      id: "6d20637d-b4b7-44a7-b3a6-94b23d4df3ee",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 23000,
      baseNet: 23000,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "QR", airlineName: "Qatar Airways", flightNo: "QR 476",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 1, durationMin: 269, duration: "4h 29m",
        depTime: "05:30", arrTime: "09:59", refundable: false, baggageKg: 25,
        fareBasis: "QRE1",
        segments: [
          { carrier: "QR", carrierName: "Qatar Airways", flightNo: "QR 476", from: "DEL", to: "SIN", depTime: "05:30", arrTime: "06:59", durationMin: 89 },
          { carrier: "QR", carrierName: "Qatar Airways", flightNo: "QR 489", from: "SIN", to: "DXB", depTime: "08:54", arrTime: "09:59", durationMin: 65 },
        ],
      },
    },
    {
      id: "50358a57-0ba2-43a3-b693-6256cbe2a6b6",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 23300,
      baseNet: 23300,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "SQ", airlineName: "Singapore Airlines", flightNo: "SQ 507",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 1, durationMin: 239, duration: "3h 59m",
        depTime: "20:50", arrTime: "00:49", refundable: true, baggageKg: 25,
        fareBasis: "SQE1",
        segments: [
          { carrier: "SQ", carrierName: "Singapore Airlines", flightNo: "SQ 507", from: "DEL", to: "AUH", depTime: "20:50", arrTime: "22:04", durationMin: 74 },
          { carrier: "SQ", carrierName: "Singapore Airlines", flightNo: "SQ 520", from: "AUH", to: "DXB", depTime: "23:19", arrTime: "00:49", durationMin: 90 },
        ],
      },
    },
    {
      id: "bb0eef2c-b5e3-40ce-be00-a235bf3f135b",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 25800,
      baseNet: 25800,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "LH", airlineName: "Lufthansa", flightNo: "LH 662",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 0, durationMin: 164, duration: "2h 44m",
        depTime: "09:20", arrTime: "12:04", refundable: true, baggageKg: 25,
        fareBasis: "LHE0",
        segments: [
          { carrier: "LH", carrierName: "Lufthansa", flightNo: "LH 662", from: "DEL", to: "DXB", depTime: "09:20", arrTime: "12:04", durationMin: 164 },
        ],
      },
    },
    {
      id: "65f17f7d-240d-4321-b3ff-6912c516cc70",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 27700,
      baseNet: 27700,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "AI", airlineName: "Air India", flightNo: "AI 600",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 0, durationMin: 164, duration: "2h 44m",
        depTime: "16:15", arrTime: "18:59", refundable: true, baggageKg: 25,
        fareBasis: "AIE0",
        segments: [
          { carrier: "AI", carrierName: "Air India", flightNo: "AI 600", from: "DEL", to: "DXB", depTime: "16:15", arrTime: "18:59", durationMin: 164 },
        ],
      },
    },
    {
      id: "0daa1eed-25db-4704-9d6d-ba5268d74954",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 28300,
      baseNet: 28300,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "BA", airlineName: "British Airways", flightNo: "BA 445",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 0, durationMin: 164, duration: "2h 44m",
        depTime: "21:05", arrTime: "23:49", refundable: false, baggageKg: 25,
        fareBasis: "BAE0",
        segments: [
          { carrier: "BA", carrierName: "British Airways", flightNo: "BA 445", from: "DEL", to: "DXB", depTime: "21:05", arrTime: "23:49", durationMin: 164 },
        ],
      },
    },
    {
      id: "ec8aa3ec-d013-49f2-a7b3-4839be763cc2",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 30200,
      baseNet: 30200,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "TG", airlineName: "Thai Airways", flightNo: "TG 569",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 1, durationMin: 302, duration: "5h 2m",
        depTime: "07:55", arrTime: "12:57", refundable: true, baggageKg: 25,
        fareBasis: "TGE1",
        segments: [
          { carrier: "TG", carrierName: "Thai Airways", flightNo: "TG 569", from: "DEL", to: "FRA", depTime: "07:55", arrTime: "09:41", durationMin: 106 },
          { carrier: "TG", carrierName: "Thai Airways", flightNo: "TG 582", from: "FRA", to: "DXB", depTime: "11:49", arrTime: "12:57", durationMin: 68 },
        ],
      },
    },
    {
      id: "6304d64a-3a5f-4899-84c4-2f5d3150b2db",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 30400,
      baseNet: 30400,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "EY", airlineName: "Etihad Airways", flightNo: "EY 631",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 1, durationMin: 287, duration: "4h 47m",
        depTime: "18:15", arrTime: "23:02", refundable: false, baggageKg: 25,
        fareBasis: "EYE1",
        segments: [
          { carrier: "EY", carrierName: "Etihad Airways", flightNo: "EY 631", from: "DEL", to: "DOH", depTime: "18:15", arrTime: "19:53", durationMin: 98 },
          { carrier: "EY", carrierName: "Etihad Airways", flightNo: "EY 644", from: "DOH", to: "DXB", depTime: "21:02", arrTime: "23:02", durationMin: 120 },
        ],
      },
    },
    {
      id: "239e31a9-bbf8-404c-898a-3fb50d772bf9",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 30600,
      baseNet: 30600,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "BA", airlineName: "British Airways", flightNo: "BA 693",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 1, durationMin: 210, duration: "3h 30m",
        depTime: "17:50", arrTime: "21:20", refundable: true, baggageKg: 25,
        fareBasis: "BAE1",
        segments: [
          { carrier: "BA", carrierName: "British Airways", flightNo: "BA 693", from: "DEL", to: "SIN", depTime: "17:50", arrTime: "18:50", durationMin: 60 },
          { carrier: "BA", carrierName: "British Airways", flightNo: "BA 706", from: "SIN", to: "DXB", depTime: "19:56", arrTime: "21:20", durationMin: 84 },
        ],
      },
    },
    {
      id: "ad7af47d-be7e-4a42-a2a1-158d274b7e93",
      session_id: "653dfa32-f126-46e9-8ee7-6cdf473babae",
      product: "flight",
      international: true,
      currency: "INR",
      base_net: 36200,
      baseNet: 36200,
      expires_at: "2026-09-01T08:00:24.653Z",
      detail: {
        airline: "EK", airlineName: "Emirates", flightNo: "EK 538",
        originCode: "DEL", destCode: "DXB", date: "2026-09-22",
        cabin: "economy", pax: 2, stops: 0, durationMin: 164, duration: "2h 44m",
        depTime: "22:30", arrTime: "01:14", refundable: false, baggageKg: 25,
        fareBasis: "EKE0",
        segments: [
          { carrier: "EK", carrierName: "Emirates", flightNo: "EK 538", from: "DEL", to: "DXB", depTime: "22:30", arrTime: "01:14", durationMin: 164 },
        ],
      },
    },
  ],
};

// Captured against offer bb0eef2c… (Lufthansa LH 662) — reused for
// whichever offer_id the advisor actually expands, see module docblock.
const MOCK_FARE_FAMILY = {
  grid: [
    { code: "LITE", name: "Lite", mult: 1, checkedBagKg: 0, cabinBagKg: 7, seatSelection: "paid", changeable: false, refundable: false, miles: "25%", sell: 26574, sellDelta: 0, currency: "INR" },
    { code: "VALUE", name: "Value", mult: 1.12, checkedBagKg: 25, cabinBagKg: 7, seatSelection: "standard free", changeable: "fee", refundable: false, miles: "100%", sell: 29763, sellDelta: 3189, currency: "INR" },
    { code: "FLEX", name: "Flex", mult: 1.28, checkedBagKg: 35, cabinBagKg: 10, seatSelection: "free incl. preferred", changeable: "free", refundable: true, miles: "125%", sell: 34015, sellDelta: 7441, currency: "INR" },
  ],
  upsell: { from: "LITE", to: "VALUE", extra_inr: 3189, gains: ["Free checked bag", "Standard seat", "100% miles"], oneLine: "Add INR 3,189 for a checked bag, seat choice and full miles." },
  currency: "INR",
};

const MOCK_FARE_RULES = {
  fareBasis: "LHE0",
  refundable: true,
  cat16_cancellation: {
    title: "CAT-16 Penalties - Cancellation / Refund",
    refundable: true,
    before_departure_inr: 5500,
    non_refundable_note: null,
    no_show_inr: 8800,
    bands: [
      { window: "> 7 days", penalty_inr: 3300 },
      { window: "2-7 days", penalty_inr: 5500 },
      { window: "< 48 h", penalty_inr: 7150 },
      { window: "no-show / post-departure", penalty_inr: 8800 },
    ],
    tax_recovery: { recoverable: ["all taxes"], forfeited: [] },
  },
  cat31_change: {
    title: "CAT-31 - Voluntary Changes (date/route)",
    change_fee_inr: 3500,
    fare_difference: "Add-collect at reprice; residual to EMD if downgrade.",
    same_day_change_inr: 4900,
    changes_allowed: "unlimited (fee + fare diff)",
  },
  advance_purchase: "7 days",
  min_stay: "Sunday rule / 3 nights",
  max_stay: "12 months",
  endorsements: "CHANGES/REFUNDS PERMITTED PER RULE",
  provenance: {
    source: "simulated_fare_authority",
    fetched_at: "2026-09-01T07:31:04.017Z",
    ttl_minutes: 30,
    live: false,
    note: "Deterministic simulated rules. No live GDS/NDC CAT-16/31 fetch.",
  },
};

const MOCK_ANCILLARIES = {
  bags: [
    { type: "bag", code: "BAG15", name: "Extra 15 kg checked bag", sell: 4500, currency: "INR", emd_eligible: true },
    { type: "bag", code: "BAG23", name: "Extra 23 kg checked bag", sell: 6200, currency: "INR", emd_eligible: true },
  ],
  seats: [
    { type: "seat", code: "SEAT_STD", name: "Standard seat", sell: 1200, currency: "INR", emd_eligible: true },
    { type: "seat", code: "SEAT_PREF", name: "Preferred / extra-legroom seat", sell: 3200, currency: "INR", emd_eligible: true },
  ],
  meals: [
    { type: "meal", code: "MEAL_VEG", name: "Vegetarian meal", sell: 600, currency: "INR", emd_eligible: false },
    { type: "meal", code: "MEAL_PREM", name: "Premium / chef meal", sell: 1200, currency: "INR", emd_eligible: true },
  ],
  lounge: [{ type: "lounge", code: "LOUNGE", name: "Lounge access (per pax/leg)", sell: 2800, currency: "INR", emd_eligible: true }],
  wifi: [{ type: "wifi", code: "WIFI", name: "Onboard Wi-Fi", sell: 1400, currency: "INR", emd_eligible: false }],
  priority: [{ type: "priority", code: "PRIORITY", name: "Priority check-in & boarding", sell: 900, currency: "INR", emd_eligible: true }],
  note: "Sell-only catalogue. Ancillaries bind as EMD at ticketing (money-path, not issued here).",
  availability: "available",
};

// Trimmed to 16 rows (of the captured 32) — FlightFareDetail's own seatmap
// renderer only shows rows.slice(0, 16) anyway.
const MOCK_SEATMAP = {
  segments: [
    {
      segment: "DEL-DXB",
      flightNo: "LH 662",
      cabin: "economy",
      columns: ["A", "B", "C", "D", "E", "F", "G", "H", "J"],
      rowCount: 32,
      rows: [
        { row: 1, exit_row: false, seats: [{ seat: "1A", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }, { seat: "1B", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "1C", occupied: false, type: "preferred", window: false, aisle: true, sell: 3200, currency: "INR" }, { seat: "1D", occupied: false, type: "preferred", window: false, aisle: true, sell: 3200, currency: "INR" }, { seat: "1E", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "1F", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "1G", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "1H", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "1J", occupied: true, type: "preferred", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 2, exit_row: false, seats: [{ seat: "2A", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }, { seat: "2B", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "2C", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "2D", occupied: false, type: "preferred", window: false, aisle: true, sell: 3200, currency: "INR" }, { seat: "2E", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "2F", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "2G", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "2H", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "2J", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }] },
        { row: 3, exit_row: false, seats: [{ seat: "3A", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }, { seat: "3B", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "3C", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "3D", occupied: false, type: "preferred", window: false, aisle: true, sell: 3200, currency: "INR" }, { seat: "3E", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "3F", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "3G", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "3H", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "3J", occupied: true, type: "preferred", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 4, exit_row: false, seats: [{ seat: "4A", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }, { seat: "4B", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "4C", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "4D", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "4E", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "4F", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "4G", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "4H", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "4J", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }] },
        { row: 5, exit_row: false, seats: [{ seat: "5A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "5B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "5C", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "5D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "5E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "5F", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "5G", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "5H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "5J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 6, exit_row: false, seats: [{ seat: "6A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "6B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "6C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "6D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "6E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "6F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "6G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "6H", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "6J", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }] },
        { row: 7, exit_row: false, seats: [{ seat: "7A", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }, { seat: "7B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "7C", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "7D", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "7E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "7F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "7G", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "7H", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "7J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 8, exit_row: false, seats: [{ seat: "8A", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }, { seat: "8B", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "8C", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "8D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "8E", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "8F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "8G", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "8H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "8J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 9, exit_row: false, seats: [{ seat: "9A", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }, { seat: "9B", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "9C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "9D", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "9E", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "9F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "9G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "9H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "9J", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }] },
        { row: 10, exit_row: false, seats: [{ seat: "10A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "10B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "10C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "10D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "10E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "10F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "10G", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "10H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "10J", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }] },
        { row: 11, exit_row: false, seats: [{ seat: "11A", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }, { seat: "11B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "11C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "11D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "11E", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "11F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "11G", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "11H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "11J", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }] },
        { row: 12, exit_row: false, seats: [{ seat: "12A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "12B", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "12C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "12D", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "12E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "12F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "12G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "12H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "12J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 13, exit_row: false, seats: [{ seat: "13A", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }, { seat: "13B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "13C", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "13D", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "13E", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "13F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "13G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "13H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "13J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 14, exit_row: false, seats: [{ seat: "14A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "14B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "14C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "14D", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "14E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "14F", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "14G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "14H", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "14J", occupied: false, type: "standard", window: true, aisle: false, sell: 1200, currency: "INR" }] },
        { row: 15, exit_row: false, seats: [{ seat: "15A", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }, { seat: "15B", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "15C", occupied: false, type: "standard", window: false, aisle: true, sell: 1200, currency: "INR" }, { seat: "15D", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "15E", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "15F", occupied: true, type: "standard", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "15G", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "15H", occupied: false, type: "standard", window: false, aisle: false, sell: 1200, currency: "INR" }, { seat: "15J", occupied: true, type: "standard", window: true, aisle: false, sell: null, currency: "INR" }] },
        { row: 16, exit_row: true, seats: [{ seat: "16A", occupied: false, type: "preferred", window: true, aisle: false, sell: 3200, currency: "INR" }, { seat: "16B", occupied: false, type: "preferred", window: false, aisle: false, sell: 3200, currency: "INR" }, { seat: "16C", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "16D", occupied: false, type: "preferred", window: false, aisle: true, sell: 3200, currency: "INR" }, { seat: "16E", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "16F", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "16G", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "16H", occupied: true, type: "preferred", window: false, aisle: false, sell: null, currency: "INR" }, { seat: "16J", occupied: true, type: "preferred", window: true, aisle: false, sell: null, currency: "INR" }] },
      ],
    },
  ],
  note: "Sell-only seat map. Selection holds a seat; EMD binds at ticketing.",
};

export function mockFlightFares(offerId: string, action: string) {
  const base = { offer_id: offerId, action, currency: "INR" };
  if (action === "fare_family") return { ...base, baseSell: 26574, fare_family: MOCK_FARE_FAMILY };
  if (action === "fare_rules") return { ...base, fare_rules: MOCK_FARE_RULES };
  if (action === "ancillaries") return { ...base, ancillaries: MOCK_ANCILLARIES };
  if (action === "seatmap") return { ...base, seatmap: MOCK_SEATMAP };
  return base;
}
