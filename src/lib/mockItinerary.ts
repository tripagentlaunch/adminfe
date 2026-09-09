/* =============================================================================
 * TripAgent — src/lib/mockItinerary.ts
 * Static mock data behind the "Generate AI Itinerary" path in the real
 * Itinerary Builder (2026-09-03) — standing in for the not-yet-built AI
 * generation call. Modeled on the Switzerland reference mockup the
 * designer shared, restructured into the tiered-hierarchy shape
 * ItineraryView.tsx renders (see that file's own docblock for the "why":
 * this whole exercise exists to fix the mockup reading like a printed
 * PDF instead of a working tool — item #1 of that plan, day/tier
 * collapsing, is what's being built first).
 *
 * Rewritten solo (2026-09-03) — the original reference mockup was a
 * 2-adult honeymoon trip, which conflicts with TripAgent's later scope
 * decision that it only accepts solo trips booked by the cardholder who
 * is also the traveller (see the designer's scope call). pax/seat/
 * baggage/room-occupancy counts and the "Honeymoon" purpose below are
 * all adjusted to solo; this is still the SAME shared mock used
 * regardless of which enquiry clicks "Generate AI Itinerary," not tied
 * to one specific traveller's name.
 *
 * Every item carries an explicit `status` (a real business state, e.g.
 * "on_hold", "booked") — `tierOf()` below is the ONLY place that maps
 * status → visual tier ("attention" | "done"), so adding a new status
 * later never means hunting through the render code to teach it a new
 * urgency rule.
 *
 * `roomType` (hotels) and `cabin` (flights) are pulled out of the old
 * flat `detail`/chip strings into their own fields (2026-09-03, item #6
 * of the hierarchy plan — inline editing) specifically so ItineraryView
 * can render them as editable text instead of baked-in prose; the rest
 * of each item's detail stays a plain display string (`detailRest`)
 * since editing occupancy/price/meal plan isn't in scope for this pass.
 * ===========================================================================*/

export type ItineraryItemStatus =
  | "on_hold"
  | "booked"
  | "awaiting_supplier"
  | "price_changed"
  | "not_selected"
  | "in_progress"
  // "draft" (2026-09-06) — a real backend now generates "Generate AI
  // Itinerary"'s content (see WorkbenchDataProvider.tsx's initItinerary),
  // and every item it drafts carries this status: an illustrative,
  // unverified suggestion (no live flight/hotel search behind it yet),
  // never to be confused with "on_hold" (a real hold with a supplier).
  | "draft"
  // "searched" (2026-09-06) — a generated itinerary's flight item(s) now
  // come from a REAL TripSure search (itinerary_service.py calls the
  // same flight_service.search() the Search panel uses) whenever origin/
  // destination resolve — a genuine found offer (real carrier/flight
  // number/price), just not yet held or ticketed. Distinct from "draft"
  // (an illustrative, unsearched AI guess) and from "on_hold" (a real
  // hold actually placed with the supplier, which this still isn't).
  | "searched";

export function tierOf(status: ItineraryItemStatus): "attention" | "done" {
  return status === "booked" ? "done" : "attention";
}

// nextStep (2026-09-03, item #5 of the hierarchy plan) — every attention
// item carries a short, concrete next-step string alongside its status,
// e.g. "6h 20m left" or "no reply 2d". StatusPill folds this into the
// pill itself ("On hold · 6h 20m left") so the urgency survives row
// collapsing (item #2) — a bare "On hold" pill on a collapsed row tells
// you nothing about HOW urgent; four different statuses sharing the
// same amber bucket (on_hold/in_progress/not_selected) only stay
// distinguishable at a glance because of this text, not the color.

// Maps a business status onto the app's existing 5-bucket semantic
// palette (.taw-status--*, already used by Orders) rather than inventing
// a new color language just for this screen.
export const STATUS_META: Record<ItineraryItemStatus, { label: string; bucket: "warn" | "info" | "danger" | "success" }> = {
  on_hold: { label: "On hold", bucket: "warn" },
  in_progress: { label: "In progress", bucket: "warn" },
  not_selected: { label: "Not selected", bucket: "warn" },
  awaiting_supplier: { label: "Awaiting supplier", bucket: "info" },
  price_changed: { label: "Price changed", bucket: "danger" },
  booked: { label: "Booked", bucket: "success" },
  draft: { label: "Draft", bucket: "info" },
  searched: { label: "Searched", bucket: "info" },
};

