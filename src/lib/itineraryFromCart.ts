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

export function boundFromDateRange(rangeStr: string | undefined, year: number) {
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

function addDaysIso(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
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
