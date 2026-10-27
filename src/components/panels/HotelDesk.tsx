"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelDesk.tsx
 * Ported from web/js/advisor.js: HotelDesk (line ~1257) + its Wave-1
 * property-detail (PDP) expander, HotelPdpDetail (line ~1199, colocated here
 * — only ever used by HotelDesk in the original module too).
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "../../lib/cx";
import { startSearch, SEARCH_TIMEOUT_MS } from "../../lib/abortableSearch";
import { hotelProperty, searchHotels, hotelAutosuggestV2, hotelListingStart, hotelListingMore, hotelDetailsV2, hotelPriceCheckV2, hotelPublicGet, hotelSetWebsite, inr } from "../../services/api";
import { AutosuggestInput } from "../AutosuggestInput";
import { citySuggest } from "../../lib/citySuggest";
import { rankLocationSuggestions } from "../../lib/locationSuggest";
import { errText, toast, todayISO, fmtDate, hotelCartItem } from "../../lib/advisorHelpers";
import { addDaysIso, boundFromDateRange } from "../../lib/itineraryFromCart";
import { Empty, Field, Spinner, SkeletonResults, SkeletonRows, Icon, Dropdown, SleekScroll } from "../ui";
import { buildMockHotelOffers } from "../../lib/mockHotelSearch";
import { DEFAULT_HOTEL_VIEW, HOTEL_PAGE_SIZE, activeFilterCount, filterHotels, hotelFacets, offerNet, sortHotels, viewKey, type HotelView } from "../../lib/hotelListing";
import { HotelMap } from "./HotelMap";

// SORT_OPTIONS/STAR_OPTIONS (2026-09-04) — the filter/sort row rebuilt to
// match FlightDesk's `.taw-filter-strip` (a row of Dropdown pills + one
// toggle chip for Refundable), replacing the older boxed `.taw-shopbar`
// (segmented star buttons + a labeled native <select> for sort) so all
// three Search desks share one filter-bar language instead of Hotels
// looking like an earlier, different design pass.
const HOTEL_SORT_OPTIONS = [
  { key: "best", label: "Best value", icon: "sort" },
  { key: "cheapest", label: "Price: low to high", icon: "sort" },
  { key: "priceDesc", label: "Price: high to low", icon: "sort" },
  { key: "toprated", label: "Top-rated", icon: "sort" },
];
const HOTEL_STAR_OPTIONS = [
  { key: "any", label: "All stars" },
  { key: "3", label: "3★+" },
  { key: "4", label: "4★+" },
  { key: "5", label: "5★" },
];

// The last searches' results, kept in the browser for five minutes like TripSure's own site does
// (it keeps a search for 5 minutes): asking for the same city, dates and rooms again, or coming
// back to Hotels from Flights, shows the hotels at once instead of searching again. Only a search
// whose whole city has loaded is kept.
const HOTEL_RESULTS_TTL_MS = 5 * 60 * 1000;
const HOTEL_RESULTS_CACHE = new Map<string, { at: number; res: any }>();
function keepHotelResults(key: string, res: any) {
  if (HOTEL_RESULTS_CACHE.size > 20) HOTEL_RESULTS_CACHE.clear();
  HOTEL_RESULTS_CACHE.set(key, { at: Date.now(), res: { ...res, more: null } });
}

// TEMP toggle — flip to false to fall back to the old synthetic searchHotels()
// generator instantly if the real TripSure data looks wrong. Remove once the
// list view (and later the details view) are confirmed good.
const USE_REAL_HOTELS = true;

// HARDCODED FALLBACK, not a real API call — GET /hotels/locations requires
// q with min_length=1 (hotel_router.py:get_locations) and 422s on an empty/
// missing q, so there is no live "popular destinations" call to make for
// the on-focus default list. Shaped like a locationSuggestions[] entry, but
// note the `id` values are NOT real TripSure location ids (there's no
// vendor call behind them) — see the _isFallbackDefault handling in
// onSelect below, which deliberately does NOT feed one of these straight
// into runReal()'s selectedLocation/hotelListingV2 payload the way a real
// autosuggest result does. Selecting one only fills the city text; Search
// still re-resolves it against the real API, same as typing a city by hand
// always has.
const DEFAULT_CITY_SUGGESTIONS = [
  { id: "_default-delhi", name: "Delhi", type: "city", coordinates: { lat: 28.6139, lon: 77.209 }, state: "Delhi", country: "IN", _isFallbackDefault: true },
  { id: "_default-mumbai", name: "Mumbai", type: "city", coordinates: { lat: 19.076, lon: 72.8777 }, state: "Maharashtra", country: "IN", _isFallbackDefault: true },
  { id: "_default-goa", name: "Goa", type: "city", coordinates: { lat: 15.2993, lon: 74.124 }, state: "Goa", country: "IN", _isFallbackDefault: true },
  { id: "_default-dubai", name: "Dubai", type: "city", coordinates: { lat: 25.2048, lon: 55.2708 }, state: "", country: "AE", _isFallbackDefault: true },
  { id: "_default-bangkok", name: "Bangkok", type: "city", coordinates: { lat: 13.7563, lon: 100.5018 }, state: "", country: "TH", _isFallbackDefault: true },
];

// cityLocationSuggestions(query) — AutosuggestInput's fetchSuggestions for
// the City field, over the already-wired hotelAutosuggestV2() (GET
// /hotels/locations -> backend/app/routers/hotel_router.py ->
// hotel_service.autosuggest() -> TripSure's confirmed-live
// /api/hotel/locations/autosuggest). locationSuggestions[] is TripSure's own
// array key inside the unwrapped {response: {...}} envelope hotel_service.py
// already strips down to. Empty query (showDefaultsOnFocus's on-focus/
// on-clear call) never reaches the network — see DEFAULT_CITY_SUGGESTIONS
// above for why.
function cityLocationSuggestions(query: string) {
  if (!query) return Promise.resolve(DEFAULT_CITY_SUGGESTIONS);
  // Instant from the built-in directory for 1 letter; live TripSure results win when they
  // answer within 2.5s, else the directory fills in (see lib/citySuggest.ts, same as flights).
  return citySuggest(query, rankLocationSuggestions);
}

function renderCityLocationSuggestion(loc: any) {
  return (
    <span>
      {loc.name}
      {loc.state ? ", " + loc.state : ""}, {loc.country}
    </span>
  );
}

// resolveHotelState(loc) (2026-09-15, real Maldives search reproduction) —
// ported from itinerary_service.py's _resolve_hotel_location, which fixed
// the SAME bug for the itinerary-generation/recommendation path earlier
// tonight (the Singapore fix) — this manual advisor Search panel builds
// its own listingPayload independently and never got that fix, so a
// country-level destination here (Maldives, Singapore, ...) still sent
// TripSure's real /hotels/listing call `state: ""`, which TripSure rejects
// outright: "Bad Request: locationFieldsValid When mapSearch is false,
// city, state, country name and country code are required" (confirmed
// live, real "Maldives" reproduction). TripSure's own top-level
// locationSuggestions entry for a country carries no `state` field at
// all — but its OWN nested `popular_locations[0]` entries for the SAME
// place DO (e.g. Maldives -> "Male Fish Market" -> state: "Kaafu Atoll",
// same pattern the Singapore fix found: "Marina Bay" -> state:
// "Singapore") — a real TripSure value, never a guess invented here.
// Falls back to that (then city/name) only when `state` is genuinely
// empty; every other, already-working destination keeps its real
// state/province unchanged.
function resolveHotelState(loc: any): string {
  if (loc.state) return loc.state;
  const popular = loc.popular_locations || [];
  const stateFromPopular = popular.map((p: any) => p.state).find((s: any) => s);
  return stateFromPopular || loc.city || loc.name || "";
}

