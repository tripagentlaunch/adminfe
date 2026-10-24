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
// ISO date(s) embedded in rangeStr (2026-09-10, bug fix) — Aanya v2/v3/v4's
// own travel_window (this function's caller always passes enquiry.ask.
// dateRange, which is travel_window verbatim — see enquiry_service.
// get_traveller_profile) can already be a real ISO date/range: "2027-01-10
// to 2027-01-18", "from 2026-12-01", or a bare "2026-12-01" are all real,
// currently-occurring shapes, confirmed against real stored enquiries —
// none of which the "D – D Mon" pattern below (v1's own shape) has ever
// matched. Tried FIRST since an ISO date is exact and self-contained (it
// carries its own year, unlike "D – D Mon" — `year` is only ever used by
// the fallback below). Mirrors backend/app/services/itinerary_service.py's
// _guess_date_bounds fix — same real bug, same real formats, a parallel
// fix in each runtime since one function can't be shared across Python
// and TypeScript.
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;

export function boundFromDateRange(rangeStr: string | undefined, _year?: number) {
  if (!rangeStr) return null;

  const isoDates = rangeStr.match(ISO_DATE_RE);
  if (isoDates && isoDates.length) {
    const valid = isoDates.filter((d) => !isNaN(new Date(d).getTime()));
    if (valid.length >= 2 && valid[1] >= valid[0]) {
      return { startIso: valid[0], endIso: valid[1] };
    }
    // Exactly one real date (only a start, or only an end, was ever
    // confirmed) — endIso stays null rather than a fabricated zero-night
    // bound; dayInBound() already treats a null half of the bound as
    // "nothing to flag against" (see its own docblock), the same honest
    // degrade the backend fix uses for this identical case.
    if (valid.length === 1) {
      return { startIso: valid[0], endIso: null as string | null };
    }
  }

  // "D Mon to D Mon", "26 Dec – 1 Jan", "18 – 22 Nov", "26 Dec 2026 to 1 Jan 2027" (rewritten 2026-10-21).
  // Mirrors _guess_date_bounds in backend/app/services/itinerary_service.py. The separator may be
  // "to"/"until"/"till" or a dash (it used to be a dash only, so "26 Dec to 1 Jan" returned null and
  // the Search panel fell back to today+21 / an empty return date). The first month is optional
  // ("18 – 22 Nov" is one month). (?<!\d) stops a match starting inside a year ("2027"). A year on
  // either side is used; with none, the NEXT occurrence of the start date (so a trip in 2027 is not
  // given 2026), and an end that falls before the start rolls into the following year
  // ("26 Dec to 1 Jan" = 26 Dec -> 1 Jan of the next year). `_year` is kept for the old call sites.
  const m = rangeStr.match(
    /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]{3,9})?\.?(?:,?\s+(\d{4}))?\s*(?:to|until|till|[–—-])\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/i
  );
  if (!m) return single(rangeStr);
  const endMonth = monthIndex(m[5]);
  const startMonth = m[2] ? monthIndex(m[2]) : endMonth;
  if (startMonth < 0 || endMonth < 0) return single(rangeStr);
  const d1 = Number(m[1]);
  const d2 = Number(m[4]);
  let startYear: number;
  if (m[3] || m[6]) {
    startYear = Number(m[3] || m[6]);
  } else {
    const now = new Date();
    const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    startYear = now.getFullYear() * 10000 + (startMonth + 1) * 100 + d1 >= todayKey ? now.getFullYear() : now.getFullYear() + 1;
  }
  let endYear = m[6] ? Number(m[6]) : startYear;
  if (!m[6] && (endMonth + 1) * 100 + d2 < (startMonth + 1) * 100 + d1) endYear = startYear + 1;
  if (m[6] && !m[3] && endYear * 10000 + (endMonth + 1) * 100 + d2 < startYear * 10000 + (startMonth + 1) * 100 + d1) startYear = endYear - 1;
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const startIso = iso(startYear, startMonth, d1);
  const endIso = iso(endYear, endMonth, d2);
  // A day that doesn't exist in its month ("31 Feb") is not a date.
  if (isNaN(new Date(startIso).getTime()) || isNaN(new Date(endIso).getTime()) || new Date(startIso).getUTCDate() !== d1 || new Date(endIso).getUTCDate() !== d2) return null;
  return { startIso, endIso };
}

