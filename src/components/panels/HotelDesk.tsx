"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelDesk.tsx
 * Ported from web/js/advisor.js: HotelDesk (line ~1257) + its Wave-1
 * property-detail (PDP) expander, HotelPdpDetail (line ~1199, colocated here
 * — only ever used by HotelDesk in the original module too).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { hotelProperty, searchHotels, hotelAutosuggestV2, hotelListingV2, inr } from "../../services/api";
import { AutosuggestInput } from "../AutosuggestInput";
import { errText, toast, todayISO, fmtDate, hotelCartItem } from "../../lib/advisorHelpers";
import { Empty, Field, Spinner, SkeletonResults, SkeletonRows, Icon } from "../ui";

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
  const [form, setForm] = useState({ city: "Dubai", checkIn: todayISO(21), checkOut: todayISO(25), rooms: 1, pax: 2 });
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
        state: top.state || "",
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
        .catch((e: any) => {
          setErr(errText(e));
          setLoading(false);
          toast("Hotel search failed", "error");
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
  return (
    <div className="taw-fade-in">
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
          <button className="taw-btn taw-btn--primary taw-btn--block" disabled={loading} onClick={run}>
            {loading ? <Spinner /> : <Icon name="search" size={16} />}
            {loading ? "Searching…" : "Search Hotels"}
          </button>
        </div>
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
      {!loading && !res && !err ? <Empty icon={<Icon name="hotel" size={28} />}>Pick a city and dates to pull live hotel rates.</Empty> : null}
    </div>
  );
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
  const starBtn = (val: string, label: string) => (
    <button className={"taw-seg" + (view.stars === val ? " is-on" : "")} onClick={() => setV("stars", val)}>
      {label}
    </button>
  );
  return (
    <div>
      {offers.length ? (
        <div className="taw-shopbar">
          <div className="taw-segrp">
            {starBtn("any", "All")}
            {starBtn("3", "3★+")}
            {starBtn("4", "4★+")}
            {starBtn("5", "5★")}
          </div>
          <button
            className={"taw-toggle" + (view.refundable ? " is-on" : "")}
            onClick={() => setV("refundable", !view.refundable)}
            aria-pressed={view.refundable ? "true" : "false"}
          >
            <Icon name="shield" size={13} />
            Refundable
          </button>
          {boards.length > 1 ? (
            <select className="taw-select taw-select--sm" value={view.board} aria-label="Filter by board" onChange={(e) => setV("board", e.target.value)}>
              <option value="all">Any board</option>
              {boards.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : null}
          <div className="taw-shopbar-sp" />
          <label className="taw-sortlab">Sort</label>
          <select className="taw-select taw-select--sm" value={view.sort} aria-label="Sort hotels" onChange={(e) => setV("sort", e.target.value)}>
            <option value="best">Best value</option>
            <option value="cheapest">Cheapest</option>
            <option value="toprated">Top-rated</option>
          </select>
        </div>
      ) : null}
      {offers.length ? (
        <div className="taw-shopcount">
          Showing {shown.length} of {offers.length} stays
        </div>
      ) : null}
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
                    <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={() => onAdd(hotelCartItem(o))}>
                      <Icon name="plus" size={13} />
                      Add
                    </button>
                  </div>
                </div>
                {isOpen ? <HotelPdpDetail offer={o} advisorId={advisorId} checkIn={checkIn} /> : null}
              </div>
            );
          })
        ) : (
          <Empty icon={<Icon name="hotel" size={28} />}>{offers.length ? "No stays match these filters — widen them to see more." : "No hotel offers for this stay."}</Empty>
        )}
      </div>
    </div>
  );
}
