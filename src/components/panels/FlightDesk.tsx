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
import { Dropdown, Empty, Field, Spinner, SkeletonRows, Icon, SleekScroll } from "../ui";
import { buildMockFlightOffers, classifyStopType, mockFlightFares } from "../../lib/mockFlightSearch";
import { boundFromDateRange } from "../../lib/itineraryFromCart";

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
// CHIP_WINDOW_SIZE (2026-09-02) — how many date chips show at once in the
// nearby-dates row; </> buttons page through the rest instead of scrolling.
const CHIP_WINDOW_SIZE = 5;

const CABIN_OPTIONS = [
  { key: "economy", label: "Economy" },
  { key: "premium_economy", label: "Premium Economy" },
  { key: "business", label: "Business" },
  { key: "first", label: "First" },
];

// normalizeCabin (2026-09-03, flow-testing hurdle) — member.preferences.cabin
// is stored capitalized ("Business") for human display (Traveller Profile
// etc.); CABIN_OPTIONS' keys are lowercase/snake_case. Seeding form.cabin
// straight from the preference without this returned a value matching NO
// option, so the Cabin Dropdown rendered its trigger blank — surfaced live
// testing Kabir Shah (preferences.cabin: "Business").
function normalizeCabin(pref: any): string | null {
  if (!pref) return null;
  const key = String(pref).toLowerCase().replace(/\s+/g, "_");
  return CABIN_OPTIONS.some((o) => o.key === key) ? key : null;
}

// CITY_AIRPORT_CODES / codeFromAsk (2026-09-04, flow-testing hurdle) — the
// desk always opened on hardcoded DEL→DXB regardless of what the selected
// enquiry actually asked for, so building Priya's Goa itinerary meant
// manually retyping BOM→GOI every time before Search did anything useful.
// enquiry.ask.from is a display string ("Mumbai (BOM)") that already
// carries the code in parens; ask.destinations[] is a bare city name with
// no code, so it needs this lookup — covers exactly the mock enquiries'
// cities for now, same "match the mock data" scope as the rest of this
// pass, not a real airport directory.
const CITY_AIRPORT_CODES: Record<string, string> = {
  delhi: "DEL",
  mumbai: "BOM",
  singapore: "SIN",
  goa: "GOI",
  dubai: "DXB",
};
function codeFromAsk(text: any): string | null {
  if (!text) return null;
  const paren = String(text).match(/\(([A-Z]{3})\)/);
  if (paren) return paren[1];
  return CITY_AIRPORT_CODES[String(text).trim().toLowerCase()] || null;
}

