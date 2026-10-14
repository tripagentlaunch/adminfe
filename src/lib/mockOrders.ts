/* =============================================================================
 * Placeholder data for the Orders workspace UI (components/orders/*).
 * FRONTEND-ONLY MOCK: nothing here is read from or written to the backend.
 * "Today" for the date-range filter is pinned to MOCK_TODAY so the demo list
 * looks the same whenever it is opened.
 * ===========================================================================*/

export type PaymentStatus = "Paid" | "Pending" | "Refunded";
export type OrderStatus = "Confirmed" | "Pending" | "Cancelled";

export interface Flight {
  id: string;
  dateLabel: string;
  from: string; to: string; fromCity: string; toCity: string;
  dep: string; arr: string; duration: string; stops: string;
  cabin: string; airline: string; flightNo: string;
  pricePerTraveller: number;
  detail: { baggage: string; seat: string; terminal: string };
}
export interface Hotel {
  name: string; location: string; rating: number; pricePerNight: number;
  amenities: string[]; checkIn: string; checkOut: string; nights: number; rooms: number; total: number;
  tone: string; // CSS gradient used as the placeholder photo
}
export interface Visa {
  type: string; country: string; processing: string; documents: string[]; fee: number;
  status: "Not started" | "Applied" | "Approved";
  note: string;
}
export interface Itinerary {
  id: string; label: string; title: string; dates: string;
  flights: Flight[]; hotel: Hotel | null; visa: Visa | null;
}
export interface Traveller { name: string; relation: string; age: number }
export interface MockOrder {
  id: string; number: number; createdAt: string; // ISO date
  customerName: string; email: string; destination: string;
  travelDates: string; travellers: Traveller[];
  amount: number; paymentStatus: PaymentStatus; status: OrderStatus;
  tone: string; itineraries: Itinerary[];
}

export const MOCK_TODAY = "2026-10-14";

export const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const TONES = {
  alps: "linear-gradient(135deg,#7FA3B8 0%,#C9DCE6 55%,#F1EEE4 100%)",
  bali: "linear-gradient(135deg,#6FA58A 0%,#B7D8A8 55%,#F2E8C9 100%)",
  dubai: "linear-gradient(135deg,#C8A15B 0%,#E9D3A3 55%,#FAF1D9 100%)",
  london: "linear-gradient(135deg,#7C8798 0%,#BDC5D2 55%,#EEF0F4 100%)",
  maldives: "linear-gradient(135deg,#4FA7B5 0%,#9ADBD9 55%,#F3F0DA 100%)",
};

const zurichFlights = (suffix = ""): Flight[] => [
  { id: "f1" + suffix, dateLabel: "Sat, 12 Dec 2026", from: "BLR", to: "ZRH", fromCity: "Bengaluru", toCity: "Zurich",
    dep: "02:10", arr: "08:45", duration: "10h 05m", stops: "1 stop (DOH)", cabin: "Economy", airline: "Qatar Airways", flightNo: "QR 573",
    pricePerTraveller: 58200, detail: { baggage: "2 × 23 kg checked + 7 kg cabin", seat: "Auto-assigned at check-in", terminal: "T2 → T1" } },
  { id: "f2" + suffix, dateLabel: "Sat, 19 Dec 2026", from: "ZRH", to: "BLR", fromCity: "Zurich", toCity: "Bengaluru",
    dep: "21:30", arr: "13:10 +1", duration: "10h 10m", stops: "1 stop (DOH)", cabin: "Economy", airline: "Qatar Airways", flightNo: "QR 96",
    pricePerTraveller: 54800, detail: { baggage: "2 × 23 kg checked + 7 kg cabin", seat: "Auto-assigned at check-in", terminal: "T1 → T2" } },
];