// Picks the cheapest priceSummary entry for a TripSure hotel (by totalPrice)
// for the list view; HotelPdpDetail will get the full array later.
function cheapestPrice(priceSummary: any) {
  if (!priceSummary || !priceSummary.length) return null;
  return priceSummary.reduce((best: any, p: any) => {
    if (best == null) return p;
    return Number(p.totalPrice) < Number(best.totalPrice) ? p : best;
  }, null);
}

// Maps one TripSure /hotels/listing "hotels[]" entry into the offer shape
// HotelResults/hotelCartItem already expect (see the old synthetic shape:
// { id, international, base_net, detail: { hotelName, cityName, stars, ... } }).
function mapTripSureHotel(hotel: any, ctx: any) {
  const info = hotel.hotelInfo || {};
  const priceSummary = hotel.priceSummary || [];
  const best = cheapestPrice(priceSummary);
  // TripSure flags each property (free cancellation, free breakfast, amenities) whether or not the
  // listing carries a price, so the filters work on unpriced hotels too.
  const opts = info.options || {};
  const amenityFlags = info.amenity || {};
  return {
    id: hotel.hotelKey,
    international: ctx.international,
    base_net: best ? Number(best.totalPrice) || 0 : 0,
    detail: {
      hotelName: info.name,
      cityName: info.city,
      image: info.image,
      stars: Number(info.starRating) || 0,
      board: best && best.boardBasis ? best.boardBasis.description || best.boardBasis.type : null,
      nights: ctx.nights,
      rooms: ctx.rooms,
      nightlyFrom: best ? Number(best.pricePerNightPerRoom) || undefined : undefined,
      refundable: best ? best.refundability === "Refundable" : !!(opts.refundable || opts.freeCancellation),
      freeCancellation: !!opts.freeCancellation,
      freeBreakfast: !!opts.freeBreakfast,
      stayType: info.type || info.category || null,
      chain: info.chainName || null,
      amenities: Object.keys(amenityFlags).filter((k) => amenityFlags[k]),
      // address/lat/lng (2026-09-11) — TripSure's own real address and
      // coordinates for this property, carried through so a hotel added
      // from Search can get the same real Google Maps link in the
      // Proposal PDF as one an AI-generated itinerary finds directly (see
      // proposalTemplateData.ts's mapsUrl). TripSure has no public hotel
      // website of its own to link to instead (confirmed against its
      // integration guide — a pure server-to-server API).
      address: info.address || null,
      lat: info.latitude != null ? Number(info.latitude) : null,
      lng: info.longitude != null ? Number(info.longitude) : null,
    },
    // Full TripSure context, namespaced so it doesn't collide with the fields
    // above — HotelPdpDetail will read this once it's wired to real data.
    _tripsure: {
      hotelId: hotel.hotelKey,
      docKey: ctx.docKey,
      token: ctx.token,
      priceSummary: priceSummary,
    },
  };
}

// HotelWebsiteEditor (2026-09-11) — advisor-entered override for
// hotel_snapshots.website: the hotel's OWN real, official site. Manual-only
// by design — TripSure's listing()/details() carry no website field of
// their own, and an automated Google Places lookup was ruled out as
// unreliable for independent/regional properties (wrong chain branch, OTA
// links, stale URLs). Filled in once per hotelKey here, then reused
// everywhere that property's link is built: proposalTemplateData.ts's
// hotelUrl() prefers it over our internal /hotel/{hotelKey} page, and that
// page itself redirects straight to it once set (see PublicHotelView.tsx).
// STATUS_BADGE (2026-09-11 hotel-enrichment fix) — the admin-facing label/
// tone for official_website_status, straight off hotel_snapshots (never
// inferred client-side): "verified" is the only status that makes hotelUrl()/
// officialWebsiteUrl() in proposalTemplateData.ts actually show a real-site
// link anywhere; the others are shown here so an advisor can tell WHY a
// hotel has no website button yet, distinguishing "never looked" (no
// badge at all — this table has no automated enrichment pass today, only
// this manual entry) from a genuinely attempted-and-failed/unavailable
// state a future enrichment integration could set.
const WEBSITE_STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  verified: { label: "Verified", tone: "success" },
  pending: { label: "Pending", tone: "warn" },
  unavailable: { label: "Unavailable", tone: "info" },
  failed: { label: "Failed verification", tone: "danger" },
};

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

// HotelWebsiteEditor doubles as this app's admin-panel hotel-detail view
// (spec section 9): there is no separate role-gated "Admin Panel" hotel
// screen in this architecture (AdminPanel.tsx is org/ops-scoped — agents,
// orders, enquiry assignment — not itemized by hotel), so this is the one
// real per-hotel admin surface, already advisor-facing where a specific
// hotel is actually in view. Shows every hotel_snapshots enrichment field
// the spec asks for (name/city/supplier hotel id/primary image/website/
// status/source/verified-at) and is the manual-entry path itself — an
// admin-entered URL is stored under source="admin" (hotel_service.
// set_website's own default), kept distinct from a future automated
// supplier/enrichment source, never conflated.
function HotelWebsiteEditor({ hotelKey, hotelName }: { hotelKey: string; hotelName?: string }) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    hotelPublicGet(hotelKey)
      .then((r: any) => {
        if (!alive) return;
        setSnapshot(r || null);
        setWebsite((r && r.website) || "");
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hotelKey]);

  function save() {
    const trimmed = website.trim();
    setSaving(true);
    hotelSetWebsite(hotelKey, trimmed || null)
      .then((r: any) => {
        setSnapshot((prev: any) => ({ ...(prev || {}), ...(r || {}) }));
        setSaving(false);
        setEditing(false);
        toast("Website saved for " + (hotelName || "this hotel"), "success");
      })
      .catch((e: any) => {
        setSaving(false);
        toast(errText(e), "error");
      });
  }

  if (loading) return null;

  const saved: string | null = (snapshot && snapshot.website) || null;
  // `official_website_status` reads undefined until supabase/migrations/
  // 20260911190000_hotel_enrichment.sql is applied — a set website with no
  // status yet is still shown as "Verified" (matches proposalTemplateData.
  // ts's own pre-migration fallback: a stored website was always treated
  // as trustworthy before this status column existed).
  const status: string | null = snapshot ? snapshot.official_website_status ?? (saved ? "verified" : null) : null;
  const source: string | null = (snapshot && snapshot.official_website_source) || (saved ? "admin" : null);
  const verifiedAt: string | null = (snapshot && snapshot.official_website_verified_at) || null;
  const badge = status ? WEBSITE_STATUS_BADGE[status] : null;

  return (
    <div className="taw-dx-rule" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
        {snapshot && snapshot.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- advisor-only admin view, not the customer-facing app
          <img src={snapshot.image} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 6, background: "var(--surface-2, #eee)", flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{(snapshot && snapshot.name) || hotelName || "—"}</div>
          <div className="taw-muted" style={{ fontSize: 12 }}>{(snapshot && snapshot.city) || "—"}</div>
          <div className="taw-muted" style={{ fontSize: 11 }}>Supplier hotel ID: {hotelKey}</div>
        </div>
      </div>

      <div className="k">Official website</div>
      {editing ? (
        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
          <input
            className="taw-input"
            style={{ flex: 1 }}
            placeholder="https://www.thehotel.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            autoFocus
          />
          <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={saving} onClick={save}>
            {saving ? <Spinner /> : "Save"}
          </button>
          <button
            className="taw-btn taw-btn--sm"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setWebsite(saved || "");
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="v" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {saved ? (
            <a href={saved} target="_blank" rel="noopener noreferrer">
              {saved}
            </a>
          ) : (
            <span className="taw-muted">Not set — proposal links fall back to our internal hotel page.</span>
          )}
          {badge ? <span className={`taw-status taw-status--${badge.tone}`}>{badge.label}</span> : null}
          <button className="taw-linkbtn" onClick={() => setEditing(true)}>
            {saved ? "Edit" : "Add website"}
          </button>
        </div>
      )}
      {saved ? (
        <div className="taw-muted" style={{ fontSize: 11, marginTop: 6 }}>
          Source: {source || "—"} · Verified: {fmtDateTime(verifiedAt) || "—"}
        </div>
      ) : null}
    </div>
  );
}

