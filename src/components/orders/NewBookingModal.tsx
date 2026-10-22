"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Field, Icon, Spinner } from "../ui";
import { AutosuggestInput } from "../AutosuggestInput";
import {
  bookingConfirmFlightItinerary, bookingCreateFlightItinerary, bookingCustomerSearch, bookingDiscardFlightItinerary,
  fastapiFlightSearch, flightSsr, getTripsureFlightOffer, inr,
} from "../../services/api";
import { airportAutosuggest } from "../../lib/airportSuggest";
import { errText } from "../../lib/errText";
import { todayISO } from "../../lib/advisorHelpers";
import { durationLabel } from "../../lib/realOrders";
import { NewBookingHotel } from "./NewBookingHotel";
import { SingleCalendar } from "./RangeCalendar";

type Customer = { member_id: string | null; name: string; email: string };
type Step = "customer" | "search" | "results" | "seats" | "flightDone" | "hotel";

const CABINS = [
  { key: "economy", label: "Economy" },
  { key: "premium_economy", label: "Premium Economy" },
  { key: "business", label: "Business" },
  { key: "first", label: "First" },
];

type Pick = { code: string; label: string; price: number };
type SegSel = { seat: Pick | null; baggage: Pick | null };

// Sector keys look like "2_DEL$BOM" ({providerId}_{origin}${dest}).
function ssrSector(catalog: any, o?: string, d?: string): any | null {
  const data = catalog && typeof catalog.data === "object" && catalog.data ? catalog.data : catalog || {};
  const suffix = `_${o}$${d}`;
  const hits = Object.keys(data).filter((k) => k.endsWith(suffix));
  return hits.length === 1 ? data[hits[0]] : null;
}
const baggageLabel = (b: any) => b.text || (b.weight ? `Extra ${b.weight} kg` : b.code);
const isLegroom = (s: any) => /legroom|exit/i.test(String(s.seatType || s.description || ""));

const DEP_BUCKETS = [
  { key: "early", label: "Before 6 AM", test: (h: number) => h < 6 },
  { key: "morning", label: "6 AM – 12 PM", test: (h: number) => h >= 6 && h < 12 },
  { key: "afternoon", label: "12 PM – 6 PM", test: (h: number) => h >= 12 && h < 18 },
  { key: "evening", label: "After 6 PM", test: (h: number) => h >= 18 },
];
const depHour = (o: any) => Number(String(o.detail.depTime || "").slice(0, 2));
const stopBucket = (o: any) => Math.min(2, o.detail.stops || 0); // 0, 1, 2+
const airlineOf = (o: any) => o.detail.airlineName || o.detail.airline || "Unknown";
const durOf = (o: any) => (typeof o.detail.durationMin === "number" ? o.detail.durationMin : Infinity);
const SORTS = [
  { key: "cheapest", label: "Cheapest", pick: (a: any, b: any) => a.base_net - b.base_net },
  { key: "fastest", label: "Fastest", pick: (a: any, b: any) => durOf(a) - durOf(b) || a.base_net - b.base_net },
  { key: "earliest", label: "Earliest departure", pick: (a: any, b: any) => String(a.detail.depTime).localeCompare(String(b.detail.depTime)) || a.base_net - b.base_net },
  { key: "latest", label: "Latest departure", pick: (a: any, b: any) => String(b.detail.depTime).localeCompare(String(a.detail.depTime)) || a.base_net - b.base_net },
] as const;

