/* =============================================================================
 * TripAgent — src/lib/itineraryFromCart.ts
 * Search → Itinerary Builder, direct (2026-09-03) — "there needs to be a
 * way for someone to add something from search directly to itinerary,"
 * explicitly WITHOUT a cart staging step in between (direct scope call:
 * "Cart is not necessary at all for this flow"). blankItinerary() seeds a
 * real (empty, not mock) itinerary the moment an enquiry has none yet;
 * addCartItemToItinerary() converts whatever a Search desk's "Add" button
 * already builds (flightCartItem/hotelCartItem/visaCartItem, see
 * advisorHelpers.ts) into this shape and merges it in — flights/hotels
 * land in the day matching their date (a new day is created if none
 * exists yet for that date), visa replaces the trip's single `visa` slot
 * (there's one visa per trip in this model, not one per day).
 *
 * Deliberately simpler than the AI-generated mock data (mockItinerary.ts)
 * — a freshly search-added item has no curated chips/alerts/actions, just
 * status "on_hold" (a real, unconfirmed thing the advisor just picked,
 * same as how a held flight actually behaves) and a plain "Added from
 * Search" meta line. It's still a real itinerary item — same shape,
 * same tiering/collapsing/editing behavior in ItineraryView — not a
 * lesser stand-in for one.
 * ===========================================================================*/

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function blankItinerary(): any {
  return {
    destination: "New itinerary",
    dateRange: "",
    // startIso/endIso (2026-09-04) — the itinerary's own committed date
    // bound, separate from whatever days happen to exist yet. null until
    // something seeds it (see boundFromDateRange) — with no bound set,
    // every day is treated as in-bound (see ItineraryView's dayInBound).
    startIso: null as string | null,
    endIso: null as string | null,
    cities: [],
    nights: 0,
    pax: 0,
    purpose: "",
    totals: { grand: 0, confirmed: 0, held: 0 },
    visa: null,
    alerts: [],
    days: [],
  };
}