// HotelPdpDetail — Wave-1 hotel PROPERTY-DETAIL (PDP) expander on a selected
// offer. Calls the DEDICATED hotel-property function (NOT data-read): HTL-026
// composition, HTL-030/031/032 normalised + AI-summarised reviews, HTL-033/035
// /036/037/038 rate matrix with occupancy fit, non-refundable ack + date-aware
// cancellation policy. NET-RATE SUPPRESSION: we pass advisor_id so the advisor
// can see room-group net for sourcing; the member.js path passes member_id and
// gets the SELL-ONLY shape (the function strips net for any member/verified
// session). This advisor surface is sourcing-side, so net is expected here.
// RealHotelDetail — real TripSure property view for a listing result. Details are
// fetched on demand (POST /hotels/details with the listing's docKey/token/hotelId);
// each room option is price-checked (POST /hotels/price-check with its bookingCode
// and the LISTING token) before it can be added. Every provider error is shown.
function roomOptions(det: any): any[] {
  const out: any[] = [];
  ((det && det.hotelInfo && det.hotelInfo.roomGroups) || []).forEach((g: any) =>
    (g.options || []).forEach((o: any) => {
      const sr = (o.standardRooms || [])[0] || {};
      const rt = sr.roomType || {};
      out.push({
        code: o.recommendationId,
        title: rt.roomTitle || rt.standardizedRoomTitle || "Room",
        board: rt.roomDescription || "",
        refundable: !!rt.refundable,
        rooms: (o.standardRooms || []).length || 1,
        perNight: sr.rateBreakdown ? sr.rateBreakdown.perRoomPerNightTotal : null,
        total: Number(o.totalRate) || 0,
        maxAdults: rt.maxAdults,
      });
    })
  );
  return out;
}

