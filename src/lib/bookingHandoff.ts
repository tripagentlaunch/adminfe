/* "Book this trip": hands an enquiry over to New Booking on /orders
   (OrdersWorkspace reads these params). The order is tied to the enquiry and
   the search starts pre-filled with the customer and, where the Console
   itinerary has them, the first flight's route and the trip dates. Fares are
   always searched live again — itinerary prices are quotes, not locks. */

function firstFlightRoute(itinerary: any): { from?: string; to?: string; date?: string; item?: any } {
  for (const day of itinerary?.days || []) {
    for (const item of day.items || []) {
      if (item.type !== "flight") continue;
      // segments[].route looks like "DEL 08:30 → BOM 10:45"
      const segs: any[] = item.segments || [];
      const first = String(segs[0]?.route || "");
      const last = String(segs[segs.length - 1]?.route || "");
      const from = /^([A-Z]{3})\b/.exec(first)?.[1];
      const to = /→\s*([A-Z]{3})\b/.exec(last)?.[1];
      return { from, to, date: day._iso || undefined, item };
    }
  }
  return {};
}

export function bookingHandoffUrl({ enquiry, member, itinerary }: { enquiry: any; member?: any; itinerary?: any }): string {
  const q = new URLSearchParams({ book: "1" });
  const set = (k: string, v: any) => { if (v != null && v !== "") q.set(k, String(v)); };
  set("enquiry", enquiry?.id);
  set("member", member?.id || enquiry?.member_id);
  set("name", member?.name || enquiry?.detail?.name || "Traveller");
  set("email", member?.email);
  set("phone", member?.phone || member?.wa_phone);
  const route = firstFlightRoute(itinerary);
  set("from", route.from);
  set("to", route.to);
  set("date", route.date || itinerary?.startIso);
  if (route.from && itinerary?.endIso) set("ret", itinerary.endIso);
  // Travellers: the mix the Console flight was priced for, else the enquiry's head count.
  const mix = route.item?.paxMix;
  const persons = enquiry?.ask?.persons;
  if (mix) {
    set("adults", mix.adults);
    set("children", mix.children || "");
    set("infants", mix.infants || "");
  } else if (Array.isArray(persons) && persons.length) set("adults", Math.min(9, persons.length));
  // What the customer asked for on that flight, shown on the seats & baggage step.
  const r = route.item?.requests;
  if (r) {
    set("bag", r.extraBaggageKg || "");
    set("seat", r.seat);
    set("meal", r.meal);
    set("note", r.note);
  }
  return "/orders?" + q.toString();
}