export function fmtDayDate(iso: string) {
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// boundFromDateRange (2026-09-04) — best-effort parse of an enquiry's
// ask.dateRange display string ("18 – 22 Nov") into real ISO start/end
// bounds, so an itinerary has a real committed date range to check new
// items against from the moment it's created — not just whatever
// happens to already be in `days` (which is empty for scratch/
// Search-first itineraries). Same "match the mock data" scope as this
// session's other date/city lookups: handles the single-month "D – D
// Mon" shape every current mock enquiry uses, not a general date-range
// parser — returns null (caller treats everything as in-bound, no
// flagging) if it can't confidently parse.
export function boundFromDateRange(rangeStr: string | undefined, year: number) {
  if (!rangeStr) return null;
  const m = rangeStr.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (!m) return null;
  const monthIdx = MONTH_ABBR.indexOf(m[3].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;
  const mm = String(monthIdx + 1).padStart(2, "0");
  const pad = (n: string) => n.padStart(2, "0");
  return { startIso: `${year}-${mm}-${pad(m[1])}`, endIso: `${year}-${mm}-${pad(m[2])}` };
}

// fmtDateRangeIso — the same "D – D Mon" shape as above (or "D Mon – D
// Mon" across a month boundary), for recomputing the header's date
// range once an out-of-bound day gets folded into the trip and the
// bound grows past its original span.
export function fmtDateRangeIso(startIso: string, endIso: string) {
  const s = new Date(startIso),
    e = new Date(endIso);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const dayMon = (dt: Date) => dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return sameMonth ? `${s.getDate()} – ${dayMon(e)}` : `${dayMon(s)} – ${dayMon(e)}`;
}

export function nightsBetweenIso(startIso: string, endIso: string) {
  const s = new Date(startIso).getTime(),
    e = new Date(endIso).getTime();
  if (isNaN(s) || isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / 86400000));
}

function fmtSegDuration(min: number) {
  if (!min) return "";
  return Math.floor(min / 60) + "h " + (min % 60) + "m";
}

// resortDays (2026-09-04) — re-sorts by _iso and relabels "Day N"
// sequentially, pulled out of findOrCreateDay's insert step so
// ItineraryView can reuse the EXACT same rule after a manual day-date
// edit: since a Search-added item lands by matching `_iso` (see
// addCartItemToItinerary below), editing a day's date has to move it
// and renumber the rest the same way inserting a new day already does —
// otherwise the displayed date and the day's real bucketing identity
// would silently drift apart. Returns new day objects rather than
// mutating in place (the original inline version mutated `label` on
// the existing day objects it was resorting, which happened to be
// harmless only because callers always also swap in a new top-level
// array reference).
export function resortDays(days: any[]) {
  const sorted = days.slice().sort((a: any, b: any) => (a._iso || "").localeCompare(b._iso || ""));
  return sorted.map((d: any, i: number) => ({ ...d, label: "Day " + (i + 1) }));
}

// Finds the day matching `iso` (by date, not by id) or creates+inserts one
// in date order — a freshly added flight/hotel should land next to
// whatever's already there, not always at the end.
function findOrCreateDay(days: any[], iso: string, route: string) {
  const existing = days.find((d: any) => d._iso === iso);
  if (existing) return { days, day: existing };
  const day = { id: "day-" + uid(), _iso: iso, label: "", date: fmtDayDate(iso), route, subtotal: null, items: [] as any[] };
  const next = resortDays(days.concat([day]));
  const inserted = next.find((d: any) => d.id === day.id);
  return { days: next, day: inserted };
}

export function addCartItemToItinerary(data: any, cartItem: any) {
  const base = data || blankItinerary();

  if (cartItem.type === "visa") {
    const d = cartItem._detail || {};
    const visa = {
      id: "visa-" + uid(),
      status: "in_progress",
      nextStep: d.processing_days ? "processing " + d.processing_days + "d" : undefined,
      title: cartItem._title || "Visa",
      sub: cartItem._sub || "",
      meta: d.processing_days ? d.processing_days + " days processing" : "",
      price: cartItem.baseNet,
      chips: (d.documents || []).slice(0, 3).map((label: string) => ({ label, tone: "warn" })),
      note: "Added from Search — document checklist not yet collected.",
    };
    return { ...base, visa, totals: { ...base.totals, grand: base.totals.grand + cartItem.baseNet, held: base.totals.held + cartItem.baseNet } };
  }

  const d = cartItem._detail || {};
  let iso: string | null = null;
  let route = "";
  let item: any;

  if (cartItem.type === "flight") {
    iso = d.date || null;
    route = (d.originCode || cartItem.originCode || "") + " → " + (d.destCode || cartItem.destCode || "");
    item = {
      id: cartItem._cid,
      type: "flight",
      time: d.depTime || null,
      duration: d.duration,
      title: cartItem._title,
      status: "on_hold",
      price: cartItem.baseNet,
      cabin: d.cabin,
      segments: (d.segments || []).map((seg: any) => ({
        flightNo: seg.flightNo,
        route: (seg.from || "") + " " + (seg.depTime || "") + " → " + (seg.to || "") + " " + (seg.arrTime || ""),
        duration: fmtSegDuration(seg.durationMin),
      })),
      chips: [cartItem.refundable ? "Refundable" : "Non-refundable"],
      meta: "Added from Search",
    };
  } else {
    // hotel — checkIn is stamped onto the item by HotelResults' Add button
    // (see HotelDesk.tsx), since hotel offers themselves don't carry a date.
    iso = cartItem.checkIn || null;
    route = d.cityName || "";
    item = {
      id: cartItem._cid,
      type: "hotel",
      time: null,
      duration: d.nights ? d.nights + " nights" : undefined,
      title: cartItem._title,
      status: "on_hold",
      price: cartItem.baseNet,
      sub: [d.cityName, d.stars ? d.stars + "★" : null, d.board].filter(Boolean).join(" · "),
      roomType: d.roomType || undefined,
      detailRest: [d.nights ? d.nights + " nights" : null, d.nightlyFrom ? "from ₹" + Math.round(d.nightlyFrom).toLocaleString("en-IN") + "/night" : null]
        .filter(Boolean)
        .join(" · "),
      chips: [cartItem.refundable ? "Refundable" : "Non-refundable"],
      meta: "Added from Search",
    };
  }

  if (!iso) {
    // No date on the offer at all — still needs SOME bucket; falls into an
    // "Unscheduled" day rather than being silently dropped.
    iso = "unscheduled";
    route = route || "Date not set";
  }

  const { days, day } = findOrCreateDay(base.days, iso, route);
  const dayIdx = days.indexOf(day);
  const updatedDay = { ...day, items: day.items.concat([item]) };
  const nextDays = days.slice();
  nextDays[dayIdx] = updatedDay;

  return { ...base, days: nextDays, totals: { ...base.totals, grand: base.totals.grand + cartItem.baseNet, held: base.totals.held + cartItem.baseNet } };
}
