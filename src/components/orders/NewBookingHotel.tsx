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
  bookingAddHotelStay, bookingLockHotelItinerary, currentHotelJourney, newHotelJourney, hotelAutosuggestV2, hotelDetailsV2, hotelListingStart, hotelPriceCheckV2, inr,
} from "../../services/api";
import { errText } from "../../lib/errText";
import { todayISO } from "../../lib/advisorHelpers";
import {
  DEFAULT_HOTEL_VIEW, HOTEL_PAGE_SIZE, activeFilterCount, filterHotels, hotelFacets, keepSearch, keptSearch, mapTripSureHotel, sortHotels, viewKey, type HotelView,
} from "../../lib/hotelListing";
import { loadRestOfCity, type MoreHandle } from "../../lib/hotelMore";
import { HotelMap, placesFromSuggestion, type MapPlace } from "../panels/HotelMap";
import { HotelLocationMap } from "../panels/HotelLocationMap";

type Customer = { member_id: string | null; name: string; email: string; phone?: string };
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

// "+91 81728 36138" / "918172836138" / "08172836138" -> "8172836138" (the country code is sent separately).
function nationalMobile(v: string): string {
  let d = (v || "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

// Tripsure sends check-in instructions as strings holding HTML-escaped HTML ("&lt;ul&gt;…").
// Decoded and flattened to plain text lines — never injected as markup.
function plainInstructions(list: any): string[] {
  const decode = (t: string) => new DOMParser().parseFromString(t, "text/html").documentElement.textContent || "";
  return (Array.isArray(list) ? list : [])
    .map((x) => decode(decode(String(x || "")).replace(/<\/(li|p)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")))
    .flatMap((t) => t.split("\n"))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Tripsure's review-page split: base fare per night per room, taxes & fees, total.
function splitPrice(rb: any, total: number) {
  const base = rb && rb.baseFare != null ? Number(rb.baseFare) : null;
  const tax = rb && rb.tax != null ? Number(rb.tax) : null;
  if (base == null && tax == null) return null;
  return { base: base ?? total - (tax || 0), tax: tax ?? total - (base || 0), total };
}

function PriceBreakdown({ price, nights, rooms }: { price: { base: number; tax: number; total: number } | null; nights: number; rooms: number }) {
  if (!price) return null;
  const n = Math.max(1, nights), r = Math.max(1, rooms);
  const row = (l: string, v: number, strong = false) => (
    <div className={`ow-pb-row${strong ? " tot" : ""}`}><span>{l}</span><span>{inr(v)}</span></div>
  );
  return (
    <div className="ow-pb">
      <h4>Price breakdown</h4>
      {row(`${inr(Math.round(price.base / n / r))} × ${n} night${n === 1 ? "" : "s"} × ${r} room${r === 1 ? "" : "s"}`, price.base)}
      {row("Taxes & fees", price.tax)}
      {row("Total Amount", price.total, true)}
    </div>
  );
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
        price: splitPrice(rb, Number(o.totalRate) || 0),
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
  const [form, setForm] = useState({ city: "", checkIn: todayISO(14), checkOut: todayISO(16), rooms: 1, adults: 2, children: 0, childAges: [] as number[] });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  // children change together with their ages (one age per child, 0-17; new ones start at 5)
  const setChildren = (n: number) => setForm((f) => ({ ...f, children: n, childAges: Array.from({ length: n }, (_, i) => f.childAges[i] ?? 5) }));
  const setAge = (i: number, age: number) => setForm((f) => ({ ...f, childAges: f.childAges.map((a, j) => (j === i ? age : a)) }));
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
  const [added, setAdded] = useState<{ orderId: string; hotelId: string; handles: any; panRequired: boolean; addressRequired: boolean; label: string; price: { base: number; tax: number; total: number } | null } | null>(null);
  const [guest, setGuest] = useState({
    title: "Mr", firstName: customer.name.split(" ")[0] || "", lastName: customer.name.split(" ").slice(1).join(" "),
    mobile: nationalMobile(customer.phone || ""), email: customer.email || "", pan: "",
    streetAddress1: "", city: "", state: "", postalCode: "",
    gstNumber: "", gstName: "", gstAddress: "", gstState: "", gstCity: "", gstPincode: "",
  });
  const [lockChanges, setLockChanges] = useState<string | null>(null); // "changed since added" message awaiting the advisor's OK
  const [lockInfo, setLockInfo] = useState<any | null>(null);
  const setG = (k: string, v: string) => setGuest((g) => ({ ...g, [k]: v }));

  const nights = Math.round((Date.parse(form.checkOut) - Date.parse(form.checkIn)) / 86_400_000);

  // ── Detail view (hero gallery, feature rows) ──────────────────────────────
  const [imgIdx, setImgIdx] = useState(0);
  const [allThumbs, setAllThumbs] = useState(false);
  const [allAmen, setAllAmen] = useState(false);
  const [shared, setShared] = useState(false);
  const [moreDesc, setMoreDesc] = useState(false);
  const [moreKnow, setMoreKnow] = useState(false);
  const [moreCancel, setMoreCancel] = useState(false);
  const [picking, setPicking] = useState(false); // the "Select a room" panel
  const [selCode, setSelCode] = useState<string | null>(null);
  const pickReq = useRef(0); // id of the latest hotel pick; older responses are ignored

  // ── Results: the same filters, sort, list/map and paging as the Search desk's Hotels ──────────
  // `hotels` are TripSure's hotels, each carrying the docKey/token of the response it came from
  // (`_session`): the first screen and every later page have their own, and details / price check
  // need the pair that came with the hotel.
  const [view, setView] = useState<HotelView>(DEFAULT_HOTEL_VIEW);
  const setV = (k: keyof HotelView, v: any) => setView((f) => ({ ...f, [k]: v }));
  const [layout, setLayout] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(HOTEL_PAGE_SIZE);
  const [moreInfo, setMoreInfo] = useState<{ loaded: number; failed?: boolean } | null>(null);
  const moreRef = useRef<MoreHandle | null>(null);
  const searchKeyRef = useRef("");
  const sentinel = useRef<HTMLDivElement | null>(null);
  const stopMore = () => { if (moreRef.current) moreRef.current.stop(); moreRef.current = null; setMoreInfo(null); };
  useEffect(() => () => { if (moreRef.current) moreRef.current.stop(); }, []);
  const offers = useMemo(
    () => hotels.map((h) => mapTripSureHotel(h, { international: false, nights, rooms: form.rooms, docKey: h._session && h._session.docKey, token: h._session && h._session.token })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotels, nights, form.rooms]
  );
  const facets = useMemo(() => hotelFacets(offers, inr), [offers]);
  const shown = useMemo(() => sortHotels(filterHotels(offers, view), view), [offers, view]);
  const filterKey = viewKey(view);
  const nFilters = activeFilterCount(view);
  useEffect(() => setVisible(HOTEL_PAGE_SIZE), [filterKey]);
  const hasMore = layout === "list" && visible < shown.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + HOTEL_PAGE_SIZE); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);
  const [places, setPlaces] = useState<MapPlace[]>([]); // the city's neighbourhoods and landmarks (the map's chips)
  const sessOf = (h: any) => (h && h._session) || session;
  const toggleAmenity = (k: string) => setV("amenities", view.amenities.indexOf(k) >= 0 ? view.amenities.filter((x) => x !== k) : view.amenities.concat([k]));
  const hReset = () => setView((f) => ({ ...DEFAULT_HOTEL_VIEW, sort: f.sort }));

  function runSearch() {
    onError(null);
    if (!form.city.trim()) { onError("Enter a city or destination."); return; }
    if (!form.checkOut) { setPanel("dates"); onError("Pick a check-out date."); return; }
    if (!(nights >= 1)) { onError("Check-out must be after check-in."); return; }
    newHotelJourney(); // one trace id for this search, through to the room that gets booked
    setBusy(true);
    const withLoc = location
      ? Promise.resolve(location)
      : hotelAutosuggestV2(form.city.trim()).then((r: any) => {
          const top = r && r.locationSuggestions && r.locationSuggestions[0];
          if (!top) throw new Error(`No location match for "${form.city.trim()}".`);
          return top;
        });
    withLoc
      .then((top: any): Promise<any> | any => {
        const countryCode = top.country || "IN";
        const key = JSON.stringify([form.city.trim().toLowerCase(), String(top.id), form.checkIn, form.checkOut, form.rooms, form.adults, form.childAges.join(",")]);
        searchKeyRef.current = key;
        const kept = keptSearch(key);
        if (kept) return { kept };
        return hotelListingStart({
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          // children are dealt out room by room, the same way the server does when it locks the room
          rooms: Array.from({ length: form.rooms }, (_, i) => {
            const ages = form.childAges.filter((_a, j) => j % form.rooms === i);
            return {
              numberOfAdults: String(Math.max(1, Math.ceil(form.adults / form.rooms))),
              numberOfChildren: String(ages.length),
              childrenAge: ages.join(","),
            };
          }),
          city: top.city || top.name,
          locationSuggestion: { id: String(top.id), name: top.name, type: top.type, lat: top.coordinates.lat, lon: top.coordinates.lon },
          state: resolveState(top),
          countryName: top.country || "IN",
          circularSearch: false,
          nationalityCode: "IN",
          countryCode,
          partnerCall: true,
          currency: "INR",
          fetchFromCache: false,
        }).then((r: any) => ({ r, countryCode, top }));
      })
      .then((out: any) => {
        stopMore();
        setView(DEFAULT_HOTEL_VIEW); setLayout("list"); setFiltersOpen(false); setVisible(HOTEL_PAGE_SIZE);
        if (out.kept) {
          setSession(out.kept.session); setSearched(out.kept.searched); setPlaces(out.kept.places || []); setHotels(out.kept.hotels); setSub("results");
          return;
        }
        const { r, countryCode, top } = out;
        setPlaces(placesFromSuggestion(top));
        const first = (r.hotels || []).map((h: any) => ({ ...h, _session: { docKey: r.docKey, token: r.token } }));
        setSession({ docKey: r.docKey, token: r.token });
        const when = { checkIn: form.checkIn, checkOut: form.checkOut };
        setSearched(when);
        setHotels(first);
        setSub("results");
        if (r.more && r.more.token) {
          // The rest of the city loads behind the first hotels (TripSure's own site does the same).
          const handle = loadRestOfCity<any>({
            more: { token: r.more.token, countryCode, ctx: { docKey: r.docKey, token: r.token } },
            first,
            idOf: (h) => h.hotelKey,
            mapHotel: (h, ctx) => ({ ...h, _session: { docKey: ctx.docKey, token: ctx.token } }),
            onUpdate: (all, info) => { setHotels(all); setMoreInfo({ loaded: info.loaded }); },
            onDone: (all) => {
              if (moreRef.current === handle) moreRef.current = null;
              setMoreInfo(null);
              keepSearch(searchKeyRef.current, { hotels: all, session: { docKey: r.docKey, token: r.token }, searched: when, places: placesFromSuggestion(top) });
            },
            onFail: (all) => { if (moreRef.current === handle) moreRef.current = null; setMoreInfo({ loaded: all.length, failed: true }); },
          });
          moreRef.current = handle;
        } else {
          keepSearch(searchKeyRef.current, { hotels: first, session: { docKey: r.docKey, token: r.token }, searched: when, places: placesFromSuggestion(top) });
        }
      })
      .catch((e: any) => onError(errText(e)))
      .finally(() => setBusy(false));
  }

  function pickHotel(h: any) {
    const sess = sessOf(h);
    if (!sess) return;
    onError(null);
    const req = ++pickReq.current;
    const current = () => req === pickReq.current; // false once another pick / leaving the page superseded this one
    setHotel(h);
    setImgIdx(0); setAllThumbs(false); setAllAmen(false); setShared(false); setMoreDesc(false); setMoreKnow(false); setMoreCancel(false);
    setDetails(null);
    setChecks({});
    setPicking(false); setSelCode(null);
    setSub("rooms");
    setBusy(true);
    hotelDetailsV2({ docKey: sess.docKey, token: sess.token, hotelId: String(h.hotelKey) })
      .then((d: any) => { if (current()) setDetails(d || {}); })
      .catch((e: any) => { if (current()) { onError(errText(e)); setSub("results"); } })
      .finally(() => { if (current()) setBusy(false); });
  }

  // Leaving the detail page invalidates any details call still in flight.
  function leaveDetail() {
    pickReq.current++;
    setPicking(false);
    setBusy(false);
    setSub("results");
  }

  // Tripsure's live check of one room, shaped for the UI (what it needs from the guest, what changed).
  function runCheck(opt: any): Promise<any> {
    const sess = sessOf(hotel);
    if (!sess || !hotel) return Promise.reject(new Error("Open a hotel first."));
    return hotelPriceCheckV2({ hotelId: String(hotel.hotelKey), docKey: sess.docKey, token: sess.token, bookingCode: opt.code })
      .then((r: any) => {
        const rate = (r.roomRates || [])[0];
        if (!rate) throw new Error("Tripsure returned no rate for this room.");
        return {
          state: "ok", total: Number(rate.rateBreakdown && rate.rateBreakdown.total) || 0, listed: opt.total,
          price: splitPrice(rate.rateBreakdown, Number(rate.rateBreakdown && rate.rateBreakdown.total) || 0),
          panRequired: !!(r.panCardRequired || (rate.roomType && rate.roomType.isPANMandatory)),
          addressRequired: !!r.customerAddressRequired,
          instructions: plainInstructions([...(r.checkInInstructions || []), r.specialCheckInInstructions].filter(Boolean)),
          // what the live check says that the room list didn't (guide: show the customer any change)
          changes: [
            rate.roomType && rate.roomType.roomTitle && opt.title && rate.roomType.roomTitle !== opt.title ? `Room is now "${rate.roomType.roomTitle}"` : null,
            rate.roomType && rate.roomType.refundable != null && !!rate.roomType.refundable !== opt.refundable
              ? `Now ${rate.roomType.refundable ? "refundable" : "non-refundable"}` : null,
            (((rate.cancellationRules || [])[0] || {}).rules || []).find((x: any) => x.valueType === "Amount" && Number(x.value) === 0 && x.end)?.end
              !== opt.freeUntil && opt.freeUntil ? "Free-cancellation deadline changed" : null,
          ].filter(Boolean),
        };
      });
  }

  function priceCheck(opt: any) {
    setChecks((c) => ({ ...c, [opt.code]: { state: "loading" } }));
    runCheck(opt)
      .then((chk) => setChecks((c) => ({ ...c, [opt.code]: chk })))
      .catch((e: any) => setChecks((c) => ({ ...c, [opt.code]: { state: "err", msg: errText(e) } })));
  }

  // One click: the live check, then straight on to adding the room — unless the check found a
  // different price or different terms, in which case it stops and shows them (the advisor
  // confirms with the second click, as before).
  function addRoom(opt: any) {
    setChecks((c) => ({ ...c, [opt.code]: { state: "loading" } }));
    runCheck(opt)
      .then((chk) => {
        setChecks((c) => ({ ...c, [opt.code]: chk }));
        if (Math.round(chk.total) !== Math.round(opt.total) || chk.changes.length) return;
        confirmAdd(opt, chk);
      })
      .catch((e: any) => setChecks((c) => ({ ...c, [opt.code]: { state: "err", msg: errText(e) } })));
  }

  function confirmAdd(opt: any, fresh?: any) {
    const sess = sessOf(hotel);
    if (!sess || !hotel || !searched) return;
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
      handles: { hotelId: String(hotel.hotelKey), docKey: sess.docKey, token: sess.token, bookingCode: opt.code },
      snapshot: {
        name: info.name || "Hotel",
        address: info.address || null,
        city: info.city || null,
        rating: info.starRating != null ? Math.min(5, Number(info.starRating) || 0) : null,
        image_url: info.image
          || ((details && details.hotelInfo && details.hotelInfo.imageInfo) || []).map((i: any) => i.largeImageUrl || i.wideAngleImageUrl || i.thumbnailImageUrl).find(Boolean)
          || null,
        latitude: info.latitude != null ? Number(info.latitude) : null,
        longitude: info.longitude != null ? Number(info.longitude) : null,
        amenities,
        board_basis: opt.board || null,
      },
      check_in: (searched || form).checkIn,
      check_out: (searched || form).checkOut,
      rooms: form.rooms,
      adults: form.adults,
      children: form.children,
      children_ages: form.childAges,
      journey_id: currentHotelJourney(),
    })
      .then((r: any) => {
        setAdded({
          orderId: r.order_id, hotelId: r.hotel_id, panRequired: !!(fresh || checks[opt.code] || {}).panRequired,
          addressRequired: !!(fresh || checks[opt.code] || {}).addressRequired,
          handles: { hotelId: String(hotel.hotelKey), docKey: sess.docKey, token: sess.token, bookingCode: opt.code },
          label: `${info.name || "Hotel"} — ${opt.title}`,
          price: (fresh || checks[opt.code] || {}).price || opt.price || null,
        });
        setSub("guest");
      })
      .catch((e: any) => onError(errText(e)))
      .finally(() => setAdding(false));
  }

  function lockRoom(acceptChanges = false) {
    if (!added) return;
    onError(null);
    setLockChanges(null);
    setAdding(true);
    bookingLockHotelItinerary({
      booking_hotel_id: added.hotelId,
      handles: added.handles,
      guest: {
        title: guest.title, firstName: guest.firstName.trim(), lastName: guest.lastName.trim(),
        mobile: nationalMobile(guest.mobile), email: guest.email.trim(), pan: guest.pan.trim() || null,
        streetAddress1: guest.streetAddress1.trim(), city: guest.city.trim(), state: guest.state.trim(), postalCode: guest.postalCode.trim(),
        gstNumber: guest.gstNumber.trim().toUpperCase(), gstName: guest.gstName.trim(), gstAddress: guest.gstAddress.trim(),
        gstState: guest.gstState.trim(), gstCity: guest.gstCity.trim(), gstPincode: guest.gstPincode.trim(),
      },
      accept_changes: acceptChanges,
    })
      .then((r: any) => { setLockInfo(r); setSub("locked"); })
      .catch((e: any) => {
        const msg = errText(e);
        if (e && e.status === 409 && /^Changed since this room was added/i.test(msg)) setLockChanges(msg);
        else onError(msg);
      })
      .finally(() => setAdding(false));
  }

  if (sub === "search") {
    const stepper = (label: string, k: "rooms" | "adults" | "children", min: number, max: number) => (
      <div className="ow-gstep">
        <span>{label}</span>
        <div className="ow-step">
          <button type="button" disabled={form[k] <= min} aria-label={`Fewer ${label}`} onClick={() => (k === "children" ? setChildren(form[k] - 1) : set(k, form[k] - 1))}><Icon name="minus" size={13} /></button>
          <b>{form[k]}</b>
          <button type="button" disabled={form[k] >= max} aria-label={`More ${label}`} onClick={() => (k === "children" ? setChildren(form[k] + 1) : set(k, form[k] + 1))}><Icon name="plus" size={13} /></button>
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
              <span>{form.adults} Guest{form.adults === 1 ? "" : "s"}{form.children ? ` + ${form.children} child${form.children === 1 ? "" : "ren"}` : ""} · {form.rooms} Room{form.rooms === 1 ? "" : "s"}</span>
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
            {stepper("Children (total)", "children", 0, 18)}
            {form.children > 0 ? (
              <div className="ow-gstep" style={{ flexWrap: "wrap", gap: 8 }}>
                <span style={{ width: "100%" }}>Age of each child on the day of travel</span>
                {form.childAges.map((age, i) => (
                  <select key={i} className="taw-input" aria-label={`Age of child ${i + 1}`} value={age} style={{ width: 92 }}
                    onChange={(e) => setAge(i, Number(e.target.value))}>
                    {Array.from({ length: 18 }, (_, a) => <option key={a} value={a}>{a === 0 ? "Under 1" : `${a} yr${a === 1 ? "" : "s"}`}</option>)}
                  </select>
                ))}
              </div>
            ) : null}
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
    const starOpts = [{ k: "any", l: "Any" }, { k: "3", l: "3★+" }, { k: "4", l: "4★+" }, { k: "5", l: "5★" }];
    return (
      <>
        <div className="ow-modal-foot" style={{ marginTop: 0 }}>
          <span className="ow-sub">
            {form.city} · {nightsTxt} · {shown.length === offers.length ? offers.length : `${shown.length} of ${offers.length}`} hotels
            {moreInfo ? (moreInfo.failed ? ` · couldn't load the rest, showing ${moreInfo.loaded}` : ` · loading more… ${moreInfo.loaded} so far`) : ""}
          </span>
          <button type="button" className="taw-btn taw-btn--sm" onClick={() => { stopMore(); setSub("search"); }}>Change search</button>
        </div>
        {offers.length > 0 ? (
          <div className="ow-fchips">
            {chip(layout === "list", "List", () => setLayout("list"), "list")}
            {chip(layout === "map", "Map", () => setLayout("map"), "pin")}
            {chip(view.sort === "best", "Best value", () => setV("sort", "best"))}
            {chip(view.sort === "cheapest", "Price ↑", () => setV("sort", view.sort === "cheapest" ? "best" : "cheapest"))}
            {chip(view.sort === "priceDesc", "Price ↓", () => setV("sort", view.sort === "priceDesc" ? "best" : "priceDesc"))}
            {chip(view.sort === "toprated", "Star rating", () => setV("sort", view.sort === "toprated" ? "best" : "toprated"), "star")}
            {chip(view.refundable, "Free cancellation", () => setV("refundable", !view.refundable))}
            {chip(view.breakfast, "Breakfast included", () => setV("breakfast", !view.breakfast))}
            {chip(view.amenities.indexOf("freeWiFi") >= 0, "WiFi", () => toggleAmenity("freeWiFi"), "wifi")}
            {chip(filtersOpen || nFilters > 0, `Filters${nFilters ? ` (${nFilters})` : ""}`, () => setFiltersOpen(!filtersOpen), "sliders")}
            {nFilters > 0 ? <button type="button" className="ow-link" onClick={hReset}>Reset</button> : null}
          </div>
        ) : null}

        {filtersOpen && offers.length > 0 ? (
          <div className="ow-gpanel" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <div className="ow-fchips">
              <span className="ow-sub">Star rating</span>
              {starOpts.map((o) => chip(view.stars === o.k, o.l, () => setV("stars", o.k)))}
            </div>
            {facets.hasPrices && facets.priceBands.length ? (
              <div className="ow-fchips">
                <span className="ow-sub">Price</span>
                {chip(view.price === "any", "Any price", () => setV("price", "any"))}
                {facets.priceBands.map((b) => chip(view.price === b.key, b.label, () => setV("price", view.price === b.key ? "any" : b.key)))}
              </div>
            ) : null}
            {facets.stayTypes.length > 1 ? (
              <div className="ow-fchips">
                <span className="ow-sub">Property type</span>
                {chip(view.stayType === "all", "Any", () => setV("stayType", "all"))}
                {facets.stayTypes.map((t) => chip(view.stayType === t, t, () => setV("stayType", view.stayType === t ? "all" : t)))}
              </div>
            ) : null}
            {facets.boards.length > 1 ? (
              <div className="ow-fchips">
                <span className="ow-sub">Board</span>
                {chip(view.board === "all", "Any", () => setV("board", "all"))}
                {facets.boards.map((b) => chip(view.board === b, b, () => setV("board", view.board === b ? "all" : b)))}
              </div>
            ) : null}
            {facets.amenities.length ? (
              <div className="ow-fchips">
                <span className="ow-sub">Amenities</span>
                {facets.amenities.slice(0, 12).map((a) => chip(view.amenities.indexOf(a.key) >= 0, a.label, () => toggleAmenity(a.key)))}
              </div>
            ) : null}
          </div>
        ) : null}

        {offers.length === 0 ? <Empty icon="hotel" title="No hotels found" message="Try other dates or a nearby city." /> : null}
        {offers.length > 0 && shown.length === 0 ? (
          <div className="ow-empty">
            <b>No hotels match these filters</b>
            <button type="button" className="taw-btn taw-btn--sm" onClick={hReset}>Reset filters</button>
          </div>
        ) : null}

        {layout === "map" && shown.length > 0 ? (
          <HotelMap hotels={shown} onAction={(id: string) => { const h = hotels.find((x) => String(x.hotelKey) === id); if (h) pickHotel(h); }} actionLabel="Select" fitKey={filterKey} city={form.city} places={places} />
        ) : (
          <div className="ow-hgrid">
            {shown.slice(0, visible).map((o: any) => {
              const h = o._raw;
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
        )}
        {hasMore ? (
          <div ref={sentinel} style={{ padding: "12px 0 18px", textAlign: "center" }}>
            <button type="button" className="taw-btn taw-btn--sm" onClick={() => setVisible((v) => v + HOTEL_PAGE_SIZE)}>
              Show more hotels ({shown.length - visible} left)
            </button>
          </div>
        ) : null}
      </>
    );
  }

  if (sub === "guest" && added) {
    const pan = guest.pan.trim().toUpperCase();
    const panBad = (added.panRequired && !pan) || (pan !== "" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan));
    const gstOk = guest.gstNumber.trim() === "" || guest.gstNumber.trim().length === 15;
    const addrBad = added.addressRequired && !(guest.streetAddress1.trim() && guest.city.trim() && guest.postalCode.trim());
    const ready = guest.firstName.trim() && guest.lastName.trim() && /^\d{10}$/.test(nationalMobile(guest.mobile)) && guest.email.includes("@") && !panBad && !addrBad && gstOk;
    return (
      <>
        <div className="taw-banner taw-banner--info">
          {added.label} is recorded on the order. Enter the lead guest to lock the room with Tripsure now — a room can only be locked from this search, and only a locked room can be confirmed later. Nothing is booked or charged yet.
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
        {added.addressRequired ? (
          <>
            <div className="taw-banner taw-banner--info">This rate needs the customer&apos;s address.</div>
            <div className="ow-grid2">
              <Field label="Street address" htmlFor="nbg-street"><input className="taw-input" value={guest.streetAddress1} onChange={(e) => setG("streetAddress1", e.target.value)} /></Field>
              <Field label="City" htmlFor="nbg-city"><input className="taw-input" value={guest.city} onChange={(e) => setG("city", e.target.value)} /></Field>
              <Field label="State" htmlFor="nbg-state"><input className="taw-input" value={guest.state} onChange={(e) => setG("state", e.target.value)} /></Field>
              <Field label="Postal code" htmlFor="nbg-pin"><input className="taw-input" value={guest.postalCode} onChange={(e) => setG("postalCode", e.target.value)} /></Field>
            </div>
          </>
        ) : null}
        <details className="ow-room-pol">
          <summary>GST invoice details (optional, for a business customer)</summary>
          <div className="ow-grid2" style={{ marginTop: 8 }}>
            <Field label="GST number (15 characters)" htmlFor="nbg-gst"><input className="taw-input" maxLength={15} value={guest.gstNumber} onChange={(e) => setG("gstNumber", e.target.value.toUpperCase())} /></Field>
            <Field label="Company name" htmlFor="nbg-gstn"><input className="taw-input" value={guest.gstName} onChange={(e) => setG("gstName", e.target.value)} /></Field>
            <Field label="Company address" htmlFor="nbg-gsta"><input className="taw-input" value={guest.gstAddress} onChange={(e) => setG("gstAddress", e.target.value)} /></Field>
            <Field label="City" htmlFor="nbg-gstc"><input className="taw-input" value={guest.gstCity} onChange={(e) => setG("gstCity", e.target.value)} /></Field>
            <Field label="State" htmlFor="nbg-gsts"><input className="taw-input" value={guest.gstState} onChange={(e) => setG("gstState", e.target.value)} /></Field>
            <Field label="Pincode" htmlFor="nbg-gstp"><input className="taw-input" value={guest.gstPincode} onChange={(e) => setG("gstPincode", e.target.value)} /></Field>
          </div>
          {guest.gstNumber.trim() !== "" && guest.gstNumber.trim().length !== 15 ? <div className="ow-sub" style={{ color: "var(--danger, #b00020)" }}>A GST number has 15 characters.</div> : null}
        </details>
        {lockChanges ? (
          <div className="taw-banner taw-banner--warn" role="alert">
            <div style={{ whiteSpace: "normal" }}>{lockChanges}</div>
            <div className="ow-ful-acts">
              <button type="button" className="taw-btn taw-btn--sm" onClick={() => setLockChanges(null)} disabled={adding}>Don&apos;t lock</button>
              <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => lockRoom(true)} disabled={adding}>Accept changes and lock</button>
            </div>
          </div>
        ) : null}
        <PriceBreakdown price={added.price} nights={nights} rooms={form.rooms} />
        <div className="ow-modal-foot">
          <button type="button" className="taw-btn" onClick={() => onAdded(added.orderId)} disabled={adding} title="The room stays on the order but can't be confirmed until it is locked">
            Skip (lock later by searching again)
          </button>
          <button type="button" className="taw-btn taw-btn--primary" onClick={() => lockRoom()} disabled={adding || !ready}>
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
            The lock is short-lived. Next, on the order: add the travellers, record the payment and confirm the hotel from Booking progress.
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
  const availability = busy ? "Checking availability…" : opts.length ? `${opts.length} room option${opts.length === 1 ? "" : "s"} available` : "No rooms available for these dates";
  if (picking && opts.length) {
    const sel = opts.find((o) => o.code === selCode) || opts[0];
    const chk = checks[sel.code] || {};
    const verified = chk.state === "ok";
    const changed = verified && Math.round(chk.total) !== Math.round(chk.listed);
    const price = verified && chk.price ? chk.price : sel.price;
    const shownTotal = verified ? chk.total : sel.total;
    return (
      <div className="ow-rp">
        <div className="ow-rp-head">
          <h3>Select a room</h3>
          <button type="button" className="taw-btn taw-btn--sm" onClick={() => setPicking(false)} disabled={adding} aria-label="Close">✕</button>
        </div>
        <div className="ow-rp-body">
          <div className="ow-rp-list">
            {opts.slice(0, 12).map((o) => (
              <button key={o.code} type="button" className={`ow-rp-item${o.code === sel.code ? " on" : ""}`} onClick={() => setSelCode(o.code)} disabled={adding}>
                <b>{o.title}</b>
                <span>From {inr(o.total)}</span>
              </button>
            ))}
          </div>
          <div className="ow-rp-detail">
            {hero ? <HotelImage key={hero.large} src={hero.large} alt={sel.title} hero /> : null}
            <h3>{sel.title}</h3>
            <div className="ow-rp-plan">
              <div className="ow-seg-top"><span>{sel.inclusions || sel.board || "Room only"}</span><span>{sel.refundable ? "Refundable" : "Non-refundable booking"}</span></div>
              <div className="ow-sub">{inr(sel.total)} · {nightsTxt}</div>
            </div>
            {sel.cancellation ? (
              <details className="ow-room-pol"><summary>Cancellation policy</summary><div className="ow-pre">{sel.cancellation}</div></details>
            ) : null}
            {changed || (verified && chk.changes && chk.changes.length) ? (
              <div className="taw-banner taw-banner--warn" style={{ whiteSpace: "normal" }}>
                {changed ? `Price changed from ${inr(chk.listed)} to ${inr(chk.total)}. ` : ""}{chk.changes && chk.changes.length ? `${chk.changes.join("; ")}. ` : ""}Tell the customer before reserving.
              </div>
            ) : null}
            {chk.state === "err" ? <div className="taw-banner taw-banner--warn">{chk.msg}</div> : null}
            <PriceBreakdown price={price} nights={nights} rooms={form.rooms} />
          </div>
        </div>
        <div className="ow-rp-foot">
          <span><b>{inr(shownTotal)}</b> <small>{nightsTxt} · Incl. taxes &amp; fees</small></span>
          <button type="button" className="ow-searchbtn" style={{ minHeight: 42 }} disabled={chk.state === "loading" || adding}
            onClick={() => (verified ? confirmAdd(sel) : addRoom(sel))}>
            {chk.state === "loading" || adding ? "Reserving…" : verified && changed ? "Accept & reserve" : "Reserve"}
          </button>
        </div>
      </div>
    );
  }
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
            <HotelLocationMap
              name={name}
              address={listInfo.address || info.address}
              lat={info.latitude != null ? Number(info.latitude) : listInfo.latitude != null ? Number(listInfo.latitude) : null}
              lng={info.longitude != null ? Number(info.longitude) : listInfo.longitude != null ? Number(listInfo.longitude) : null}
              nearby={near}
            />
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
            <button type="button" className="ow-searchbtn" style={{ minHeight: 42, width: "100%" }} onClick={() => { setSelCode((c) => c || (opts[0] && opts[0].code) || null); setPicking(true); }} disabled={busy || !opts.length}>
              Select Room
            </button>
          </div>
        </aside>
      </div>

      {!busy && opts.length === 0 ? <div className="taw-banner taw-banner--info">No rooms available for these dates.</div> : null}
    </>
  );
}
