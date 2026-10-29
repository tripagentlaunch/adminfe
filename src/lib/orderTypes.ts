/* Shared types + formatter for the Orders workspace (components/orders/*).
   Real data only: rows come from the booking_* tables via lib/realOrders.ts. */

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
  /** Airline booking reference, once ticketed. */
  pnr?: string | null;
}
export interface Hotel {
  id?: string;
  name: string; location: string; rating: number; pricePerNight: number;
  amenities: string[]; checkIn: string; checkOut: string; nights: number; rooms: number; total: number;
  tone: string; // CSS gradient used when there is no photo
  imageUrl?: string | null;
  roomType?: string | null;
  board?: string | null;
  refundable?: boolean | null;
  priceChanged?: boolean | null;
  /** Tripsure create-itinerary lock (Stage A), when the room has been locked. */
  lock?: { partnerRef: string; total: number | null; at: string | null; guest: string | null } | null;
  /** Set once the room is confirmed with the supplier. */
  confirmationNumber?: string | null;
  bookingStatus?: string | null;
}
export interface Visa {
  type: string; country: string; processing: string; documents: string[]; fee: number;
  status: "Not started" | "Applied" | "Approved";
  note: string;
}
export interface Itinerary {
  id: string; label: string; title: string; dates: string;
  flights: Flight[]; hotel: Hotel | null; visa: Visa | null;
  /** The locked Tripsure flight fare, when this itinerary has one. */
  tripsure?: { itineraryId: string; totalFare: number | null; priceChanged: boolean; createdAt: string | null };
}
export type PaxType = "adult" | "child" | "infant";
export interface Traveller {
  name: string; relation: string; age: number | null;
  id?: string;
  title?: string; firstName?: string; lastName?: string;
  gender?: "male" | "female";
  paxType?: PaxType;
  dateOfBirth?: string | null;
  isLead?: boolean;
  email?: string | null; phone?: string | null;
  nationality?: string | null;
  /** Only the last 4 characters ever reach the browser. */
  passportLast4?: string | null;
  passportExpiry?: string | null;
  hasPan?: boolean;
}

/** One bookable thing on the order, as GET /booking-orders/{id}/fulfilment reports it. */
export interface FulfilmentItem {
  kind: "flight" | "hotel";
  id: string;
  label: string;
  title: string;
  /** flight: fare_locked | ticketing | ticketed | failed | check_required
   *  hotel: price_checked | room_locked | booking | confirmed | pending | failed | check_required | cancelled */
  status: string;
  booking_ref?: string | null;
  confirmation_number?: string | null;
  pnrs?: string[];
  error?: string | null;
  booked_at?: string | null;
  amount?: number | null;
  can_book: boolean;
  blocked_reason?: string | null;
  /** hotel only: a confirmed room can be cancelled / has a tax invoice. */
  can_cancel?: boolean;
  can_invoice?: boolean;
  /** flight only: documents the fare needs (Create Itinerary conditions): passport / pan / gst. */
  documents_required?: string[];
  /** flight only: the journey's x-trace-id, quoted to TripSure support. */
  trace_id?: string | null;
}
export interface PaymentRow { id: string; amount: number; status: string; method?: string | null; reference?: string | null; note?: string | null; paid_at?: string | null }
export interface Fulfilment {
  order_id: string;
  schema_ready: boolean;
  international: boolean;
  stage: "empty" | "travellers" | "payment" | "ready" | "attention" | "partially_booked" | "booked" | "cancelled";
  next_action: string;
  customer: { name: string; email?: string | null; phone?: string | null; gst_number?: string | null; gst_company_name?: string | null; enquiry_id?: string | null };
  travellers: {
    needed: Record<PaxType, number> | null;
    entered: Record<PaxType, number>;
    complete: boolean;
    mix_error?: string | null;
    list: any[];
  };
  payment: { total: number; paid: number; refunded?: number; due: number; currency: string; payments: PaymentRow[] };
  items: FulfilmentItem[];
}
export interface Order {
  id: string; number: number; createdAt: string; // ISO date
  customerName: string; email: string; destination: string;
  travelDates: string; travellers: Traveller[];
  /** ISO dates of the trip's first departure / last return (passport validity checks). */
  travelStart?: string | null; travelEnd?: string | null;
  amount: number; paymentStatus: PaymentStatus; status: OrderStatus;
  tone: string; itineraries: Itinerary[];
  /** booking_orders.id (uuid). */
  dbId: string;
  /** Searched passenger count, used until real travellers are attached. */
  paxCount?: number;
  /** Where the order stands (travellers -> payment -> booking); detail view only. */
  fulfilment?: Fulfilment;
}

export const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
