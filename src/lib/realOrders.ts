/* =============================================================================
 * Adapters: booking_* rows (GET /booking-orders, /booking-orders/{id}) ->
 * the Order shape the Orders workspace UI renders.
 * ===========================================================================*/
import type { Flight, Fulfilment, Hotel, Itinerary, Order, OrderStatus, PaymentStatus, Traveller } from "./orderTypes";

/** An order as the Orders workspace renders it (what summaryToOrder/detailToOrder return). */
export type RealOrder = Order;

const LIVE_TONE = "linear-gradient(135deg,#7C8798 0%,#BDC5D2 55%,#EEF0F4 100%)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Tripsure times are airport-local and zone-less ("2026-08-15T15:35:00"); parse
// the digits directly so the browser's timezone can never shift them.
function parts(ts?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(ts || "");
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], hh: m[4], mm: m[5] };
}
function dayLabel(ts?: string | null) {
  const p = parts(ts);
  if (!p) return "";
  const dow = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${dow}, ${p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
}
const hhmm = (ts?: string | null) => { const p = parts(ts); return p ? `${p.hh}:${p.mm}` : "—"; };
const shortDate = (iso?: string | null) => { const p = parts(iso ? iso + "T00:00" : null); return p ? `${p.d} ${MONTHS[p.mo - 1]}` : ""; };

export function durationLabel(mins?: number | null) {
  if (mins == null) return "";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function travelDates(start?: string | null, end?: string | null) {
  if (!start) return "Dates TBC";
  const year = start.slice(0, 4);
  if (!end || end === start) return `${shortDate(start)} ${year}`;
  return `${shortDate(start)} – ${shortDate(end)} ${end.slice(0, 4)}`;
}

const STATUS: Record<string, OrderStatus> = { pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled" };

// "Paid" only when recorded payments cover the whole order; the view's own
// payment_status label is used when it has no paid_total to go on.
function paymentStatusOf(s: any): PaymentStatus {
  const total = Number(s.total_amount) || 0;
  if (s.paid_total != null && total > 0) return Number(s.paid_total) >= total - 0.5 ? "Paid" : "Pending";
  const label = String(s.payment_status || "").toLowerCase();
  return label === "paid" ? "Paid" : label === "refunded" ? "Refunded" : "Pending";
}

/** One row of v_booking_order_summary -> list entry (itineraries filled in on open). */
export function summaryToOrder(s: any): Order {
  return {
    id: s.order_number || String(s.id),
    number: s.seq,
    createdAt: String(s.created_at).slice(0, 10),
    customerName: s.customer_name,
    email: s.customer_email || "",
    destination: s.destination || "—",
    travelDates: travelDates(s.travel_start, s.travel_end),
    travellers: [], // filled in by detailToOrder when the order is opened
    amount: Number(s.total_amount) || 0,
    paymentStatus: paymentStatusOf(s),
    status: STATUS[s.status] || "Pending",
    tone: LIVE_TONE,
    itineraries: [{ id: "pending", label: s.first_label || "Itinerary 1", title: "", dates: "", flights: [], hotel: null, visa: null }],
    dbId: s.id,
  };
}

function flightToUi(f: any, cabinFallback: string): Flight {
  const stops = f.stops_text || (f.stops ? `${f.stops} stop${f.stops === 1 ? "" : "s"}` : "Non-stop");
  return {
    id: f.id,
    dateLabel: dayLabel(f.departs_at),
    from: f.origin_code, to: f.destination_code,
    fromCity: f.origin_city || f.origin_code, toCity: f.destination_city || f.destination_code,
    dep: hhmm(f.departs_at), arr: hhmm(f.arrives_at),
    duration: durationLabel(f.duration_minutes), stops,
    cabin: f.cabin_class || cabinFallback, airline: f.airline_name || f.airline_code || "",
    flightNo: [f.airline_code, f.flight_number].filter(Boolean).join(" "),
    pricePerTraveller: Number(f.price_per_traveller) || 0,
    detail: {
      baggage: f.baggage_text || f.checkin_baggage || "Not provided",
      seat: f.seat_text || "Not selected yet",
      terminal: f.terminal_text || "Not provided",
    },
    pnr: f.pnr || null,
  };
}

function travellerToUi(t: any): Traveller {
  return {
    id: t.id,
    name: t.full_name || [t.first_name, t.last_name].filter(Boolean).join(" "),
    relation: t.relation || (t.is_lead ? "Lead" : ""),
    age: t.age ?? null,
    title: t.title || undefined,
    firstName: t.first_name || undefined,
    lastName: t.last_name || undefined,
    gender: t.gender || undefined,
    paxType: t.pax_type || "adult",
    dateOfBirth: t.date_of_birth || null,
    isLead: !!t.is_lead,
    email: t.email || null,
    phone: t.phone || null,
    nationality: t.nationality || null,
    passportLast4: t.passport_last4 || null,
    passportExpiry: t.passport_expiry || null,
    hasPan: !!t.has_pan,
  };
}

function hotelToUi(h: any): Hotel {
  return {
    id: h.id,
    name: h.name,
    location: h.location || "",
    rating: Number(h.rating) || 0,
    pricePerNight: Number(h.price_per_night) || 0,
    amenities: h.amenities || [],
    checkIn: h.check_in ? `${shortDate(h.check_in)} ${h.check_in.slice(0, 4)}` : "—",
    checkOut: h.check_out ? `${shortDate(h.check_out)} ${h.check_out.slice(0, 4)}` : "—",
    nights: h.nights ?? (h.check_in && h.check_out ? Math.max(0, Math.round((Date.parse(h.check_out) - Date.parse(h.check_in)) / 86_400_000)) : 0),
    rooms: h.rooms ?? 1,
    total: Number(h.total_price) || 0,
    tone: LIVE_TONE,
    imageUrl: h.image_url,
    roomType: h.room_type,
    board: h.board_basis,
    refundable: h.is_refundable,
    priceChanged: h.price_changed,
    lock: h.tripsure_partner_ref_id
      ? { partnerRef: h.tripsure_partner_ref_id, total: h.locked_total != null ? Number(h.locked_total) : null, at: h.locked_at || null, guest: h.guest_name || null }
      : null,
    confirmationNumber: h.confirmation_number || null,
    bookingStatus: h.booking_status || null,
  };
}

/** GET /booking-orders/{id} -> full order for OrderDetail. */
export function detailToOrder(d: any): Order {
  const base = summaryToOrder(d.order);
  const itineraries: Itinerary[] = (d.itineraries || []).map((it: any) => {
    const ps = it.price_summary || null;
    return {
      id: it.id,
      label: it.label,
      title: it.title,
      dates: travelDates(it.start_date, it.end_date),
      flights: (it.flights || []).map((f: any) => flightToUi(f, "Economy")),
      hotel: (it.hotels || [])[0] ? hotelToUi(it.hotels[0]) : null, // UI shows the first stay
      visa: null, // visas aren't part of this phase
      tripsure: it.tripsure_itinerary_id
        ? {
            itineraryId: it.tripsure_itinerary_id,
            totalFare: ps && ps.totalFare != null ? Number(ps.totalFare) : null,
            priceChanged: !!(it.price_validation && it.price_validation.isPriceChanged),
            createdAt: it.tripsure_created_at || null,
          }
        : undefined,
    } as Itinerary;
  });
  const pax = (d.itineraries || [])
    .map((it: any) => it.search_pax)
    .filter(Boolean)
    .reduce((m: number, p: any) => Math.max(m, (p.adults || 0) + (p.children || 0) + (p.infants || 0)), 0);
  const f = d.fulfilment as Fulfilment | undefined;
  return {
    ...base,
    itineraries: itineraries.length ? itineraries : base.itineraries,
    travellers: (d.travellers || []).map(travellerToUi),
    paxCount: pax || undefined,
    fulfilment: f,
    paymentStatus: f ? (f.payment.due <= 0.5 && f.payment.total > 0 ? "Paid" : "Pending") : base.paymentStatus,
    email: base.email || f?.customer.email || "",
  };
}
