/* What TripSure asks for when an issue is reported (flight guide section 11): the x-trace-id, the endpoint (here: the
 * step that went wrong), the timestamp, and the itineraryId or the supplier bookingId. Built from the order's flight
 * item so an advisor can paste it into the support request as it is. */

export interface SupportItem {
  title?: string;
  status?: string;
  error?: string | null;
  trace_id?: string | null;
  tripsure_itinerary_id?: string | null;
  supplier_booking_ids?: string[];
  pnrs?: string[];
}

const STEP: Record<string, string> = {
  fare_locked: "fare locked, not yet ticketed",
  ticketing: "ticketing (Book / Ticket) in progress",
  check_required: "ticketing: the result was unclear (Book / Ticket, then Booking Details)",
  failed: "ticketing (Book / Ticket) was refused",
  ticketed: "ticketed",
  cancelled: "cancelled",
};

export function supportDetails(item: SupportItem, orderNumber?: string | null, now: Date = new Date()): string {
  const lines: (string | null)[] = [
    "TripSure flight support request",
    `Time: ${now.toISOString()}`,
    orderNumber ? `Order: ${orderNumber}` : null,
    item.title ? `Flight: ${item.title}` : null,
    item.trace_id ? `Trace id (x-trace-id): ${item.trace_id}` : null,
    item.tripsure_itinerary_id ? `Itinerary id: ${item.tripsure_itinerary_id}` : null,
    item.supplier_booking_ids?.length ? `Supplier booking id: ${item.supplier_booking_ids.join(", ")}` : null,
    item.pnrs?.length ? `PNR: ${item.pnrs.join(", ")}` : null,
    item.status ? `Step: ${STEP[item.status] || item.status}` : null,
    item.error ? `Problem: ${item.error}` : null,
  ];
  return lines.filter((l): l is string => !!l).join("\n");
}