export const MOCK_ITINERARY = {
  destination: "Switzerland",
  dateRange: "12 – 20 Oct",
  cities: ["Zurich", "Lucerne", "Zermatt"],
  nights: 8,
  pax: 1,
  purpose: "Leisure",
  totals: { grand: 642300, confirmed: 418700, held: 223600 },
  meta: { syncedMinsAgo: 14, travelers: "1 traveller", draftVersion: 4, owner: "Ananya D" },
  visa: {
    id: "visa-ch",
    status: "in_progress" as ItineraryItemStatus,
    nextStep: "decision by 11 Oct",
    title: "Schengen visa · Switzerland",
    sub: "Type C short-stay · 1 applicant · VFS Mumbai",
    meta: "Appointment 22 Sep, 10:30 · 15 working days",
    price: 19600,
    chips: [
      { label: "Passports valid 2031", tone: "success" },
      { label: "Hotel vouchers needed", tone: "warn" },
      { label: "Insurance pending", tone: "warn" },
    ],
    note: "Decision lands 1 day before departure — flag risk to traveller",
  },
  alerts: [
    { id: "a1", text: "Flight hold expires in 6h 20m — ticket by 06 Oct, 18:00", jumpToDayId: "day-1", category: "flights" },
    { id: "a2", text: "Zermatt rate rose ₹9,600 since selection — reconfirm with traveller", jumpToDayId: "day-6", category: "hotels" },
    { id: "a3", text: "Visa appointment 22 Sep · book before ticketing", jumpToDayId: "visa", category: "visa" },
  ],
  days: [
    {
      id: "day-1",
      label: "Day 1",
      date: "Thu 12 Oct",
      // _iso (2026-09-03) — days added later via Search (see
      // itineraryFromCart.ts) need a machine-sortable date to slot in
      // among these correctly; without it, a real hurdle surfaced live:
      // a Search-added day landed at the END of the list regardless of
      // its actual date, since it sorted against these mock days'
      // missing _iso (empty string) instead of a real comparison.
      _iso: "2026-10-12",
      route: "Mumbai → Zurich",
      subtotal: 312400,
      items: [
        {
          id: "f1",
          type: "flight",
          time: "04:35",
          duration: "13h 20m",
          title: "Emirates · 1 stop via Dubai",
          status: "on_hold" as ItineraryItemStatus,
          nextStep: "6h 20m left",
          price: 224800,
          segments: [
            { flightNo: "EK 501", route: "BOM T2 04:35 → DXB T3 06:05", duration: "3h 30m" },
            { layover: "Layover 2h 10m · same terminal · no visa needed" },
            { flightNo: "EK 87", route: "DXB T3 08:15 → ZRH 12:25", duration: "6h 10m" },
          ],
          cabin: "Business",
          chips: ["Fare J", "1 seat", "1 × 32kg checked", "Seat 6A", "Change fee ₹12,000"],
          meta: "PNR 4XKJ2P · held with Emirates NDC · ticket by 06 Oct 18:00",
        },
        {
          id: "h1",
          type: "hotel",
          time: "15:00",
          duration: "2 nights",
          title: "Widder Hotel, Zurich",
          status: "booked" as ItineraryItemStatus,
          price: 87600,
          sub: "5-star · Rennweg 7, Old Town · In 12 Oct, out 14 Oct",
          roomType: "Deluxe King",
          detailRest: "1 adult · ₹43,800/night · Breakfast included",
          chips: ["Quiet room requested", "Late arrival flagged", "Free cancel till 09 Oct"],
          meta: "Conf WDR-88213 · prepaid · voucher issued 02 Sep",
        },
      ],
    },
    {
      id: "day-3",
      label: "Day 3",
      date: "Sat 14 Oct",
      _iso: "2026-10-14",
      route: "Zurich → Lucerne",
      subtotal: 114300,
      items: [
        {
          id: "h2",
          type: "hotel",
          time: "14:00",
          duration: "3 nights",
          title: "Bürgenstock Resort, Lucerne",
          status: "awaiting_supplier" as ItineraryItemStatus,
          nextStep: "no reply 2d",
          price: 114300,
          sub: "5-star · Obbürgen · In 14 Oct, out 17 Oct",
          roomType: "Lake View Suite",
          detailRest: "1 adult · ₹38,100/night · Half board",
          chips: ["Requested 01 Sep", "Pay at hotel"],
          meta: "No confirmation number yet · needed for visa file by 20 Sep",
        },
      ],
    },
    {
      id: "day-6",
      label: "Day 6",
      date: "Tue 17 Oct",
      _iso: "2026-10-17",
      route: "Lucerne → Zermatt",
      subtotal: 151600,
      items: [
        {
          id: "h3",
          type: "hotel",
          time: "15:00",
          duration: "3 nights",
          title: "Riffelalp Resort, Zermatt",
          status: "price_changed" as ItineraryItemStatus,
          nextStep: "+₹9,600",
          price: 151600,
          oldPrice: 142000,
          sub: "5-star · 2,222 m · In 17 Oct, out 20 Oct",
          roomType: "Matterhorn Junior Suite",
          detailRest: "1 adult · ₹50,533/night · Half board",
          chips: ["Since 28 Aug", "Free cancel till 10 Oct", "2 rooms left"],
          meta: "Quoted to traveller at old rate · reconfirm before booking",
        },
      ],
    },
    {
      id: "day-9",
      label: "Day 9",
      date: "Fri 20 Oct",
      _iso: "2026-10-20",
      route: "Zurich → Mumbai",
      subtotal: null,
      items: [
        {
          id: "f2",
          type: "flight",
          time: null,
          title: "Return flight",
          status: "not_selected" as ItineraryItemStatus,
          nextStep: "4 options",
          price: 198400,
          priceIsFrom: true,
          sub: "ZRH → BOM · after 13:00 · business, same fare family as outbound",
          note: "Return leg must be ticketed together with outbound to hold fare",
        },
      ],
    },
  ],
};
