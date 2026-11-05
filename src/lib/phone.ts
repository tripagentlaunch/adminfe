/* Mobile numbers for TripSure's Create Itinerary (guide 6.5): `customerInfo.mobile` is the national number and
   `mobileCountryCode` is its calling code, sent separately. Mirrors adbe's _national_mobile. */

// Calling codes of the countries advisors book for, longest match wins ("971" before "97").
const CALLING_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "52", "55", "60", "61", "62",
  "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98", "212", "230", "248", "254", "255", "351", "353",
  "358", "420", "852", "880", "960", "961", "962", "965", "966", "968", "971", "972", "973", "974", "975", "977",
];

/** The number without its country calling code or trunk 0, digits only. */
export function nationalMobile(raw: string, countryCode = "91"): string {
  let d = String(raw || "").replace(/\D/g, "");
  const cc = String(countryCode || "").replace(/\D/g, "") || "91";
  if (cc === "91") {
    if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return d;
  }
  if (d.startsWith(cc) && d.length > cc.length + 6) d = d.slice(cc.length);
  if (d.startsWith("0") && d.length > 7) d = d.slice(1);
  return d;
}

/** A phone as it was saved ("+971 50 123 4567", "00447911123456", "8172836138") -> calling code + national number. Without a "+" / "00" prefix it is an Indian number. */
export function splitMobile(raw: string): { code: string; national: string } {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  const international = s.startsWith("+") || s.startsWith("00");
  if (international) {
    const rest = s.startsWith("00") ? digits.slice(2) : digits;
    const code = [...CALLING_CODES].sort((a, b) => b.length - a.length).find((c) => rest.startsWith(c));
    if (code) return { code, national: nationalMobile(rest, code) };
  }
  return { code: "91", national: nationalMobile(digits, "91") };
}

/** Whether a national number can be a real one for this calling code (India is exactly 10 digits). */
export function mobileOk(national: string, countryCode: string): boolean {
  return (countryCode || "91") === "91" ? /^\d{10}$/.test(national) : /^\d{6,14}$/.test(national);
}
