// An enquiry's `detail` as fields: an object (Tara / WhatsApp, and the website form from
// 2026-11-03), or the website form's older labeled text ("Destination: …\nDates: …").
// Mirrors adminbe's app/services/enquiry_detail.py.
const TEXT_KEYS: Record<string, string> = {
  destination: "destination", dates: "travel_window", travellers: "travelers_count",
  "trip type": "trip_type", cabin: "flight_preference", budget: "budget_total",
};

export function detailOf(raw: any): Record<string, any> {
  if (raw && typeof raw === "object") return raw;
  const out: Record<string, any> = {};
  if (typeof raw !== "string" || !raw.trim()) return out;
  raw.split("\n").forEach((line) => {
    const i = line.indexOf(":");
    const key = i > 0 ? TEXT_KEYS[line.slice(0, i).trim().toLowerCase()] : null;
    if (key && line.slice(i + 1).trim()) out[key] = line.slice(i + 1).trim();
  });
  // Any text detail is the form's, even "No trip details provided." (every field left empty).
  out.source = "website_enquiry_form";
  return out;
}

// Sent from the website's Plan a trip (/enquire) form.
export function isWebsiteQuery(e: any): boolean {
  return !!e && e.channel === "web" && detailOf(e.detail).source === "website_enquiry_form";
}

// The default message customerbe stores when the customer left "Anything else" empty.
export const EMPTY_NOTE = "New trip enquiry submitted via the website.";