function RealHotelDetail({ offer, checkIn, onAdd }: any) {
  const ts = offer._tripsure || {};
  const [det, setDet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [checks, setChecks] = useState<any>({}); // bookingCode -> {state, ...}
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hotelDetailsV2({ docKey: ts.docKey, token: ts.token, hotelId: ts.hotelId })
      .then((r: any) => { if (!cancelled) { setDet(r || {}); setLoading(false); } })
      .catch((e: any) => { if (!cancelled) { setErr(errText(e)); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function confirmPrice(opt: any) {
    setChecks((c: any) => ({ ...c, [opt.code]: { state: "loading" } }));
    hotelPriceCheckV2({ hotelId: ts.hotelId, docKey: ts.docKey, token: ts.token, bookingCode: opt.code })
      .then((r: any) => {
        const rate = (r.roomRates || [])[0];
        if (!rate) throw new Error("TripSure returned no rate for this room.");
        const total = Number(rate.rateBreakdown && rate.rateBreakdown.total) || 0;
        setChecks((c: any) => ({
          ...c,
          [opt.code]: {
            state: "ok", total, listed: opt.total,
            refundable: !!(rate.roomType && rate.roomType.refundable),
            refundability: rate.refundability || null,
            roomTypeCode: rate.roomType && rate.roomType.roomTypeCode,
            roomTypeId: rate.roomType && rate.roomType.roomTypeId,
          },
        }));
      })
      .catch((e: any) => setChecks((c: any) => ({ ...c, [opt.code]: { state: "err", msg: errText(e) } })));
  }

  function addRoom(opt: any, chk: any) {
    const d = offer.detail || {};
    const nights = d.nights || 1, rooms = d.rooms || 1;
    const verified = {
      ...offer,
      base_net: chk.total,
      detail: { ...d, roomType: opt.title, board: opt.board || d.board, refundable: chk.refundable,
                nightlyFrom: chk.total / Math.max(1, nights * rooms) },
    };
    onAdd({
      ...hotelCartItem(verified, []),
      checkIn,
      // kept for the later Create Itinerary / Book Room step
      tripsure: { hotelId: ts.hotelId, docKey: ts.docKey, token: ts.token, bookingCode: opt.code,
                  roomTypeCode: chk.roomTypeCode, roomTypeId: chk.roomTypeId, bookingAmount: chk.total },
    });
    toast(d.hotelName + " — " + opt.title + " added at " + inr(chk.total), "success");
  }

  if (loading) return <div className="taw-dx"><div className="taw-dx-body"><SkeletonRows count={4} height={14} /></div></div>;
  if (err)
    return (
      <div className="taw-dx">
        <div className="taw-banner taw-banner--err"><Icon name="alert" size={14} />{err}</div>
        <button className="taw-btn taw-btn--sm" style={{ marginTop: 8 }} onClick={() => { setErr(null); setLoading(true); setTick((t) => t + 1); }}>Retry</button>
      </div>
    );

  const info = (det && det.hotelInfo) || {};
  const opts = roomOptions(det);
  const shownOpts = showAll ? opts : opts.slice(0, 8);
  const amenities: string[] = [];
  (info.hotelAmenities || []).forEach((a: any) => (a.amenity || []).forEach((x: string) => amenities.length < 14 && amenities.push(x)));
  const rev = (info.reviews || [])[0];
  return (
    <div className="taw-dx">
      <div className="taw-dx-body">
        {info.address ? <div style={{ fontSize: 12.5 }}><b>{info.hotelName}</b> · {info.address}</div> : null}
        <div className="taw-res-sub" style={{ margin: "4px 0 8px" }}>
          {info.checkIn ? <span>Check-in {info.checkIn}</span> : null}
          {info.checkOut ? <span>Check-out {info.checkOut}</span> : null}
          {rev ? <span>Guest rating {rev.rating} ({rev.count} reviews)</span> : null}
        </div>
        {info.description ? (
          <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px", color: "var(--taupe)" }}>
            {String(info.description).slice(0, 420)}{String(info.description).length > 420 ? "…" : ""}
          </p>
        ) : null}
        {amenities.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {amenities.map((a) => <span key={a} className="taw-chip taw-chip--dom">{a}</span>)}
          </div>
        ) : null}
        <div style={{ fontSize: 12, fontWeight: 600, margin: "6px 0" }}>Rooms &amp; rates ({opts.length})</div>
        {opts.length === 0 ? <div className="taw-banner taw-banner--info">No rooms available for these dates.</div> : null}
        {shownOpts.map((opt) => {
          const chk = checks[opt.code] || {};
          const changed = chk.state === "ok" && Math.round(chk.total) !== Math.round(chk.listed);
          return (
            <div key={opt.code} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.title}{opt.rooms > 1 ? " × " + opt.rooms : ""}</div>
                  <div className="taw-res-sub">
                    {opt.board ? <span>{opt.board}</span> : null}
                    {opt.refundable ? <span className="taw-chip taw-chip--ref">Refundable</span> : <span className="taw-chip taw-chip--noref">Non-ref</span>}
                    {opt.perNight ? <span className="ta-num">{inr(opt.perNight)}/night/room</span> : null}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="ta-num" style={{ fontWeight: 600 }}>{inr(chk.state === "ok" ? chk.total : opt.total)}</div>
                  {chk.state === "ok" ? (
                    <button className="taw-btn taw-btn--accent taw-btn--sm" style={{ marginTop: 4 }} onClick={() => addRoom(opt, chk)}>
                      <Icon name="plus" size={13} /> Add this room
                    </button>
                  ) : (
                    <button className="taw-btn taw-btn--sm" style={{ marginTop: 4 }} disabled={chk.state === "loading"} onClick={() => confirmPrice(opt)}>
                      {chk.state === "loading" ? <Spinner /> : "Confirm price"}
                    </button>
                  )}
                </div>
              </div>
              {chk.state === "ok" ? (
                <div style={{ fontSize: 11.5, marginTop: 5, color: changed ? "#B03434" : "var(--taupe)" }}>
                  {changed ? "Price changed: was " + inr(chk.listed) + ", now " + inr(chk.total) + ". " : "Price confirmed. "}
                  {chk.refundability ? String(chk.refundability) : chk.refundable ? "Refundable" : "Non-refundable"}
                </div>
              ) : null}
              {chk.state === "err" ? (
                <div className="taw-banner taw-banner--err" style={{ marginTop: 6 }}><Icon name="alert" size={13} />{chk.msg}</div>
              ) : null}
            </div>
          );
        })}
        {opts.length > 8 && !showAll ? (
          <button className="taw-linkbtn" onClick={() => setShowAll(true)}>Show all {opts.length} room options</button>
        ) : null}
      </div>
    </div>
  );
}

function HotelPdpDetail(props: any) {
  const offer = props.offer || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  useEffect(() => {
    const body: any = { offer_id: offer.id };
    if (props.advisorId) body.advisor_id = props.advisorId;
    if (props.checkIn) body.checkIn = props.checkIn;
    setLoading(true);
    hotelProperty(body)
      .then((r: any) => {
        setData(r || {});
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="taw-dx">
        <div className="taw-dx-body">
          <SkeletonRows count={4} height={14} />
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="taw-dx">
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={14} />
          {err}
        </div>
      </div>
    );
  }
  if (!data) return null;
  const prop = data.property || {};
  const reviews = data.reviews || {};
  const groups = data.roomGroups || [];
  const policy = data.policySummary || data.policy || null;
  const ai = reviews.aiSummary || null;
  return (
    <div className="taw-dx">
      {/* Reviews + AI summary (HTL-030/031/032 — normalised /scale, labelled AI). */}
      {reviews.score != null ? (
        <div style={{ marginBottom: 11 }}>
          <div className="taw-res-sub" style={{ marginBottom: 7 }}>
            <span>
              <b>{reviews.score + " / " + (reviews.scale || 10)}</b>
            </span>
            {reviews.count ? <span>{reviews.count + " reviews"}</span> : null}
            {reviews.sourceScale && reviews.sourceScale !== reviews.scale ? (
              <span className="taw-muted">normalised from /{reviews.sourceScale}</span>
            ) : null}
            {reviews.provenance ? (
              <span className="taw-muted">
                {(reviews.provenance.source || "") + (reviews.provenance.verified === false ? " · unverified" : "")}
              </span>
            ) : null}
          </div>
          {ai ? (
            <div className="taw-dx-ai">
              <b>AI</b>
              <span>{(ai.text || "") + (ai.label ? " — " + ai.label : "")}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Rate matrix per room group with occupancy fit + cancellation policy. */}
      <div className="taw-dx-prov" style={{ marginBottom: 6 }}>
        Rooms &amp; rates{data.advisorView ? " · advisor view" : ""}
      </div>
      {groups.length ? (
        groups.map((g: any, i: number) => {
          const rates = g.rates || [];
          return (
            <div key={i} className="taw-dx-fam" style={{ marginBottom: 8 }}>
              <h5>{g.roomType || "Room " + (i + 1)}</h5>
              {g.occupancy ? (
                <div className="taw-dx-prov">Occupancy: {typeof g.occupancy === "object" ? JSON.stringify(g.occupancy) : g.occupancy}</div>
              ) : null}
              {rates.map((rt: any, j: number) => {
                const cp = rt.cancellationPolicy || {};
                const note =
                  (rt.board || "Room only") +
                  " · " +
                  (rt.refundable ? cp.label || "Refundable" : "Non-refundable") +
                  (rt.requiresAck ? " · ack required" : "") +
                  (rt.refundable && rt.freeCancelUntil ? " · free until " + fmtDate(rt.freeCancelUntil) : "");
                return (
                  <div key={j} className="taw-dx-anc">
                    <span className="lab">{note}</span>
                    <span className="px ta-num">{inr(rt.staySell != null ? rt.staySell : rt.sell != null ? rt.sell : 0)}</span>
                  </div>
                );
              })}
            </div>
          );
        })
      ) : (
        <Empty icon={<Icon name="hotel" size={22} />}>No rate detail.</Empty>
      )}
      {policy ? (
        <div className="taw-dx-rule" style={{ marginTop: 8 }}>
          <div className="k">Cancellation policy{policy.label ? " · " + policy.label : ""}</div>
          <div className="v">
            {(policy.refundable ? "Refundable. " : "Non-refundable. ") +
              (Array.isArray(policy.penaltyTiers)
                ? policy.penaltyTiers.map((t: any) => t.penaltyPct + "% if ≤" + t.minDaysToCheckIn + "d").join(" · ")
                : "")}
          </div>
        </div>
      ) : null}
      {prop.langFallback ? (
        <div className="taw-dx-prov">
          Content language fell back to {prop.contentLang || "default"} (requested {prop.requestedLang || "—"})
        </div>
      ) : null}
      {reviews.provenance && reviews.provenance.lastRefreshed ? (
        <div className="taw-dx-prov">Content refreshed {fmtDate(reviews.provenance.lastRefreshed)}</div>
      ) : null}
    </div>
  );
}

export function HotelDesk(props: any) {
  const member = props.member;
  const ask = props.enquiry && props.enquiry.ask;
  // city defaults to the enquiry's actual destination (2026-09-04,
  // flow-testing hurdle — was always hardcoded "Dubai" regardless of what
  // the selected enquiry asked for, so e.g. Priya's Goa itinerary needed
  // retyping the city by hand before Search did anything useful). Falls
  // back to "Dubai" only when there's no enquiry selected yet.
  // checkIn/checkOut (2026-09-14 fix, real Switzerland-enquiry
  // reproduction: searched Dec 5-15, got back a hotel dated "Mon, 05
  // Oct" — flagged by ItineraryView's own "Outside itinerary dates"
  // warning once added) — these had NO equivalent fix to the `city` one
  // above: always defaulted to today+21/today+25 regardless of which
  // enquiry was selected, so Search silently ran against whatever
  // today+21 happened to be (here, genuinely Oct 5) unless the advisor
  // remembered to retype both dates by hand first — the exact same class
  // of bug `city` already had, just never carried over to these two
  // fields. FlightDesk.tsx's own form already does this correctly
  // (boundFromDateRange(ask.dateRange, 2026)?.startIso || todayISO(21));
  // mirrored here rather than inventing a second approach. Handles both
  // real enquiries (ask.dateRange = the backend's raw travel_window,
  // e.g. "2026-12-05 to 2026-12-15") and mock ones ("12 – 16 Oct")
  // gracefully falling back to the old today+21/25 default only when no
  // enquiry is selected yet or its dates can't be parsed.
  // pax defaults to 1, not 2 (2026-09-03) — TripAgent's scope is solo
  // trips only (the cardholder is always the traveller).
  const trip = props.tripDates && props.tripDates.startIso ? props.tripDates : boundFromDateRange(ask && ask.dateRange);
  const startDefault = (trip && trip.startIso) || todayISO(21);
  const endDefault = (trip && trip.endIso) || (trip && trip.startIso ? addDaysIso(trip.startIso, 4) : todayISO(25));
  const [form, setForm] = useState({
    city: (ask && ask.destinations && ask.destinations[0]) || "Dubai",
    // Trip dates (2026-10-21): the itinerary's own dates (props.tripDates, see tripDatesFor) first, then
    // the enquiry's date text, else today+21 / +25. A known start with no end gets a 4-night stay.
    checkIn: startDefault,
    checkOut: endDefault,
    rooms: 1,
    pax: 1,
  });
  // The full location object the advisor picked from the City typeahead
  // (id/name/type/coordinates/state/country) — set on AutosuggestInput's
  // onSelect, cleared whenever they type again. When present, runReal()
  // uses it directly instead of re-calling hotelAutosuggestV2() and
  // guessing the first match, same identifier chain the guide intends.
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [openOffer, setOpenOffer] = useState<any>(null);
  function toggleDetail(id: any) {
    setOpenOffer((cur: any) => (cur === id ? null : id));
  }
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  // The search in flight (deadline + cancel, see lib/abortableSearch.ts).
  // Replaced on every run(); anything finishing for a handle that is no longer
  // current (cancelled, superseded, unmounted) is ignored.
  const searchRef = useRef<any>(null);
  // The rest of the city keeps loading behind the first hotels (TripSure's async listing).
  // `moreRef` is the loop that is running; `moreInfo` is what the header says about it.
  const moreRef = useRef<{ stop: () => void } | null>(null);
  const [moreInfo, setMoreInfo] = useState<{ loaded: number; expected?: number; failed?: boolean } | null>(null);
  const searchKeyRef = useRef("");
  function stopMore() {
    if (moreRef.current) moreRef.current.stop();
    moreRef.current = null;
    setMoreInfo(null);
  }
  useEffect(() => () => {
    if (searchRef.current) searchRef.current.cancel();
    if (moreRef.current) moreRef.current.stop();
  }, []);
  // Hotel shop controls (HTL filters + sort), client-side over hotel-search offers.
  const [view, setView] = useState<HotelView>(DEFAULT_HOTEL_VIEW);
  function setV(k: string, v: any) {
    setView((f) => ({ ...f, [k]: v }));
  }
  // Every filter off; the sort order stays as chosen.
  function clearFilters() {
    setView((f) => ({ ...DEFAULT_HOTEL_VIEW, sort: f.sort }));
  }
  // Fields the advisor has typed into — the trip dates below only fill the others (see FlightDesk).
  const touched = useRef<Record<string, boolean>>({});
  function set(k: string, v: any) {
    touched.current[k] = true;
    setForm((f) => ({ ...f, [k]: v }));
  }
  const tripStart = props.tripDates && props.tripDates.startIso;
  const tripEnd = props.tripDates && props.tripDates.endIso;
  useEffect(() => {
    if (!tripStart) return;
    setForm((f) => ({
      ...f,
      checkIn: touched.current.checkIn ? f.checkIn : tripStart,
      checkOut: touched.current.checkOut ? f.checkOut : tripEnd || addDaysIso(tripStart, 4),
    }));
  }, [tripStart, tripEnd]);

  function runReal(signal?: AbortSignal) {
    const city = form.city.trim();
    const checkIn = form.checkIn;
    const checkOut = form.checkOut;
    const roomsCount = Number(form.rooms) || 1;
    const paxCount = Number(form.pax) || 2;
    const adultsPerRoom = Math.max(1, Math.ceil(paxCount / roomsCount));
    const nights = Math.max(1, Math.round(((new Date(checkOut) as any) - (new Date(checkIn) as any)) / 86400000));

    // Prefer what the advisor actually picked from the typeahead. Falls
    // back to the old "autosuggest + take the first match" behavior only
    // when they typed a city and hit Search without picking a suggestion —
    // unchanged from before this typeahead existed, so nothing regresses
    // for anyone who ignores the dropdown.
    const withLocation = selectedLocation
      ? Promise.resolve(selectedLocation)
      : hotelAutosuggestV2(city, signal).then((locRes: any) => {
          const top = (locRes && locRes.locationSuggestions && locRes.locationSuggestions[0]) || null;
          if (!top) throw new Error("No location match for \"" + city + "\".");
          return top;
        });

    return withLocation.then((top: any) => {
      const countryCode = top.country || "IN";
      const listingPayload = {
        checkIn: checkIn,
        checkOut: checkOut,
        rooms: Array.from({ length: roomsCount }, () => ({
          numberOfAdults: String(adultsPerRoom),
          numberOfChildren: "0",
          childrenAge: "",
        })),
        city: top.city || top.name,
        locationSuggestion: { id: top.id, name: top.name, type: top.type, lat: top.coordinates.lat, lon: top.coordinates.lon },
        state: resolveHotelState(top),
        countryName: top.country || "IN",
        circularSearch: false,
        nationalityCode: "IN",
        countryCode: countryCode,
        partnerCall: true,
        currency: "INR",
        fetchFromCache: false,
      };

      return hotelListingStart(listingPayload, signal).then((listRes: any) => {
        const ctx = {
          international: countryCode !== "IN",
          nights: nights,
          rooms: roomsCount,
          docKey: listRes.docKey,
          token: listRes.token,
        };
        const offers = (listRes.hotels || []).map((h: any) => mapTripSureHotel(h, ctx));
        const more = listRes.more && listRes.more.token ? { token: listRes.more.token, countryCode: countryCode, ctx: ctx } : null;
        return { offers: offers, count: listRes.totalCount != null ? listRes.totalCount : offers.length, more: more };
      });
    });
  }

  // The first hotels are on screen; fetch the rest of the city behind them. Each page of
  // results brings its own docKey/token (details and price check need the pair that came
  // with the hotel), a hotel seen twice keeps the later copy, and the loop ends when
  // TripSure says the search is no longer in progress (or after 15 polls, as its own site does).
  function loadMoreHotels(first: any) {
    stopMore();
    const more = first.more;
    const ctl = new AbortController();
    let stopped = false;
    let timer: any = null;
    const handle = { stop: () => { stopped = true; if (timer) clearTimeout(timer); ctl.abort(); } };
    moreRef.current = handle;
    const byId = new Map<string, any>();
    first.offers.forEach((o: any) => byId.set(o.id, o));
    let key: string | undefined;
    let polls = 0;
    setMoreInfo({ loaded: byId.size });
    const finish = (failed?: boolean) => {
      if (moreRef.current === handle) moreRef.current = null;
      setMoreInfo(failed ? { loaded: byId.size, failed: true } : null);
      if (!failed && searchKeyRef.current) {
        const all = Array.from(byId.values());
        keepHotelResults(searchKeyRef.current, { offers: all, count: all.length });
      }
    };
    const tick = () => {
      if (stopped) return;
      polls += 1;
      hotelListingMore({ token: more.token, nextResultsKey: key, countryCode: more.countryCode }, ctl.signal)
        .then((pg: any) => {
          if (stopped) return;
          const ctx = { ...more.ctx, docKey: pg.docKey || more.ctx.docKey, token: pg.token || more.ctx.token };
          (pg.hotels || []).forEach((h: any) => byId.set(h.hotelKey, mapTripSureHotel(h, ctx)));
          if (pg.nextResultsKey) key = pg.nextResultsKey;
          const all = Array.from(byId.values());
          setRes((prev: any) => (prev ? { ...prev, offers: all, count: all.length } : prev));
          const expected = pg.expectedHotelCount != null ? Number(pg.expectedHotelCount) : undefined;
          if (pg.status !== "InProgress" || polls >= 15) { finish(); return; }
          setMoreInfo({ loaded: all.length, expected: expected });
          timer = setTimeout(tick, 1500);
        })
        .catch((e: any) => {
          if (stopped || (e && e.aborted)) return;
          finish(true);
        });
    };
    tick();
  }

  function cancelSearch() {
    const s = searchRef.current;
    if (!s) return;
    searchRef.current = null; // its late rejection is then ignored
    s.cancel();
    stopMore();
    setLoading(false);
    setErr(null);
  }

  function run() {
    if (searchRef.current) searchRef.current.cancel();
    stopMore();
    setErr(null);
    setLoading(true);
    setRes(null);
    setOpenOffer(null);
    setView(DEFAULT_HOTEL_VIEW);

    if (USE_REAL_HOTELS) {
      searchKeyRef.current = JSON.stringify([form.city.trim().toLowerCase(), selectedLocation && selectedLocation.id, form.checkIn, form.checkOut, form.rooms, form.pax]);
      const kept = HOTEL_RESULTS_CACHE.get(searchKeyRef.current);
      if (kept && Date.now() - kept.at < HOTEL_RESULTS_TTL_MS) {
        setRes(kept.res);
        setLoading(false);
        toast((kept.res.count || (kept.res.offers || []).length) + " hotel offers (from your last search, under 5 minutes old)", "success");
        return;
      }
      const search = startSearch();
      searchRef.current = search;
      runReal(search.signal)
        .then((r: any) => {
          if (searchRef.current !== search) return;
          search.done();
          searchRef.current = null;
          setRes(r);
          setLoading(false);
          toast((r.count || (r.offers || []).length) + " hotel offers loaded", "success");
          if (r.more) loadMoreHotels(r);
          else keepHotelResults(searchKeyRef.current, r);
        })
        .catch((e: any) => {
          if (searchRef.current !== search) return;
          search.done();
          searchRef.current = null;
          // Deadline hit: back to the form (fields untouched) with a Retry-able
          // error. Never demo data, which is only for "backend unreachable".
          if (search.timedOut()) {
            const msg = "Hotel search timed out after " + Math.round(SEARCH_TIMEOUT_MS / 1000) + "s — the hotel supplier is responding slowly. Your search is kept; try again.";
            setErr(msg);
            setLoading(false);
            toast(msg, "error");
            return;
          }
          // A real answer from the backend (e.g. TripSure's own error, relayed with
          // its message and codes) is shown as-is — never replaced by demo data.
          if (e && e.status) {
            setErr(errText(e));
            setLoading(false);
            toast("Hotel search failed: " + errText(e), "error");
            return;
          }
          // No response at all (backend unreachable, e.g. local dev): fall back to
          // demo data, but say why instead of hiding the error.
          const mock = buildMockHotelOffers({ city: form.city.trim(), checkIn: form.checkIn, checkOut: form.checkOut, rooms: Number(form.rooms) || 1, pax: Number(form.pax) || 2 });
          setRes(mock);
          setLoading(false);
          toast("Backend unreachable (" + errText(e) + ") — showing demo hotel data — " + mock.count + " hotel offers loaded", "error");
        });
      return;
    }

    const params: any = { city: form.city.trim(), checkIn: form.checkIn, checkOut: form.checkOut, rooms: Number(form.rooms) || 1, pax: Number(form.pax) || 2 };
    if (member && member.id) params.member_id = member.id;
    if (props.advisorId) params.advisor_id = props.advisorId;
    searchHotels(params)
      .then((r: any) => {
        setRes(r);
        setLoading(false);
        toast((r.count || (r.offers || []).length) + " hotel offers loaded", "success");
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
        toast("Hotel search failed", "error");
      });
  }
  const offers = (res && res.offers) || [];

  // showResults / backToSearch (2026-09-04) — same "results REPLACE the
  // form, not sit below it" treatment as FlightDesk (see its own docblock
  // on `showResults`), brought here and to VisaDesk so all three Search
  // desks behave the same way instead of Hotels/Visas dumping results
  // underneath a form that's still sitting there taking up room.
  const showResults = loading || res != null;
  function backToSearch() {
    stopMore();
    setRes(null);
    setErr(null);
  }
  // onExpandChange (2026-09-04) — without this, the Search card stays
  // sized to its own content (`.taw-card--fit`, see SearchDesksPanel's
  // docblock) while on Hotels, so a real result list just grows the
  // whole card (and the page under it) taller instead of scrolling
  // inside a fixed height the way Flights does — SleekScroll below only
  // produces a scrollbar when its flex ancestor chain actually has a
  // bounded height to fill. Reporting showResults upward the same way
  // FlightDesk does is what lets SearchDesksPanel grow the card to the
  // column's full height while results are showing, giving SleekScroll
  // something real to scroll within.
  useEffect(() => {
    if (props.onExpandChange) props.onExpandChange(showResults);
  }, [showResults]);

  const formView = (
    <>
      {err ? (
        <div className="taw-banner taw-banner--err" style={{ marginBottom: 11 }}>
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      <div className="taw-row taw-row-3" style={{ marginBottom: 11 }}>
        <Field label="City" htmlFor="taw-ho-city">
          <AutosuggestInput
            value={form.city}
            onChange={(v: any) => {
              set("city", v);
              setSelectedLocation(null);
            }}
            onSelect={(loc: any) => {
              set("city", loc.name);
              // A fallback default has no real TripSure location id behind
              // it — leave selectedLocation null so runReal() falls through
              // to its own live hotelAutosuggestV2() resolution at Search
              // time, exactly as if the advisor had typed the city by hand.
              setSelectedLocation(loc._isFallbackDefault ? null : loc);
            }}
            fetchSuggestions={cityLocationSuggestions}
            renderSuggestion={renderCityLocationSuggestion}
            getKey={(loc: any) => loc.id}
            showDefaultsOnFocus
            placeholder="Dubai"
          />
        </Field>
        <Field label="Check-in" htmlFor="taw-ho-in">
          <input className="taw-input" type="date" value={form.checkIn} onChange={(e) => set("checkIn", e.target.value)} />
        </Field>
        <Field label="Check-out" htmlFor="taw-ho-out">
          <input className="taw-input" type="date" value={form.checkOut} onChange={(e) => set("checkOut", e.target.value)} />
        </Field>
      </div>
      <div className="taw-row taw-row-3" style={{ marginBottom: 13 }}>
        <Field label="Rooms" htmlFor="taw-ho-rooms">
          <input className="taw-input" type="number" min={1} value={form.rooms} onChange={(e) => set("rooms", e.target.value)} />
        </Field>
        <Field label="Guests" htmlFor="taw-ho-pax">
          <input className="taw-input" type="number" min={1} value={form.pax} onChange={(e) => set("pax", e.target.value)} />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="taw-btn taw-btn--primary taw-btn--brown taw-btn--block" disabled={loading} onClick={run}>
            {loading ? <Spinner /> : <Icon name="search" size={16} />}
            {loading ? "Searching…" : "Search Hotels"}
          </button>
        </div>
      </div>
    </>
  );

  const resultsView = (
    <div className="taw-results-view">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        {!loading ? (
          <button className="taw-icon-btn" onClick={backToSearch} aria-label="New search" title="New search">
            <Icon name="chevron" size={20} style={{ transform: "rotate(90deg)" }} />
          </button>
        ) : (
          <>
            <button className="taw-btn taw-btn--sm" onClick={cancelSearch}>Cancel</button>
            <span style={{ fontSize: 12, color: "var(--taupe)" }}>Searching hotels in {form.city || "your city"} — the first hotels appear in a few seconds.</span>
          </>
        )}
        {res ? (
          <div className="taw-leg-switch">
            <span className="taw-leg-tab is-active">
              {form.city} · {fmtDate(form.checkIn)} – {fmtDate(form.checkOut)}
            </span>
          </div>
        ) : null}
        {moreInfo ? (
          <span role="status" style={{ fontSize: 12, color: moreInfo.failed ? "var(--danger, #B03434)" : "var(--taupe)" }}>
            {moreInfo.failed
              ? "Couldn't load the rest of the hotels. Showing " + moreInfo.loaded + "."
              : "Loading more hotels… " + moreInfo.loaded + " so far"}
          </span>
        ) : null}
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {loading ? <SkeletonResults /> : null}
      {!loading && res ? (
        <HotelResults offers={offers} view={view} setV={setV} clearFilters={clearFilters} city={form.city} openOffer={openOffer} toggleDetail={toggleDetail} checkIn={form.checkIn} advisorId={props.advisorId} onAdd={props.onAdd} />
      ) : null}
    </div>
  );

  return <div className="taw-fade-in taw-fdesk">{showResults ? resultsView : formView}</div>;
}

// Split out of HotelDesk's render purely so the filter/sort math below reads
// as one block, mirroring the original's inline IIFE at the same spot.
function HotelResults({ offers, view, setV, clearFilters, city, openOffer, toggleDetail, checkIn, advisorId, onAdd }: any) {
  const offNet = offerNet;
  const facets = useMemo(() => hotelFacets(offers, inr), [offers]);
  const shown = useMemo(() => sortHotels(filterHotels(offers, view), view), [offers, view]);
  const filterKey = viewKey(view);
  const nFilters = activeFilterCount(view);

  // List or map (TripSure's own List / Map switch).
  const [layout, setLayout] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);
  // A big city is ~1,000 hotels: draw a page of them and the next page as the advisor scrolls.
  const [visible, setVisible] = useState(HOTEL_PAGE_SIZE);
  useEffect(() => setVisible(HOTEL_PAGE_SIZE), [filterKey]);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const more = layout === "list" && visible < shown.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!more || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + HOTEL_PAGE_SIZE);
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, visible]);

  // "View in list" on a map card: back to the list, that hotel drawn, scrolled to and outlined.
  const [focusId, setFocusId] = useState<string | null>(null);
  function pickFromMap(id: string) {
    setLayout("list");
    setFocusId(id);
  }
  useEffect(() => {
    if (!focusId || layout !== "list") return;
    const at = shown.findIndex((o: any) => String(o.id) === focusId);
    if (at >= visible) {
      setVisible(at + 1);
      return;
    }
    const t = setTimeout(() => {
      const el = document.getElementById("taw-hotel-" + focusId);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    const clear = setTimeout(() => setFocusId(null), 3500);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [focusId, layout, visible, shown]);

  const boardOptions = [{ key: "all", label: "Any board" }, ...facets.boards.map((b: string) => ({ key: b, label: b }))];
  const priceOptions = [{ key: "any", label: "Any price" }, ...facets.priceBands];
  const stayOptions = [{ key: "all", label: "Any type" }, ...facets.stayTypes.map((t: string) => ({ key: t, label: t }))];
  const toggleAmenity = (k: string) => setV("amenities", view.amenities.indexOf(k) >= 0 ? view.amenities.filter((x: string) => x !== k) : view.amenities.concat([k]));
  return (
    <div className="taw-results-panel">
      {offers.length ? (
        <>
        <div className="taw-filter-strip taw-filter-strip--wrap">
          <button className={cx("taw-chip", "taw-chip--toggle", layout === "list" && "is-active")} onClick={() => setLayout("list")} aria-pressed={layout === "list" ? "true" : "false"}>
            <Icon name="list" size={12} />
            List
          </button>
          <button className={cx("taw-chip", "taw-chip--toggle", layout === "map" && "is-active")} onClick={() => setLayout("map")} aria-pressed={layout === "map" ? "true" : "false"}>
            <Icon name="pin" size={12} />
            Map
          </button>
          <Dropdown value={view.sort} options={HOTEL_SORT_OPTIONS} onChange={(v: any) => setV("sort", v)} ariaLabel="Sort hotels" triggerClassName="taw-filter-dd" hideOptionIcons />
          <Dropdown value={view.stars} options={HOTEL_STAR_OPTIONS} onChange={(v: any) => setV("stars", v)} ariaLabel="Filter by stars" triggerClassName="taw-filter-dd" />
          {facets.hasPrices && facets.priceBands.length ? (
            <Dropdown value={view.price} options={priceOptions} onChange={(v: any) => setV("price", v)} ariaLabel="Filter by price" triggerClassName="taw-filter-dd" hideOptionIcons />
          ) : null}
          <button
            className={cx("taw-chip", "taw-chip--toggle", view.refundable && "is-active")}
            onClick={() => setV("refundable", !view.refundable)}
            aria-pressed={view.refundable ? "true" : "false"}
          >
            <Icon name={view.refundable ? "x" : "shield"} size={12} />
            Free cancellation
          </button>
          <button
            className={cx("taw-chip", "taw-chip--toggle", view.breakfast && "is-active")}
            onClick={() => setV("breakfast", !view.breakfast)}
            aria-pressed={view.breakfast ? "true" : "false"}
          >
            Breakfast included
          </button>
          <button className={cx("taw-chip", "taw-chip--toggle", showFilters && "is-active")} onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters ? "true" : "false"}>
            <Icon name="sliders" size={12} />
            Filters{nFilters ? " (" + nFilters + ")" : ""}
          </button>
        </div>
        {showFilters ? (
          <div className="taw-filter-more" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "2px 2px 8px", flex: "none" }}>
            {facets.boards.length > 1 ? <Dropdown value={view.board} options={boardOptions} onChange={(v: any) => setV("board", v)} ariaLabel="Filter by board" triggerClassName="taw-filter-dd" /> : null}
            {facets.stayTypes.length > 1 ? <Dropdown value={view.stayType} options={stayOptions} onChange={(v: any) => setV("stayType", v)} ariaLabel="Filter by property type" triggerClassName="taw-filter-dd" hideOptionIcons /> : null}
            {facets.amenities.slice(0, 12).map((a: any) => (
              <button key={a.key} className={cx("taw-chip", "taw-chip--toggle", view.amenities.indexOf(a.key) >= 0 && "is-active")} onClick={() => toggleAmenity(a.key)} aria-pressed={view.amenities.indexOf(a.key) >= 0 ? "true" : "false"}>
                {a.label}
              </button>
            ))}
            {nFilters ? (
              <button type="button" onClick={clearFilters} style={{ background: "none", border: "none", padding: "0 4px", color: "#8A5A2B", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
        <div style={{ fontSize: 11.5, color: "var(--taupe)", margin: "0 2px 6px", flex: "none" }}>
          {shown.length === offers.length ? offers.length + " hotels" : shown.length + " of " + offers.length + " hotels"}
        </div>
        </>
      ) : null}
      {layout === "map" ? (
        <HotelMap hotels={shown} selectedId={focusId} onPick={pickFromMap} fitKey={filterKey} city={city} />
      ) : (
      <SleekScroll className="taw-results-scroll">
      <div className="taw-results">
        {shown.length ? (
          shown.slice(0, visible).map((o: any) => {
            const d = o.detail || {};
            const net = offNet(o);
            const stars = d.stars || 0;
            let starStr = "";
            for (let i = 0; i < stars; i++) starStr += "★";
            const isOpen = openOffer === o.id;
            const real = !!(o._tripsure && !o._isMock);
            return (
              <div key={o.id} id={"taw-hotel-" + o.id} className="taw-res" style={{ display: "block", ...(focusId === String(o.id) ? { outline: "2px solid #B8945F", outlineOffset: -2 } : null) }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                  <div className="taw-res-main">
                    <div className="taw-res-title">
                      <Icon name="hotel" size={18} /> {d.hotelName || "Hotel"}
                      {stars ? <span className="taw-chip taw-chip--star">{starStr}</span> : null}
                      {o.international ? <span className="taw-chip taw-chip--intl">INTL</span> : <span className="taw-chip taw-chip--dom">DOM</span>}
                      {d.refundable ? <span className="taw-chip taw-chip--ref">Refundable</span> : <span className="taw-chip taw-chip--noref">Non-ref</span>}
                    </div>
                    <div className="taw-res-sub">
                      <span>
                        <b>{d.cityName || ""}</b>
                      </span>
                      {d.roomType ? <span>{d.roomType}</span> : null}
                      {d.board ? <span>{d.board}</span> : null}
                      {d.nights ? <span>{d.nights + " nights × " + (d.rooms || 1) + " room"}</span> : null}
                      {d.nightlyFrom ? <span className="ta-num">from {inr(d.nightlyFrom)}/night</span> : null}
                    </div>
                    <button className="taw-linkbtn" onClick={() => toggleDetail(o.id)} aria-expanded={isOpen ? "true" : "false"}>
                      <Icon name="chevron" size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: ".15s" }} />
                      {isOpen ? "Hide property detail" : "Property detail · reviews · rates · policy"}
                    </button>
                  </div>
                  <div className="taw-res-side">
                    {real && !net ? (
                      <div className="taw-res-net" style={{ fontSize: 12, color: "var(--taupe)" }}>Rates on selection</div>
                    ) : (
                      <div className="taw-res-net ta-num">
                        {inr(net)}
                        <small>net cost</small>
                      </div>
                    )}
                    <button
                      className="taw-btn taw-btn--accent taw-btn--sm"
                      onClick={() => {
                        // Real TripSure hotel: pick a room and confirm its price first (opens the room list).
                        if (real) {
                          if (!isOpen) toggleDetail(o.id);
                          return;
                        }
                        const others = shown.filter((x: any) => x.id !== o.id).slice(0, 2);
                        const alternatives = others.map((alt: any) => {
                          const ad = alt.detail || {};
                          return {
                            name: ad.hotelName || "Hotel",
                            detail: [ad.stars ? ad.stars + "★" : null, ad.board].filter(Boolean).join(" · "),
                            price: offNet(alt),
                            image: ad.image || null,
                          };
                        });
                        onAdd({ ...hotelCartItem(o, alternatives), checkIn });
                      }}
                    >
                      <Icon name={real ? "chevron" : "plus"} size={13} />
                      {real ? "Select room" : "Add"}
                    </button>
                  </div>
                </div>
                {/* !o._isMock (2026-09-15, same fix as hotelCartItem's
                    realHotelKey) — HotelWebsiteEditor WRITES to
                    hotel_snapshots (hotelSetWebsite), keyed by whatever
                    hotelKey it's given; a mock/demo offer's id is never a
                    real TripSure hotelKey, so letting an advisor "set the
                    website" on one here would create a garbage
                    hotel_snapshots row for a hotel that was never
                    actually searched. */}
                {isOpen && !o._isMock ? (
                  <div className="taw-dx">
                    <HotelWebsiteEditor hotelKey={o.id} hotelName={d.hotelName} />
                  </div>
                ) : null}
                {isOpen ? (real ? <RealHotelDetail offer={o} checkIn={checkIn} onAdd={onAdd} /> : <HotelPdpDetail offer={o} advisorId={advisorId} checkIn={checkIn} />) : null}
              </div>
            );
          })
        ) : (
          <Empty icon={<Icon name="hotel" size={28} />}>{offers.length ? "No stays match these filters — widen them to see more." : "No hotel offers for this stay."}</Empty>
        )}
        {more ? (
          <div ref={sentinel} style={{ padding: "10px 0 16px", textAlign: "center" }}>
            <button type="button" className="taw-btn taw-btn--sm" onClick={() => setVisible((v) => v + HOTEL_PAGE_SIZE)}>
              Show more hotels ({shown.length - visible} left)
            </button>
          </div>
        ) : null}
      </div>
      </SleekScroll>
      )}
    </div>
  );
}
