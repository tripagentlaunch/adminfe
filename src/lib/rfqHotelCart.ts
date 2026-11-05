/* Awarded RFQ hotel bid -> the offer shape hotelCartItem() turns into an itinerary item.
   An RFQ bid is free text parsed into { total_amount, cancellation, inclusions… } — it has no hotel id, room
   code or photo, so those are never invented: the offer carries NO `id` (hotelCartItem would otherwise treat a
   numeric offers-row id as a real hotel key and build a public link to a hotel that was never searched). */

export interface RfqHotelSpec {
  destination?: string; city?: string;
  check_in?: string; check_out?: string;
  nights?: number | string; duration_nights?: number | string; los?: number | string;
  rooms?: number; guests?: number; room_type?: string; stars?: number | string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && v !== undefined && Number.isFinite(n) ? n : null;
};

export function nightsOf(spec: RfqHotelSpec): number | null {
  const explicit = num(spec.nights) ?? num(spec.duration_nights) ?? num(spec.los);
  if (explicit != null && explicit > 0) return Math.round(explicit);
  if (spec.check_in && spec.check_out) {
    const a = Date.parse(spec.check_in), z = Date.parse(spec.check_out);
    if (!Number.isNaN(a) && !Number.isNaN(z) && z > a) return Math.round((z - a) / 86_400_000);
  }
  return null;
}

/** Strongest meal plan the bid's inclusions mention; a bid that names none is Room Only. */
export function boardOf(inclusions: unknown): string {
  const text = (Array.isArray(inclusions) ? inclusions : [inclusions]).map((x) => String(x || "").toLowerCase()).join(" | ");
  if (/all[\s-]?inclusive/.test(text)) return "All Inclusive";
  if (/full board/.test(text)) return "Full Board";
  if (/half board/.test(text)) return "Half Board";
  if (/breakfast/.test(text)) return "Breakfast Included";
  return "Room Only";
}

/** true / false from the bid's cancellation text; null when the bid said nothing. */
export function refundableOf(cancellation: unknown): boolean | null {
  const t = String(cancellation || "").trim().toLowerCase();
  if (!t) return null;
  if (/non[\s-]?refundable|no refund/.test(t)) return false;
  return true;
}

/** `award` is rfqAward()'s answer ({ offer, supplier, … }); `spec` is the RFQ's requirement spec. */
export function awardToHotelOffer(award: any, spec: RfqHotelSpec | null | undefined) {
  const offer = (award && award.offer) || {};
  const d = offer.detail || {};
  const s = spec || {};
  const supplierName = (award && award.supplier && (award.supplier.name || award.supplier.code)) || "";
  const refundable = refundableOf(d.cancellation);
  return {
    // no `id` on purpose — see the note at the top of this file
    base_net: Number(offer.base_net != null ? offer.base_net : d.net_inr) || 0,
    international: !!offer.international,
    detail: {
      hotelName: d.hotel_name || d.property || supplierName || "Hotel (RFQ)",
      cityName: s.destination || s.city || "",
      nights: nightsOf(s) ?? undefined,
      stars: num(s.stars) ?? undefined,
      board: boardOf(d.inclusions),
      roomType: d.room_type || s.room_type || "",
      // Unknown cancellation terms stay "not refundable" in the cart until the advisor confirms otherwise.
      refundable: refundable === true,
      source: "rfq-award",
      rfq_id: d.rfq_id,
      quote_id: d.quote_id,
      cancellation: d.cancellation || null,
    },
  };
}
