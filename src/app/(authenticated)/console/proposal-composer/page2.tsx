"use client";
/* =============================================================================
 * TripAgent — src/app/lab/proposal-instinct/page.tsx
 * Customer-view itinerary template (2026-09-24), modeled on a reference
 * competitor build ("Instinct") the user shared: tabbed Plan/Days/Decisions,
 * a definition-list trip "shape," numbered narrative days, a reservations
 * timeline, honest "nothing is booked" framing repeated per tab — NOT a
 * literal clone of its content, only its structure/hierarchy/density, per
 * direct instruction. Editorial photo (2026-09-24, direct follow-up) sits
 * as a background BEHIND the header + title/subtitle/summary block only —
 * above the Plan/Days/Decisions tabs, not as its own separate banner row
 * the way Instinct places it (and not reused anywhere else on the page).
 * public/images/lab-hero-switzerland.jpg is a placeholder (Picsum,
 * deterministic seed) standing in for real destination photography —
 * swap for the real thing once that's sourced.
 *
 * TEMPLATE, not wired to real data yet (direct instruction, 2026-09-24:
 * "Dont worry about the data right now. This is a template. Data when
 * figured out, will change it later.") — content below is illustrative,
 * Switzerland/Kabir-Shah-flavored to match the rest of this app's existing
 * proposal mock, hardcoded in this file rather than pulled through
 * buildProposalTemplateData(). Now responsive at a real `(max-width:
 * 640px)` breakpoint (2026-09-24, direct follow-up — this replaced the
 * earlier dev-only manual Desktop/Mobile toggle once the mobile pass was
 * done); wiring into Proposal Composer is the remaining next step.
 *
 * New structural idea beyond the reference (direct instruction): every
 * flight/hotel choice shows ONE recommended pick + 2 alternatives, not a
 * single locked-in item — RecommendationGroup below.
 *
 * Lives under src/app/lab/ (gitignored, never shipped/committed) per this
 * app's own established comparison-prototype pattern — see
 * lab/queue-profile/page.tsx's own docblock.
 * ===========================================================================*/
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./lab.css";

// img() — a seeded placeholder photo (Picsum) standing in for real
// destination/property photography, same "template for now" scope as
// the hero (2026-09-24: "an image attached to the left of the card for
// each option"). Deterministic per name so the same option always shows
// the same image across re-renders.
function img(seed: string, w: number, h: number) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