function fmtDay(ts?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ts || "");
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function NewBookingModal({ onClose, onCreated, addToOrder }: {
  onClose: () => void;
  onCreated: (orderId: string) => void;
  addToOrder?: { dbId: string; customerName: string; email: string };
}) {
  const [step, setStep] = useState<Step>(addToOrder ? "search" : "customer");
  const [customer, setCustomer] = useState<Customer | null>(
    addToOrder ? { member_id: null, name: addToOrder.customerName, email: addToOrder.email } : null
  );

  // ── Step 1: customer ──────────────────────────────────────────────────────
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<any[]>([]);
  const [custBusy, setCustBusy] = useState(false);
  const [manual, setManual] = useState({ name: "", email: "" });

  useEffect(() => {
    const q = custQuery.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      setCustBusy(true);
      bookingCustomerSearch(q)
        .then((rows: any) => { if (live) setCustHits(rows || []); })
        .catch(() => { if (live) setCustHits([]); })
        .finally(() => { if (live) setCustBusy(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [custQuery]);

  // ── Step 2: search ────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    from: "", to: "", fromCity: "", toCity: "",
    date: todayISO(), adults: 1, cabin: "economy",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const [searching, setSearching] = useState(false);
  const [offers, setOffers] = useState<any[] | null>(null);
  const [partialErrors, setPartialErrors] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Only the latest search may touch results/err: a slow earlier response must not land after a newer one.
  const searchSeq = useRef(0);

  const airportSuggestions = (q: string) => airportAutosuggest(q, 8);
  // Real Tripsure autosuggest fields only: airport_name, airport_code, city, country.
  const renderAirport = (a: any) => (
    <span className="ow-sug">
      <span className="ow-sug-ic"><Icon name="flight" size={16} /></span>
      <span className="ow-sug-t">
        <b>{a.airport_name || a.city} <span className="ow-sug-code">({a.airport_code})</span></b>
        <small>{[a.city, a.country].filter(Boolean).join(" — ")}</small>
      </span>
    </span>
  );
  const [panel, setPanel] = useState<null | "trav" | "date">(null);

  const swapAirports = () =>
    setForm((f) => ({ ...f, from: f.to, to: f.from, fromCity: f.toCity, toCity: f.fromCity }));
  const cabinLabel = (CABINS.find((c) => c.key === form.cabin) || CABINS[0]).label;

  function runSearch() {
    setErr(null);
    if (form.from.length !== 3 || form.to.length !== 3) {
      setErr("Pick a From and To airport from the suggestions."); return;
    }
    if (form.from === form.to) { setErr("From and To must differ."); return; }
    if (!form.date) { setErr("Pick a departure date."); return; }
    setSearching(true);
    const seq = ++searchSeq.current;
    fastapiFlightSearch({
      originCode: form.from, destCode: form.to,
      date: form.date, pax: form.adults, cabin: form.cabin,
    })
      .then((r: any) => {
        if (seq !== searchSeq.current) return;
        setErr(null);
        setOffers((r.offers || []).slice().sort((a: any, b: any) => a.base_net - b.base_net));
        setPartialErrors(r.errors || []);
        setStep("results");
      })
      .catch((e: any) => { if (seq === searchSeq.current) setErr(errText(e)); })
      .finally(() => { if (seq === searchSeq.current) setSearching(false); });
  }

  // ── Step 3: select fare ───────────────────────────────────────────────────
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null);

  // ── Step 3 filters / sort (client-side over the fetched offers) ───────────
  const [sortKey, setSortKey] = useState<(typeof SORTS)[number]["key"]>("cheapest");
  const [fStops, setFStops] = useState<number[]>([]);
  const [fDep, setFDep] = useState<string[]>([]);
  const [fAir, setFAir] = useState<string[]>([]);
  const [fMax, setFMax] = useState<number | null>(null);
  useEffect(() => { setSortKey("cheapest"); setFStops([]); setFDep([]); setFAir([]); setFMax(null); }, [offers]);

  const priceBounds = useMemo(() => {
    const ps = (offers || []).map((o) => o.base_net);
    return ps.length ? { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) } : { min: 0, max: 0 };
  }, [offers]);
  const maxPrice = fMax == null ? priceBounds.max : Math.min(fMax, priceBounds.max);
  const filtersOn = fStops.length > 0 || fDep.length > 0 || fAir.length > 0 || maxPrice < priceBounds.max;
  const visible = useMemo(() => {
    const sorter = SORTS.find((x) => x.key === sortKey)!.pick;
    return (offers || [])
      .filter((o) =>
        (!fStops.length || fStops.includes(stopBucket(o))) &&
        (!fDep.length || DEP_BUCKETS.some((b) => fDep.includes(b.key) && b.test(depHour(o)))) &&
        (!fAir.length || fAir.includes(airlineOf(o))) &&
        o.base_net <= maxPrice)
      .sort(sorter);
  }, [offers, sortKey, fStops, fDep, fAir, maxPrice]);
  const airlines = useMemo(() => {
    const m = new Map<string, { n: number; min: number }>();
    (offers || []).forEach((o) => {
      const k = airlineOf(o);
      const c = m.get(k) || { n: 0, min: Infinity };
      m.set(k, { n: c.n + 1, min: Math.min(c.min, o.base_net) });
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [offers]);
  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const resetFilters = () => { setFStops([]); setFDep([]); setFAir([]); setFMax(null); };

  // ── Step 4: seats & baggage ───────────────────────────────────────────────
  // Select locks the fare as a hidden DRAFT, then real options come from SSR.
  const [sel, setSel] = useState<SegSel[]>([]);
  const [ssr, setSsr] = useState<any | null>(null);
  const [draft, setDraft] = useState<{ itineraryId: string; tripsureId: string } | null>(null);
  const draftRef = useRef<{ itineraryId: string; tripsureId: string } | null>(null);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [seatSeg, setSeatSeg] = useState(0);
  const [seatTab, setSeatTab] = useState<"baggage" | "seats">("baggage");

  function setDraftBoth(d: { itineraryId: string; tripsureId: string } | null) {
    draftRef.current = d;
    setDraft(d);
  }

  // Deletes the unconfirmed draft (and its order if brand-new). Best effort:
  // a failed delete leaves a hidden draft, never a visible booking.
  function discardDraft(): Promise<void> {
    const d = draftRef.current;
    setDraftBoth(null);
    return d ? bookingDiscardFlightItinerary(d.itineraryId).then(() => undefined, () => undefined) : Promise.resolve();
  }

  async function goToSeats(offer: any) {
    const cached = getTripsureFlightOffer(offer.id);
    if (!cached || !customer) { setErr("This search has expired — search again."); return; }
    // supplierTraceIds is keyed by provider id ("1", "2"): send the trace id of THIS
    // fare's provider. (Provider 1 fares are rejected without it.) Only when the
    // search returned a single supplier is that one id unambiguous without a match.
    const traceMap = (cached.supplierTraceIds || {}) as Record<string, string>;
    const traceId: string | null =
      traceMap[String(cached.providerId)] || (Object.keys(traceMap).length === 1 ? Object.values(traceMap)[0] : null) || null;
    const raw = cached.raw || {};
    const price = (raw.PriceSummaries || raw.priceSummaries || [])[0] || {};
    const segments = raw.segments || [];
    setErr(null);
    setLockingId(offer.id);
    let created: { itineraryId: string; tripsureId: string } | null = null;
    try {
      const r: any = await bookingCreateFlightItinerary({
        customer: { member_id: customer.member_id, name: customer.name, email: customer.email || null },
        order_id: addToOrder ? addToOrder.dbId : null,
        offer: {
          fareSourceCode: cached.fareSourceCode,
          providerId: cached.providerId,
          traceId,
        },
        snapshot: {
          segments: segments.map((s: any) => ({
            departureAirport: s.departureAirport,
            arrivalAirport: s.arrivalAirport,
            departureDateTime: s.departureDateTime,
            arrivalDateTime: s.arrivalDateTime,
            airlineCode: s.airlineCode,
            airlineName: s.airlineName,
            flightNumber: s.flightNumber,
            durationInMins: s.durationInMins,
            stops: s.stops,
          })),
          bookingClass: price.bookingClass || null,
          baggageKg: offer.detail.baggageKg,
          refundable: offer.detail.refundable,
        },
        adults: form.adults, children: 0, infants: 0,
        cabin_class: form.cabin.toUpperCase(),
        origin_city: form.fromCity || null,
        destination_city: form.toCity || null,
        draft: true,
      });
      if (!r.is_draft) { throw new Error("This fare is already recorded on an order."); }
      created = { itineraryId: r.itinerary_id, tripsureId: r.tripsure_itinerary_id };
      setDraftBoth(created);
      const catalog = await flightSsr(r.tripsure_itinerary_id);
      setSsr(catalog);
      setSelectedOffer(offer);
      setSel((segments.length ? segments : [null]).map(() => ({ seat: null, baggage: null })));
      setSeatSeg(0);
      setSeatTab("baggage");
      setStep("seats");
    } catch (e: any) {
      if (created) await discardDraft();
      setErr(errText(e));
    } finally {
      setLockingId(null);
    }
  }

  async function backToResults() {
    setLeaving(true);
    await discardDraft();
    setLeaving(false);
    setSsr(null);
    setErr(null);
    setStep("results");
  }

  // Closing by ANY route (X, backdrop, Escape, parent unmount) discards an
  // unconfirmed draft. Confirm clears draftRef first, so a locked fare is safe.
  useEffect(() => () => { void discardDraft(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || creating || leaving || lockingId) return;
      // Escape first closes an open dropdown / suggestion list, not the modal.
      if (document.querySelector('[role="listbox"]')) return;
      // A fare is already locked on these screens: close like "Finish" so the list refreshes.
      const orderId = step === "flightDone" || step === "hotel" ? lock?.orderId || addToOrder?.dbId : null;
      if (orderId) onCreated(orderId); else onClose();
    };
    // capture: runs before the list's own handler closes it, so we still see it open
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function pickSeat(i: number, v: Pick | null) {
    setSel((prev) => prev.map((p, j) => (j === i ? { ...p, seat: v } : p)));
  }
  function pickBaggage(i: number, v: Pick | null) {
    setSel((prev) => prev.map((p, j) => (j === i ? { ...p, baggage: v } : p)));
  }

  // ── Create itinerary ──────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);

  // ── Hotel (see NewBookingHotel.tsx) ───────────────────────────────────────
  // Set once a flight itinerary is locked, so a hotel can join that itinerary.
  const [lock, setLock] = useState<{ orderId: string; itineraryId: string } | null>(null);
  // hotel-only: new itinerary on addToOrder's order, or a brand-new order.
  const [hotelBack, setHotelBack] = useState<Step>("search");

  function confirmItinerary() {
    const d = draftRef.current;
    if (!d) { setErr("This fare is no longer held — go back and select it again."); return; }
    const segments = sel
      .map((p, i) => ({
        segment_order: i + 1,
        seat: p.seat ? { code: p.seat.code, label: p.seat.label, price: p.seat.price } : null,
        baggage: p.baggage ? { code: p.baggage.code, label: p.baggage.label, price: p.baggage.price } : null,
      }))
      .filter((x) => x.seat || x.baggage);
    setCreating(true);
    setErr(null);
    // Server re-verifies every price against Tripsure SSR (409 on mismatch).
    bookingConfirmFlightItinerary(d.itineraryId, { segments })
      .then((r: any) => {
        setDraftBoth(null); // confirmed: no longer discardable
        setLock({ orderId: r.order_id, itineraryId: d.itineraryId });
        setStep("flightDone");
      })
      .catch((e: any) => setErr(errText(e)))
      .finally(() => setCreating(false));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const stepNo = step === "customer" ? 1 : step === "search" ? 2 : step === "results" ? 3 : 4;
  const stepLabel =
    step === "customer" ? "Customer" :
    step === "search" ? "Flight search" :
    step === "results" ? "Choose a fare" :
    step === "hotel" ? "Hotel" :
    step === "flightDone" ? "Fare locked" : "Seats & baggage";
  const title = step === "hotel" ? "Add hotel" : addToOrder ? "Add flight itinerary" : "New booking";

  return (
    <div
      className="taw-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget && !creating && !leaving && !lockingId) onClose(); }}
    >
      <div className={`taw-modal-panel ow-modal${step === "results" || step === "search" || step === "hotel" ? " ow-modal--wide" : ""}`}>
        <div className="ow-modal-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
            <div className="ow-sub">
              {step === "hotel" || step === "flightDone" ? stepLabel : `Step ${stepNo} of 4 · ${stepLabel}`}{customer ? ` · ${customer.name}` : ""}
            </div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={creating || leaving || !!lockingId} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        {err ? <div className="taw-banner taw-banner--danger">{errText(err)}</div> : null}

        {/* ── Step 1: Customer ── */}
        {step === "customer" ? (
          <>
            <Field label="Find an existing customer" htmlFor="nb-cust">
              <input
                className="taw-input"
                value={custQuery}
                onChange={(e) => setCustQuery(e.target.value)}
                placeholder="Search by name or email"
              />
            </Field>
            {/* custBusy alone sticks if the query is deleted back under 2 chars mid-request
                (that request's `live` flag flips, so its finally never clears it). */}
            {custBusy && custQuery.trim().length >= 2 ? <Spinner /> : null}
            {(custQuery.trim().length < 2 ? [] : custHits).map((m) => (
              <button
                key={m.id}
                type="button"
                className="ow-pick"
                onClick={() => { setCustomer({ member_id: m.id, name: m.name, email: m.email || "" }); setStep("search"); }}
              >
                <span className="ow-av">{String(m.name || "?").split(" ").map((p: string) => p[0]).slice(0, 2).join("")}</span>
                <span className="who">{m.name}<small>{m.email || m.phone || ""}</small></span>
              </button>
            ))}
            <div className="ow-or">or add a new customer</div>
            <div className="ow-grid2">
              <Field label="Name" htmlFor="nb-name">
                <input className="taw-input" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="nb-email">
                <input className="taw-input" type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
              </Field>
            </div>
            <button
              type="button"
              className="taw-btn taw-btn--primary"
              disabled={!manual.name.trim()}
              onClick={() => { setCustomer({ member_id: null, name: manual.name.trim(), email: manual.email.trim() }); setStep("search"); }}
            >
              Continue with this customer
            </button>
          </>
        ) : null}

        {/* ── Step 2: Search ── */}
        {step === "search" ? (
          <>
            <div className="ow-trip" role="tablist" aria-label="Trip type">
              <button type="button" role="tab" aria-selected="true" className="ow-trip-pill on">One way</button>
              <button type="button" role="tab" aria-selected="false" className="ow-trip-pill" disabled title="Round trip isn't supported yet">Round trip</button>
            </div>
            <div className="ow-sbar ow-sbar--flight">
              <div className="ow-sbar-route">
                <label className="ow-pill ow-pill--field">
                  <span className="ow-pill-l">From</span>
                  <AutosuggestInput
                    className="ow-pill-input"
                    value={form.from}
                    onChange={(v: any) => set("from", String(v).toUpperCase())}
                    onSelect={(a: any) => setForm((f) => ({ ...f, from: a.airport_code, fromCity: a.city }))}
                    fetchSuggestions={airportSuggestions}
                    floating
                    renderSuggestion={renderAirport}
                    getKey={(a: any) => a.airport_code}
                    placeholder="DEL"
                  />
                  <span className="ow-pill-s">{form.from.length === 3 && form.fromCity ? form.fromCity : "City or airport"}</span>
                </label>
                <button type="button" className="ow-swap" onClick={swapAirports} aria-label="Swap From and To" title="Swap">
                  <Icon name="swap" size={16} />
                </button>
                <label className="ow-pill ow-pill--field">
                  <span className="ow-pill-l">To</span>
                  <AutosuggestInput
                    className="ow-pill-input"
                    value={form.to}
                    onChange={(v: any) => set("to", String(v).toUpperCase())}
                    onSelect={(a: any) => setForm((f) => ({ ...f, to: a.airport_code, toCity: a.city }))}
                    fetchSuggestions={airportSuggestions}
                    floating
                    renderSuggestion={renderAirport}
                    getKey={(a: any) => a.airport_code}
                    placeholder="BOM"
                  />
                  <span className="ow-pill-s">{form.to.length === 3 && form.toCity ? form.toCity : "City or airport"}</span>
                </label>
              </div>
              <div className={`ow-pill ow-pill--btn ow-pill--date${panel === "date" ? " open" : ""}`}>
                <span className="ow-pill-l">Depart</span>
                <button type="button" className="ow-pillbtn" aria-expanded={panel === "date"} onClick={() => setPanel(panel === "date" ? null : "date")} aria-label="Choose departure date">
                  <Icon name="calendar" size={14} />
                  <span>{fmtDay(form.date) || "Select date"}</span>
                </button>
              </div>
              <div className="ow-pill ow-pill--btn ow-pill--date ow-pill--disabled" title="Round trip isn't supported yet" aria-disabled="true">
                <span className="ow-pill-l">Return</span>
                <span className="ow-pillbtn"><Icon name="calendar" size={14} /><span>Add return</span></span>
              </div>
              <div className={`ow-pill ow-pill--btn ow-pill--trav${panel === "trav" ? " open" : ""}`}>
                <span className="ow-pill-l">Travellers &amp; Cabin</span>
                <button type="button" className="ow-pillbtn" aria-expanded={panel === "trav"} onClick={() => setPanel(panel === "trav" ? null : "trav")}>
                  <Icon name="people" size={14} />
                  <span>{form.adults} Adult{form.adults === 1 ? "" : "s"} · {cabinLabel}</span>
                </button>
              </div>

              <button type="button" className="ow-searchbtn" onClick={runSearch} disabled={searching}>
                <Icon name="search" size={15} />
                {searching ? "Searching…" : "Search"}
              </button>
            </div>

            {panel === "date" ? (
              <SingleCalendar value={form.date} min={todayISO()} onChange={(d) => set("date", d)} onDone={() => setPanel(null)} />
            ) : null}

            {panel === "trav" ? (
              <div className="ow-gpanel">
                <div className="ow-gstep">
                  <span>Adults</span>
                  <div className="ow-step">
                    <button type="button" disabled={form.adults <= 1} aria-label="Fewer adults" onClick={() => set("adults", form.adults - 1)}><Icon name="minus" size={13} /></button>
                    <b>{form.adults}</b>
                    <button type="button" disabled={form.adults >= 9} aria-label="More adults" onClick={() => set("adults", form.adults + 1)}><Icon name="plus" size={13} /></button>
                  </div>
                </div>
                <div className="ow-gstep">
                  <span>Cabin</span>
                  <div className="ow-cabins">
                    {CABINS.map((c) => (
                      <button key={c.key} type="button" className={`ow-fchip${form.cabin === c.key ? " on" : ""}`} aria-pressed={form.cabin === c.key} onClick={() => set("cabin", c.key)}>{c.label}</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="taw-btn taw-btn--sm" onClick={() => setPanel(null)}>Done</button>
              </div>
            ) : null}

            <div className="ow-sub" style={{ whiteSpace: "normal" }}>One-way, live Tripsure search.</div>
            <button type="button" className="taw-btn taw-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => { setErr(null); setLock(null); setHotelBack("search"); setStep("hotel"); }}>
              <Icon name="hotel" size={13} /> Hotel only (no flight)
            </button>
            {!addToOrder ? (
              <div className="ow-modal-foot">
                <button type="button" className="taw-btn" onClick={() => setStep("customer")}>Back</button>
                <span />
              </div>
            ) : null}
          </>
        ) : null}

        {/* ── Step 3: Results ── */}
        {step === "results" ? (
          <>
            <div className="ow-modal-foot" style={{ marginTop: 0 }}>
              <span className="ow-sub">
                {form.fromCity || form.from} → {form.toCity || form.to} · {fmtDay(form.date)} · {visible.length} of {offers ? offers.length : 0} flights
              </span>
              <button type="button" className="taw-btn taw-btn--sm" onClick={() => { setErr(null); setStep("search"); }}>Change search</button>
            </div>
            {partialErrors.length ? (
              <div className="taw-banner taw-banner--info">Some suppliers failed — results may be partial.</div>
            ) : null}

            {offers && offers.length === 0 ? (
              <Empty icon="flight" title="No flights found" message="Try another date or cabin." />
            ) : (
              <div className="ow-fl">
                <aside className="ow-fl-side" aria-label="Filters">
                  <div className="ow-fl-sidehead">
                    <b>Filters</b>
                    {filtersOn ? <button type="button" className="ow-link" onClick={resetFilters}>Reset</button> : null}
                  </div>

                  <div className="ow-fgroup">
                    <div className="ow-fgroup-t">Stops</div>
                    {[{ k: 0, l: "Non-stop" }, { k: 1, l: "1 stop" }, { k: 2, l: "2+ stops" }].map((x) => {
                      const n = (offers || []).filter((o) => stopBucket(o) === x.k).length;
                      return (
                        <label key={x.k} className={`ow-fopt${n ? "" : " off"}`}>
                          <input type="checkbox" disabled={!n} checked={fStops.includes(x.k)} onChange={() => toggle(fStops, x.k, setFStops)} />
                          <span>{x.l}</span><em>{n}</em>
                        </label>
                      );
                    })}
                  </div>

                  <div className="ow-fgroup">
                    <div className="ow-fgroup-t">Departure time</div>
                    {DEP_BUCKETS.map((x) => {
                      const n = (offers || []).filter((o) => x.test(depHour(o))).length;
                      return (
                        <label key={x.key} className={`ow-fopt${n ? "" : " off"}`}>
                          <input type="checkbox" disabled={!n} checked={fDep.includes(x.key)} onChange={() => toggle(fDep, x.key, setFDep)} />
                          <span>{x.label}</span><em>{n}</em>
                        </label>
                      );
                    })}
                  </div>

                  <div className="ow-fgroup">
                    <div className="ow-fgroup-t">Airlines</div>
                    {airlines.map(([name, c]) => (
                      <label key={name} className="ow-fopt">
                        <input type="checkbox" checked={fAir.includes(name)} onChange={() => toggle(fAir, name, setFAir)} />
                        <span>{name}</span><em>{inr(c.min)}</em>
                      </label>
                    ))}
                  </div>

                  {priceBounds.max > priceBounds.min ? (
                    <div className="ow-fgroup">
                      <div className="ow-fgroup-t">Max price <b>{inr(maxPrice)}</b></div>
                      <input
                        type="range" className="ow-range" aria-label="Maximum price"
                        min={priceBounds.min} max={priceBounds.max}
                        step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
                        value={maxPrice} onChange={(e) => setFMax(Number(e.target.value))}
                      />
                      <div className="ow-range-l"><span>{inr(priceBounds.min)}</span><span>{inr(priceBounds.max)}</span></div>
                    </div>
                  ) : null}
                </aside>

                <div className="ow-fl-main">
                  <div className="ow-sorttabs" role="tablist">
                    {SORTS.map((t) => {
                      const best = (offers || []).filter((o) => visible.includes(o)).slice().sort(t.pick)[0];
                      return (
                        <button key={t.key} type="button" role="tab" aria-selected={sortKey === t.key}
                          className={`ow-sorttab${sortKey === t.key ? " on" : ""}`} onClick={() => setSortKey(t.key)}>
                          <span className="ow-sorttab-l">{t.label}</span>
                          <span className="ow-sorttab-v">
                            {best ? (t.key === "earliest" || t.key === "latest"
                              ? `${best.detail.depTime} · ${inr(best.base_net)}`
                              : `${inr(best.base_net)} · ${durationLabel(best.detail.durationMin)}`) : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="ow-results">
                    {visible.length === 0 ? (
                      <div className="ow-empty">
                        <b>No flights match these filters</b>
                        <button type="button" className="taw-btn taw-btn--sm" onClick={resetFilters}>Reset filters</button>
                      </div>
                    ) : null}
                    {visible.map((o) => {
                      const d = o.detail;
                      const raw = (getTripsureFlightOffer(o.id) || {}).raw || {};
                      const first = (raw.segments || [])[0] || {};
                      return (
                        <div className="ow-fcard" key={o.id}>
                          <div className="ow-fcard-air">
                            <b>{d.airlineName || d.airline}</b>
                            <small>{d.flightNo}</small>
                            <small><Icon name="calendar" size={11} /> {fmtDay(first.departureDateTime)}</small>
                          </div>
                          <div className="ow-route">
                            <div className="ow-city"><div className="code">{d.depTime}</div><div className="nm">{d.originCode}</div></div>
                            <div className="ow-line">
                              {durationLabel(d.durationMin)}<div className="bar" />
                              {d.stops === 0 ? "Non-stop" : `${d.stops} stop${d.stops === 1 ? "" : "s"}`}
                            </div>
                            <div className="ow-city r"><div className="code">{d.arrTime}</div><div className="nm">{d.destCode}</div></div>
                          </div>
                          <div className="ow-fcard-buy">
                            <div className="ow-fcard-price"><b>{inr(o.base_net)}</b><small>total</small></div>
                            <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => goToSeats(o)} disabled={!!lockingId}>
                              {lockingId === o.id ? "Locking fare…" : "Select"}
                            </button>
                          </div>
                          <div className="ow-fcard-tags">
                            <span className="taw-chip taw-chip--dom">{d.cabin}</span>
                            {d.refundable === true ? <span className="ow-tag ok">Refundable</span> : d.refundable === false ? <span className="ow-tag">Non-refundable</span> : null}
                            {d.baggageKg ? <span className="ow-tag">{d.baggageKg} kg bag</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* ── After the fare lock: optionally add a hotel to the same itinerary ── */}
        {step === "flightDone" && lock ? (
          <>
            <div className="taw-banner taw-banner--info">
              Flight itinerary created and the fare is locked. Add a hotel to this itinerary, or finish.
            </div>
            <div className="ow-modal-foot">
              <button type="button" className="taw-btn" onClick={() => onCreated(lock.orderId)}>Finish</button>
              <button type="button" className="taw-btn taw-btn--primary" onClick={() => { setErr(null); setHotelBack("flightDone"); setStep("hotel"); }}>
                <Icon name="hotel" size={14} /> Add hotel to this itinerary
              </button>
            </div>
          </>
        ) : null}

        {/* ── Hotel steps ── */}
        {step === "hotel" && customer ? (
          <NewBookingHotel
            customer={customer}
            orderId={lock?.orderId || addToOrder?.dbId || null}
            itineraryId={lock?.itineraryId || null}
            onBack={() => { setErr(null); setStep(hotelBack); }}
            onAdded={onCreated}
            onError={setErr}
          />
        ) : null}

        {/* ── Step 4: Seats & Baggage (real SSR options) ── */}
        {step === "seats" && selectedOffer ? (() => {
          const cached = getTripsureFlightOffer(selectedOffer.id);
          const segments: any[] = cached?.raw?.segments || [];
          const d = selectedOffer.detail;
          const rows = segments.length > 0 ? segments : [null];
          const si = Math.min(seatSeg, rows.length - 1);
          const seg = rows[si];
          const block = seg ? ssrSector(ssr, seg.departureAirport, seg.arrivalAirport) : ssrSector(ssr, d.originCode, d.destCode);
          const bagOpts: any[] = (block?.baggage || []).filter((b: any) => b && b.code);
          const seatOpts: any[] = (block?.seats || []).filter((x: any) => x && x.code);
          const noneAtAll = rows.every((s: any) => {
            const b = s ? ssrSector(ssr, s.departureAirport, s.arrivalAirport) : ssrSector(ssr, d.originCode, d.destCode);
            return !(b?.baggage || []).length && !(b?.seats || []).length;
          });
          const cur = sel[si] || { seat: null, baggage: null };
          const bagCount = sel.filter((p) => p.baggage).length;
          const seatCount = sel.filter((p) => p.seat).length;
          const extrasTotal = sel.reduce((n, p) => n + (p.seat?.price || 0) + (p.baggage?.price || 0), 0);
          const busy = creating || leaving;
          return (
            <>
              <div className="ow-seg" style={{ marginBottom: 12 }}>
                <div className="ow-seg-top">
                  <span>{d.airlineName || d.airline} · {d.flightNo}</span>
                  <span><b>{inr(selectedOffer.base_net)}</b> total</span>
                </div>
                <div className="ow-route">
                  <div className="ow-city"><div className="code">{d.originCode}</div><div className="time">{d.depTime}</div></div>
                  <div className="ow-line">
                    {durationLabel(d.durationMin)}<div className="bar" />
                    {d.stops === 0 ? "Non-stop" : `${d.stops} stop${d.stops === 1 ? "" : "s"}`}
                  </div>
                  <div className="ow-city r"><div className="code">{d.destCode}</div><div className="time">{d.arrTime}</div></div>
                </div>
              </div>

              <div className="ow-info">
                <Icon name="shield" size={15} />
                <span>Seat and baggage preferences are saved with the booking. Actual assignment happens at ticketing.</span>
              </div>

              {noneAtAll ? (
                <div className="ow-empty">
                  <Icon name="luggage" size={20} />
                  <div><b>No extras available for this fare</b></div>
                  <div className="ow-sub">The airline offers no extra baggage or seat selection here. You can still confirm and lock the fare.</div>
                </div>
              ) : (
                <div className="ow-sel">
                  <div className="ow-sel-tabs" role="tablist" aria-orientation="vertical">
                    {([
                      { k: "baggage", label: "Baggage", icon: "luggage", n: bagCount },
                      { k: "seats", label: "Seats", icon: "flight", n: seatCount },
                    ] as const).map((t) => (
                      <button
                        key={t.k} type="button" role="tab" aria-selected={seatTab === t.k}
                        className={`ow-sel-tab${seatTab === t.k ? " on" : ""}`}
                        onClick={() => setSeatTab(t.k)}
                      >
                        <Icon name={t.icon} size={15} />
                        <span>{t.label}</span>
                        {t.n ? <em>{t.n}</em> : null}
                      </button>
                    ))}
                  </div>

                  <div className="ow-sel-panel" role="tabpanel">
                    {rows.length > 1 ? (
                      <div className="ow-segpills">
                        {rows.map((s: any, i: number) => (
                          <button key={i} type="button" className={`ow-segpill${i === si ? " on" : ""}`} onClick={() => setSeatSeg(i)}>
                            {s ? `${s.departureAirport} → ${s.arrivalAirport}` : `Segment ${i + 1}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="ow-sel-title">
                      {seatTab === "baggage" ? "Extra baggage" : "Seat selection"}
                      <span className="ow-sub">
                        {seg ? `${seg.departureAirport} → ${seg.arrivalAirport} · ${fmtDay(seg.departureDateTime)}` : "Flight preferences"}
                      </span>
                    </div>

                    {seatTab === "baggage" ? (
                      bagOpts.length === 0 ? (
                        <div className="ow-sub">No extra baggage is offered for this segment.</div>
                      ) : (
                        <div className="ow-cards">
                          {bagOpts.map((b: any) => {
                            const on = cur.baggage?.code === b.code;
                            const pick: Pick = { code: b.code, label: baggageLabel(b), price: Number(b.price) || 0 };
                            return (
                              <div key={b.code} className={`ow-card${on ? " on" : ""}`}>
                                <span className="ow-card-ic"><Icon name="luggage" size={18} /></span>
                                <div className="ow-card-main">
                                  <div className="ow-card-t">{pick.label}</div>
                                  <div className="ow-card-s">{inr(pick.price)}</div>
                                </div>
                                <div className="ow-step" aria-label={`Quantity for ${pick.label}`}>
                                  <button type="button" disabled={!on || busy} aria-label={`Remove ${pick.label}`}
                                    onClick={() => pickBaggage(si, null)}><Icon name="minus" size={13} /></button>
                                  <b>{on ? 1 : 0}</b>
                                  <button type="button" disabled={on || busy} aria-label={`Add ${pick.label}`}
                                    onClick={() => pickBaggage(si, pick)}><Icon name="plus" size={13} /></button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="ow-sub">One extra-baggage option per segment.</div>
                        </div>
                      )
                    ) : seatOpts.length === 0 ? (
                      <div className="ow-sub">Seat selection is not offered for this segment.</div>
                    ) : (
                      <SeatPicker
                        seats={seatOpts}
                        selected={cur.seat?.code || null}
                        disabled={busy}
                        onPick={(x: any | null) =>
                          pickSeat(si, x ? { code: x.code, label: `Seat ${x.code}`, price: Number(x.price) || 0 } : null)}
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="ow-sticky-foot">
                <div className="ow-total">
                  <small>Total fare</small>
                  <b>{inr(selectedOffer.base_net + extrasTotal)}</b>
                  <small>
                    {extrasTotal > 0
                      ? `${inr(selectedOffer.base_net)} fare + ${inr(extrasTotal)} extras (${[bagCount ? `${bagCount} baggage` : "", seatCount ? `${seatCount} seat` : ""].filter(Boolean).join(", ")})`
                      : "No extras selected"}
                  </small>
                </div>
                <div className="ow-sticky-btns">
                  <button type="button" className="taw-btn" onClick={backToResults} disabled={busy}>
                    {leaving ? "Releasing…" : "Back"}
                  </button>
                  <button type="button" className="taw-btn taw-btn--primary" onClick={confirmItinerary} disabled={busy || !draft}>
                    {creating ? "Confirming…" : "Confirm & lock fare"}
                  </button>
                </div>
              </div>
            </>
          );
        })() : null}
      </div>
    </div>
  );
}

// Seat grid built from the SSR seat list. Rows/letters come from each seat's
// code ("12A"); a letter that exists elsewhere in the cabin but is missing
// from a row's list is shown as occupied. Falls back to plain tiles if codes
// aren't row+letter. Seats priced 0 are "free", >0 "paid".
function SeatPicker({ seats, selected, disabled, onPick }: {
  seats: any[]; selected: string | null; disabled: boolean; onPick: (s: any | null) => void;
}) {
  const parsed = seats.map((s) => {
    const m = /^(\d+)([A-Za-z])$/.exec(String(s.code));
    return m ? { s, row: +m[1], col: m[2].toUpperCase() } : null;
  });
  const gridOk = parsed.every(Boolean);
  const legend = (
    <div className="ow-legend">
      <span><i className="ow-seat free" /> Free</span>
      <span><i className="ow-seat paid" /> Paid</span>
      <span><i className="ow-seat leg" /> Extra legroom</span>
      <span><i className="ow-seat on" /> Selected</span>
      <span><i className="ow-seat occ" /> Occupied</span>
    </div>
  );
  const cls = (s: any, on: boolean) =>
    `ow-seat${on ? " on" : isLegroom(s) ? " leg" : (Number(s.price) || 0) > 0 ? " paid" : " free"}`;
  const tip = (s: any) => `${s.code}${s.seatType ? ` · ${s.seatType}` : ""} · ${(Number(s.price) || 0) > 0 ? inr(Number(s.price)) : "Free"}`;

  if (!gridOk) {
    return (
      <>
        {legend}
        <div className="ow-tiles">
          {seats.map((s) => {
            const on = selected === s.code;
            return (
              <button key={s.code} type="button" aria-pressed={on} disabled={disabled}
                className={`ow-tile${on ? " on" : ""}`} onClick={() => onPick(on ? null : s)}>
                <div className="ow-tile-t">{s.code}</div>
                <div className="ow-tile-s">{s.seatType || "Seat"}</div>
                <div className="ow-tile-p">{(Number(s.price) || 0) > 0 ? inr(Number(s.price)) : "Free"}</div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const cols = Array.from(new Set(parsed.map((x: any) => x.col))).sort() as string[];
  const rowNos = Array.from(new Set(parsed.map((x: any) => x.row))).sort((a: any, b: any) => a - b) as number[];
  const byKey = new Map(parsed.map((x: any) => [`${x.row}${x.col}`, x.s]));
  const aisleAfter = Math.ceil(cols.length / 2) - 1; // 3-3 → after C; 2-2 → after B
  return (
    <>
      {legend}
      <div className="ow-seatmap">
        <div className="ow-seatrow ow-seathead">
          <span className="ow-rowno" />
          {cols.map((c, i) => (
            <span key={c} className="ow-colhead" style={i === aisleAfter ? { marginRight: 14 } : undefined}>{c}</span>
          ))}
        </div>
        {rowNos.map((r) => (
          <div className="ow-seatrow" key={r}>
            <span className="ow-rowno">{r}</span>
            {cols.map((c, i) => {
              const s = byKey.get(`${r}${c}`);
              const gap = i === aisleAfter ? { marginRight: 14 } : undefined;
              if (!s) return <span key={c} className="ow-seat occ" style={gap} title="Occupied / not available" />;
              const on = selected === s.code;
              return (
                <button key={c} type="button" className={cls(s, on)} style={gap} title={tip(s)}
                  aria-label={tip(s)} aria-pressed={on} disabled={disabled}
                  onClick={() => onPick(on ? null : s)} />
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