export const MOCK_ORDERS: MockOrder[] = [
  {
    id: "TA-240918", number: 1, createdAt: "2026-10-09", customerName: "Aarav Mehta", email: "aarav.mehta@example.com",
    destination: "Zurich, Switzerland", travelDates: "12 Dec – 19 Dec 2026",
    travellers: [{ name: "Aarav Mehta", relation: "Lead", age: 38 }, { name: "Neha Mehta", relation: "Spouse", age: 36 }, { name: "Kabir Mehta", relation: "Son", age: 9 }],
    amount: 486500, paymentStatus: "Paid", status: "Confirmed", tone: TONES.alps,
    itineraries: [
      { id: "i1", label: "Itinerary 1", title: "Swiss Alps Family Escape", dates: "12 Dec – 19 Dec 2026",
        flights: zurichFlights(),
        hotel: { name: "Hotel Schweizerhof Zermatt", location: "Bahnhofstrasse, Zermatt, Switzerland", rating: 4.8, pricePerNight: 31200,
          amenities: ["Wifi", "Breakfast", "Spa", "Mountain view", "Airport transfer"], checkIn: "13 Dec 2026", checkOut: "19 Dec 2026", nights: 6, rooms: 2, total: 374400, tone: TONES.alps },
        visa: { type: "Schengen Visa", country: "Switzerland", processing: "10–15 working days", fee: 9800,
          documents: ["Passport (valid 6+ months)", "Passport-size photographs (35×45 mm)", "Flight and hotel bookings", "Bank statements (last 6 months)", "Travel insurance (€30,000 cover)", "Income tax returns (2 years)"],
          status: "Applied", note: "Your visa application has been submitted and is under process." } },
      { id: "i2", label: "Itinerary 2", title: "Zurich & Lucerne City Break", dates: "12 Dec – 16 Dec 2026",
        flights: zurichFlights("b").slice(0, 1),
        hotel: { name: "Baur au Lac", location: "Talstrasse 1, Zurich, Switzerland", rating: 4.9, pricePerNight: 46800,
          amenities: ["Wifi", "Breakfast", "Spa", "Lake view"], checkIn: "12 Dec 2026", checkOut: "16 Dec 2026", nights: 4, rooms: 1, total: 187200, tone: TONES.london },
        visa: { type: "Schengen Visa", country: "Switzerland", processing: "10–15 working days", fee: 9800, documents: ["Passport (valid 6+ months)", "Passport-size photographs (35×45 mm)", "Flight and hotel bookings"], status: "Not started", note: "Application not started for this itinerary." } },
    ],
  },
  {
    id: "TA-240921", number: 2, createdAt: "2026-10-11", customerName: "Priya Nair", email: "priya.nair@example.com",
    destination: "Bali, Indonesia", travelDates: "3 Jan – 10 Jan 2027",
    travellers: [{ name: "Priya Nair", relation: "Lead", age: 31 }, { name: "Rohan Nair", relation: "Spouse", age: 33 }],
    amount: 214000, paymentStatus: "Pending", status: "Pending", tone: TONES.bali,
    itineraries: [{ id: "i1", label: "Itinerary 1", title: "Bali Honeymoon Retreat", dates: "3 Jan – 10 Jan 2027",
      flights: [
        { id: "f1", dateLabel: "Sun, 3 Jan 2027", from: "BLR", to: "DPS", fromCity: "Bengaluru", toCity: "Denpasar", dep: "23:55", arr: "08:30 +1", duration: "7h 05m", stops: "Non-stop", cabin: "Economy", airline: "IndiGo", flightNo: "6E 1177", pricePerTraveller: 31200, detail: { baggage: "1 × 20 kg checked + 7 kg cabin", seat: "Seat 14A, 14B", terminal: "T1" } },
        { id: "f2", dateLabel: "Sun, 10 Jan 2027", from: "DPS", to: "BLR", fromCity: "Denpasar", toCity: "Bengaluru", dep: "09:40", arr: "14:15", duration: "6h 05m", stops: "Non-stop", cabin: "Economy", airline: "IndiGo", flightNo: "6E 1178", pricePerTraveller: 29800, detail: { baggage: "1 × 20 kg checked + 7 kg cabin", seat: "Seat 22C, 22D", terminal: "I" } }],
      hotel: { name: "Alila Seminyak", location: "Jl. Taman Ganesha, Seminyak, Bali", rating: 4.7, pricePerNight: 14500, amenities: ["Wifi", "Breakfast", "Spa", "Pool", "Beachfront"], checkIn: "4 Jan 2027", checkOut: "10 Jan 2027", nights: 6, rooms: 1, total: 87000, tone: TONES.bali },
      visa: { type: "Visa on Arrival", country: "Indonesia", processing: "On arrival (15–30 min)", fee: 2900, documents: ["Passport (valid 6+ months)", "Return flight ticket", "Hotel booking"], status: "Not started", note: "Pay the fee at the airport on arrival." } }],
  },
  {
    id: "TA-240925", number: 3, createdAt: "2026-09-28", customerName: "Rahul Verma", email: "rahul.verma@example.com",
    destination: "Dubai, UAE", travelDates: "20 Nov – 25 Nov 2026",
    travellers: [{ name: "Rahul Verma", relation: "Lead", age: 42 }, { name: "Anjali Verma", relation: "Spouse", age: 40 }, { name: "Ishaan Verma", relation: "Son", age: 14 }, { name: "Mira Verma", relation: "Daughter", age: 11 }],
    amount: 342800, paymentStatus: "Paid", status: "Confirmed", tone: TONES.dubai,
    itineraries: [{ id: "i1", label: "Itinerary 1", title: "Dubai Family Holiday", dates: "20 Nov – 25 Nov 2026",
      flights: [{ id: "f1", dateLabel: "Fri, 20 Nov 2026", from: "DEL", to: "DXB", fromCity: "Delhi", toCity: "Dubai", dep: "04:30", arr: "06:50", duration: "3h 50m", stops: "Non-stop", cabin: "Economy", airline: "Emirates", flightNo: "EK 513", pricePerTraveller: 21400, detail: { baggage: "2 × 23 kg checked + 7 kg cabin", seat: "Seats 31A–31D", terminal: "T3" } }],
      hotel: { name: "Atlantis The Palm", location: "Crescent Rd, Palm Jumeirah, Dubai", rating: 4.6, pricePerNight: 38900, amenities: ["Wifi", "Breakfast", "Waterpark", "Spa", "Kids club"], checkIn: "20 Nov 2026", checkOut: "25 Nov 2026", nights: 5, rooms: 2, total: 194500, tone: TONES.dubai },
      visa: { type: "UAE Tourist Visa", country: "United Arab Emirates", processing: "3–4 working days", fee: 6200, documents: ["Passport (valid 6+ months)", "Passport-size photographs", "Return flight tickets"], status: "Approved", note: "Visa approved — e-visa copies are in the traveller's documents." } }],
  },
  {
    id: "TA-240930", number: 4, createdAt: "2026-09-15", customerName: "Sneha Kapoor", email: "sneha.kapoor@example.com",
    destination: "London, United Kingdom", travelDates: "5 Dec – 12 Dec 2026",
    travellers: [{ name: "Sneha Kapoor", relation: "Lead", age: 29 }],
    amount: 168900, paymentStatus: "Refunded", status: "Cancelled", tone: TONES.london,
    itineraries: [{ id: "i1", label: "Itinerary 1", title: "London Solo City Break", dates: "5 Dec – 12 Dec 2026",
      flights: [{ id: "f1", dateLabel: "Sat, 5 Dec 2026", from: "BOM", to: "LHR", fromCity: "Mumbai", toCity: "London", dep: "02:40", arr: "07:55", duration: "9h 45m", stops: "Non-stop", cabin: "Premium Economy", airline: "British Airways", flightNo: "BA 138", pricePerTraveller: 82400, detail: { baggage: "2 × 23 kg checked + 10 kg cabin", seat: "Seat 21A", terminal: "T2 → T5" } }],
      hotel: { name: "The Zetter Clerkenwell", location: "St John's Square, London", rating: 4.4, pricePerNight: 15200, amenities: ["Wifi", "Breakfast", "Bar"], checkIn: "5 Dec 2026", checkOut: "12 Dec 2026", nights: 7, rooms: 1, total: 106400, tone: TONES.london },
      visa: { type: "UK Standard Visitor Visa", country: "United Kingdom", processing: "15–21 working days", fee: 13500, documents: ["Passport", "Bank statements", "Employment letter"], status: "Not started", note: "Order cancelled before the visa application was started." } }],
  },
  {
    id: "TA-240933", number: 5, createdAt: "2026-08-30", customerName: "Vikram Singh", email: "vikram.singh@example.com",
    destination: "Malé, Maldives", travelDates: "14 Feb – 19 Feb 2027",
    travellers: [{ name: "Vikram Singh", relation: "Lead", age: 45 }, { name: "Kavya Singh", relation: "Spouse", age: 43 }],
    amount: 398000, paymentStatus: "Paid", status: "Confirmed", tone: TONES.maldives,
    itineraries: [{ id: "i1", label: "Itinerary 1", title: "Maldives Overwater Villa", dates: "14 Feb – 19 Feb 2027",
      flights: [{ id: "f1", dateLabel: "Sun, 14 Feb 2027", from: "BLR", to: "MLE", fromCity: "Bengaluru", toCity: "Malé", dep: "10:15", arr: "12:05", duration: "2h 20m", stops: "Non-stop", cabin: "Business", airline: "IndiGo", flightNo: "6E 1253", pricePerTraveller: 36900, detail: { baggage: "2 × 23 kg checked + 10 kg cabin", seat: "Seats 2A, 2B", terminal: "T1" } }],
      hotel: { name: "Soneva Fushi Water Villa", location: "Baa Atoll, Maldives", rating: 4.9, pricePerNight: 52000, amenities: ["Wifi", "All meals", "Spa", "Private pool", "Speedboat transfer"], checkIn: "14 Feb 2027", checkOut: "19 Feb 2027", nights: 5, rooms: 1, total: 260000, tone: TONES.maldives },
      visa: { type: "Visa on Arrival", country: "Maldives", processing: "On arrival", fee: 0, documents: ["Passport (valid 6+ months)", "Return ticket", "Resort confirmation"], status: "Not started", note: "Free 30-day visa on arrival." } }],
  },
  {
    id: "TA-240938", number: 6, createdAt: "2026-10-12", customerName: "Ananya Rao", email: "ananya.rao@example.com",
    destination: "Zurich, Switzerland", travelDates: "27 Dec – 3 Jan 2027",
    travellers: [{ name: "Ananya Rao", relation: "Lead", age: 34 }, { name: "Dev Rao", relation: "Spouse", age: 36 }],
    amount: 276400, paymentStatus: "Pending", status: "Pending", tone: TONES.alps,
    itineraries: [{ id: "i1", label: "Itinerary 1", title: "New Year in the Alps", dates: "27 Dec – 3 Jan 2027",
      flights: zurichFlights("c"),
      hotel: { name: "Hotel Edelweiss Interlaken", location: "Höheweg 37, Interlaken", rating: 4.5, pricePerNight: 22600, amenities: ["Wifi", "Breakfast", "Spa"], checkIn: "28 Dec 2026", checkOut: "3 Jan 2027", nights: 6, rooms: 1, total: 135600, tone: TONES.alps },
      visa: { type: "Schengen Visa", country: "Switzerland", processing: "10–15 working days", fee: 9800, documents: ["Passport (valid 6+ months)", "Passport-size photographs (35×45 mm)", "Flight and hotel bookings", "Bank statements (last 6 months)"], status: "Applied", note: "Your visa application has been submitted and is under process." } }],
  },
];
