"use client";
/* =============================================================================
 * TripAgent — src/components/panels/FlightDesk.tsx
 * Ported from web/js/advisor.js: FlightDesk (line ~1000) + its Wave-1 fare
 * depth expander, FlightFareDetail (line ~872, colocated here — only ever
 * used by FlightDesk in the original module too).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { fastapiFlightAutosuggest, fastapiFlightSearch, flightFares, searchFlights, inr } from "../../services/api";
import { AutosuggestInput } from "../AutosuggestInput";
import { cx } from "../../lib/cx";
import { toast, todayISO, fmtDate, fareBrand, flightCartItem } from "../../lib/advisorHelpers";
import { Dropdown, Empty, Field, Spinner, SkeletonResults, SkeletonRows, Icon } from "../ui";
import { MOCK_FLIGHT_SEARCH_RESPONSE, mockFlightFares } from "../../lib/mockFlightSearch";

// HARDCODED FALLBACK, not a real API call — GET /flights/autosuggest
// requires q with min_length=2 (flight_router.py:get_autosuggest) and 422s
// on an empty/missing q, so there is no live "popular airports" call to
// make for the on-focus default list. Shaped identically to a real
// /flights/autosuggest response entry (see the guide's own sample; this
// endpoint was never flagged with the search()-style live snake_case
// surprise) so renderAirportSuggestion() below needs no special-casing for
// where an item came from.
// CABIN_OPTIONS (2026-09-02) — the Cabin field was a native <select>, same
// unstyleable-own-popup limitation the Flights desk-picker had (see
// Dropdown.tsx's own docblock) — swapped for the same custom Dropdown.
const CABIN_OPTIONS = [
  { key: "economy", label: "Economy" },
  { key: "premium_economy", label: "Premium Economy" },
  { key: "business", label: "Business" },
  { key: "first", label: "First" },
];

const DEFAULT_AIRPORT_SUGGESTIONS = [
  { country: "India", country_code: "IN", city: "New Delhi", airport_name: "Indira Gandhi International Airport", airport_code: "DEL", location: { lat: 28.5665, lon: 77.1031 }, popularity_score: 100, aliases: ["delhi"] },
  { country: "India", country_code: "IN", city: "Mumbai", airport_name: "Chhatrapati Shivaji Maharaj International Airport", airport_code: "BOM", location: { lat: 19.0896, lon: 72.8656 }, popularity_score: 98, aliases: ["mumbai", "bombay"] },
  { country: "India", country_code: "IN", city: "Bengaluru", airport_name: "Kempegowda International Airport", airport_code: "BLR", location: { lat: 13.1986, lon: 77.7066 }, popularity_score: 95, aliases: ["bangalore", "bengaluru"] },
  { country: "India", country_code: "IN", city: "Hyderabad", airport_name: "Rajiv Gandhi International Airport", airport_code: "HYD", location: { lat: 17.2403, lon: 78.4294 }, popularity_score: 90, aliases: ["hyderabad"] },
  { country: "India", country_code: "IN", city: "Chennai", airport_name: "Chennai International Airport", airport_code: "MAA", location: { lat: 12.9941, lon: 80.1709 }, popularity_score: 88, aliases: ["chennai", "madras"] },
  { country: "India", country_code: "IN", city: "Goa", airport_name: "Goa International Airport", airport_code: "GOI", location: { lat: 15.3808, lon: 73.8314 }, popularity_score: 85, aliases: ["goa", "dabolim"] },
];

// airportSuggestions(query) — AutosuggestInput's fetchSuggestions for both
// From/To fields. GET /flights/autosuggest requires a real advisor session
// (get_current_advisor) same as everything else fastapiFlightCall() drives —
// no anon-key fallback, unlike the legacy edge-function path this panel
// otherwise still uses for search itself. Empty query (showDefaultsOnFocus's
// on-focus/on-clear call) never reaches the network — see
// DEFAULT_AIRPORT_SUGGESTIONS above for why.
function airportSuggestions(query: string) {
  if (!query) return Promise.resolve(DEFAULT_AIRPORT_SUGGESTIONS);
  return fastapiFlightAutosuggest(query, 8);
}

function renderAirportSuggestion(a: any) {
  return (
    <span>
      {a.city} — {a.airport_name} <span className="taw-muted">({a.airport_code})</span>
    </span>
  );
}

// TEMP toggle — flip to true to switch flight search onto the real TripSure
// data via FastAPI (fastapiFlightSearch()), same rollback pattern as
// HotelDesk.jsx's USE_REAL_HOTELS. Defaults false: unverified against live/
// preprod (see backend/app/services/flight_service.py's own "CONFIRMED
// LIVE (2026-08-07)" vs unconfirmed notes). SCOPE: search only — flip this
// back to false instantly if real data looks wrong; it does not affect
// offer selection (fare family/rules/ancillaries/seatmap, hold, reprice),
// which stays on the legacy flight-fares/flight-hold/flight-irrops/
// flight-shop edge functions regardless of this flag.
const USE_REAL_FLIGHTS = true;

// FlightFareDetail — Wave-1 flight DEPTH expander on a selected offer. Calls
// the DEDICATED flight-fares function (NOT data-read) for fare_family
// (FLT-018/019), fare_rules (FLT-020/021), ancillaries (FLT-022) and seatmap
// (FLT-023). All SELL-ONLY: the function strips offer net before deriving any
// shop surface, so this view never carries supplier net cost. Each sub-surface
// lazy-loads once and is cached locally.
function FlightFareDetail(props: any) {
  const offer = props.offer || {};
  const [sub, setSub] = useState("fare_family");
  const [cache, setCache] = useState<any>({});
  const [loading, setLoading] = useState<any>({});
  const [errs, setErrs] = useState<any>({});

  function load(action: string) {
    if (cache[action] || loading[action]) return;
    setLoading((l: any) => ({ ...l, [action]: true }));
    const body: any = { action: action, offer_id: offer.id };
    if (props.memberId) body.member_id = props.memberId;
    if (props.advisorId) body.advisor_id = props.advisorId;
    flightFares(body)
      .then((r: any) => {
        setCache((c: any) => ({ ...c, [action]: r || {} }));
        setLoading((l: any) => ({ ...l, [action]: false }));
      })
      // Demo-data fallback, same reasoning as FlightDesk's run() above —
      // no backend reachable locally, so fall back to the captured fixture
      // instead of just showing an error for every fare-detail sub-tab.
      .catch(() => {
        setCache((c: any) => ({ ...c, [action]: mockFlightFares(offer.id, action) }));
        setLoading((l: any) => ({ ...l, [action]: false }));
      });
  }
  useEffect(() => {
    load(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  function Tab(key: string, label: string) {
    return (
      <button className={cx("taw-dx-tab", sub === key && "is-on")} onClick={() => setSub(key)}>
        {label}
      </button>
    );
  }
  const data = cache[sub];
  const busy = loading[sub];
  const err = errs[sub];

  function body() {
    if (busy) {
      return (
        <div className="taw-dx-body">
          <SkeletonRows count={3} height={14} />
        </div>
      );
    }
    if (err) {
      return (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={14} />
          {err}
        </div>
      );
    }
    if (!data) return null;
    if (sub === "fare_family") {
      const ff = data.fare_family || {};
      const fams = ff.grid || ff.families || [];
      return (
        <div>
          <div className="taw-dx-grid">
            {fams.map((f: any, i: number) => {
              const feats: string[] = [];
              if (f.checkedBagKg != null) feats.push(f.checkedBagKg ? f.checkedBagKg + "kg checked" : "No checked bag");
              if (f.cabinBagKg != null) feats.push(f.cabinBagKg + "kg cabin");
              if (f.seatSelection) feats.push("Seat: " + f.seatSelection);
              feats.push(f.changeable === false ? "Non-changeable" : "Changeable" + (f.changeable === "fee" ? " (fee)" : ""));
              feats.push(f.refundable ? "Refundable" : "Non-refundable");
              if (f.miles) feats.push("Miles " + f.miles);
              return (
                <div key={i} className={cx("taw-dx-fam", f.recommended && "is-rec")}>
                  <h5>{f.name || f.code || "Fare " + (i + 1)}</h5>
                  <div className="px ta-num">
                    {inr(f.sell != null ? f.sell : f.price != null ? f.price : 0)}
                    {f.sellDelta || f.upsellDelta ? (
                      <small style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6 }}>
                        +{inr(f.sellDelta || f.upsellDelta)}
                      </small>
                    ) : null}
                  </div>
                  <ul>
                    {feats.slice(0, 6).map((a, j) => (
                      <li key={j}>
                        <Icon name="check" size={11} />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {ff.provenance || ff.source ? (
            <div className="taw-dx-prov">
              Source:{" "}
              {ff.source ||
                (typeof ff.provenance === "string" ? ff.provenance : (ff.provenance && (ff.provenance.source || ff.provenance.note)) || "unknown")}
              {ff.freshness ? " · " + ff.freshness : ""}
            </div>
          ) : null}
        </div>
      );
    }
    if (sub === "fare_rules") {
      const fr = data.fare_rules || {};
      const cats: any[] = [];
      if (fr.fareBasis) cats.push({ label: "Fare basis", text: fr.fareBasis + (fr.refundable ? " · refundable" : " · non-refundable") });
      Object.keys(fr).forEach((k) => {
        const v = fr[k];
        if (v && typeof v === "object" && (v.title || v.note || v.non_refundable_note)) {
          const bits: string[] = [];
          if (v.non_refundable_note) bits.push(v.non_refundable_note);
          if (v.note) bits.push(v.note);
          if (v.no_show_inr != null) bits.push("No-show: " + inr(v.no_show_inr));
          if (v.before_departure_inr != null) bits.push("Before departure: " + inr(v.before_departure_inr));
          if (Array.isArray(v.bands))
            bits.push(
              v.bands
                .map((b: any) => (b.window || b.label || "") + (b.fee_inr != null ? " " + inr(b.fee_inr) : b.penalty_inr != null ? " " + inr(b.penalty_inr) : ""))
                .join("; ")
            );
          cats.push({ label: v.title || k.replace(/_/g, " "), text: bits.filter(Boolean).join(" · ") || "See airline rules." });
        }
      });
      return (
        <div>
          {cats.map((rc, i) => (
            <div key={i} className="taw-dx-rule">
              <div className="k">{rc.label}</div>
              <div className="v">{rc.text}</div>
            </div>
          ))}
          {fr.provenance || fr.source ? (
            <div className="taw-dx-prov">
              Provenance:{" "}
              {fr.source ||
                (typeof fr.provenance === "string" ? fr.provenance : (fr.provenance && (fr.provenance.source || fr.provenance.note)) || "unknown")}
              {fr.freshness ? " · " + fr.freshness : ""}
            </div>
          ) : null}
        </div>
      );
    }
    if (sub === "ancillaries") {
      const anc = data.ancillaries || {};
      const buckets = Array.isArray(anc) ? [{ name: "", items: anc }] : Object.keys(anc).map((k) => ({ name: k, items: anc[k] }));
      let any = false;
      const out = buckets.map((bk: any, bi: number) => {
        if (!Array.isArray(bk.items) || !bk.items.length) return null;
        any = true;
        return (
          <div key={bi} style={{ marginBottom: 8 }}>
            {bk.name ? (
              <div className="taw-dx-prov" style={{ marginBottom: 4, textTransform: "capitalize" }}>
                {bk.name}
              </div>
            ) : null}
            {bk.items.map((a: any, i: number) => (
              <div key={i} className="taw-dx-anc">
                <span className="lab">{(a.name || a.code || a.type || "Item") + (a.emd_eligible ? " · EMD" : "")}</span>
                <span className="px ta-num">{a.sell != null ? inr(a.sell) : "—"}</span>
              </div>
            ))}
          </div>
        );
      });
      return any ? <div>{out}</div> : <Empty icon={<Icon name="luggage" size={22} />}>No ancillaries for this fare.</Empty>;
    }
    if (sub === "seatmap") {
      const sm = data.seatmap || {};
      const segs = sm.segments || [];
      return segs.length ? (
        <div>
          {segs.map((seg: any, si: number) => {
            const rows = seg.rows || [];
            return (
              <div key={si} style={{ marginBottom: 12 }}>
                <div className="taw-dx-prov" style={{ marginBottom: 6 }}>
                  {(seg.segment || "") + (seg.flightNo ? " · " + seg.flightNo : "")}
                </div>
                <div className="taw-dx-seatmap">
                  {rows.slice(0, 16).map((rw: any, ri: number) => (
                    <div key={ri} className="taw-dx-seatrow">
                      <span style={{ width: 18, fontSize: 9, color: "var(--muted)" }}>{rw.row}</span>
                      {(rw.seats || []).map((s: any, k: number) => {
                        const occ = !!s.occupied;
                        const prem = !occ && (s.sell > 0 || s.type === "preferred" || s.exit_row);
                        return (
                          <span
                            key={k}
                            className={cx("taw-dx-seat", occ && "occ", prem && "prem")}
                            title={(s.seat || "") + (s.sell ? " · " + inr(s.sell) : occ ? " · occupied" : "")}
                          >
                            {String(s.seat || "").replace(/^\d+/, "")}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Icon name="flight" size={22} />}>No seat map available.</Empty>
      );
    }
    return null;
  }

  return (
    <div className="taw-dx">
      <div className="taw-dx-tabs">
        {Tab("fare_family", "Fare families")}
        {Tab("fare_rules", "Fare rules")}
        {Tab("ancillaries", "Ancillaries")}
        {Tab("seatmap", "Seat map")}
      </div>
      {body()}
    </div>
  );
}

export function FlightDesk(props: any) {
  const member = props.member;
  const [form, setForm] = useState({
    originCode: "DEL",
    destCode: "DXB",
    date: todayISO(21),
    // returnDate (2026-09-02) — round-trip support, new: previously this
    // desk was one-way only (a single `date`, no return leg anywhere in
    // state or in the search params below). Defaults a week after the
    // default departure so it's never invalid (before departure) out of
    // the box.
    returnDate: todayISO(28),
    pax: (member && member.preferences && member.preferences.pax) || 2,
    cabin: (member && member.preferences && member.preferences.cabin) || "economy",
  });
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  // Shopping controls (FLT-011 filters / FLT-012 sort) — applied client-side
  // over the offers the search adapter returns. Reset whenever a new search runs.
  const [view, setView] = useState({ sort: "best", stops: "any", refundable: false, carrier: "all", depWindow: "any" });
  function setV(k: string, v: any) {
    setView((f) => ({ ...f, [k]: v }));
  }
  // Per-offer fare-detail expander (Wave-1 flight-fares). Only one open at a time.
  const [openOffer, setOpenOffer] = useState<any>(null);
  function toggleDetail(id: any) {
    setOpenOffer((cur: any) => (cur === id ? null : id));
  }
  // includeNearbyDates (2026-09-02) — replaces the earlier "Compare nearby
  // dates" price-matrix link entirely (that whole flight-shop date_matrix
  // flow — matrix/matrixBusy/loadMatrix — is gone). Per direct request:
  // a plain checkbox before the Search button; when checked, the search
  // ITSELF pulls flights from ±3 days around the chosen date, not just a
  // price comparison you then have to act on separately.
  const [includeNearbyDates, setIncludeNearbyDates] = useState(false);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // swapOrigin() — the Switch button between From/To (2026-09-02).
  function swapOrigin() {
    setForm((f) => ({ ...f, originCode: f.destCode, destCode: f.originCode }));
  }

  // offsetDateStr(dateStr, days) — a date-string offset from an ARBITRARY
  // base date, unlike advisorHelpers' todayISO() which only offsets from
  // today. Needed for building the ±3-day nearby-dates window around
  // whatever date the advisor actually chose.
  function offsetDateStr(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // fetchOffersForDate(dateStr) — the real API call for ONE date, factored
  // out of run() so it can be fired once (normal search) or in parallel
  // across ±3 days (includeNearbyDates checked) without duplicating the
  // USE_REAL_FLIGHTS branch.
  function fetchOffersForDate(dateStr: string) {
    const base: any = {
      originCode: form.originCode.toUpperCase().trim(),
      destCode: form.destCode.toUpperCase().trim(),
      date: dateStr,
      returnDate: form.returnDate,
      pax: Number(form.pax) || 1,
      cabin: form.cabin,
    };
    if (USE_REAL_FLIGHTS) return fastapiFlightSearch(base);
    if (member && member.id) base.member_id = member.id;
    if (props.advisorId) base.advisor_id = props.advisorId;
    return searchFlights(base);
  }

  // run(dateOverride?) — 2026-09-02: takes an optional explicit date, and
  // now ALSO fires ±3 extra searches when includeNearbyDates is checked,
  // merging every date's real offers into one list (each offer tagged
  // with `_searchDate` so FlightResults can show which day it's for).
  // Replaces the earlier "Compare nearby dates" price-matrix flow
  // entirely — that showed only an aggregate price per date and required
  // a second click to actually search it; this pulls real flights for
  // every date in one action.
  function run(dateOverride?: string) {
    const searchDate = dateOverride || form.date;
    setErr(null);
    setLoading(true);
    setRes(null);
    setOpenOffer(null);
    setView({ sort: "best", stops: "any", refundable: false, carrier: "all", depWindow: "any" });

    const dates = includeNearbyDates ? [-3, -2, -1, 0, 1, 2, 3].map((d) => offsetDateStr(searchDate, d)) : [searchDate];

    Promise.allSettled(dates.map((dt) => fetchOffersForDate(dt).then((r: any) => ({ dt, r }))))
      .then((results) => {
        const ok = results.filter((x: any) => x.status === "fulfilled").map((x: any) => x.value);
        if (!ok.length) {
          // Every date's real call failed — no backend reachable from
          // local dev, same as before. Falls back ONCE to the single
          // captured mock result set (2026-09-01) rather than showing N
          // identical copies of it stitched together across dates.
          setRes(MOCK_FLIGHT_SEARCH_RESPONSE);
          setLoading(false);
          toast("Live API unreachable — showing demo flight data", "error");
          return;
        }
        const merged: any[] = [];
        ok.forEach(({ dt, r }: any) => {
          ((r && r.offers) || []).forEach((o: any) => merged.push({ ...o, _searchDate: dt }));
        });
        setRes({ offers: merged, count: merged.length });
        setLoading(false);
        const acrossLabel = dates.length > 1 ? " across " + ok.length + " date" + (ok.length === 1 ? "" : "s") : "";
        toast(merged.length + " flight offers loaded" + acrossLabel, "success");
      });
  }

  // showResults (2026-09-02) — the form and the results are now mutually
  // exclusive views (results REPLACE the form, not sit below it), so
  // SearchDesksPanel can also grow the whole Search card to full height
  // only while there's something worth the room to show. Reported
  // upward via onExpandChange whenever it changes; SearchDesksPanel owns
  // the actual animated resize (see its own docblock).
  const showResults = loading || res != null;
  useEffect(() => {
    if (props.onExpandChange) props.onExpandChange(showResults);
  }, [showResults]);

  function backToSearch() {
    setRes(null);
    setErr(null);
  }

  const offers = (res && res.offers) || [];

  // formView / resultsView (2026-09-02) — mutually exclusive now: results
  // REPLACE the search form instead of appearing below it. The idle
  // "Set a route and search..." illustration is gone entirely — it was
  // only ever needed as filler under the form when there was nothing
  // else to show, and now the form itself simply IS what's shown until
  // there's something to search for.
  const formView = (
    <>
      <div className="taw-join-row" style={{ marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="From" htmlFor="taw-fl-origin">
            <AutosuggestInput
              className="taw-sharp-r"
              value={form.originCode}
              onChange={(v: any) => set("originCode", v)}
              onSelect={(a: any) => set("originCode", a.airport_code)}
              fetchSuggestions={airportSuggestions}
              renderSuggestion={renderAirportSuggestion}
              getKey={(a: any) => a.airport_code}
              showDefaultsOnFocus
              placeholder="DEL"
            />
          </Field>
        </div>
        <button type="button" className={cx("taw-input", "taw-join-btn")} onClick={swapOrigin} title="Switch From/To" aria-label="Switch From and To">
          <Icon name="swap" size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="To" htmlFor="taw-fl-dest">
            <AutosuggestInput
              className="taw-sharp-l"
              value={form.destCode}
              onChange={(v: any) => set("destCode", v)}
              onSelect={(a: any) => set("destCode", a.airport_code)}
              fetchSuggestions={airportSuggestions}
              renderSuggestion={renderAirportSuggestion}
              getKey={(a: any) => a.airport_code}
              showDefaultsOnFocus
              placeholder="DXB"
            />
          </Field>
        </div>
      </div>
      <div className="taw-join-row" style={{ marginBottom: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Departure" htmlFor="taw-fl-date">
            <input className="taw-input taw-sharp-r" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Arrival" htmlFor="taw-fl-return-date">
            <input
              className="taw-input taw-sharp-l"
              type="date"
              value={form.returnDate}
              min={form.date}
              onChange={(e) => set("returnDate", e.target.value)}
            />
          </Field>
        </div>
      </div>
      {/* Plain flex row, not .taw-row-3 (2026-09-02) — .taw-search-stack
          forces EVERY .taw-row-2/3/4 to a single column in this narrow
          panel (see its own rule below), which was silently stacking
          Pax/Cabin/the Search button vertically instead of the intended
          side-by-side row. Pax/Cabin get their own gapped (NOT joined —
          that treatment is only for From/To and Departure/Arrival) row;
          the Search button moved to its own full-width row below. */}
      <div style={{ display: "flex", gap: 12, marginBottom: 13 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Pax" htmlFor="taw-fl-pax">
            <input className="taw-input" type="number" min={1} value={form.pax} onChange={(e) => set("pax", e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field label="Cabin">
            <Dropdown
              value={form.cabin}
              options={CABIN_OPTIONS}
              onChange={(v: any) => set("cabin", v)}
              ariaLabel="Cabin"
              triggerClassName={cx("taw-input", "taw-select-dropdown")}
            />
          </Field>
        </div>
      </div>
      {/* includeNearbyDates checkbox (2026-09-02) — replaces the earlier
          "Compare nearby dates" price-matrix link+strip entirely. When
          checked, run() (above) fires ±3 extra real searches and merges
          every date's actual offers into the results list, instead of
          showing a separate price-only calendar the advisor had to act
          on with a second click. */}
      <label className="taw-checkrow" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={includeNearbyDates} onChange={(e) => setIncludeNearbyDates(e.target.checked)} />
        Include nearby dates (±3 days)
      </label>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <button className="taw-btn taw-btn--primary taw-btn--brown taw-btn--block" disabled={loading} onClick={() => run()}>
          {loading ? <Spinner /> : <Icon name="search" size={16} />}
          {loading ? "Searching…" : "Search Flights"}
        </button>
      </div>
    </>
  );

  const resultsView = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        {/* Back-to-search (2026-09-02) — the only way out of results now
            that they've replaced the form; hidden while a search is still
            in flight, since there's nothing to "go back to" mid-request
            (the form isn't mounted). */}
        {!loading ? (
          <button className="taw-linkbtn" onClick={backToSearch}>
            <Icon name="chevron" size={12} style={{ transform: "rotate(90deg)" }} />
            New search
          </button>
        ) : null}
        <span className="taw-muted" style={{ fontSize: 12 }}>
          {form.originCode} → {form.destCode} · {form.date}
        </span>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {loading ? <SkeletonResults /> : null}
      {!loading && res ? (
        <FlightResults offers={offers} view={view} setV={setV} openOffer={openOffer} toggleDetail={toggleDetail} member={member} advisorId={props.advisorId} onAdd={props.onAdd} />
      ) : null}
    </>
  );

  return <div className="taw-fade-in">{showResults ? resultsView : formView}</div>;
}

// Split out of FlightDesk's render purely so the filter/sort math below reads
// as one block, mirroring the original's inline IIFE at the same spot.
function FlightResults({ offers, view, setV, openOffer, toggleDetail, member, advisorId, onAdd }: any) {
  const offNet = (o: any) => {
    const d = o.detail || {};
    return Number(o.base_net != null ? o.base_net : o.baseNet) || d.baseNet || 0;
  };
  // Carriers present in this result set, for the carrier filter.
  const carriers: any[] = [];
  const seen: any = {};
  offers.forEach((o: any) => {
    const d = o.detail || {};
    const c = d.airline;
    if (c && !seen[c]) {
      seen[c] = 1;
      carriers.push({ code: c, name: d.airlineName || c });
    }
  });
  // FLT-011 — filter.
  let shown = offers.filter((o: any) => {
    const d = o.detail || {};
    if (view.stops === "nonstop" && d.stops !== 0) return false;
    if (view.stops === "max1" && (d.stops || 0) > 1) return false;
    if (view.refundable && !d.refundable) return false;
    if (view.carrier !== "all" && d.airline !== view.carrier) return false;
    if (view.depWindow !== "any") {
      const hh = Number(String(d.depTime || "").split(":")[0]);
      const inWin =
        view.depWindow === "morning"
          ? hh >= 5 && hh < 12
          : view.depWindow === "afternoon"
          ? hh >= 12 && hh < 17
          : view.depWindow === "evening"
          ? hh >= 17 && hh < 22
          : hh >= 22 || hh < 5; // night
      if (!inWin) return false;
    }
    return true;
  });
  // FLT-012 — sort. 'best' = price normalised + duration penalty.
  const minNet = Math.min.apply(null, offers.map(offNet).concat([Infinity]));
  const minDur = Math.min.apply(
    null,
    offers.map((o: any) => (o.detail || {}).durationMin || 9999).concat([Infinity])
  );
  const arrKey = (o: any) => {
    const t = (o.detail || {}).arrTime || "23:59";
    const p = t.split(":");
    return Number(p[0]) * 60 + Number(p[1] || 0);
  };
  shown = shown.slice().sort((a: any, b: any) => {
    const da = a.detail || {},
      db = b.detail || {};
    if (view.sort === "cheapest") return offNet(a) - offNet(b);
    if (view.sort === "fastest") return (da.durationMin || 9999) - (db.durationMin || 9999);
    if (view.sort === "earliest") return arrKey(a) - arrKey(b);
    // best: weighted price (70%) + duration (30%), each normalised to its min.
    const sa = 0.7 * (offNet(a) / (minNet || 1)) + 0.3 * ((da.durationMin || minDur) / (minDur || 1));
    const sb = 0.7 * (offNet(b) / (minNet || 1)) + 0.3 * ((db.durationMin || minDur) / (minDur || 1));
    return sa - sb;
  });
  const stopBtn = (val: string, label: string) => (
    <button className={"taw-seg" + (view.stops === val ? " is-on" : "")} onClick={() => setV("stops", val)}>
      {label}
    </button>
  );
  return (
    <div>
      {offers.length ? (
        <div className="taw-shopbar">
          <div className="taw-segrp">
            {stopBtn("any", "All")}
            {stopBtn("nonstop", "Non-stop")}
            {stopBtn("max1", "≤ 1 stop")}
          </div>
          <button
            className={"taw-toggle" + (view.refundable ? " is-on" : "")}
            onClick={() => setV("refundable", !view.refundable)}
            aria-pressed={view.refundable ? "true" : "false"}
          >
            <Icon name="shield" size={13} />
            Refundable
          </button>
          <select
            className="taw-select taw-select--sm"
            value={view.depWindow}
            aria-label="Filter by departure time"
            onChange={(e) => setV("depWindow", e.target.value)}
          >
            <option value="any">Any time</option>
            <option value="morning">Morning 05–12</option>
            <option value="afternoon">Afternoon 12–17</option>
            <option value="evening">Evening 17–22</option>
            <option value="night">Night 22–05</option>
          </select>
          {carriers.length > 1 ? (
            <select
              className="taw-select taw-select--sm"
              value={view.carrier}
              aria-label="Filter by carrier"
              onChange={(e) => setV("carrier", e.target.value)}
            >
              <option value="all">All carriers</option>
              {carriers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="taw-shopbar-sp" />
          <label className="taw-sortlab">Sort</label>
          <select className="taw-select taw-select--sm" value={view.sort} aria-label="Sort offers" onChange={(e) => setV("sort", e.target.value)}>
            <option value="best">Best</option>
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
            <option value="earliest">Earliest arrival</option>
          </select>
        </div>
      ) : null}
      {offers.length ? (
        <div className="taw-shopcount">
          Showing {shown.length} of {offers.length} offers
        </div>
      ) : null}
      <div className="taw-results">
        {shown.length ? (
          shown.map((o: any) => {
            const d = o.detail || {};
            const net = offNet(o);
            const brand = fareBrand(d);
            const isOpen = openOffer === o.id;
            return (
              <div key={o.id + (o._searchDate || "")} className="taw-res" style={{ display: "block" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                  <div className="taw-res-main">
                    <div className="taw-res-title">
                      <Icon name="flight" size={18} /> {d.airlineName || d.airline || "Flight"} <span className="taw-muted">{d.flightNo || ""}</span>
                      {/* Only present when includeNearbyDates merged multiple
                          dates' offers into one list (2026-09-02) — labels
                          which day this particular offer is for. */}
                      {o._searchDate ? <span className="taw-chip taw-chip--dom">{fmtDate(o._searchDate)}</span> : null}
                      {o.international ? <span className="taw-chip taw-chip--intl">INTL</span> : <span className="taw-chip taw-chip--dom">DOM</span>}
                      {brand ? <span className="taw-chip taw-chip--fare">{brand}</span> : null}
                      {d.refundable ? <span className="taw-chip taw-chip--ref">Refundable</span> : <span className="taw-chip taw-chip--noref">Non-ref</span>}
                    </div>
                    <div className="taw-res-sub">
                      <span>
                        <b>{(d.originCode || "") + " → " + (d.destCode || "")}</b>
                      </span>
                      {d.depTime ? (
                        <span className="taw-icrow">
                          <Icon name="clock" size={13} />
                          {d.depTime + " – " + (d.arrTime || "")}
                        </span>
                      ) : null}
                      {d.duration ? <span>{d.duration}</span> : null}
                      {d.stops != null ? <span>{d.stops === 0 ? "Non-stop" : d.stops + " stop"}</span> : null}
                      {d.baggageKg ? (
                        <span className="taw-icrow">
                          <Icon name="luggage" size={13} />
                          {d.baggageKg + "kg"}
                        </span>
                      ) : null}
                    </div>
                    <button className="taw-linkbtn" onClick={() => toggleDetail(o.id)} aria-expanded={isOpen ? "true" : "false"}>
                      <Icon name="chevron" size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: ".15s" }} />
                      {isOpen ? "Hide fare detail" : "Fare detail · families · rules · seats"}
                    </button>
                  </div>
                  <div className="taw-res-side">
                    <div className="taw-res-net ta-num">
                      {inr(net)}
                      <small>net cost</small>
                    </div>
                    <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={() => onAdd(flightCartItem(o))}>
                      <Icon name="plus" size={13} />
                      Add
                    </button>
                  </div>
                </div>
                {isOpen ? <FlightFareDetail offer={o} memberId={member && member.id} advisorId={advisorId} /> : null}
              </div>
            );
          })
        ) : (
          <Empty icon={<Icon name="flight" size={28} />}>
            {offers.length ? "No offers match these filters — widen them to see more." : "No flight offers for this query."}
          </Empty>
        )}
      </div>
    </div>
  );
}
