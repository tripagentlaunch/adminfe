"use client";
/* Hotel steps of the New Booking modal: city -> listing -> room options ->
   price-check -> "Confirm & add hotel" (POST /booking-orders/hotel-stay).
   The server re-runs priceCheck itself, so the price stored in booking_hotels
   is Tripsure's, not what this component displays. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Icon, Spinner } from "../ui";
import { AutosuggestInput } from "../AutosuggestInput";
import { rankLocationSuggestions } from "../../lib/locationSuggest";
import { RangeCalendar, fmtPill, localTodayISO } from "./RangeCalendar";
import {
  bookingAddHotelStay, bookingLockHotelItinerary, hotelAutosuggestV2, hotelDetailsV2, hotelListingV2, hotelPriceCheckV2, inr,
} from "../../services/api";
import { errText } from "../../lib/errText";
import { todayISO } from "../../lib/advisorHelpers";

type Customer = { member_id: string | null; name: string; email: string };
type Sub = "search" | "results" | "rooms" | "guest" | "locked";


// Same fallback HotelDesk's resolveHotelState uses: a country-level suggestion
// has no `state`, and Tripsure rejects an empty one.
function resolveState(loc: any): string {
  if (loc.state) return loc.state;
  const fromPopular = (loc.popular_locations || []).map((p: any) => p.state).find((s: any) => s);
  return fromPopular || loc.city || loc.name || "";
}

function cheapest(priceSummary: any[]) {
  return (priceSummary || []).reduce(
    (best: any, p: any) => (best == null || Number(p.totalPrice) < Number(best.totalPrice) ? p : best),
    null
  );
}

const hStars = (h: any) => Number((h.hotelInfo || {}).starRating) || 0;
const hPrice = (h: any) => { const b = cheapest(h.priceSummary); return b ? Number(b.totalPrice) || 0 : 0; };
const hOpt = (h: any, k: string) => !!((h.hotelInfo || {}).options || {})[k];
const hWifi = (h: any) => !!((h.hotelInfo || {}).amenity || {}).freeWiFi;

function HotelImage({ src, alt, hero, thumb }: { src?: string; alt: string; hero?: boolean; thumb?: boolean }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    // Hero and thumbnails keep their reserved size (placeholder) so a failed
    // load can't collapse the layout and shift the scroll; list cards omit it.
    if (hero) return <div className="ow-hero-ph"><Icon name="hotel" size={28} /></div>;
    if (thumb) return <span className="ow-thumb-ph"><Icon name="hotel" size={16} /></span>;
    return null;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={hero ? "ow-hero-img" : "ow-hcard-img"} src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />;
}

function roomOptions(det: any): any[] {
  const out: any[] = [];
  ((det && det.hotelInfo && det.hotelInfo.roomGroups) || []).forEach((g: any) =>
    (g.options || []).forEach((o: any) => {
      const rt = ((o.standardRooms || [])[0] || {}).roomType || {};
      const rb = ((o.standardRooms || [])[0] || {}).rateBreakdown || {};
      const sr0 = (o.standardRooms || [])[0] || {};
      if (!o.recommendationId) return;
      out.push({
        code: String(o.recommendationId),
        title: rt.roomTitle || rt.standardizedRoomTitle || "Room",
        board: rt.roomDescription || "",
        refundable: !!rt.refundable,
        perNight: rb.perRoomPerNightTotal ?? null,
        cancellation: typeof sr0.cancellationPolicy === "string" ? sr0.cancellationPolicy.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "",
        // end of the zero-charge window, when the supplier's own rules carry one
        freeUntil: (((sr0.cancellationRules || [])[0] || {}).rules || []).find((r: any) => r.valueType === "Amount" && Number(r.value) === 0 && r.end)?.end || null,
        inclusions: (sr0.inclusions || []).join(", "),
        total: Number(o.totalRate) || 0,
      });
    })
  );
  return out;
}

// No .catch here: a failed request must reject so AutosuggestInput shows "Couldn't load suggestions"
// instead of "No matches." (which means the provider answered with nothing).
const citySuggestions = (q: string) =>
  q ? hotelAutosuggestV2(q).then((r: any) => rankLocationSuggestions(q, (r && r.locationSuggestions) || [])) : Promise.resolve([]);

export function NewBookingHotel({ customer, orderId, itineraryId, onBack, onAdded, onError }: {
  customer: Customer;
  /** Attach as a new itinerary on this order. */
  orderId?: string | null;
  /** Attach to this itinerary (e.g. the flight just locked). Wins over orderId. */
  itineraryId?: string | null;
  onBack: () => void;
  onAdded: (orderId: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [sub, setSub] = useState<Sub>("search");
  const [form, setForm] = useState({ city: "", checkIn: todayISO(14), checkOut: todayISO(16), rooms: 1, adults: 2 });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  // Dates of the search that minted `session` (docKey/token). The form can be edited
  // after "Change search" without re-searching, so recording a stay must use these.
  const [searched, setSearched] = useState<{ checkIn: string; checkOut: string } | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<null | "dates" | "guests">(null); // inline calendar / guests panel

  const [session, setSession] = useState<{ docKey: string; token: string } | null>(null);
  const [hotels, setHotels] = useState<any[]>([]);

  const [hotel, setHotel] = useState<any | null>(null);
  const [details, setDetails] = useState<any | null>(null);
  const [checks, setChecks] = useState<Record<string, any>>({});
  const [adding, setAdding] = useState(false);

  // Stage A: the recorded row + the handles needed to lock it.
  const [added, setAdded] = useState<{ orderId: string; hotelId: string; handles: any; panRequired: boolean; label: string } | null>(null);
  const [guest, setGuest] = useState({
    title: "Mr", firstName: customer.name.split(" ")[0] || "", lastName: customer.name.split(" ").slice(1).join(" "),
    mobile: "", email: customer.email || "", pan: "",
  });
  const [lockInfo, setLockInfo] = useState<any | null>(null);
  const setG = (k: string, v: string) => setGuest((g) => ({ ...g, [k]: v }));

  const nights = Math.round((Date.parse(form.checkOut) - Date.parse(form.checkIn)) / 86_400_000);

  // ── Detail view (hero gallery, feature rows) ──────────────────────────────
  const [imgIdx, setImgIdx] = useState(0);
  const [allThumbs, setAllThumbs] = useState(false);
  const [allNear, setAllNear] = useState(false);
  const [allAmen, setAllAmen] = useState(false);
  const [shared, setShared] = useState(false);
  const [moreDesc, setMoreDesc] = useState(false);
  const [moreKnow, setMoreKnow] = useState(false);
  const [moreCancel, setMoreCancel] = useState(false);
  const roomsRef = useRef<HTMLDivElement>(null);
  const pickReq = useRef(0); // id of the latest hotel pick; older responses are ignored

  // ── Results: client-side sort / filters over the fetched listing ──────────
  const [hSort, setHSort] = useState<"" | "star" | "priceAsc" | "priceDesc">("");
  const [hFreeCancel, setHFreeCancel] = useState(false);
  const [hBreakfast, setHBreakfast] = useState(false);
  const [hWifiOnly, setHWifiOnly] = useState(false);
  const [hStarsSel, setHStarsSel] = useState<number[]>([]);
  const [hMax, setHMax] = useState<number | null>(null);
  const [hFiltersOpen, setHFiltersOpen] = useState(false);
  useEffect(() => {
    setHSort(""); setHFreeCancel(false); setHBreakfast(false); setHWifiOnly(false); setHStarsSel([]); setHMax(null); setHFiltersOpen(false);
  }, [hotels]);
  const hBounds = useMemo(() => {
    const ps = hotels.map(hPrice).filter((n) => n > 0);
    return ps.length ? { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) } : { min: 0, max: 0 };
  }, [hotels]);
  const hMaxPrice = hMax == null ? hBounds.max : Math.min(hMax, hBounds.max);
  const hExtraOn = hStarsSel.length > 0 || hMaxPrice < hBounds.max;
  const hVisible = useMemo(() => {
    const list = hotels.filter((h) =>
      (!hFreeCancel || hOpt(h, "freeCancellation")) &&
      (!hBreakfast || hOpt(h, "freeBreakfast")) &&
      (!hWifiOnly || hWifi(h)) &&
      (!hStarsSel.length || hStarsSel.some((n) => (n === 3 ? Math.round(hStars(h)) <= 3 : Math.round(hStars(h)) === n))) &&
      (hMaxPrice >= hBounds.max || hPrice(h) <= hMaxPrice));
    if (hSort === "star") list.sort((a, b) => hStars(b) - hStars(a) || hPrice(a) - hPrice(b));
    else if (hSort === "priceAsc") list.sort((a, b) => (hPrice(a) || Infinity) - (hPrice(b) || Infinity));
    else if (hSort === "priceDesc") list.sort((a, b) => hPrice(b) - hPrice(a));
    return list;
  }, [hotels, hFreeCancel, hBreakfast, hWifiOnly, hStarsSel, hMaxPrice, hBounds.max, hSort]);
  const hAnyFilter = hFreeCancel || hBreakfast || hWifiOnly || hExtraOn;
  const hReset = () => { setHFreeCancel(false); setHBreakfast(false); setHWifiOnly(false); setHStarsSel([]); setHMax(null); };

  function runSearch() {
    onError(null);
    if (!form.city.trim()) { onError("Enter a city or destination."); return; }
    if (!form.checkOut) { setPanel("dates"); onError("Pick a check-out date."); return; }
    if (!(nights >= 1)) { onError("Check-out must be after check-in."); return; }
    setBusy(true);
    const withLoc = location
      ? Promise.resolve(location)
      : hotelAutosuggestV2(form.city.trim()).then((r: any) => {
          const top = r && r.locationSuggestions && r.locationSuggestions[0];
          if (!top) throw new Error(`No location match for "${form.city.trim()}".`);
          return top;
        });
    withLoc
      .then((top: any) =>
        hotelListingV2({
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          rooms: Array.from({ length: form.rooms }, () => ({
            numberOfAdults: String(Math.max(1, Math.ceil(form.adults / form.rooms))),
            numberOfChildren: "0",
            childrenAge: "",
          })),
          city: top.city || top.name,
          locationSuggestion: { id: String(top.id), name: top.name, type: top.type, lat: top.coordinates.lat, lon: top.coordinates.lon },
          state: resolveState(top),
          countryName: top.country || "IN",
          circularSearch: false,
          nationalityCode: "IN",
          countryCode: top.country || "IN",
          partnerCall: true,
          currency: "INR",
          fetchFromCache: false,
        })
      )
      .then((r: any) => {
        setSession({ docKey: r.docKey, token: r.token });
        setSearched({ checkIn: form.checkIn, checkOut: form.checkOut });
        setHotels(r.hotels || []);
        setSub("results");
      })
      .catch((e: any) => onError(errText(e)))
      .finally(() => setBusy(false));
  }

  function pickHotel(h: any) {
    if (!session) return;
    onError(null);
    const req = ++pickReq.current;
    const current = () => req === pickReq.current; // false once another pick / leaving the page superseded this one
    setHotel(h);
    setImgIdx(0); setAllThumbs(false); setAllNear(false); setAllAmen(false); setShared(false); setMoreDesc(false); setMoreKnow(false); setMoreCancel(false);
    setDetails(null);
    setChecks({});
    setSub("rooms");
    setBusy(true);
    hotelDetailsV2({ docKey: session.docKey, token: session.token, hotelId: String(h.hotelKey) })
      .then((d: any) => { if (current()) setDetails(d || {}); })
      .catch((e: any) => { if (current()) { onError(errText(e)); setSub("results"); } })
      .finally(() => { if (current()) setBusy(false); });
  }

  // Leaving the detail page invalidates any details call still in flight.
  function leaveDetail() {
    pickReq.current++;
    setBusy(false);
    setSub("results");
  }

  function priceCheck(opt: any) {
    if (!session || !hotel) return;
    setChecks((c) => ({ ...c, [opt.code]: { state: "loading" } }));
    hotelPriceCheckV2({ hotelId: String(hotel.hotelKey), docKey: session.docKey, token: session.token, bookingCode: opt.code })
      .then((r: any) => {
        const rate = (r.roomRates || [])[0];
        if (!rate) throw new Error("Tripsure returned no rate for this room.");
        setChecks((c) => ({
          ...c,
          [opt.code]: {
            state: "ok", total: Number(rate.rateBreakdown && rate.rateBreakdown.total) || 0, listed: opt.total,
            panRequired: !!(r.panCardRequired || (rate.roomType && rate.roomType.isPANMandatory)),
          },
        }));
      })
      .catch((e: any) => setChecks((c) => ({ ...c, [opt.code]: { state: "err", msg: errText(e) } })));
  }

  function confirmAdd(opt: any) {
    if (!session || !hotel || !searched) return;
    const info = hotel.hotelInfo || {};
    const amenities: string[] = [];
    ((details && details.hotelInfo && details.hotelInfo.hotelAmenities) || []).forEach((a: any) =>
      (a.amenity || []).forEach((x: string) => amenities.length < 30 && amenities.push(x))
    );
    setAdding(true);
    onError(null);
    bookingAddHotelStay({
      customer: { member_id: customer.member_id, name: customer.name, email: customer.email || null },
      itinerary_id: itineraryId || null,
      order_id: itineraryId ? null : orderId || null,
      handles: { hotelId: String(hotel.hotelKey), docKey: session.docKey, token: session.token, bookingCode: opt.code },
      snapshot: {
        name: info.name || "Hotel",
        address: info.address || null,
        city: info.city || null,
        rating: info.starRating != null ? Math.min(5, Number(info.starRating) || 0) : null,
        image_url: info.image || null,
        latitude: info.latitude != null ? Number(info.latitude) : null,
        longitude: info.longitude != null ? Number(info.longitude) : null,
        amenities,
        board_basis: opt.board || null,
      },
      check_in: (searched || form).checkIn,
      check_out: (searched || form).checkOut,
      rooms: form.rooms,
      adults: form.adults,
    })
      .then((r: any) => {
        setAdded({
          orderId: r.order_id, hotelId: r.hotel_id, panRequired: !!(checks[opt.code] || {}).panRequired,
          handles: { hotelId: String(hotel.hotelKey), docKey: session.docKey, token: session.token, bookingCode: opt.code },
          label: `${info.name || "Hotel"} — ${opt.title}`,
        });
        setSub("guest");
      })
      .catch((e: any) => onError(errText(e)))
      .finally(() => setAdding(false));
  }

  function lockRoom() {
    if (!added) return;
    onError(null);
    setAdding(true);
    bookingLockHotelItinerary({
      booking_hotel_id: added.hotelId,
      handles: added.handles,
      guest: {
        title: guest.title, firstName: guest.firstName.trim(), lastName: guest.lastName.trim(),
        mobile: guest.mobile.replace(/\D/g, ""), email: guest.email.trim(), pan: guest.pan.trim() || null,
      },
    })
      .then((r: any) => { setLockInfo(r); setSub("locked"); })
      .catch((e: any) => onError(errText(e)))
      .finally(() => setAdding(false));
  }

  if (sub === "search") {
    const stepper = (label: string, k: "rooms" | "adults", min: number, max: number) => (
      <div className="ow-gstep">
        <span>{label}</span>
        <div className="ow-step">
          <button type="button" disabled={form[k] <= min} aria-label={`Fewer ${label}`} onClick={() => set(k, form[k] - 1)}><Icon name="minus" size={13} /></button>
          <b>{form[k]}</b>
          <button type="button" disabled={form[k] >= max} aria-label={`More ${label}`} onClick={() => set(k, form[k] + 1)}><Icon name="plus" size={13} /></button>
        </div>
      </div>
    );
    return (
      <>
        <div className="ow-sbar ow-sbar--hotel">
          <label className="ow-pill ow-pill--field ow-sbar-where">
            <span className="ow-pill-l">Where to?</span>
            <AutosuggestInput
              className="ow-pill-input"
              value={form.city}
              onChange={(v: any) => { set("city", String(v)); setLocation(null); }}
              onSelect={(l: any) => { set("city", l.name); setLocation(l); }}
              fetchSuggestions={citySuggestions}
              floating
              renderSuggestion={(l: any) => (
                <span className="ow-sug">
                  <span className="ow-sug-ic"><Icon name="hotel" size={16} /></span>
                  <span className="ow-sug-t">
                    <b>{l.name}</b>
                    <small>{[l.state, l.country].filter(Boolean).join(", ")}</small>
                  </span>
                </span>
              )}
              getKey={(l: any) => String(l.id)}
              placeholder="City, area or hotel"
            />
            <span className="ow-pill-s">{location ? [location.state, location.country].filter(Boolean).join(", ") : "Destination, area or hotel"}</span>
          </label>

          <div className={`ow-pill ow-pill--btn ow-sbar-date${panel === "dates" ? " open" : ""}`}>
            <span className="ow-pill-l">Check-in</span>
            <button type="button" className="ow-pillbtn" aria-expanded={panel === "dates"}
              onClick={() => setPanel(panel === "dates" ? null : "dates")}>
              <Icon name="calendar" size={14} />
              <span>{fmtPill(form.checkIn)}</span>
            </button>
          </div>

          <div className={`ow-pill ow-pill--btn ow-sbar-date${panel === "dates" ? " open" : ""}`}>
            <span className="ow-pill-l">Check-out{nights >= 1 ? ` · ${nights}N` : ""}</span>
            <button type="button" className="ow-pillbtn" aria-expanded={panel === "dates"}
              onClick={() => setPanel(panel === "dates" ? null : "dates")}>
              <Icon name="calendar" size={14} />
              <span>{fmtPill(form.checkOut)}</span>
            </button>
          </div>

          <div className={`ow-pill ow-pill--btn ow-sbar-guests${panel === "guests" ? " open" : ""}`}>
            <span className="ow-pill-l">Guests &amp; rooms</span>
            <button type="button" className="ow-pillbtn" aria-expanded={panel === "guests"}
              onClick={() => setPanel(panel === "guests" ? null : "guests")}>
              <Icon name="people" size={14} />
              <span>{form.adults} Guest{form.adults === 1 ? "" : "s"} · {form.rooms} Room{form.rooms === 1 ? "" : "s"}</span>
            </button>
          </div>

          <button type="button" className="ow-searchbtn" onClick={runSearch} disabled={busy}>
            <Icon name="search" size={15} />
            {busy ? "Searching…" : "Search"}
          </button>
        </div>

        {panel === "dates" ? (
          <RangeCalendar
            checkIn={form.checkIn} checkOut={form.checkOut} min={localTodayISO()}
            onChange={(i, o) => setForm((f) => ({ ...f, checkIn: i, checkOut: o }))}
            onDone={() => setPanel(null)}
          />
        ) : null}
        {panel === "guests" ? (
          <div className="ow-gpanel">
            {stepper("Rooms", "rooms", 1, 9)}
            {stepper("Adults (total)", "adults", 1, 36)}
            <button type="button" className="taw-btn taw-btn--sm" onClick={() => setPanel(null)}>Done</button>
          </div>
        ) : null}

        <div className="ow-modal-foot">
          <button type="button" className="taw-btn" onClick={onBack}>Back</button>
          <span />
        </div>
      </>
    );
  }

  if (sub === "results") {
    const nightsTxt = `${nights >= 1 ? nights : 1} night${nights === 1 ? "" : "s"}, ${form.rooms} room${form.rooms === 1 ? "" : "s"}`;
    const chip = (on: boolean, label: string, toggle: () => void, icon?: string) => (
      <button type="button" className={`ow-fchip${on ? " on" : ""}`} aria-pressed={on} onClick={toggle}>
        {icon ? <Icon name={icon} size={13} /> : null}{label}
      </button>
    );
    return (
      <>
        <div className="ow-modal-foot" style={{ marginTop: 0 }}>
          <span className="ow-sub">{form.city} · {nightsTxt} · {hVisible.length} of {hotels.length} hotels</span>
          <button type="button" className="taw-btn taw-btn--sm" onClick={() => setSub("search")}>Change search</button>
        </div>

        {hotels.length > 0 ? (
          <div className="ow-fchips">
            {chip(hSort === "star", "Star rating", () => setHSort(hSort === "star" ? "" : "star"), "star")}
            {chip(hSort === "priceAsc" || hSort === "priceDesc", hSort === "priceDesc" ? "Price ↓" : hSort === "priceAsc" ? "Price ↑" : "Price",
              () => setHSort(hSort === "" || hSort === "star" ? "priceAsc" : hSort === "priceAsc" ? "priceDesc" : ""))}
            {chip(hFiltersOpen || hExtraOn, `Filters${hExtraOn ? " •" : ""}`, () => setHFiltersOpen(!hFiltersOpen), "sliders")}
            {chip(hFreeCancel, "Free cancellation", () => setHFreeCancel(!hFreeCancel))}
            {chip(hBreakfast, "Breakfast included", () => setHBreakfast(!hBreakfast))}
            {chip(hWifiOnly, "WiFi", () => setHWifiOnly(!hWifiOnly), "wifi")}
            {hAnyFilter ? <button type="button" className="ow-link" onClick={hReset}>Reset</button> : null}
          </div>
        ) : null}

        {hFiltersOpen ? (
          <div className="ow-gpanel">
            <div className="ow-gstep">
              <span>Star rating</span>
              {[3, 4, 5].map((n) => (
                <label key={n} className="ow-fopt">
                  <input type="checkbox" checked={hStarsSel.includes(n)}
                    onChange={() => setHStarsSel(hStarsSel.includes(n) ? hStarsSel.filter((x) => x !== n) : [...hStarsSel, n])} />
                  <span>{n}★{n === 3 ? " & below" : ""}</span>
                </label>
              ))}
            </div>
            {hBounds.max > hBounds.min ? (
              <div className="ow-gstep" style={{ flex: "1 1 220px" }}>
                <span>Max price <b>{inr(hMaxPrice)}</b></span>
                <input type="range" className="ow-range" aria-label="Maximum price" style={{ flex: 1 }}
                  min={hBounds.min} max={hBounds.max} step={Math.max(1, Math.round((hBounds.max - hBounds.min) / 100))}
                  value={hMaxPrice} onChange={(e) => setHMax(Number(e.target.value))} />
              </div>
            ) : null}
          </div>
        ) : null}

        {hotels.length === 0 ? <Empty icon="hotel" title="No hotels found" message="Try other dates or a nearby city." /> : null}
        {hotels.length > 0 && hVisible.length === 0 ? (
          <div className="ow-empty">
            <b>No hotels match these filters</b>
            <button type="button" className="taw-btn taw-btn--sm" onClick={hReset}>Reset filters</button>
          </div>
        ) : null}

        <div className="ow-hgrid">
          {hVisible.map((h) => {
            const info = h.hotelInfo || {};
            const best = cheapest(h.priceSummary);
            const stars = hStars(h);
            return (
              <div className="ow-hcard" key={h.hotelKey}>
                <HotelImage src={info.image} alt={info.name || "Hotel"} />
                <div className="ow-hcard-body">
                  <div className="ow-hcard-name" title={info.name}>{info.name}</div>
                  <div className="ow-hcard-sub">
                    {stars ? <span className="ow-hcard-stars">{"★".repeat(Math.min(5, Math.round(stars)))}</span> : null}
                    <span>{info.city || form.city}</span>
                  </div>
                  {info.address ? <div className="ow-hcard-addr">{info.address}</div> : null}
                  <div className="ow-fcard-tags" style={{ border: 0, paddingTop: 0 }}>
                    {hOpt(h, "freeCancellation") || (best && best.refundability === "Refundable") ? <span className="ow-tag ok">Free cancellation</span> : null}
                    {hOpt(h, "freeBreakfast") ? <span className="ow-tag ok">Breakfast included</span> : null}
                    {hWifi(h) ? <span className="ow-tag">Free WiFi</span> : null}
                  </div>
                  <div className="ow-hcard-foot">
                    <div className="ow-hcard-price">
                      {best ? (
                        <>
                          <b>{inr(Number(best.totalPrice))}</b><em>onwards</em>
                          <small>{nightsTxt}</small>
                        </>
                      ) : <small>Price on selection</small>}
                    </div>
                    <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => pickHotel(h)}>Select</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (sub === "guest" && added) {
    const pan = guest.pan.trim().toUpperCase();
    const panBad = (added.panRequired && !pan) || (pan !== "" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan));
    const ready = guest.firstName.trim() && guest.lastName.trim() && /^\d{7,15}$/.test(guest.mobile.replace(/\D/g, "")) && guest.email.includes("@") && !panBad;
    return (
      <>
        <div className="taw-banner taw-banner--info">
          {added.label} is recorded on the order. Enter the lead guest to lock the room with Tripsure — nothing is booked or charged yet.
        </div>
        <div className="ow-grid2">
          <Field label="Title" htmlFor="nbg-title">
            <select className="taw-input" value={guest.title} onChange={(e) => setG("title", e.target.value)}>
              {["Mr", "Mrs", "Ms", "Miss", "Dr"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <span />
          <Field label="First name" htmlFor="nbg-fn"><input className="taw-input" value={guest.firstName} onChange={(e) => setG("firstName", e.target.value)} /></Field>
          <Field label="Last name" htmlFor="nbg-ln"><input className="taw-input" value={guest.lastName} onChange={(e) => setG("lastName", e.target.value)} /></Field>
          <Field label="Mobile (India, 10 digits)" htmlFor="nbg-mob"><input className="taw-input" inputMode="numeric" value={guest.mobile} onChange={(e) => setG("mobile", e.target.value)} /></Field>
          <Field label="Email" htmlFor="nbg-em"><input className="taw-input" type="email" value={guest.email} onChange={(e) => setG("email", e.target.value)} /></Field>
        </div>
        <Field label={added.panRequired ? "PAN (required for this rate)" : "PAN (optional)"} htmlFor="nbg-pan">
          <input className="taw-input" maxLength={10} value={guest.pan} placeholder="ABCDE1234F"
            onChange={(e) => setG("pan", e.target.value.toUpperCase())} />
        </Field>
        <div className="ow-sub" style={{ whiteSpace: "normal" }}>PAN is sent to Tripsure only and is never stored.</div>
        <div className="ow-modal-foot">
          <button type="button" className="taw-btn" onClick={() => onAdded(added.orderId)} disabled={adding}>Skip for now</button>
          <button type="button" className="taw-btn taw-btn--primary" onClick={lockRoom} disabled={adding || !ready}>
            {adding ? "Locking room…" : "Lock room"}
          </button>
        </div>
      </>
    );
  }

  if (sub === "locked" && lockInfo) {
    return (
      <>
        <div className="ow-lock">
          <b>Room locked with Tripsure</b>
          <div>Reference {lockInfo.partner_reference_id}</div>
          <div>Locked amount {inr(Number(lockInfo.locked_total))}</div>
          <div className="ow-sub" style={{ whiteSpace: "normal" }}>
            The lock is short-lived. The room is not booked and nothing is paid — booking is a separate step.
          </div>
        </div>
        <div className="ow-modal-foot">
          <span />
          <button type="button" className="taw-btn taw-btn--primary" onClick={() => onAdded(lockInfo.order_id)}>Done</button>
        </div>
      </>
    );
  }

  // rooms — hotel detail page (listing data shows instantly, details fill in) + room choice
  const listInfo = (hotel && hotel.hotelInfo) || {};
  const info = (details && details.hotelInfo) || {};
  const opts = roomOptions(details);
  const best = hotel ? cheapest(hotel.priceSummary) : null;
  const name = info.hotelName || listInfo.name || "";
  const stars = Number(listInfo.starRating) || Number(((info.hotelRatings || []).find((r: any) => r.ratingType === "STAR") || {}).rating) || 0;
  const photos: { thumb: string; large: string; caption?: string }[] = (info.imageInfo || [])
    .map((i: any) => ({ thumb: i.thumbnailImageUrl || i.smallImageUrl || i.largeImageUrl, large: i.largeImageUrl || i.wideAngleImageUrl || i.thumbnailImageUrl, caption: i.caption }))
    .filter((i: any) => i.large);
  if (!photos.length) {
    const urls: string[] = (listInfo.imagesList && listInfo.imagesList.length ? listInfo.imagesList : [info.bestImage || listInfo.image]).filter(Boolean);
    urls.forEach((u) => photos.push({ thumb: u, large: u }));
  }
  const hero = photos[Math.min(imgIdx, Math.max(0, photos.length - 1))];
  const THUMBS = 6;
  const thumbs = allThumbs ? photos : photos.slice(0, THUMBS);
  // Cancellation / breakfast come from the room options the details call returned;
  // the listing's flags are only a fallback while those are still loading.
  const cheapestOpt = opts.slice().sort((a, b) => a.total - b.total)[0];
  const refundOpt = opts.filter((o) => o.refundable).sort((a, b) => a.total - b.total)[0];
  const policyOpt = refundOpt || cheapestOpt;
  const bfCount = opts.filter((o) => /breakfast/i.test(`${o.inclusions} ${o.board}`)).length;
  const freeCancel = opts.length ? !!refundOpt : hOpt(hotel || {}, "freeCancellation") || (best && best.refundability === "Refundable");
  const freeBreakfast = opts.length ? bfCount > 0 : hOpt(hotel || {}, "freeBreakfast");
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const review = (info.reviews || [])[0];
  const desc: string = String(info.description || "").trim();
  const know: string[] = [
    ...(info.policies || []).map((x: any) => String(x.content || "").trim()),
    ...(info.mustReadRules || []),
    ...(info.commonRules || []),
  ].filter(Boolean);
  const amenGroups: { category: string; items: string[] }[] = (info.hotelAmenities || [])
    .map((g: any) => ({ category: g.category, items: g.amenity || [] })).filter((g: any) => g.items.length);
  const near: any[] = info.nearByAttractions || [];
  const amenities: string[] = [];
  (info.hotelAmenities || []).forEach((g: any) => (g.amenity || []).forEach((x: string) => amenities.push(x)));
  if (!amenities.length) (info.facilities || listInfo.facilities || []).forEach((x: string) => amenities.push(x));
  const amenList = Array.from(new Set(amenities));
  const checkIn = info.checkIn, checkOut = info.checkOut;
  const nightsTxt = `${nights >= 1 ? nights : 1} night${nights === 1 ? "" : "s"}, ${form.rooms} room${form.rooms === 1 ? "" : "s"}`;
  const share = () => {
    const txt = [name, [listInfo.address || info.address, listInfo.city || info.city].filter(Boolean).join(", "), `${fmtPill(form.checkIn)} → ${fmtPill(form.checkOut)}`].filter(Boolean).join("\n");
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { setShared(true); setTimeout(() => setShared(false), 1800); }, () => onError("Couldn't copy to the clipboard."));
  };
  const toRooms = () => {
    const el = roomsRef.current;
    if (!el) return;
    const box = el.closest(".ow-modal") as HTMLElement | null; // the modal is the scroll container
    if (!box) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top, behavior: "smooth" });
  };
  const availability = busy ? "Checking availability…" : opts.length ? `${opts.length} room option${opts.length === 1 ? "" : "s"} available` : "No rooms available for these dates";
  return (
    <>
      <div className="ow-modal-foot" style={{ marginTop: 0 }}>
        <button type="button" className="taw-btn taw-btn--sm" onClick={leaveDetail} disabled={adding}>← Other hotels</button>
        <span />
      </div>

      <div className="ow-hd">
        <div className="ow-hd-main">
          <div className="ow-hd-head">
            <div>
              <h3 className="ow-hd-name">{name}</h3>
              <div className="ow-hcard-sub">
                {stars ? <span className="ow-hcard-stars">{"★".repeat(Math.min(5, Math.round(stars)))}</span> : null}
                <span>{[listInfo.address || info.address, listInfo.city || info.city].filter(Boolean).join(", ")}</span>
                {review && review.rating ? <span className="ow-tag">{review.rating}/5{review.count ? ` · ${review.count} review${review.count === "1" ? "" : "s"}` : ""}</span> : null}
              </div>
            </div>
            <div className="ow-hd-actions">
              <button type="button" className="ow-fchip" disabled title="Saving hotels isn't available yet"><Icon name="heart" size={13} /> Save</button>
              <button type="button" className="ow-fchip" onClick={share}><Icon name="send" size={13} /> {shared ? "Copied" : "Share"}</button>
            </div>
          </div>

          {hero ? (
            <>
              <HotelImage key={hero.large} src={hero.large} alt={hero.caption || name} hero />
              {photos.length > 1 ? (
                <div className="ow-thumbs">
                  {thumbs.map((p, i) => (
                    <button key={p.thumb + i} type="button" className={`ow-thumb${photos.indexOf(p) === imgIdx ? " on" : ""}`}
                      onClick={() => setImgIdx(photos.indexOf(p))} aria-label={p.caption || `Photo ${i + 1}`}>
                      <HotelImage src={p.thumb} alt="" thumb />
                    </button>
                  ))}
                  {!allThumbs && photos.length > THUMBS ? (
                    <button type="button" className="ow-thumb ow-thumb--more" onClick={() => setAllThumbs(true)}>+{photos.length - THUMBS}</button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="ow-hero-ph"><Icon name="hotel" size={28} /></div>
          )}

          <div className="ow-frows">
            {freeCancel ? (
              <div className="ow-frow">
                <b>Free cancellation</b>
                <span>
                  {refundOpt && refundOpt.freeUntil ? `Until ${fmtDate(refundOpt.freeUntil)} on refundable rooms.` : "Available on refundable rooms — see each room's policy."}
                </span>
              </div>
            ) : null}
            {policyOpt && policyOpt.cancellation ? (
              <div className="ow-frow">
                <b>Cancellation policy</b>
                <span className="ow-pre">
                  {moreCancel || policyOpt.cancellation.length <= 220 ? policyOpt.cancellation : policyOpt.cancellation.slice(0, 220) + "…"}
                  {policyOpt.cancellation.length > 220 ? <> <button type="button" className="ow-link" onClick={() => setMoreCancel(!moreCancel)}>{moreCancel ? "Less" : "More"}</button></> : null}
                  <small className="ow-fnote">For the {refundOpt ? "cheapest refundable" : "cheapest"} room; other rooms differ.</small>
                </span>
              </div>
            ) : null}
            {freeBreakfast ? (
              <div className="ow-frow">
                <b>Free breakfast</b>
                <span>{opts.length ? `Included on ${bfCount} of ${opts.length} room option${opts.length === 1 ? "" : "s"}.` : "Included on selected rates."}</span>
              </div>
            ) : null}
            {desc ? (
              <div className="ow-frow">
                <b>About</b>
                <span className="ow-pre">
                  {moreDesc || desc.length <= 300 ? desc : desc.slice(0, 300) + "…"}
                  {desc.length > 300 ? <> <button type="button" className="ow-link" onClick={() => setMoreDesc(!moreDesc)}>{moreDesc ? "Less" : "More"}</button></> : null}
                </span>
              </div>
            ) : null}
            {near.length ? (
              <div className="ow-frow">
                <b>Nearby</b>
                <span>
                  {(allNear ? near : near.slice(0, 3)).map((n: any) => `${n.name}${n.distance ? ` · ${n.distance} ${n.unit || "Km"}` : ""}`).join("  |  ")}
                  {!allNear && near.length > 3 ? <> <button type="button" className="ow-link" onClick={() => setAllNear(true)}>+{near.length - 3} more</button></> : null}
                </span>
              </div>
            ) : null}
            {amenList.length ? (
              <div className="ow-frow">
                <b>Amenities</b>
                {allAmen && amenGroups.length ? (
                  <span className="ow-amgroups">
                    {amenGroups.map((g) => (
                      <span key={g.category} className="ow-amgroup"><em>{g.category}</em>{g.items.join(" · ")}</span>
                    ))}
                    <button type="button" className="ow-link" onClick={() => setAllAmen(false)}>Show less</button>
                  </span>
                ) : (
                  <span className="ow-amen">
                    {(allAmen ? amenList : amenList.slice(0, 6)).map((a) => <span key={a} className="ow-tag">{a}</span>)}
                    {!allAmen && amenList.length > 6 ? <button type="button" className="ow-link" onClick={() => setAllAmen(true)}>+{amenList.length - 6} more</button> : null}
                  </span>
                )}
              </div>
            ) : null}
            {checkIn || checkOut ? (
              <div className="ow-frow"><b>Check-in &amp; Check-out</b><span>{[checkIn && `Check-in ${checkIn}${info.checkInEndTime && info.checkInEndTime !== "anytime" ? ` (until ${info.checkInEndTime})` : ""}`, checkOut && `Check-out ${checkOut}`].filter(Boolean).join("  ·  ")}</span></div>
            ) : null}
            {know.length ? (
              <div className="ow-frow">
                <b>Know before you go</b>
                <span className="ow-know">
                  {(moreKnow ? know : know.slice(0, 2)).map((k, i) => <span key={i}>• {k}</span>)}
                  {know.length > 2 ? <button type="button" className="ow-link" onClick={() => setMoreKnow(!moreKnow)}>{moreKnow ? "Show less" : `+${know.length - 2} more`}</button> : null}
                </span>
              </div>
            ) : null}
            {busy && !details ? <div className="ow-sub"><Spinner /> Loading hotel details…</div> : null}
          </div>
        </div>

        <aside className="ow-hd-side">
          <div className="ow-hd-box">
            <small>Starts from</small>
            <div className="ow-hd-price">
              {best ? <><b>{inr(Number(best.totalPrice))}</b><em>onwards</em></> : <b>—</b>}
            </div>
            <small>{nightsTxt}</small>
            <div className="ow-hd-dates"><Icon name="calendar" size={13} /> {fmtPill(form.checkIn)} → {fmtPill(form.checkOut)}</div>
            <div className={`ow-hd-avail${!busy && !opts.length ? " none" : ""}`}>{availability}</div>
            <button type="button" className="ow-searchbtn" style={{ minHeight: 42, width: "100%" }} onClick={toRooms} disabled={busy || !opts.length}>
              Select Room
            </button>
          </div>
        </aside>
      </div>

      <div ref={roomsRef} className="ow-rooms-h">Choose a room</div>
      {busy ? <Spinner /> : null}
      {!busy && opts.length === 0 ? <div className="taw-banner taw-banner--info">No rooms available for these dates.</div> : null}
      {opts.slice(0, 12).map((opt) => {
        const chk = checks[opt.code] || {};
        const changed = chk.state === "ok" && Math.round(chk.total) !== Math.round(chk.listed);
        return (
          <div key={opt.code} className="ow-seg">
            <div className="ow-seg-top">
              <span>{opt.title}</span>
              <span>{opt.refundable ? "Refundable" : "Non-refundable"}</span>
            </div>
            {opt.board ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>{opt.board}</div> : null}
            {opt.inclusions ? <div className="ow-sub" style={{ whiteSpace: "normal" }}>Includes: {opt.inclusions}</div> : null}
            {opt.cancellation ? (
              <details className="ow-room-pol">
                <summary>Cancellation policy</summary>
                <div className="ow-pre">{opt.cancellation}</div>
              </details>
            ) : null}
            <div className="ow-seg-foot">
              <span>
                <b>{inr(chk.state === "ok" ? chk.total : opt.total)}</b> <small>total</small>
                {opt.perNight ? <> · <small>{inr(opt.perNight)}/night/room</small></> : null}
                {changed ? <> · <small>price changed from {inr(chk.listed)}</small></> : null}
                {chk.state === "err" ? <> · <small style={{ color: "var(--danger, #b00020)" }}>{chk.msg}</small></> : null}
              </span>
              {chk.state === "ok" ? (
                <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => confirmAdd(opt)} disabled={adding}>
                  <Icon name="plus" size={13} /> {adding ? "Adding…" : "Confirm & add hotel"}
                </button>
              ) : (
                <button type="button" className="taw-btn taw-btn--sm" onClick={() => priceCheck(opt)} disabled={chk.state === "loading"}>
                  {chk.state === "loading" ? "Checking…" : "Check price"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
