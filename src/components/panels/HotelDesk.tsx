"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelDesk.tsx
 * Ported from web/js/advisor.js: HotelDesk (line ~1257) + its Wave-1
 * property-detail (PDP) expander, HotelPdpDetail (line ~1199, colocated here
 * — only ever used by HotelDesk in the original module too).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { hotelProperty, searchHotels, hotelAutosuggestV2, hotelListingV2, hotelPublicGet, hotelSetWebsite, inr } from "../../services/api";
import { AutosuggestInput } from "../AutosuggestInput";
import { errText, toast, todayISO, fmtDate, hotelCartItem } from "../../lib/advisorHelpers";
import { boundFromDateRange } from "../../lib/itineraryFromCart";
import { Empty, Field, Spinner, SkeletonResults, SkeletonRows, Icon, Dropdown, SleekScroll } from "../ui";
import { buildMockHotelOffers } from "../../lib/mockHotelSearch";

// SORT_OPTIONS/STAR_OPTIONS (2026-09-04) — the filter/sort row rebuilt to
// match FlightDesk's `.taw-filter-strip` (a row of Dropdown pills + one
// toggle chip for Refundable), replacing the older boxed `.taw-shopbar`
// (segmented star buttons + a labeled native <select> for sort) so all
// three Search desks share one filter-bar language instead of Hotels
// looking like an earlier, different design pass.
const HOTEL_SORT_OPTIONS = [
  { key: "best", label: "Best value", icon: "sort" },
  { key: "cheapest", label: "Cheapest", icon: "sort" },
  { key: "toprated", label: "Top-rated", icon: "sort" },
];
const HOTEL_STAR_OPTIONS = [
  { key: "any", label: "All stars" },
  { key: "3", label: "3★+" },
  { key: "4", label: "4★+" },
  { key: "5", label: "5★" },
];

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
  return hotelAutosuggestV2(query).then((r: any) => (r && r.locationSuggestions) || []);
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
      refundable: !!(best && best.refundability === "Refundable"),
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
  const [form, setForm] = useState({
    city: (ask && ask.destinations && ask.destinations[0]) || "Dubai",
    checkIn: boundFromDateRange(ask && ask.dateRange, 2026)?.startIso || todayISO(21),
    checkOut: boundFromDateRange(ask && ask.dateRange, 2026)?.endIso || todayISO(25),
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
  // Hotel shop controls (HTL filters + sort), client-side over hotel-search offers.
  const [view, setView] = useState({ sort: "best", stars: "any", refundable: false, board: "all" });
  function setV(k: string, v: any) {
    setView((f) => ({ ...f, [k]: v }));
  }
  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function runReal() {
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
      : hotelAutosuggestV2(city).then((locRes: any) => {
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

      return hotelListingV2(listingPayload).then((listRes: any) => {
        const ctx = {
          international: countryCode !== "IN",
          nights: nights,
          rooms: roomsCount,
          docKey: listRes.docKey,
          token: listRes.token,
        };
        const offers = (listRes.hotels || []).map((h: any) => mapTripSureHotel(h, ctx));
        return { offers: offers, count: listRes.totalCount != null ? listRes.totalCount : offers.length };
      });
    });
  }

  function run() {
    setErr(null);
    setLoading(true);
    setRes(null);
    setOpenOffer(null);
    setView({ sort: "best", stars: "any", refundable: false, board: "all" });

    if (USE_REAL_HOTELS) {
      runReal()
        .then((r: any) => {
          setRes(r);
          setLoading(false);
          toast((r.count || (r.offers || []).length) + " hotel offers loaded", "success");
        })
        .catch(() => {
          // Same fallback contract as FlightDesk (see mockHotelSearch.ts's
          // own docblock) — the real call above always runs first; only on
          // failure (every time locally, no backend reachable) does the UI
          // fall back to mock data instead of a bare error banner.
          const mock = buildMockHotelOffers({ city: form.city.trim(), checkIn: form.checkIn, checkOut: form.checkOut, rooms: Number(form.rooms) || 1, pax: Number(form.pax) || 2 });
          setRes(mock);
          setLoading(false);
          toast("Live API unreachable — showing demo hotel data — " + mock.count + " hotel offers loaded", "error");
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
        ) : null}
        {res ? (
          <div className="taw-leg-switch">
            <span className="taw-leg-tab is-active">
              {form.city} · {fmtDate(form.checkIn)} – {fmtDate(form.checkOut)}
            </span>
          </div>
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
        <HotelResults offers={offers} view={view} setV={setV} openOffer={openOffer} toggleDetail={toggleDetail} checkIn={form.checkIn} advisorId={props.advisorId} onAdd={props.onAdd} />
      ) : null}
    </div>
  );

  return <div className="taw-fade-in taw-fdesk">{showResults ? resultsView : formView}</div>;
}

// Split out of HotelDesk's render purely so the filter/sort math below reads
// as one block, mirroring the original's inline IIFE at the same spot.
function HotelResults({ offers, view, setV, openOffer, toggleDetail, checkIn, advisorId, onAdd }: any) {
  const offNet = (o: any) => Number(o.base_net != null ? o.base_net : o.baseNet) || 0;
  // Board types present, for the board filter.
  const boards: any[] = [];
  const seenB: any = {};
  offers.forEach((o: any) => {
    const b = (o.detail || {}).board;
    if (b && !seenB[b]) {
      seenB[b] = 1;
      boards.push(b);
    }
  });
  // Filter.
  let shown = offers.filter((o: any) => {
    const d = o.detail || {};
    const s = d.stars || 0;
    if (view.stars === "5" && s < 5) return false;
    if (view.stars === "4" && s < 4) return false;
    if (view.stars === "3" && s < 3) return false;
    if (view.refundable && !d.refundable) return false;
    if (view.board !== "all" && d.board !== view.board) return false;
    return true;
  });
  // Sort. 'best' rewards rating per rupee (stars / normalised price).
  const minNet = Math.min.apply(null, offers.map(offNet).concat([Infinity]));
  shown = shown.slice().sort((a: any, b: any) => {
    const da = a.detail || {},
      db = b.detail || {};
    if (view.sort === "cheapest") return offNet(a) - offNet(b);
    if (view.sort === "toprated") return (db.stars || 0) - (da.stars || 0) || offNet(a) - offNet(b);
    // best: higher stars and lower price win.
    const sa = (da.stars || 3) / (offNet(a) / (minNet || 1));
    const sb = (db.stars || 3) / (offNet(b) / (minNet || 1));
    return sb - sa;
  });
  const boardOptions = [{ key: "all", label: "Any board" }, ...boards.map((b: string) => ({ key: b, label: b }))];
  return (
    <div className="taw-results-panel">
      {offers.length ? (
        <div className="taw-filter-strip">
          <Dropdown value={view.sort} options={HOTEL_SORT_OPTIONS} onChange={(v: any) => setV("sort", v)} ariaLabel="Sort hotels" triggerClassName="taw-filter-dd" hideOptionIcons />
          <Dropdown value={view.stars} options={HOTEL_STAR_OPTIONS} onChange={(v: any) => setV("stars", v)} ariaLabel="Filter by stars" triggerClassName="taw-filter-dd" />
          {boards.length > 1 ? (
            <Dropdown value={view.board} options={boardOptions} onChange={(v: any) => setV("board", v)} ariaLabel="Filter by board" triggerClassName="taw-filter-dd" />
          ) : null}
          <button
            className={cx("taw-chip", "taw-chip--toggle", view.refundable && "is-active")}
            onClick={() => setV("refundable", !view.refundable)}
            aria-pressed={view.refundable ? "true" : "false"}
          >
            <Icon name={view.refundable ? "x" : "shield"} size={12} />
            Refundable
          </button>
        </div>
      ) : null}
      <SleekScroll className="taw-results-scroll">
      <div className="taw-results">
        {shown.length ? (
          shown.map((o: any) => {
            const d = o.detail || {};
            const net = offNet(o);
            const stars = d.stars || 0;
            let starStr = "";
            for (let i = 0; i < stars; i++) starStr += "★";
            const isOpen = openOffer === o.id;
            return (
              <div key={o.id} className="taw-res" style={{ display: "block" }}>
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
                    <div className="taw-res-net ta-num">
                      {inr(net)}
                      <small>net cost</small>
                    </div>
                    <button
                      className="taw-btn taw-btn--accent taw-btn--sm"
                      onClick={() => {
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
                      <Icon name="plus" size={13} />
                      Add
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
                {isOpen ? <HotelPdpDetail offer={o} advisorId={advisorId} checkIn={checkIn} /> : null}
              </div>
            );
          })
        ) : (
          <Empty icon={<Icon name="hotel" size={28} />}>{offers.length ? "No stays match these filters — widen them to see more." : "No hotel offers for this stay."}</Empty>
        )}
      </div>
      </SleekScroll>
    </div>
  );
}