// Results filter-strip options (2026-09-02) — every SORT_OPTIONS entry
// carries the SAME icon so the Sort dropdown's trigger always shows a
// sort icon regardless of which option is currently picked (Dropdown
// shows the CURRENT option's own icon — giving them all the same one is
// what makes it "always visible" without needing a separate prop for it).
const SORT_OPTIONS = [
  { key: "best", label: "Best", icon: "sort" },
  { key: "cheapest", label: "Cheapest", icon: "sort" },
  { key: "fastest", label: "Fastest", icon: "sort" },
  { key: "earliest", label: "Earliest arrival", icon: "sort" },
];
const DEP_WINDOW_OPTIONS = [
  { key: "any", label: "Any time", icon: "clock" },
  { key: "morning", label: "Morning 05–12", icon: "sunrise" },
  { key: "afternoon", label: "Afternoon 12–17", icon: "sun" },
  { key: "evening", label: "Evening 17–22", icon: "sunset" },
  { key: "night", label: "Night 22–05", icon: "moon" },
];
// STOPS_OPTIONS (2026-09-02) — matches classifyStopType() in
// mockFlightSearch.ts, not a raw stop count: "direct" (technical/fuel
// stop, same flight number, no plane change) is genuinely different from
// "connecting" (a real layover, different flight/aircraft) — a bare
// "≤1 stop" filter couldn't tell those apart.
const STOPS_OPTIONS = [
  { key: "any", label: "Any stops" },
  { key: "nonstop", label: "Non-stop" },
  { key: "direct", label: "Direct (technical stop)" },
  { key: "connecting", label: "Connecting" },
  { key: "overnight", label: "Overnight layover" },
  { key: "multi", label: "Multiple connections" },
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
  const ask = props.enquiry && props.enquiry.ask;
  const [form, setForm] = useState({
    // originCode (2026-09-06) — Aanya's concierge chat never asks where
    // the member is departing FROM, only the destination (confirmed
    // against enquiry_service.get_traveller_profile's `ask` shape — no
    // `from` field exists for a real enquiry, only for the mock ones
    // this codeFromAsk lookup was written against). "DEL" is a disclosed
    // assumption (Indian UHNI audience, Delhi as the default hub — see
    // CLAUDE.md), same one itinerary_service.py's flight draft uses when
    // origin is unknown, not a silent guess unique to this component.
    originCode: (ask && codeFromAsk(ask.from)) || "DEL",
    // destCode (2026-09-06, fixed) — used to default to hardcoded "DXB"
    // whenever codeFromAsk() couldn't resolve a code synchronously (which
    // was EVERY real enquiry: its CITY_AIRPORT_CODES dict only ever
    // covered the mock enquiries' five cities — see its own scope note).
    // Confirmed live: a London enquiry opened Search on Dubai regardless.
    // Left blank here now; the effect below resolves it for real via
    // /flights/autosuggest the instant this desk mounts for a real
    // destination the static dict doesn't cover.
    destCode: (ask && ask.destinations && codeFromAsk(ask.destinations[0])) || "",
    // date/returnDate (2026-09-10, fixed) — used to be hardcoded to
    // "today + 21 days" regardless of which enquiry was open, same
    // "always DEL→DXB" class of bug destCode/originCode above were
    // already fixed for (confirmed live: Switzerland enquiry with real
    // dates on file, 2027-01-10 to 2027-01-18, still opened Search on an
    // unrelated October 2026 default). boundFromDateRange (shared with
    // blankItinerary's own seeding, itineraryFromCart.ts) now parses
    // ask.dateRange for real — including the ISO-format dates v2/v3/v4
    // actually store, not just v1's "D – D Mon" shape. Falls back to the
    // original today+21/one-way defaults whenever ask.dateRange is
    // missing or genuinely unparseable, same as before.
    date: boundFromDateRange(ask && ask.dateRange, 2026)?.startIso || todayISO(21),
    // returnDate (2026-09-02) — round-trip support: EMPTY by default,
    // one-way. Whether a search is round-trip or one-way is decided
    // purely by whether this field has a value in it AT THE MOMENT
    // Search is clicked (see run()) — not a separate toggle. Now seeded
    // from the enquiry's real end date when boundFromDateRange resolved
    // one (see date, above) — still empty/one-way whenever it didn't.
    returnDate: boundFromDateRange(ask && ask.dateRange, 2026)?.endIso || "",
    // pax (2026-09-10, fixed) — used to default from member.preferences.pax,
    // a member-level field that doesn't exist for a real member; confirmed
    // live as a real bug, not the "solo trips only" scope this comment used
    // to claim (a real enquiry can and does have 2+ travellers — Traveller
    // Profile already shows "2 adults" correctly via paxLabel(ask.persons)
    // for the exact same enquiry Search silently defaulted to 1 pax on).
    // Same source, same pattern as Traveller Profile's own paxLabel —
    // ask.persons.length is the enquiry's real traveller count.
    pax: (ask && ask.persons && ask.persons.length) || 1,
    cabin: normalizeCabin(member && member.preferences && member.preferences.cabin) || "economy",
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
  // leg (2026-09-02) — which direction's offers are currently shown, for
  // a round-trip search. Reset to "outbound" on every new run().
  const [leg, setLeg] = useState<"outbound" | "return">("outbound");
  // selectedChipDate (2026-09-02) — when includeNearbyDates was checked,
  // clicking a date chip filters the current leg's already-fetched
  // offers down to just that day (client-side, no refetch — every date
  // in the window was already fetched). null = show every date merged.
  const [selectedChipDate, setSelectedChipDate] = useState<string | null>(null);
  // chipWindowStart (2026-09-02) — the date-chip row is no longer a
  // scrolling strip; it shows a fixed-size window of CHIP_WINDOW_SIZE
  // chips at a time, paged with the </> buttons flanking it, per direct
  // request. Reset to 0 on every new run() and on every leg switch.
  const [chipWindowStart, setChipWindowStart] = useState(0);

  // defaultChipDateFor(legName) — the date that should be pre-selected
  // when landing on a leg: the actual date the advisor searched for that
  // leg (departure date for outbound, return date for return), not
  // "every date merged" — per direct request.
  function defaultChipDateFor(legName: "outbound" | "return") {
    return legName === "outbound" ? form.date : form.returnDate;
  }

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Real destination-code resolution (2026-09-06) — resolves destCode
  // against the SAME real /flights/autosuggest endpoint the From/To
  // fields already query for suggestions, instead of hand-maintaining an
  // ever-growing static city list. Only runs once per mount (this desk
  // is already keyed by enquiry — see WorkbenchTab.tsx's own comment on
  // `key={selEnqId}` — so a fresh mount is exactly "enquiry just
  // changed"), and only when codeFromAsk() couldn't resolve one
  // synchronously above; a code that WAS resolved synchronously (a mock
  // enquiry, or a real destination string that already carries "(XXX)")
  // is left alone.
  useEffect(() => {
    const destName = ask && ask.destinations && ask.destinations[0];
    if (!destName || codeFromAsk(destName)) return;
    let cancelled = false;
    fastapiFlightAutosuggest(destName, 5)
      .then((rows: any[]) => {
        if (cancelled || !rows || !rows.length) return;
        const best = rows.reduce((a: any, b: any) => ((b.popularity_score || 0) > (a.popularity_score || 0) ? b : a));
        if (best && best.airport_code) set("destCode", best.airport_code);
      })
      .catch(() => {
        // No real code found — destCode stays blank rather than a
        // fabricated/wrong guess; the advisor can still type one in.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // fetchOffersForDate(dateStr, fromCode, toCode) — the real API call for
  // ONE date on ONE leg, factored out of run() so it can be fired once
  // (normal search), in parallel across ±3 days (includeNearbyDates), and
  // for EITHER direction (outbound origin→dest, or return dest→origin)
  // without duplicating the USE_REAL_FLIGHTS branch. Each leg is its own
  // one-way-shaped query — round-trip here means "outbound and return
  // fetched and shown separately," not a single combined round-trip
  // search param.
  function fetchOffersForDate(dateStr: string, fromCode: string, toCode: string) {
    const base: any = {
      originCode: fromCode,
      destCode: toCode,
      date: dateStr,
      pax: Number(form.pax) || 1,
      cabin: form.cabin,
    };
    if (USE_REAL_FLIGHTS) return fastapiFlightSearch(base);
    if (member && member.id) base.member_id = member.id;
    if (props.advisorId) base.advisor_id = props.advisorId;
    return searchFlights(base);
  }

  // fetchLeg(dates, fromCode, toCode) — runs fetchOffersForDate across
  // every date in the window for one leg, merges into one array (each
  // offer tagged with `_searchDate`), and falls back to
  // buildMockFlightOffers PER DATE (not one shared static dataset) only
  // if every real call for this leg failed — so different dates/legs
  // actually look different from each other when compared, per direct
  // request, instead of the same canned data reappearing everywhere.
  function fetchLeg(dates: string[], fromCode: string, toCode: string) {
    return Promise.allSettled(dates.map((dt) => fetchOffersForDate(dt, fromCode, toCode).then((r: any) => ({ dt, r })))).then((results) => {
      const ok = results.filter((x: any) => x.status === "fulfilled").map((x: any) => x.value);
      if (!ok.length) {
        const merged: any[] = [];
        dates.forEach((dt) => {
          const mock = buildMockFlightOffers({ originCode: fromCode, destCode: toCode, date: dt, pax: Number(form.pax) || 1, cabin: form.cabin });
          mock.offers.forEach((o: any) => merged.push({ ...o, _searchDate: dt }));
        });
        return { offers: merged, usedMock: true };
      }
      const merged: any[] = [];
      ok.forEach(({ dt, r }: any) => {
        ((r && r.offers) || []).forEach((o: any) => merged.push({ ...o, _searchDate: dt }));
      });
      return { offers: merged, usedMock: false };
    });
  }

  // run(dateOverride?) — 2026-09-02: fetches the outbound leg always, and
  // ALSO the return leg (reversed route, form.returnDate's own ±3-day
  // window) when form.returnDate has a value AT THIS MOMENT — that's the
  // one-way-vs-round-trip decision, made fresh on every search rather
  // than a separate persistent toggle. Both legs kept SEPARATE in
  // `res` (not merged together) so the departure/return switcher below
  // can show genuinely different results per leg.
  function run(dateOverride?: string) {
    const searchDate = dateOverride || form.date;
    const roundTrip = !!(form.returnDate && form.returnDate.trim());
    setErr(null);
    setLoading(true);
    setRes(null);
    setOpenOffer(null);
    setLeg("outbound");
    setSelectedChipDate(includeNearbyDates ? searchDate : null);
    setChipWindowStart(0);
    setView({ sort: "best", stops: "any", refundable: false, carrier: "all", depWindow: "any" });

    const originCode = form.originCode.toUpperCase().trim();
    const destCode = form.destCode.toUpperCase().trim();
    const outboundDates = includeNearbyDates ? [-3, -2, -1, 0, 1, 2, 3].map((d) => offsetDateStr(searchDate, d)) : [searchDate];
    const returnDates = roundTrip ? (includeNearbyDates ? [-3, -2, -1, 0, 1, 2, 3].map((d) => offsetDateStr(form.returnDate, d)) : [form.returnDate]) : [];

    Promise.all([fetchLeg(outboundDates, originCode, destCode), roundTrip ? fetchLeg(returnDates, destCode, originCode) : Promise.resolve({ offers: [], usedMock: false })]).then(
      ([outboundResult, returnResult]) => {
        setRes({
          outbound: outboundResult.offers,
          return: roundTrip ? returnResult.offers : null,
          nearbyDates: includeNearbyDates,
          roundTrip,
        });
        setLoading(false);
        const anyMock = outboundResult.usedMock || returnResult.usedMock;
        const total = outboundResult.offers.length + returnResult.offers.length;
        toast((anyMock ? "Live API unreachable — showing demo flight data — " : "") + total + " flight offers loaded", anyMock ? "error" : "success");
      }
    );
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

  // activeLegOffers / offers (2026-09-02) — `leg` picks which of the two
  // separately-fetched result sets to look at; `selectedChipDate` (only
  // meaningful when res.nearbyDates) then filters THAT leg's offers down
  // to one day, client-side — every date in the window was already
  // fetched, so this never triggers a new request.
  const activeLegOffers = res ? (leg === "return" ? res.return || [] : res.outbound || []) : [];
  const offers = selectedChipDate ? activeLegOffers.filter((o: any) => o._searchDate === selectedChipDate) : activeLegOffers;
  // chipDates — the distinct dates actually fetched for the CURRENT leg,
  // in order, for the date-chip row (only rendered when res.nearbyDates).
  const chipDates = res ? Array.from(new Set(activeLegOffers.map((o: any) => o._searchDate))).sort() : [];

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
              placeholder="e.g. LHR"
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
    <div className="taw-results-view">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        {/* Edit search (2026-09-02, relabeled 2026-09-06) — the only way
            back to the From/To/date/cabin/pax fields now that results
            have replaced the form; hidden while a search is still in
            flight, since there's nothing to go back to mid-request (the
            form isn't mounted). Was icon-only labeled "New search" (per
            an earlier direct request removing its text label and the
            route/date summary line) — confirmed live that reads as
            "discard this search and start over," when backToSearch()
            actually does neither (form state is untouched, only
            res/err are cleared, so every field is still exactly as
            searched). Relabeled "Edit search" with its text back,
            specifically so it reads as inviting to click rather than
            a wipe — the actual bug behind "hard to adjust filters and
            re-search without fully backing out."  */}
        {!loading ? (
          <button className="taw-btn taw-btn--sm" onClick={backToSearch} aria-label="Edit search" title="Edit search">
            <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
            Edit search
          </button>
        ) : null}
        {/* Departure/Return leg switcher (2026-09-02) — for a round trip
            (res.roundTrip, decided by whether Arrival had a date in it
            when Search was clicked — see run()), two real tabs that show
            genuinely DIFFERENT result sets (res.outbound vs res.return),
            each fetched/generated independently. For a ONE-WAY search
            (per direct follow-up), still render the same pill container
            for visual consistency, but as a single inert "tab" with the
            route AND the searched date together (route · date) — there's
            nothing to switch to, so the second option just isn't there. */}
        {res ? (
          <div className="taw-leg-switch">
            <button
              className={cx("taw-leg-tab", leg === "outbound" && "is-active")}
              onClick={() => {
                setLeg("outbound");
                setSelectedChipDate(res.nearbyDates ? defaultChipDateFor("outbound") : null);
                setChipWindowStart(0);
              }}
            >
              {form.originCode} → {form.destCode}
              {!res.roundTrip ? " · " + fmtDate(form.date) : ""}
            </button>
            {res.roundTrip ? (
              <button
                className={cx("taw-leg-tab", leg === "return" && "is-active")}
                onClick={() => {
                  setLeg("return");
                  setSelectedChipDate(res.nearbyDates ? defaultChipDateFor("return") : null);
                  setChipWindowStart(0);
                }}
              >
                {form.destCode} → {form.originCode}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* Date-chip row (2026-09-02) — only when includeNearbyDates was
          checked at search time (res.nearbyDates), listing the dates
          actually fetched for the CURRENTLY ACTIVE leg. Clicking one
          filters down to just that day (client-side — every date's
          offers were already fetched, this never re-searches); clicking
          the already-selected one clears the filter back to "all dates".
          Paged with </> buttons instead of scrolling (2026-09-02, direct
          request) — CHIP_WINDOW_SIZE chips visible at a time. */}
      {res && res.nearbyDates && chipDates.length > 1 ? (
        <div className="taw-date-chips-row">
          <button
            type="button"
            className="taw-icon-btn"
            disabled={chipWindowStart === 0}
            onClick={() => setChipWindowStart((s) => Math.max(0, s - 1))}
            aria-label="Earlier dates"
          >
            <Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} />
          </button>
          <div className="taw-date-chips">
            {chipDates.slice(chipWindowStart, chipWindowStart + CHIP_WINDOW_SIZE).map((dt: any) => (
              <button
                key={dt}
                className={cx("taw-date-chip", selectedChipDate === dt && "is-active")}
                onClick={() => setSelectedChipDate((cur) => (cur === dt ? null : dt))}
              >
                {fmtDate(dt)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="taw-icon-btn"
            disabled={chipWindowStart + CHIP_WINDOW_SIZE >= chipDates.length}
            onClick={() => setChipWindowStart((s) => Math.min(chipDates.length - CHIP_WINDOW_SIZE, s + 1))}
            aria-label="Later dates"
          >
            <Icon name="chevron" size={16} style={{ transform: "rotate(-90deg)" }} />
          </button>
        </div>
      ) : null}
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {/* Real loading state (2026-09-06) — same Spinner + title/message
          pattern already built for Itinerary Builder's "Drafting your
          itinerary…" (WorkbenchTab.tsx), reused here for visual
          consistency rather than the previous bare 3-box skeleton, which
          read as the UI having frozen (no text, nothing explaining what
          was happening) during a real multi-second TripSure call. */}
      {loading ? (
        <div className="taw-itin-choose">
          <Spinner />
          <div className="title">Searching flights…</div>
          <div className="message">
            Looking up real fares for {form.originCode || "your origin"} → {form.destCode || "your destination"} — this takes a few seconds.
          </div>
        </div>
      ) : null}
      {!loading && res ? (
        <FlightResults offers={offers} view={view} setV={setV} openOffer={openOffer} toggleDetail={toggleDetail} member={member} advisorId={props.advisorId} onAdd={props.onAdd} />
      ) : null}
    </div>
  );

  return <div className="taw-fade-in taw-fdesk">{showResults ? resultsView : formView}</div>;
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
  // FLT-011 — filter. Stops now matches the REAL distinction (see
  // classifyStopType's own docblock in mockFlightSearch.ts) instead of a
  // raw stop count — "direct" (technical stop, same flight, no plane
  // change) is a genuinely different thing from "connecting" (a real
  // layover/plane change), which a bare "≤1 stop" count couldn't tell
  // apart. Works for real API offers too, not just mock ones — it only
  // reads `segments`/`stops`, both already part of the real shape.
  let shown = offers.filter((o: any) => {
    const d = o.detail || {};
    if (view.stops !== "any" && classifyStopType(d) !== view.stops) return false;
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
  const carrierOptions = [{ key: "all", label: "All carriers" }, ...carriers.map((c: any) => ({ key: c.code, label: c.name }))];
  return (
    <div className="taw-results-panel">
      {/* One horizontally-scrollable strip of dropdowns + a chip
          (2026-09-02, replacing the old mixed segmented-buttons/selects/
          labeled-select bar) — Sort (leading sort icon on every option,
          so the trigger always shows it regardless of which is picked) →
          Departure time → Carrier → Stops, then the Refundable chip. */}
      {offers.length ? (
        <div className="taw-filter-strip">
          <Dropdown value={view.sort} options={SORT_OPTIONS} onChange={(v: any) => setV("sort", v)} ariaLabel="Sort offers" triggerClassName="taw-filter-dd" hideOptionIcons />
          <Dropdown
            value={view.depWindow}
            options={DEP_WINDOW_OPTIONS}
            onChange={(v: any) => setV("depWindow", v)}
            ariaLabel="Filter by departure time"
            triggerClassName={cx("taw-filter-dd", "taw-filter-dd--wide")}
          />
          {carriers.length > 1 ? (
            <Dropdown value={view.carrier} options={carrierOptions} onChange={(v: any) => setV("carrier", v)} ariaLabel="Filter by carrier" triggerClassName="taw-filter-dd" />
          ) : null}
          <Dropdown value={view.stops} options={STOPS_OPTIONS} onChange={(v: any) => setV("stops", v)} ariaLabel="Filter by stops" triggerClassName="taw-filter-dd" />
          {/* Refundable as a chip (2026-09-02) — selected state swaps its
              icon to an X so it visibly reads as "click to remove this
              filter", not just a color change. */}
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
                      {/* net > 0, not just != null (2026-09-06) — offNet()'s
                          own fallback chain still bottoms out at a plain 0
                          when a real offer genuinely carries no price data
                          (rather than the "0" meaning "verified zero cost",
                          which is never actually true for a real fare) —
                          the root cause of "NET COST always shows ₹0" was
                          mapTripSureFlightOffer's PriceSummaries/
                          fareSourceCode casing (fixed in api.ts), but this
                          honest fallback stays regardless of that, for any
                          future case a real offer's price genuinely can't
                          be read. */}
                      {net > 0 ? inr(net) : "—"}
                      <small>net cost</small>
                    </div>
                    <button
                      className="taw-btn taw-btn--accent taw-btn--sm"
                      onClick={() => {
                        const others = shown.filter((x: any) => x.id !== o.id).slice(0, 2);
                        const alternatives = others.map((alt: any) => {
                          const ad = alt.detail || {};
                          return {
                            name: ad.airlineName || ad.airline || "Flight",
                            detail: [ad.duration, ad.cabin].filter(Boolean).join(" · "),
                            price: offNet(alt),
                            image: null,
                          };
                        });
                        onAdd(flightCartItem(o, alternatives));
                      }}
                    >
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
      </SleekScroll>
    </div>
  );
}
