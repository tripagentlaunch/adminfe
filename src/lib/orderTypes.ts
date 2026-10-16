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
export interface Traveller { name: string; relation: string; age: number }
export interface Order {
  id: string; number: number; createdAt: string; // ISO date
  customerName: string; email: string; destination: string;
  travelDates: string; travellers: Traveller[];
  amount: number; paymentStatus: PaymentStatus; status: OrderStatus;
  tone: string; itineraries: Itinerary[];
  /** booking_orders.id (uuid). */
  dbId: string;
  /** Searched passenger count, used until real travellers are attached. */
  paxCount?: number;
}

export const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
