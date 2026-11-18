/* Helpers for TripSure's Hotel Details response (guide 6.3), shared by the Hotels desk and New Booking. */

/** Why a Details response can't be used, or null when it is fine. TripSure answers 200 with validResponse:false and a message when it has no details. */
export function detailsProblem(r: any): string | null {
  if (!r || r.validResponse !== false) return null;
  const why = String(r.partnerErrorMsg || r.errorMessage || "").trim();
  return why ? `TripSure says: ${why.replace(/\.$/, "")}.` : "TripSure returned no details for this hotel. Search again to get fresh rates.";
}

/**
 * The code Price Check and Create Itinerary need for one rate: roomType.bookingCode (guide 6.3), else the
 * option's recommendationId, which is the same value in every response seen so far.
 */
export function rateBookingCode(option: any, roomType: any): string {
  const code = roomType && roomType.bookingCode;
  return String(code != null && code !== "" ? code : (option && option.recommendationId) || "");
}

/** What the guest must provide for a rate, as the room list already says it (roomType.isPANMandatory / isPassportMandatory). */
export function rateRequirements(roomType: any): string[] {
  const rt = roomType || {};
  return [rt.isPANMandatory ? "PAN required" : "", rt.isPassportMandatory ? "Passport required" : ""].filter(Boolean);
}

/* ---------------------------------------------------------------------------
 * Price Check (guide 6.4): "show the customer what changed". The live check is compared with what the
 * room list (Details) said, and every difference is returned as a sentence for the advisor to read out.
 * ------------------------------------------------------------------------- */

/** End of the zero-charge cancellation window in TripSure's cancellationRules, when it has one. */
export function freeUntilOf(cancellationRules: any): string | null {
  const rules = (((cancellationRules || [])[0] || {}).rules || []) as any[];
  const free = rules.find((x: any) => x.valueType === "Amount" && Number(x.value) === 0 && x.end);
  return free ? String(free.end) : null;
}

// Policy wording compared without its timestamps: the room list and the live check write the same
// deadline with different time / timezone suffixes, which is not a change.
const termsKey = (s: unknown) =>
  String(s || "")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g, (m) => m.slice(0, 10))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** What the live Price Check says that the room list didn't. `opt` is the room-list rate, `rate` is roomRates[0]. */
export function liveCheckChanges(args: { liveHotelName?: string; wasHotelName?: string; rate: any; opt: any }): string[] {
  const { rate, opt } = args;
  const rt = (rate && rate.roomType) || {};
  const out: (string | null)[] = [];
  const liveName = String(args.liveHotelName || "").trim();
  const wasName = String(args.wasHotelName || "").trim();
  // guide 6.4: the hotel's name can differ between Details and Price Check; the customer must see it
  out.push(liveName && wasName && liveName.toLowerCase() !== wasName.toLowerCase() ? `Hotel is now named "${liveName}" (was "${wasName}")` : null);
  out.push(rt.roomTitle && opt.title && rt.roomTitle !== opt.title ? `Room is now "${rt.roomTitle}"` : null);
  out.push(rt.refundable != null && !!rt.refundable !== !!opt.refundable ? `Now ${rt.refundable ? "refundable" : "non-refundable"}` : null);
  // compared by calendar day
  const live = freeUntilOf(rate && rate.cancellationRules);
  out.push(live && opt.freeUntil && live.slice(0, 10) !== String(opt.freeUntil).slice(0, 10)
    ? `Free cancellation now ends ${live.slice(0, 10)} (was ${String(opt.freeUntil).slice(0, 10)})` : null);
  // the wording itself: only when both sides have text, and it differs once timestamps are ignored
  const liveTerms = typeof (rate && rate.cancellation) === "string" ? rate.cancellation : "";
  out.push(liveTerms && opt.cancellation && termsKey(liveTerms) !== termsKey(opt.cancellation) ? "Cancellation terms have changed - read the updated terms" : null);
  return out.filter((x): x is string => !!x);
}

/** Check-in instructions arrive as strings holding HTML-escaped HTML ("&lt;ul&gt;…"): decoded to plain text lines, never injected as markup. */
export function plainInstructions(list: any): string[] {
  if (typeof DOMParser === "undefined") return [];
  const decode = (t: string) => new DOMParser().parseFromString(t, "text/html").documentElement.textContent || "";
  return (Array.isArray(list) ? list : [])
    .map((x) => decode(decode(String(x || "")).replace(/<\/(li|p)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")))
    .flatMap((t) => t.split("\n"))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
