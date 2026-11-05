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