// single — one exact day with no range ("10 November", "Nov 10", "10 Nov 2026"): a real start date,
// end unknown (null), same as a lone ISO date. Mirrors the backend's _SINGLE_DAY_MONTH_RE branch.
function single(rangeStr: string): { startIso: string; endIso: string | null } | null {
  const a = rangeStr.match(/(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/i);
  const b = a ? null : rangeStr.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  const monthName = a ? a[2] : b ? b[1] : "";
  const day = a ? Number(a[1]) : b ? Number(b[2]) : 0;
  const yearStr = a ? a[3] : b ? b[3] : undefined;
  const month = monthIndex(monthName);
  if (month < 0 || !day) return null;
  const now = new Date();
  const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const year = yearStr ? Number(yearStr) : now.getFullYear() * 10000 + (month + 1) * 100 + day >= todayKey ? now.getFullYear() : now.getFullYear() + 1;
  const startIso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (isNaN(new Date(startIso).getTime()) || new Date(startIso).getUTCDate() !== day) return null;
  return { startIso, endIso: null };
}

// monthIndex — "Dec", "december", "Sept" -> 0-11; -1 for anything that is not a month name
// (so "days" or "decide" never read as a month).
const MONTH_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function monthIndex(name: string): number {
  const n = (name || "").trim().toLowerCase().replace(/\.$/, "");
  if (n.length < 3) return -1;
  if (n === "sept") return 8;
  return MONTH_FULL.findIndex((full) => full.startsWith(n));
}

// tripDatesFor — the dates the Search panel should pre-fill: the itinerary's own real dates when it
// has them (the backend parsed them; or Tara's plan, or Search-first), else whatever the enquiry's
// own date text parses to. null when neither is known. `endIso` is null for a single known date.
export function tripDatesFor(itinerary: any, ask: any): { startIso: string; endIso: string | null } | null {
  if (itinerary && itinerary.startIso) return { startIso: itinerary.startIso, endIso: itinerary.endIso || null };
  const b = boundFromDateRange(ask && ask.dateRange, new Date().getFullYear());
  return b && b.startIso ? { startIso: b.startIso, endIso: b.endIso || null } : null;
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
      // international (2026-09-04) — carried straight off the cart item
      // (flightCartItem/hotelCartItem already set it from the real
      // offer) so cartFromItinerary() can round-trip it back out for
      // Quote Builder's GST/TCS math, which depends on it.
      international: !!cartItem.international,
      cabin: d.cabin,
      segments: (d.segments || []).map((seg: any) => ({
        flightNo: seg.flightNo,
        route: (seg.from || "") + " " + (seg.depTime || "") + " → " + (seg.to || "") + " " + (seg.arrTime || ""),
        duration: fmtSegDuration(seg.durationMin),
      })),
      chips: [cartItem.refundable ? "Refundable" : "Non-refundable"],
      meta: "Added from Search",
      alternatives: cartItem.alternatives || [],
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
      international: !!cartItem.international,
      sub: [d.cityName, d.stars ? d.stars + "★" : null, d.board].filter(Boolean).join(" · "),
      roomType: d.roomType || undefined,
      detailRest: [d.nights ? d.nights + " nights" : null, d.nightlyFrom ? "from ₹" + Math.round(d.nightlyFrom).toLocaleString("en-IN") + "/night" : null]
        .filter(Boolean)
        .join(" · "),
      chips: [cartItem.refundable ? "Refundable" : "Non-refundable"],
      meta: "Added from Search",
      // hotelKey/image (2026-09-10) — carried straight off the cart item
      // (hotelCartItem already keeps them from the real TripSure offer),
      // same "round-trippable real field" posture as `international` above
      // — lets ProposalDocument/ProposalPreview link this stay to its real
      // public /hotel/{hotelKey} page.
      hotelKey: cartItem.hotelKey,
      image: d.image,
      alternatives: cartItem.alternatives || [],
      // address/lat/lng (2026-09-11) — see hotelCartItem's own note
      // (advisorHelpers.ts) on why these are carried through: a real
      // Google Maps link in the Proposal PDF alongside the
      // /hotel/{hotelKey} page.
      address: d.address,
      lat: d.lat,
      lng: d.lng,
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

export function addDaysIso(iso: string, n: number) {
  // UTC end to end: new Date("yyyy-MM-dd") parses as UTC midnight, so mixing
  // in local-time setDate() shifts the result a day across a DST change in
  // the browser's timezone (checkOut one day short).
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type HotelBase = { city: string; checkIn: string; checkOut: string; nights: number };

// hotelBasesFromItinerary (2026-09-15, hotel-suggestion flow) — derives
// the real hotel base(s) (one city + date range each) this itinerary
// actually needs, so the Hotels tab can request real recommendations for
// each one instead of the advisor guessing dates/cities by hand. Groups
// CONSECUTIVE days sharing the same real per-day `city` (itinerary_
// service.py's 2026-09-15 fix threads Claude's own draft city onto each
// day — see that file's own note; absent on itineraries generated before
// that, or on Search-first/scratch itineraries with no per-day city at
// all, in which case this falls back to the itinerary's single overall
// city when there's only one, never a guess for a genuinely multi-city
// trip with no real per-day signal — that case just yields one base per
// day instead of silently merging different cities together).
//
// Any day that ALREADY has a hotel item is excluded outright (never
// re-recommend for something already decided) and breaks a run in
// progress, same as a genuine city change would.
//
// The itinerary's own FINAL calendar day is never counted as an extra
// night — it's the "breakfast, free time, airport departure" day (see
// this feature's own spec example: 10-14 Nov is 4 NIGHTS, not 5, because
// the 14th is checkout/departure morning) — trimmed from whichever base
// contains it, regardless of which city it happens to be tagged with.
// Mid-trip city transitions are trusted as Claude tagged them (the day a
// multi-city trip moves to a new city is that NEW city's own check-in
// day, not the old city's extra night) — a reasonable, non-fabricated
// best effort given the real per-day data available, not a guess dressed
// up as certainty.
export function hotelBasesFromItinerary(data: any): HotelBase[] {
  const allDays = (data?.days || [])
    .filter((d: any) => d._iso)
    .slice()
    .sort((a: any, b: any) => String(a._iso).localeCompare(String(b._iso)));
  if (!allDays.length) return [];
  const tripLastIso = allDays[allDays.length - 1]._iso;

  const hasHotel = (d: any) => (d.items || []).some((it: any) => it.type === "hotel");
  const cities: string[] = data.cities || [];
  const singleCity = cities.length === 1 ? cities[0] : cities.length === 0 ? data.destination : null;
  const cityOf = (day: any) => day.city || singleCity || data.destination || "";

  const bases: HotelBase[] = [];
  let run: any[] = [];
  function flush() {
    if (!run.length) return;
    const city = cityOf(run[0]);
    let nights = run;
    // Trim the trip's own final day off whichever base contains it (see
    // this function's own note above) — never leaves a 0-night base
    // behind just because a run happens to be exactly that one day.
    if (nights.length > 1 && nights[nights.length - 1]._iso === tripLastIso) {
      nights = nights.slice(0, -1);
    }
    if (city && nights.length) {
      const first = nights[0];
      const last = nights[nights.length - 1];
      bases.push({ city, checkIn: first._iso, checkOut: addDaysIso(last._iso, 1), nights: nights.length });
    }
    run = [];
  }
  for (const day of allDays) {
    if (hasHotel(day)) {
      flush();
      continue;
    }
    const city = cityOf(day);
    if (!city) {
      flush();
      continue;
    }
    if (run.length && cityOf(run[run.length - 1]) !== city) flush();
    run.push(day);
  }
  flush();
  return bases;
}

// addRecommendedHotelToItinerary (2026-09-15, hotel-suggestion flow) —
// mirrors addCartItemToItinerary's own hotel branch (same real-field
// shape: hotelKey/image/address/lat/lng, status "searched" — an
// advisor's pick from real, ranked search results, not yet held/booked),
// but starts from a hotel-recommendations card (itinerary_service.
// recommend_hotels's real TripSure fields) rather than a Search offer,
// for a specific hotel base (one city + date range) rather than a single
// day. The one real behavioral difference the spec calls for: refuses to
// add the same hotelKey twice — returns the SAME `data` reference
// unchanged (not a clone) when it's already present anywhere in the
// itinerary, so a caller comparing references can tell nothing happened
// and skip an unnecessary toast/re-render.
export function addRecommendedHotelToItinerary(data: any, hotel: any, base: HotelBase): any {
  const itinerary = data || blankItinerary();
  const alreadyAdded = (itinerary.days || []).some((d: any) =>
    (d.items || []).some((it: any) => it.type === "hotel" && it.hotelKey && String(it.hotelKey) === String(hotel.hotelKey))
  );
  if (alreadyAdded) return itinerary;

  const starLabel = hotel.stars ? `${hotel.stars}-star` : undefined;
  const item = {
    id: uid(),
    type: "hotel",
    time: null,
    duration: `${base.nights} night${base.nights === 1 ? "" : "s"}`,
    title: `${hotel.name}, ${base.city}`,
    status: "searched",
    nextStep: "Not yet held",
    price: hotel.totalPrice,
    priceIsFrom: false,
    roomType: starLabel,
    sub: [starLabel, hotel.address, hotel.board].filter(Boolean).join(" · "),
    detailRest: [`${base.nights} night${base.nights === 1 ? "" : "s"}`, hotel.board].filter(Boolean).join(" · "),
    chips: [hotel.refundable ? "Refundable" : "Non-refundable"],
    meta: "Added from hotel recommendations",
    hotelKey: hotel.hotelKey,
    image: hotel.image,
    address: hotel.address,
    lat: hotel.lat,
    lng: hotel.lng,
  };

  const { days, day } = findOrCreateDay(itinerary.days, base.checkIn, base.city);
  const dayIdx = days.indexOf(day);
  const updatedDay = { ...day, items: day.items.concat([item]) };
  const nextDays = days.slice();
  nextDays[dayIdx] = updatedDay;

  return {
    ...itinerary,
    days: nextDays,
    totals: { ...itinerary.totals, grand: itinerary.totals.grand + hotel.totalPrice, held: itinerary.totals.held + hotel.totalPrice },
  };
}

// cartFromItinerary (2026-09-04) — the reverse of addCartItemToItinerary:
// flattens a sent itinerary's flight/hotel items + visa back into the
// {type, baseNet, international, ...} cart shape QuoteBuilder.tsx (and the
// real pricing engine behind it, price() -> quote-price) expects. Needed
// because Proposal Composer's Quote Builder has to price the itinerary
// AS IT WAS SENT — QuoteBuilder was built against a live `cart` array
// from the old Search->Cart flow, and Console's itinerary items are a
// different (richer, day-bucketed) shape now that Search writes straight
// into the itinerary instead. `label` isn't read by QuoteBuilder itself
// (its line labels come back from the pricing response), but costs
// nothing to pass through in case the backend echoes it.
//
// A visa is always `international: true` here — visas aren't tracked
// with the flag the way flights/hotels are (there's no "domestic visa"),
// so this is a real fact about the product, not a guess. AI-mock items
// (mockItinerary.ts) predate the `international` field entirely and
// default to false — an honest reflection of "this mock data was never
// wired to real pricing," not a new gap this function introduces.
export function cartFromItinerary(data: any): any[] {
  if (!data) return [];
  const items = (data.days || []).flatMap((day: any) =>
    (day.items || []).map((it: any) => ({
      type: it.type,
      product: it.type,
      baseNet: it.price || 0,
      international: !!it.international,
      label: it.title,
    }))
  );
  if (data.visa) {
    items.push({ type: "visa", product: "visa", baseNet: data.visa.price || 0, international: true, label: data.visa.title });
  }
  return items;
}


// swapHotelAlternative (2026-10-12, alternatives-with-swap) — makes one of a
// hotel item's `alternatives` the chosen hotel and moves the previous choice
// into that alternative's slot. Pure: returns a new itinerary. The item keeps
// `originalHotelKey` (the first, "Our choice" pick) so the UI can label a
// swapped pick "Selected". Dropped on swap: `note`, the over-budget warning
// computed for the ORIGINAL hotel's price (the frontend has no budget to
// recompute it from).
//
// Tag lines (alternatives[].detail) are AI comparisons written against the
// ORIGINAL pick, so they'd be wrong once something else is chosen: while a
// swapped hotel is chosen they're cleared (the preview falls back to the plain
// facts line, same as when the AI call failed), and they're restored from
// `detailsVsOriginal` — saved on the first swap — if the user swaps back.
export function swapHotelAlternative(data: any, itemId: string, hotelKey: string): any {
  if (!data || !Array.isArray(data.days)) return data;
  return {
    ...data,
    days: data.days.map((day: any) => ({
      ...day,
      items: (day.items || []).map((it: any) => {
        if (it.id !== itemId || it.type !== "hotel") return it;
        const alts: any[] = it.alternatives || [];
        const idx = alts.findIndex((a) => a.hotelKey === hotelKey);
        if (idx < 0) return it;
        const alt = alts[idx];
        const prevStars = it.stars ?? (parseInt(String(it.roomType || ""), 10) || null);
        const demoted = {
          hotelKey: it.hotelKey,
          name: it.title,
          image: it.image ?? null,
          price: it.price,
          stars: prevStars,
          address: it.address ?? null,
          board: it.board ?? null,
          lat: it.lat ?? null,
          lng: it.lng ?? null,
          detail: null,
        };
        const roomType = alt.stars ? `${alt.stars}-star` : null;
        const { note: _staleNote, detailLine: _oldLine, ...rest } = it;
        void _staleNote;
        void _oldLine;
        const originalHotelKey = it.originalHotelKey || it.hotelKey;
        // Tag lines as generated against the original choice (saved once, on the first swap).
        const detailsVsOriginal: Record<string, string | null> =
          it.detailsVsOriginal || Object.fromEntries(alts.map((a) => [a.hotelKey, a.detail ?? null]));
        const backToOriginal = alt.hotelKey === originalHotelKey;
        return {
          ...rest,
          originalHotelKey,
          detailsVsOriginal,
          hotelKey: alt.hotelKey,
          title: alt.name,
          price: alt.price,
          image: alt.image ?? null,
          address: alt.address ?? null,
          lat: alt.lat ?? null,
          lng: alt.lng ?? null,
          stars: alt.stars ?? null,
          board: alt.board ?? null,
          roomType,
          sub: [roomType, alt.address, alt.board].filter(Boolean).join(" · "),
          alternatives: alts
            .map((a, i) => (i === idx ? demoted : a))
            .map((a) => ({ ...a, detail: backToOriginal ? detailsVsOriginal[a.hotelKey] ?? null : null })),
        };
      }),
    })),
  };
}

// swapFlightAlternative (2026-10-22) — the flight counterpart of swapHotelAlternative: makes alternative
// `altIndex` the chosen flight for this leg and moves the previous choice into that slot. Pure. Flight
// alternatives carry no key, so they are addressed by position. The comparison line on every alternative is
// rewritten against the NEW choice's fare, so it never describes the wrong baseline.
const stopsLabel = (n: number) => (n === 0 ? "Non-stop" : `${n} stop${n > 1 ? "s" : ""}`);
export function swapFlightAlternative(data: any, itemId: string, altIndex: number): any {
  if (!data || !Array.isArray(data.days)) return data;
  return {
    ...data,
    days: data.days.map((day: any) => ({
      ...day,
      items: (day.items || []).map((it: any) => {
        if (it.id !== itemId || it.type !== "flight") return it;
        const alts: any[] = it.alternatives || [];
        const alt = alts[altIndex];
        if (!alt) return it;
        const route = String(it.title || "").split("·").pop() || "";
        const [origin, dest] = route.split("→").map((x) => x.trim());
        const demoted = {
          carrier: it.carrier, flightNo: it.flightNo, origin: origin || alt.origin, dest: dest || alt.dest,
          depTime: it.time ?? null, arrTime: it.arrTime ?? null, arrDayOffset: it.arrDayOffset ?? 0,
          stops: it.stops ?? 0, price: it.price, baggageKg: it.baggageKg ?? null, refundable: it.refundable ?? null,
        };
        const rest = alts.map((a, i) => (i === altIndex ? demoted : a)).map((a) => {
          const gap = a.price - alt.price;
          const versus = Math.round(gap) === 0 ? "same fare as the selected" : `₹${Math.abs(Math.round(gap)).toLocaleString("en-IN")} ${gap > 0 ? "more" : "less"} than the selected fare`;
          return { ...a, detail: `${stopsLabel(a.stops ?? 0)} · ${versus}` };
        });
        return {
          ...it,
          originalFlightNo: it.originalFlightNo || it.flightNo,
          title: `${alt.carrier} ${alt.flightNo} · ${alt.origin} → ${alt.dest}`,
          time: alt.depTime,
          arrTime: alt.arrTime,
          arrDayOffset: alt.arrDayOffset ?? 0,
          carrier: alt.carrier,
          flightNo: alt.flightNo,
          stops: alt.stops,
          price: alt.price,
          baggageKg: alt.baggageKg ?? null,
          refundable: alt.refundable ?? null,
          sub: `${alt.origin} ${alt.depTime || ""} → ${alt.dest} ${alt.arrTime || ""} · ${stopsLabel(alt.stops ?? 0)}`,
          alternatives: rest,
        };
      }),
    })),
  };
}

// mergeRefreshedItinerary (2026-10-21) — folds a /generate-itinerary/refresh result into the
// itinerary the advisor has been editing while the refresh ran, instead of replacing it.
//   baseline  - the itinerary as it was when the refresh started (the draft)
//   current   - the itinerary now (null if it was removed)
//   refreshed - what the refresh returned
// An item (matched by day id + item id) counts as touched when it differs from baseline in
// `current`: edited, added or removed by the advisor. Touched items keep the advisor's version
// (a removed one stays removed); untouched items take the refreshed version. Days and top-level
// fields follow the same rule; alerts always come from the refresh; totals take the advisor's
// change since baseline as a delta on the refreshed totals. With no edits at all this returns
// `refreshed` unchanged, which is the old behaviour.
export function mergeRefreshedItinerary(baseline: any, current: any, refreshed: any): any {
  if (!current) return current;
  if (!baseline || current === baseline) return refreshed;
  const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
  const byId = (list: any[]) => new Map((list || []).map((x: any) => [x.id, x] as [string, any]));
  const bDays = byId(baseline.days);
  const cDays = byId(current.days);

  const days: any[] = [];
  for (const rDay of refreshed.days || []) {
    const bDay = bDays.get(rDay.id);
    const cDay = cDays.get(rDay.id);
    if (bDay && !cDay) continue; // the advisor removed this day
    if (!cDay) {
      days.push(rDay);
      continue;
    }
    const bItems = byId(bDay?.items);
    const cItems = byId(cDay.items);
    const rIds = new Set((rDay.items || []).map((i: any) => i.id));
    const items: any[] = [];
    for (const rItem of rDay.items || []) {
      const b = bItems.get(rItem.id);
      const c = cItems.get(rItem.id);
      if (same(b, c)) items.push(rItem); // untouched: the refreshed version
      else if (c) items.push(c); // edited or added by the advisor
      // else the advisor removed it: stays removed
    }
    for (const c of cDay.items || []) {
      if (!rIds.has(c.id) && !bItems.has(c.id)) items.push(c); // added by the advisor, unknown to the refresh
    }
    const day: any = { ...rDay, items };
    for (const key of Object.keys(cDay)) {
      if (key !== "items" && key !== "subtotal" && bDay && !same(bDay[key], cDay[key])) day[key] = cDay[key];
    }
    days.push(day);
  }
  let addedDay = false;
  for (const cDay of current.days || []) {
    if (!bDays.has(cDay.id) && !(refreshed.days || []).some((d: any) => d.id === cDay.id)) {
      days.push(cDay); // a day the advisor created
      addedDay = true;
    }
  }

  const out: any = { ...refreshed, days: addedDay ? resortDays(days) : days };
  for (const key of Object.keys(current)) {
    if (key === "days" || key === "totals" || key === "alerts") continue;
    if (!same(baseline[key], current[key])) out[key] = current[key];
  }
  if (baseline.totals && current.totals && refreshed.totals) {
    const totals: any = { ...refreshed.totals };
    for (const k of Object.keys(totals)) {
      if (typeof totals[k] === "number") totals[k] += (Number(current.totals[k]) || 0) - (Number(baseline.totals[k]) || 0);
    }
    out.totals = totals;
  }
  return out;
}