// hotelPhoto() (2026-09-24, direct request: "change the placeholder
// images for the hotel cards") — real Unsplash hotel/resort photos
// instead of Picsum's arbitrary random images (which could land on
// anything — a forest, an object, a street). Each id below was fetched
// and visually checked before use (a real bedroom/pool/resort exterior,
// not guessed from the id alone). Still a placeholder standing in for
// real property photography, not any specific hotel's actual room.
function hotelPhoto(id: string, w: number, h: number) {
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=60`;
}

type FlightLeg = { depTime: string; depCity: string; arrTime: string; arrCity: string; flightNos: string; duration: string; cabin: string };
type Option = { name: string; detail: string; price: string; image: string; flight?: FlightLeg };
type RecGroup = { title: string; sub?: string; kind: "flight" | "hotel"; recommended: Option; alternatives: [Option, Option] };

const STAYS: RecGroup[] = [
  {
    title: "Zurich",
    sub: "2 nights",
    kind: "hotel",
    recommended: { name: "Widder Hotel", detail: "Old Town · 5-star · quiet courtyard rooms", price: "₹87,600", image: hotelPhoto("1611892440504-42a792e24d32", 400, 280) },
    alternatives: [
      { name: "Baur au Lac", detail: "Lakefront · 5-star · grander, less intimate", price: "₹96,200", image: hotelPhoto("1590490360182-c33d57733427", 160, 160) },
      { name: "Storchen Zürich", detail: "River view · 4-star · best value of the three", price: "₹61,400", image: hotelPhoto("1571003123894-1f0594d2b5d9", 160, 160) },
    ],
  },
  {
    title: "Lucerne",
    sub: "3 nights",
    kind: "hotel",
    recommended: {
      name: "Bürgenstock Resort",
      detail: "Lake View Suite · half board · funicular access",
      price: "₹1,14,300",
      image: hotelPhoto("1571896349842-33c89424de2d", 400, 280),
    },
    alternatives: [
      { name: "Palace Luzern", detail: "Lakefront classic · in-town, no funicular", price: "₹98,700", image: hotelPhoto("1520250497591-112f2f40a3f4", 160, 160) },
      { name: "Hotel Schweizerhof", detail: "Central · smaller rooms, walkable Old Town", price: "₹89,500", image: hotelPhoto("1582719478250-c89cae4dc85b", 160, 160) },
    ],
  },
  {
    title: "Zermatt",
    sub: "3 nights",
    kind: "hotel",
    recommended: {
      name: "Riffelalp Resort",
      detail: "Matterhorn Junior Suite · half board · rack railway to the village",
      price: "₹1,51,600",
      image: hotelPhoto("1445019980597-93fa8acb246c", 400, 280),
    },
    alternatives: [
      { name: "The Omnia", detail: "Cliffside design suite · adults-focused", price: "₹1,42,000", image: hotelPhoto("1566073771259-6a8506099945", 160, 160) },
      { name: "Mont Cervin Palace", detail: "Classic mountain view · in the village centre", price: "₹1,08,900", image: hotelPhoto("1631049307264-da0ec9d70304", 160, 160) },
    ],
  },
];

const FLIGHTS: RecGroup[] = [
  {
    title: "Outbound",
    sub: "Mumbai → Zurich",
    kind: "flight",
    recommended: {
      name: "Emirates",
      detail: "1 stop via Dubai · Business · 13h 20m",
      price: "₹2,24,800",
      image: img("emirates-outbound", 400, 280),
      flight: { depTime: "04:35", depCity: "Mumbai", arrTime: "12:25", arrCity: "Zurich", flightNos: "EK 501 · EK 87", duration: "13h 20m", cabin: "Business" },
    },
    alternatives: [
      {
        name: "Swiss Air",
        detail: "Nonstop · Business · 9h 05m",
        price: "₹2,41,000",
        image: img("swiss-air-outbound", 160, 160),
        flight: { depTime: "01:10", depCity: "Mumbai", arrTime: "06:15", arrCity: "Zurich", flightNos: "LX 148", duration: "9h 05m", cabin: "Business" },
      },
      {
        name: "Lufthansa",
        detail: "1 stop via Frankfurt · Business · 12h 40m",
        price: "₹2,05,400",
        image: img("lufthansa-outbound", 160, 160),
        flight: { depTime: "02:20", depCity: "Mumbai", arrTime: "11:00", arrCity: "Zurich", flightNos: "LH 761 · LH 1104", duration: "12h 40m", cabin: "Business" },
      },
    ],
  },
  {
    title: "Return",
    sub: "Zurich → Mumbai",
    kind: "flight",
    recommended: {
      name: "Emirates",
      detail: "1 stop via Dubai · Business · matches outbound fare family",
      price: "₹1,98,400",
      image: img("emirates-return", 400, 280),
      flight: { depTime: "13:40", depCity: "Zurich", arrTime: "23:55", arrCity: "Mumbai", flightNos: "EK 88 · EK 502", duration: "10h 15m", cabin: "Business" },
    },
    alternatives: [
      {
        name: "Swiss Air",
        detail: "Nonstop · Business · shortest return",
        price: "₹2,12,600",
        image: img("swiss-air-return", 160, 160),
        flight: { depTime: "22:35", depCity: "Zurich", arrTime: "07:15", arrCity: "Mumbai", flightNos: "LX 147", duration: "8h 40m", cabin: "Business" },
      },
      {
        name: "Air India",
        detail: "1 stop via Delhi · Business · lowest fare",
        price: "₹1,76,900",
        image: img("air-india-return", 160, 160),
        flight: { depTime: "15:05", depCity: "Zurich", arrTime: "04:20", arrCity: "Mumbai", flightNos: "AI 187 · AI 803", duration: "12h 15m", cabin: "Business" },
      },
    ],
  },
];

// `place` (2026-09-24, direct request) — which city each day belongs
// to, used to build the Days sub-tabs below. A day can genuinely belong
// to a place that isn't contiguous with its other days (Zurich here,
// at both the start AND the end) — the sub-tab filters by place, not
// by a single date range, so that's shown honestly rather than merged.
const DAYS = [
  { d: "Day 1 · Mon 12 Oct", t: "Arrive, settle in", place: "Zurich", body: "Nonstop-connecting business arrival into Zurich. Private transfer, Widder Hotel check-in. No plans for tonight.", image: img("day-1", 200, 200) },
  { d: "Day 2 · Tue 13 Oct", t: "Zurich, unhurried", place: "Zurich", body: "Old Town on foot, lakeside lunch, late-afternoon rest before an early Lucerne transfer tomorrow.", image: img("day-2", 200, 200) },
  { d: "Day 3 · Wed 14 Oct", t: "On to Lucerne", place: "Lucerne", body: "Scenic rail to Lucerne, funicular up to Bürgenstock. Lake View Suite check-in, dinner on the resort terrace.", image: img("day-3", 200, 200) },
  { d: "Day 4 · Thu 15 Oct", t: "Lake and mountains", place: "Lucerne", body: "Morning boat on Lake Lucerne, afternoon at leisure. Optional Pilatus or Rigi excursion if energy allows.", image: img("day-4", 200, 200) },
  { d: "Day 5 · Fri 16 Oct", t: "Onward to Zermatt", place: "Zermatt", body: "Rail to Täsch, then the shuttle into car-free Zermatt. Riffelalp check-in via the resort's own rack railway.", image: img("day-5", 200, 200) },
  { d: "Day 6 · Sat 17 Oct", t: "Matterhorn day", place: "Zermatt", body: "Gornergrat railway at first light for the clearest views, easy afternoon back at the resort spa.", image: img("day-6", 200, 200) },
  { d: "Day 7 · Sun 18 Oct", t: "Zermatt, at pace", place: "Zermatt", body: "Village walk, a longer lunch, no fixed plan for the evening — the trip's one deliberately open day.", image: img("day-7", 200, 200) },
  { d: "Day 8 · Mon 19 Oct", t: "Back to Zurich", place: "Zurich", body: "Rail back to Zurich, final-night stay at Widder Hotel, dinner near the hotel rather than a full evening out.", image: img("day-8", 200, 200) },
  { d: "Day 9 · Tue 20 Oct", t: "Depart", place: "Zurich", body: "Late-morning departure. Private transfer to the airport, return flight per whichever option is confirmed.", image: img("day-9", 200, 200) },
];

// Days sub-tabs (2026-09-24: place-based for >6 days -> direct
// follow-up: "just make it daywise, not placewise") — always a plain
// "Day 1/2/..." tab per day now, regardless of trip length.
const DAY_SUB_TABS = ["All days", ...DAYS.map((_, i) => `Day ${i + 1}`)];

const RESERVATIONS = [
  { when: "Now", what: "Start the Schengen visa application — this is the one true deadline on the trip." },
  { when: "Once the visa appointment is booked", what: "Confirm the Zurich and final-night Widder Hotel dates, on a flexible rate." },
  { when: "6–8 weeks out", what: "Lock Bürgenstock and Riffelalp — both run limited inventory in October." },
  { when: "After the visa is issued", what: "Ticket whichever outbound/return pair is confirmed; earlier fares aren't materially cheaper." },
];

const TABS = ["Plan", "Days", "Decisions"] as const;

// RecommendedFlightRow / RecommendedStayRow (2026-09-24, direct request:
// "All 1st choices will be laid out like we did in the proposal PDF
// itinerary thing - end to end") — the recommended pick gets the same
// full-width "journey"/"stay" treatment as the PDF and its web-page
// counterpart (see .tap-flight / .tap-stay in CustomerItineraryPage.tsx),
// not the small comparison-card treatment the alternatives use below.
// Chip (2026-09-24, direct request: "the our choice pill dark grey/black
// fill with gold text & star icon") — only the advisor's ORIGINAL
// recommendation gets the starred dark/gold treatment; a swapped-in
// "Selected" pick keeps the plain chip look, since it wasn't actually
// the advisor's call.
// Chip is ONLY ever used for the "chosen" slot's own badge. Both "Our
// choice" and "Selected" share the same dark/gold fill (2026-09-24,
// direct request), but the star stays specific to the advisor's actual
// recommendation (direct follow-up: "remove the star icon from
// selected") — a swapped-in pick wasn't actually recommended, so it
// shouldn't carry the same "starred" signal.
function Chip({ label }: { label: string }) {
  const isChoice = label === "Our choice";
  return (
    <span className="pv-chip pv-chip--choice">
      {isChoice ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L6 21l1.6-7L2.2 9.2l7.1-.6z" />
        </svg>
      ) : null}
      {label}
    </span>
  );
}

function RecommendedFlightRow({ opt, badge }: { opt: Option; badge: string }) {
  const f = opt.flight!;
  return (
    <div className="pv-recflight">
      <div className="pv-recflight-head">
        <a className="pv-option-name" href="#">
          {opt.name}
        </a>
        <Chip label={badge} />
      </div>
      <div className="pv-recflight-row">
        <div>
          <div className="pv-recflight-time">{f.depTime}</div>
          <div className="pv-recflight-city">{f.depCity}</div>
        </div>
        <div className="pv-recflight-mid">
          <div className="pv-recflight-nos">{f.flightNos}</div>
          <div className="pv-recflight-line" />
          <div className="pv-recflight-sub">
            {f.duration} · {f.cabin}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="pv-recflight-time">{f.arrTime}</div>
          <div className="pv-recflight-city">{f.arrCity}</div>
        </div>
      </div>
      <div className="pv-recflight-foot">
        <span>{opt.detail}</span>
        <span className="pv-option-price">{opt.price}</span>
      </div>
    </div>
  );
}

function RecommendedStayRow({ opt, badge }: { opt: Option; badge: string }) {
  return (
    <div className="pv-recstay">
      <div className="pv-recstay-body">
        <div className="pv-recflight-head">
          <a className="pv-option-name" href="#">
            {opt.name}
          </a>
          <Chip label={badge} />
        </div>
        <div className="pv-option-detail" style={{ marginTop: 8 }}>
          {opt.detail}
        </div>
        <div className="pv-option-price pv-option-price--hotel" style={{ marginTop: 10 }}>
          {opt.price}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pv-recstay-photo" src={opt.image} alt="" />
    </div>
  );
}

// RecommendedStayCardStacked (2026-09-24, direct request: "Place the
// image on top, then 'Our choice' tag, then the hotel name") — used
// ONLY in the sideBySide comparison layout's left column (see the
// Zurich-only call site); the default RecommendedStayRow above is left
// untouched since Lucerne/Zermatt still need to show the ORIGINAL
// layout for the comparison to mean anything.
function RecommendedStayCardStacked({ opt, badge }: { opt: Option; badge: string }) {
  return (
    <div className="pv-recstay-stacked">
      <div className="pv-recstay-stacked-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pv-recstay-stacked-photo" src={opt.image} alt="" />
        <div className="pv-recstay-chip-overlay">
          <Chip label={badge} />
        </div>
      </div>
      <div className="pv-recstay-stacked-body">
        <a className="pv-option-name pv-option-name--block" href="#">
          {opt.name}
        </a>
        <div className="pv-option-detail" style={{ marginTop: 8 }}>
          {opt.detail}
        </div>
        <div className="pv-option-price pv-option-price--hotel" style={{ marginTop: 10 }}>
          {opt.price}
        </div>
      </div>
    </div>
  );
}

// AltOptionRow — the shared alternative-card markup (2026-09-24),
// factored out so it can render either inside the default layout's
// grid (side by side, collapsed behind "Other options") or stacked full-
// width in the sideBySide comparison layout's right column.
function AltOptionRow({ opt, group, onSelect }: { opt: Option; group: RecGroup; onSelect: () => void }) {
  return (
    <div className="pv-option">
      {group.kind === "hotel" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pv-option-thumb" src={opt.image} alt="" />
      ) : null}
      <div className="pv-option-body">
        <a className="pv-option-name pv-option-name--block" href="#">
          {opt.name}
        </a>
        {opt.flight ? (
          <div className="pv-option-timing">
            {opt.flight.depTime} – {opt.flight.arrTime}
          </div>
        ) : null}
        <div className="pv-option-detail">{opt.detail}</div>
      </div>
      <div className="pv-option-side">
        <div className="pv-option-price">{opt.price}</div>
        <button type="button" className="pv-swap-btn" onClick={onSelect}>
          Swap
        </button>
      </div>
    </div>
  );
}

// Swap (2026-09-24, direct request: "a button that allows the user to
// swap it with the recommended one") — all 3 picks (the advisor's
// original recommendation + both alternatives) are kept as one array
// here so any of them can occupy the "top" slot; only the ORIGINAL
// index-0 pick is ever labeled "Recommended," a swapped-in pick reads
// "Selected" instead, since it wasn't actually the advisor's call.
//
// `layout` (2026-09-24, direct request) — "sideBySide" is a one-off
// comparison variant applied to ONLY the first hotel group (see the
// call site): left column = the chosen pick, right column = an
// "Alternatives" heading + both alternatives stacked, always visible
// (no "Other options" disclosure). Every other group keeps the default
// stacked layout so both can be compared on the same page.
function RecommendationGroup({
  group,
  layout = "default",
  device = "desktop",
}: {
  group: RecGroup;
  layout?: "default" | "sideBySide";
  device?: "desktop" | "mobile";
}) {
  // On mobile, sideBySide's always-visible "Alternatives" column has
  // nowhere to go once it stacks under the chosen card, so it falls back
  // to the collapsed "Other options" dropdown instead (2026-09-24, direct
  // request) — but the chosen card itself stays the stacked (image-on-top)
  // style, not the row style "default" would otherwise use (2026-09-24,
  // follow-up fix: mobile had reverted to the row-style card by mistake).
  const showAlternativesList = layout === "sideBySide" && device !== "mobile";
  const options = [group.recommended, ...group.alternatives];
  const [selected, setSelected] = useState(0);
  const chosen = options[selected];
  const badge = selected === 0 ? "Our choice" : "Selected";
  const chosenRow = group.kind === "flight" ? <RecommendedFlightRow opt={chosen} badge={badge} /> : <RecommendedStayRow opt={chosen} badge={badge} />;
  // sideBySide's left column always uses the stacked (image-on-top) card,
  // regardless of kind — currently only ever hit for hotels (Zurich).
  const chosenCardStacked = group.kind === "hotel" ? <RecommendedStayCardStacked opt={chosen} badge={badge} /> : chosenRow;

  return (
    <div className="pv-recgroup">
      {group.kind === "flight" ? (
        // Route is the real heading, "Outbound"/"Return" is just the
        // category label below it (2026-09-24, direct request) — the
        // reverse of hotels below, where the city stays the heading.
        <div className="pv-recgroup-head pv-recgroup-head--flight">
          <span className="pv-recgroup-title">{group.sub}</span>
          <span className="pv-recgroup-eyebrow">{group.title}</span>
        </div>
      ) : (
        <div className="pv-recgroup-head">
          <span className="pv-recgroup-title">{group.title}</span>
          {group.sub ? <span className="pv-recgroup-sub">{group.sub}</span> : null}
        </div>
      )}

      {showAlternativesList ? (
        <div className="pv-recgroup-split">
          <div className="pv-recgroup-split-col">{chosenCardStacked}</div>
          <div className="pv-recgroup-split-col">
            <div className="pv-recgroup-eyebrow" style={{ marginBottom: 10 }}>
              Alternatives
            </div>
            <div className="pv-alt-stack">
              {options.map((opt, i) => (i === selected ? null : <AltOptionRow key={i} opt={opt} group={group} onSelect={() => setSelected(i)} />))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {layout === "sideBySide" ? chosenCardStacked : chosenRow}
          <details className="pv-otheroptions">
            <summary>Other options</summary>
            <div className="pv-alt-grid">
              {options.map((opt, i) => (i === selected ? null : <AltOptionRow key={i} opt={opt} group={group} onSelect={() => setSelected(i)} />))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function FooterNote() {
  return <div className="pv-footnote">Prepared 24 September 2026. Nothing is booked, held or paid.</div>;
}

export default function ProposalInstinctLab() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Plan");
  // Sliding active-tab indicator (2026-09-24, direct request: "switching
  // to tabs should smoothly animate... make the tabs smoothly animate") —
  // a single positioned pill that measures the active button's own
  // position/width and transitions between them, instead of each button
  // getting its own background (which just cuts instantly between tabs).
  const tabRefs = useRef<Partial<Record<(typeof TABS)[number], HTMLButtonElement | null>>>({});
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  const [daySubTab, setDaySubTab] = useState(DAY_SUB_TABS[0]);
  const daySubTabRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const [daySubTabIndicator, setDaySubTabIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = daySubTabRefs.current[daySubTab];
    if (el) setDaySubTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [daySubTab]);
  const daySubTabsRef = useRef<HTMLDivElement>(null);
  const scrollDaySubTabs = (dir: 1 | -1) => daySubTabsRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
  const visibleDays = daySubTab === "All days" ? DAYS : [DAYS[DAY_SUB_TABS.indexOf(daySubTab) - 1]];
  // Real responsive breakpoint (2026-09-24, direct request: "packaged...
  // removing the desktop/mobile switch toggle") — the dev-only manual
  // toggle drove both a container-width CSS class AND this `device` value
  // (which RecommendationGroup needs in JS, not just CSS, since it swaps
  // actual markup structure between the sideBySide "Alternatives" list
  // and the collapsed "Other options" dropdown). The toggle is gone; this
  // now tracks the real viewport at the same breakpoint lab.css's
  // `@media (max-width: 640px)` rules use, so the page is genuinely
  // responsive rather than only previewable at a fixed simulated width.
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setDevice(mq.matches ? "mobile" : "desktop");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="pv-page">
      <div className="pv-shell">
        <div className="pv-card">
          <div className="pv-hero" style={{ backgroundImage: "url(/images/lab-hero-switzerland.jpg)" }}>
            <div className="pv-hero-scrim" />
            <div className="pv-hero-content">
              <div className="pv-header">
                <div className="pv-header-left">
                  <span className="pv-wordmark">TripAgent</span>
                  <span className="pv-madefor">Made for Kabir Shah · 24 Sept</span>
                </div>
                <button type="button" className="pv-dlbtn">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Download PDF
                </button>
              </div>
              <h1 className="pv-title">Switzerland, curated for you</h1>
              <div className="pv-subtitle">12 – 20 Oct 2026 · 1 traveller</div>
              <p className="pv-summary">
                An eight-night route through Zurich, Lucerne and Zermatt — a confirmed base in each city, one recommended flight and hotel per leg, and two
                shortlisted alternatives if your preference differs.
              </p>
            </div>
          </div>

          <div className="pv-body">
          <div className="pv-tabs">
            <span className="pv-tab-indicator" style={{ transform: `translateX(${tabIndicator.left}px)`, width: tabIndicator.width }} />
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                className={"pv-tab" + (tab === t ? " is-active" : "")}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div key={tab} className="pv-tabcontent">
          {tab === "Plan" ? (
            <>
              <h2 className="pv-section-title">The shape</h2>
              <div className="pv-deflist">
                <div className="pv-defrow">
                  <span className="pv-deflabel">Dates</span>
                  <span className="pv-defvalue">12 – 20 Oct 2026 · 8 nights</span>
                </div>
                <div className="pv-defrow">
                  <span className="pv-deflabel">Traveller</span>
                  <span className="pv-defvalue">1 · Business cabin</span>
                </div>
                <div className="pv-defrow">
                  <span className="pv-deflabel">Route</span>
                  <span className="pv-defvalue">Zurich → Lucerne → Zermatt</span>
                </div>
                <div className="pv-defrow">
                  <span className="pv-deflabel">Priorities</span>
                  <span className="pv-defvalue">Scenic rail, fine dining, mountain views</span>
                </div>
              </div>

              <h2 className="pv-section-title">Getting there</h2>
              {FLIGHTS.map((g) => (
                <RecommendationGroup key={g.title} group={g} />
              ))}

              <h2 className="pv-section-title">Where you stay</h2>
              {/* All three hotels now use the side-by-side layout
                  (2026-09-24, direct follow-up — comparison won over the
                  default stacked layout, applied everywhere). */}
              {STAYS.map((g) => (
                <RecommendationGroup key={g.title} group={g} layout="sideBySide" device={device} />
              ))}

              <h2 className="pv-section-title">What it costs</h2>
              <div className="pv-costtable">
                <div className="pv-costrow">
                  <span>Stays</span>
                  <span>₹2,59,800 – ₹3,00,700</span>
                </div>
                <div className="pv-costrow">
                  <span>Flights</span>
                  <span>₹3,82,300 – ₹4,53,600</span>
                </div>
                <div className="pv-costrow">
                  <span>Visa &amp; extras</span>
                  <span>₹19,600</span>
                </div>
                <div className="pv-costrow pv-costrow--total">
                  <span>Trip total</span>
                  <span>₹6,61,700 – ₹7,73,900</span>
                </div>
              </div>
              <button type="button" className="pv-cta" onClick={() => setTab("Days")}>
                See the day-by-day plan
              </button>
            </>
          ) : null}

          {tab === "Days" ? (
            <>
              <h2 className="pv-section-title">Nine days, paced</h2>
              <div className="pv-subtabs-row">
                <button type="button" className="pv-subtabs-chevron" aria-label="Scroll days left" onClick={() => scrollDaySubTabs(-1)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="pv-tabs pv-tabs--sub" ref={daySubTabsRef}>
                  <span
                    className="pv-tab-indicator"
                    style={{ transform: `translateX(${daySubTabIndicator.left}px)`, width: daySubTabIndicator.width }}
                  />
                  {DAY_SUB_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      ref={(el) => {
                        daySubTabRefs.current[t] = el;
                      }}
                      className={"pv-tab" + (daySubTab === t ? " is-active" : "")}
                      onClick={() => setDaySubTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button type="button" className="pv-subtabs-chevron" aria-label="Scroll days right" onClick={() => scrollDaySubTabs(1)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div key={daySubTab} className="pv-days pv-tabcontent">
                {visibleDays.map((day, i) => {
                  const [dayLabel, dateLabel] = day.d.split(" · ");
                  return (
                    <div key={i} className="pv-day-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="pv-day-card-photo" src={day.image} alt="" />
                      <div className="pv-day-card-body">
                        <div className="pv-recgroup-eyebrow">{dayLabel}</div>
                        <div className="pv-day-head">
                          {dateLabel} · {day.t}
                        </div>
                        <div className="pv-day-body">{day.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <h2 className="pv-section-title">Reservations that matter</h2>
              <div className="pv-days">
                {RESERVATIONS.map((r, i) => (
                  <div key={i} className="pv-day">
                    <div className="pv-day-num">{i + 1}</div>
                    <div>
                      <div className="pv-day-head">{r.when}</div>
                      <div className="pv-day-body">{r.what}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {tab === "Decisions" ? (
            <>
              <h2 className="pv-section-title">Before money moves</h2>
              <div className="pv-callout">
                <strong>Visa first.</strong> A Schengen Standard Visitor visa is required. Usual decision time is 3 weeks after biometrics — don't convert
                any rate to non-refundable while it's pending.
              </div>

              <h2 className="pv-section-title">Why this route</h2>
              <ul className="pv-bullets">
                <li>Zurich first — easiest arrival, sets up both onward rail legs without backtracking.</li>
                <li>Lucerne as the lake chapter — Bürgenstock's funicular removes the one awkward transfer in the region.</li>
                <li>Zermatt last, deliberately — the trip builds toward its most scenic stretch rather than opening with it.</li>
              </ul>
            </>
          ) : null}
          </div>

          <FooterNote />
          </div>
        </div>
      </div>
    </div>
  );
}
