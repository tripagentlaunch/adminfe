"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ItineraryView.tsx
 * Item #1 of the itinerary-hierarchy plan (2026-09-03) — the reference
 * mockup the designer shared read like a printed PDF: every line at the
 * same visual weight, everything always expanded. This is the first fix:
 *   - Two visual tiers per item, driven by tierOf() in mockItinerary.ts —
 *     "attention" (on hold / price changed / awaiting supplier / not
 *     selected) renders as a full card with detail + actions; "done"
 *     (booked) collapses to a single compact line.
 *   - Days collapse to a one-line summary by default; a day auto-expands
 *     ONLY if it contains an attention-tier item, otherwise the advisor
 *     opens it manually. Toggling is manual after that (an advisor
 *     closing a day they've already dealt with should stay closed).
 *   - The alert banner is now a clickable jump-list, not a paragraph —
 *     clicking one opens (and scrolls to) the day it's about.
 * Item #4 (single CTA per row) turned out to already be satisfied by the
 * mock data + existing .taw-btn/--primary styling — one `primary: true`
 * action per row, rendered filled, everything else outlined — so no
 * separate pass was needed for it.
 *
 * Item #6 (2026-09-03, inline editing + drag-reorder) added on top of
 * the above:
 *   - `data` is now local component state (a clone of MOCK_ITINERARY),
 *     not the imported constant directly — edits need somewhere to go.
 *   - EditableText below renders day dates, hotel room types, and
 *     flight cabins as click-to-edit text (Enter/blur commits, Escape
 *     cancels). Everything else (prices, statuses, confirmation
 *     numbers, segment detail) stays read-only — those are either
 *     supplier-confirmed facts or out of scope for this pass.
 *   - Because a day's date is now editable INSIDE its header row, that
 *     header could no longer be a real `<button>` (nesting an `<input>`
 *     inside a button is invalid HTML and breaks keyboard/focus
 *     behavior) — day/visa headers are `role="button"` divs now,
 *     manually wired for Enter/Space, same as a real button.
 *   - Drag-reorder was initially built at the DAY level; corrected
 *     2026-09-03 (direct request, once the Flights/Hotels/Visa tabs
 *     existed and made it obvious days themselves shouldn't move —
 *     they're calendar-ordered, not a free-form list) to ITEM level
 *     instead — a dedicated grip handle per item, reordering within its
 *     own day only (cross-day drag isn't supported — an item moving to
 *     a different day is a date change, not a reorder).
 * Still deliberately NOT in scope: editing occupancy/price/meal plan,
 * or a real financial-rollup visualization.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "../../lib/cx";
import { inr } from "../../services/api";
import { Empty, Icon, SleekScroll } from "../ui";
import { useWorkbench } from "../../lib/workbenchContext";
import { STATUS_META, tierOf, type ItineraryItemStatus } from "../../lib/mockItinerary";
import { fmtDayDate, resortDays, fmtDateRangeIso, nightsBetweenIso } from "../../lib/itineraryFromCart";
import { toast } from "../../lib/advisorHelpers";
import { ItinerarySummaryModal } from "./ItinerarySummaryModal";

// editValue/type (2026-09-04) — added for the day date, the one field
// here where the DISPLAYED text ("Thu 12 Oct") and the value that needs
// editing (a real ISO date, "2026-10-12") are two different strings.
// Every other use (room type, cabin) leaves both undefined/"text" and
// behaves exactly as before. type="date" renders a native date input
// while editing instead of free text — day-bucketing is driven entirely
// by the day's real _iso (see itineraryFromCart.ts), so letting the
// advisor commit arbitrary unparseable text here would silently break
// that matching rather than just look wrong.
function EditableText({
  value,
  editValue,
  onCommit,
  className,
  placeholder,
  type = "text",
}: {
  value: string;
  editValue?: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editValue !== undefined ? editValue : value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fallback = editValue !== undefined ? editValue : value;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    onCommit(draft.trim() || fallback);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        className={cx("taw-itin-edit-input", className)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(fallback);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      className={cx("taw-itin-editable", className)}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(fallback);
        setEditing(true);
      }}
      title="Click to edit"
    >
      {value || placeholder}
      <Icon name="note" size={11} />
    </span>
  );
}

// nextStep (2026-09-03, item #5) folded into the pill's own text — see
// mockItinerary.ts's docblock on the field for why: three different
// attention statuses share the "warn" amber bucket, so the concrete
// next step (not just the color) is what keeps them distinguishable,
// and it has to live IN the pill so it survives a collapsed row (#2).
function StatusPill({ status, nextStep }: { status: ItineraryItemStatus; nextStep?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cx("taw-status", "taw-status--" + meta.bucket)}>
      {meta.label}
      {nextStep ? " · " + nextStep : ""}
    </span>
  );
}

function dayHasAttention(day: any) {
  return day.items.some((it: any) => tierOf(it.status) === "attention");
}

// dayInBound (2026-09-04) — checks a day's real `_iso` against the
// itinerary's own committed date range (`data.startIso`/`endIso`,
// seeded from the enquiry's ask.dateRange or the AI mock's own day
// span — see itineraryFromCart.ts's boundFromDateRange). No bound set
// (both null — a pre-existing itinerary from before this feature, or
// an unparseable ask.dateRange) means treat everything as in-bound
// rather than flagging by default with nothing to compare against.
function dayInBound(day: any, data: any) {
  return !data.startIso || !data.endIso || (day._iso >= data.startIso && day._iso <= data.endIso);
}

// IncludeDayControl (2026-09-04) — the prompt on an out-of-bound day's
// expanded content: explains why it's flagged, and lets the advisor
// pick/confirm the Day # it becomes once folded into the sequence.
// `suggested` is always the chronologically-correct number (1 if this
// day is before the current bound, one past the last in-bound day if
// after it) — a day that's out of bound can only ever sit at one end of
// the sorted list (the bound is contiguous), so that's the only number
// that keeps the day list's own real chronological order intact. The
// advisor can still type a different one, but note the ACTUAL position
// in the list and the other days' renumbering always follow chronological
// order, not whatever's typed here — this input is a confirm step, not a
// free-form reorder tool (deliberately: a real override could put a day
// out of date order against everything else, which would make Search's
// own date-matching and the alert jump-list unreliable).
function IncludeDayControl({ day, suggested, onInclude }: { day: any; suggested: number; onInclude: (day: any, n: number) => void }) {
  const [n, setN] = useState(suggested);
  return (
    <div className="taw-itin-outbound-actions" onClick={(e) => e.stopPropagation()}>
      <label className="taw-itin-outbound-label">Include as Day</label>
      <input type="number" min={1} className="taw-input taw-itin-outbound-input" value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />
      <button className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => onInclude(day, n)}>
        Include in itinerary
      </button>
    </div>
  );
}

export function ItineraryView({ enquiryId, member }: { enquiryId: string; member: any }) {
  const router = useRouter();
  const { sendItineraryToProposal, itinerariesByEnquiry, updateItineraryData } = useWorkbench();
  // Sourced from WorkbenchContext now, not local state (2026-09-03) —
  // this used to be a useState clone of MOCK_ITINERARY, gone the moment
  // you navigated away; now it's keyed by enquiryId in shared context so
  // Search's "Add" button (SearchDesksPanel → addSearchItemToItinerary)
  // and this view read/write the exact same object. WorkbenchTab only
  // renders ItineraryView once this enquiry actually HAS data (via the
  // AI/scratch chooser or a Search add having auto-seeded a blank one),
  // so `data` is never undefined here in practice — the fallback below
  // is just a defensive guard, not a real code path.
  const data = itinerariesByEnquiry[enquiryId] || { destination: "", dateRange: "", cities: [], nights: 0, pax: 0, purpose: "", totals: { grand: 0, confirmed: 0, held: 0 }, visa: null, alerts: [], days: [] };
  function setData(updater: (d: any) => any) {
    updateItineraryData(enquiryId, updater);
  }
  // Summary window (2026-09-03) — the pause point before handing the
  // itinerary off to Proposal Composer. Only WRITES to WorkbenchContext
  // (sendItineraryToProposal, keyed by enquiryId — see workbenchContext.tsx)
  // once the advisor actually confirms in the modal, not the moment they
  // open it — clicking "Send to Proposal" should be reversible without
  // side effects until they commit.
  const [summaryOpen, setSummaryOpen] = useState(false);
  function sendToProposal() {
    sendItineraryToProposal(enquiryId, member, data);
    setSummaryOpen(false);
    router.push("/console/proposal-composer");
  }
  // Item-level drag state (2026-09-03) — {dayId, itemId} of whatever's
  // currently being dragged, or null. dayId is carried alongside itemId
  // so a drop target can refuse a drag from a DIFFERENT day (see
  // reorderItems below) — items reorder within their own day only.
  const [draggingItem, setDraggingItem] = useState<{ dayId: string; itemId: string } | null>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function updateDay(dayId: string, patch: any) {
    setData((d: any) => ({ ...d, days: d.days.map((day: any) => (day.id === dayId ? { ...day, ...patch } : day)) }));
  }

  // updateDayDate (2026-09-04) — day-bucketing (both for a Search "Add"
  // and for the alert jump-list) matches on a day's real `_iso`, not its
  // displayed `date` string (see itineraryFromCart.ts) — so editing the
  // date has to update `_iso` too, and re-sort/relabel the days exactly
  // the same way inserting a new Search-added day already does, or the
  // displayed date and the day's real identity would silently drift
  // apart the moment an advisor corrects one.
  function updateDayDate(dayId: string, newIso: string) {
    setData((d: any) => {
      const patched = d.days.map((day: any) => (day.id === dayId ? { ...day, _iso: newIso, date: fmtDayDate(newIso) } : day));
      return { ...d, days: resortDays(patched) };
    });
  }

  // includeDayInBound (2026-09-04) — folds an out-of-bound day into the
  // itinerary's committed range by extending startIso/endIso (and the
  // header's own dateRange/nights) to cover it. Doesn't touch the day's
  // position in `d.days` — that's already correct, since the day list
  // stays sorted by `_iso` through every mutation (see resortDays); once
  // the bound covers this day's `_iso`, it just becomes in-bound and
  // picks up the next "Day N" label on the very next render.
  function includeDayInBound(day: any, chosenNumber: number) {
    setData((d: any) => {
      const startIso = !d.startIso || day._iso < d.startIso ? day._iso : d.startIso;
      const endIso = !d.endIso || day._iso > d.endIso ? day._iso : d.endIso;
      return { ...d, startIso, endIso, dateRange: fmtDateRangeIso(startIso, endIso), nights: nightsBetweenIso(startIso, endIso) };
    });
    toast("Included as Day " + chosenNumber + " — the rest of the itinerary renumbered to match", "success");
  }

  function updateItem(dayId: string, itemId: string, patch: any) {
    setData((d: any) => ({
      ...d,
      days: d.days.map((day: any) =>
        day.id !== dayId ? day : { ...day, items: day.items.map((it: any) => (it.id === itemId ? { ...it, ...patch } : it)) }
      ),
    }));
  }

  function reorderItems(dayId: string, dragItemId: string, dropItemId: string) {
    if (dragItemId === dropItemId) return;
    setData((d: any) => ({
      ...d,
      days: d.days.map((day: any) => {
        if (day.id !== dayId) return day;
        const items = day.items.slice();
        const from = items.findIndex((it: any) => it.id === dragItemId);
        const to = items.findIndex((it: any) => it.id === dropItemId);
        if (from === -1 || to === -1) return day;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        return { ...day, items };
      }),
    }));
  }
  // Remove (2026-09-03, flow-testing hurdle) — the one action every
  // other operation (edit, reorder, add) had a counterpart for except
  // this one; there was no way to undo a wrongly-added item. Drops the
  // day entirely if it ends up with nothing left, rather than leaving an
  // empty day-shell behind — also rolls the item's price back out of
  // totals.grand/held so a removed item doesn't linger in the numbers.
  function removeItem(dayId: string, itemId: string) {
    setData((d: any) => {
      const day = d.days.find((x: any) => x.id === dayId);
      const item = day && day.items.find((it: any) => it.id === itemId);
      const days = d.days
        .map((dd: any) => (dd.id !== dayId ? dd : { ...dd, items: dd.items.filter((it: any) => it.id !== itemId) }))
        .filter((dd: any) => dd.items.length > 0);
      const price = item ? item.price || 0 : 0;
      return { ...d, days, totals: { ...d.totals, grand: Math.max(0, d.totals.grand - price), held: Math.max(0, d.totals.held - price) } };
    });
  }

  function removeVisa() {
    setData((d: any) => {
      const price = d.visa ? d.visa.price || 0 : 0;
      return { ...d, visa: null, totals: { ...d.totals, grand: Math.max(0, d.totals.grand - price), held: Math.max(0, d.totals.held - price) } };
    });
  }

  // Same fix as openItems below (2026-09-03, flow-testing hurdle) — was
  // lazily seeded once at mount from whatever days existed then, so a
  // day created LATER by a Search add (see itineraryFromCart.ts) never
  // got an entry and silently defaulted to collapsed regardless of
  // whether it actually contained an attention item. Only explicit
  // toggles live here now; dayOpenFor falls back to dayHasAttention()
  // computed fresh for any day without one.
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  function dayOpenFor(day: any) {
    // !dayInBound(day, data) (2026-09-04) — a day outside the itinerary's
    // committed range needs a decision, same as any other attention-tier
    // condition; it shouldn't need a manual click just to see WHY it's
    // flagged and what to do about it.
    return day.id in openDays ? openDays[day.id] : dayHasAttention(day) || !dayInBound(day, data);
  }
  // Tier decides the STARTING state (attention starts open, done starts
  // closed) but every row is a plain toggle from here on (2026-09-03,
  // item #2) — an advisor who's dealt with an on-hold flight can
  // collapse it back to a compact line same as any booked item, and a
  // booked item can still be opened to check its confirmation number.
  // Only EXPLICIT toggles live in this map now (2026-09-03, flow-testing
  // hurdle) — the old version seeded it once, lazily, from whatever
  // items existed AT MOUNT; an item added later via Search never got an
  // entry, so it silently defaulted to collapsed regardless of tier
  // (hiding its own new Remove button along with everything else).
  // Falling back to tierOf() for any id not yet explicitly toggled
  // (see itemOpenFor below) keeps items added mid-session correct too.
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  function itemOpenFor(item: any) {
    return item.id in openItems ? openItems[item.id] : tierOf(item.status) === "attention";
  }
  // data.visa can be null (2026-09-03) — a blank/scratch itinerary, or
  // one only ever added to via Search's flight/hotel desks, has no visa
  // yet; only VisaDesk's "Add" sets it (see itineraryFromCart.ts).
  //
  // Same lazy-init bug as openDays/openItems, third occurrence
  // (2026-09-03, flow-testing hurdle) — visa didn't exist at mount
  // (null), so this boolean was permanently fixed at `false`; adding a
  // visa via Search later never reopened it. `null` here means "no
  // explicit user toggle yet" — falls back to the current tier.
  const [visaOpenOverride, setVisaOpenOverride] = useState<boolean | null>(null);
  const visaOpen = visaOpenOverride !== null ? visaOpenOverride : !!data.visa && tierOf(data.visa.status) === "attention";
  // Category tabs (2026-09-03) — same visual pattern as the round-trip
  // leg switcher in flight search (.taw-leg-switch/.taw-leg-tab), reused
  // here instead of a new component since it's the exact same
  // "exactly one of a few mutually-exclusive views" shape.
  const [category, setCategory] = useState<"all" | "flights" | "hotels" | "visa">("flights");
  // alertsOpen (2026-09-04, direct request) — the "N items need
  // attention" banner is now collapsible, defaulting open so nothing
  // regresses for anyone who's never touched it.
  const [alertsOpen, setAlertsOpen] = useState(true);

  const attentionCount =
    data.days.reduce((n: number, d: any) => n + d.items.filter((it: any) => tierOf(it.status) === "attention").length, 0) +
    (data.visa && tierOf(data.visa.status) === "attention" ? 1 : 0);

  // Days filtered to the active tab (2026-09-03) — pulled out of the
  // render so the empty-state check below (visibleDays.length === 0)
  // doesn't need to recompute the same filter/map twice.
  const visibleDays =
    category === "all"
      ? data.days
      : data.days
          .map((day: any) => ({ ...day, items: day.items.filter((it: any) => it.type === (category === "flights" ? "flight" : "hotel")) }))
          .filter((day: any) => day.items.length);

  // totalInBoundCount (2026-09-04) — from the FULL (unfiltered) day list,
  // not `visibleDays` — the suggested "Day #" for an after-bound day
  // (IncludeDayControl's `suggested`) needs the trip's real total day
  // count, not however many happen to match the current Flights/Hotels
  // tab filter.
  const totalInBoundCount = data.days.filter((d: any) => dayInBound(d, data)).length;

  // Financial rollup (2026-09-03, item #7) — confirmed/held summed to
  // exactly the old "grand" total, but that total silently excluded
  // anything not yet priced (the not-selected return flight's "from
  // ₹1,98,400" isn't counted anywhere) — reading as a settled number
  // when the real cost is still open. `unresolved` sums every
  // `priceIsFrom` item's price as the KNOWN FLOOR of that gap, and the
  // grand total renders as a range (low–high+) whenever it's non-zero,
  // rather than silently omitting it.
  const unresolvedItems = data.days.flatMap((d: any) => d.items).filter((it: any) => it.priceIsFrom);
  const unresolved = unresolvedItems.reduce((s: number, it: any) => s + it.price, 0);
  const finTotal = data.totals.confirmed + data.totals.held + unresolved || 1;

  // Always derived from whatever's actually in `day.items` now
  // (2026-09-03) — previously fell back to the day's static
  // `subtotal` field when present, but that field sums EVERY item in
  // the day regardless of category. Once the Flights/Hotels/Visa tabs
  // (below) filter a day down to just one type's items, a leftover
  // combined subtotal would show a number that doesn't match what's
  // actually visible on the card. Computing from the (possibly
  // filtered) items directly keeps the two in sync automatically.
  function dayTotalLabel(day: any) {
    const known = day.items.filter((it: any) => it.price != null);
    if (!known.length) return "—";
    const sum = known.reduce((s: number, it: any) => s + it.price, 0);
    return (known.some((it: any) => it.priceIsFrom) ? "from " : "") + inr(sum);
  }

  function jumpTo(alert: any) {
    const dayOrVisaId = alert.jumpToDayId;
    setCategory(alert.category);
    if (dayOrVisaId === "visa") {
      setVisaOpenOverride(true);
    } else {
      setOpenDays((s) => ({ ...s, [dayOrVisaId]: true }));
    }
    requestAnimationFrame(() => {
      const el = dayRefs.current[dayOrVisaId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="taw-itin">
      <div className="taw-itin-summary">
        <div className="taw-itin-summary-head">
          <div>
            <div className="taw-itin-summary-title">
              {data.destination} · {data.dateRange}
            </div>
            <div className="taw-itin-summary-sub">
              {data.cities.join(" · ")} · {data.nights} night{data.nights === 1 ? "" : "s"} · {data.pax} adult{data.pax === 1 ? "" : "s"} · {data.purpose}
            </div>
          </div>
          {/* "Send to Proposal" (2026-09-03) — opens the Summary window
              first rather than navigating straight away; the actual
              WorkbenchContext write + route change happens from THAT
              modal's own confirm action (sendToProposal above). */}
          <button className="taw-btn taw-btn--primary taw-btn--sm" onClick={() => setSummaryOpen(true)}>
            <Icon name="send" size={13} />
            Send to Proposal
          </button>
        </div>
        <div className="taw-itin-totals">
          <div>
            <b>
              {inr(data.totals.grand)}
              {unresolved > 0 ? "–" + inr(data.totals.grand + unresolved) + "+" : ""}
            </b>
            <span>total</span>
          </div>
          <div>
            <b>{inr(data.totals.confirmed)}</b>
            <span>confirmed</span>
          </div>
          <div>
            <b>{inr(data.totals.held)}</b>
            <span>held</span>
          </div>
          {unresolved > 0 ? (
            <div>
              <b>{inr(unresolved)}+</b>
              <span>unresolved</span>
            </div>
          ) : null}
        </div>
        {/* The bar makes the confirmed/held/unresolved SPLIT visible at
            a glance instead of three numbers the advisor has to do the
            arithmetic on themselves — segment widths are proportional
            to each bucket's share of the (low-end) total. */}
        <div className="taw-itin-fin-bar">
          <div className="taw-itin-fin-seg taw-itin-fin-seg--confirmed" style={{ flexBasis: (data.totals.confirmed / finTotal) * 100 + "%" }} />
          <div className="taw-itin-fin-seg taw-itin-fin-seg--held" style={{ flexBasis: (data.totals.held / finTotal) * 100 + "%" }} />
          {unresolved > 0 ? (
            <div className="taw-itin-fin-seg taw-itin-fin-seg--unresolved" style={{ flexBasis: (unresolved / finTotal) * 100 + "%" }} />
          ) : null}
        </div>
      </div>

      {attentionCount > 0 ? (
        <div className="taw-itin-alerts">
          <button className="taw-itin-alerts-h" onClick={() => setAlertsOpen(!alertsOpen)} aria-expanded={alertsOpen}>
            <Icon name="alert" size={14} />
            {attentionCount} item{attentionCount === 1 ? "" : "s"} need attention
            <Icon name="chevron" size={13} className="taw-itin-alerts-chevron" style={{ transform: alertsOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
          </button>
          {alertsOpen
            ? data.alerts.map((a: any) => (
                <button key={a.id} className="taw-itin-alert" onClick={() => jumpTo(a)}>
                  {a.text}
                </button>
              ))
            : null}
        </div>
      ) : null}

      {/* Category tabs (2026-09-03) — All/Flights/Hotels/Visa, same
          shape as the flight-search round-trip leg switcher. Exactly
          one is active at a time; the day list and visa block below
          filter to match ("All" shows every item, unfiltered — the
          original combined view). Trip-wide totals/bar above stay
          unaffected — those are deliberately whole-trip, not per-tab. */}
      <div className="taw-leg-switch">
        <button className={cx("taw-leg-tab", category === "all" && "is-active")} onClick={() => setCategory("all")}>
          All
        </button>
        <button className={cx("taw-leg-tab", category === "flights" && "is-active")} onClick={() => setCategory("flights")}>
          Flights
        </button>
        <button className={cx("taw-leg-tab", category === "hotels" && "is-active")} onClick={() => setCategory("hotels")}>
          Hotels
        </button>
        <button className={cx("taw-leg-tab", category === "visa" && "is-active")} onClick={() => setCategory("visa")}>
          Visa
        </button>
      </div>

      {/* SleekScroll (2026-09-04, direct request) — only THIS, the day/
          visa list below the tabs, scrolls now; the summary, alerts
          banner, and tabs above stay fixed in view (see
          .taw-itin-card .taw-card-b's own comment for the flex chain
          this depends on). */}
      <SleekScroll className="taw-itin-days-scroll">
      {/* .taw-itin-days (2026-09-03) — a plain divider-separated
          section (each .taw-itin-day gets a border-bottom, no more
          individual card box), not another gapped list; see the CSS
          rule's own comment for why. */}
      <div className="taw-itin-days">
      {/* Visa — same attention/done tiering as any other item, just
          rendered outside the day list since it isn't tied to one day.
          data.visa can be null (2026-09-03) — nothing added from
          VisaDesk yet — in which case the tab shows a plain empty
          prompt instead of a card with nothing behind it. */}
      {(category === "visa" || category === "all") && data.visa ? (
        <div className="taw-itin-day" ref={(el) => { dayRefs.current["visa"] = el; }}>
          <button className="taw-itin-day-h" onClick={() => setVisaOpenOverride(!visaOpen)}>
            <Icon name="chevron" size={14} style={{ transform: visaOpen ? "rotate(0deg)" : "rotate(-90deg)" }} />
            <Icon name="visa" size={15} />
            <span className="taw-itin-day-route">{data.visa.title}</span>
            <StatusPill status={data.visa.status} nextStep={(data.visa as any).nextStep} />
            <span className="taw-itin-day-total">{inr(data.visa.price)}</span>
          </button>
          {visaOpen ? (
            <div className="taw-itin-item taw-itin-item--attention">
              {/* .taw-itin-item-detail, not bare children (2026-09-03
                  fix) — this block was skipping the same wrapper every
                  other item's expanded content uses for padding, so it
                  rendered flush against the card's edges with none. */}
              <div className="taw-itin-item-detail taw-itin-visa-detail">
                <div className="taw-itin-item-sub">{data.visa.sub}</div>
                <div className="taw-itin-item-meta">{data.visa.meta}</div>
                <div className="taw-itin-chips">
                  {data.visa.chips.map((c: any, i: number) => (
                    <span key={i} className={cx("taw-itin-chip", "taw-itin-chip--" + c.tone)}>
                      {c.label}
                    </span>
                  ))}
                </div>
                <div className="taw-itin-note">{data.visa.note}</div>
                <div className="taw-itin-actions">
                  <button className="taw-btn taw-btn--sm taw-btn--danger" onClick={removeVisa}>
                    <Icon name="x" size={12} />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : category === "visa" && !data.visa ? (
        <Empty icon={<Icon name="visa" size={26} />}>Nothing added from the Visa desk yet.</Empty>
      ) : null}

      {category !== "visa" && visibleDays.length === 0 ? (
        <Empty icon={<Icon name={category === "hotels" ? "hotel" : "flight"} size={26} />}>
          Nothing added from the {category === "all" ? "Flights or Hotels desks" : category === "hotels" ? "Hotels desk" : "Flights desk"} yet.
        </Empty>
      ) : null}

      {category !== "visa" ? (() => {
        // inBoundCounter (2026-09-04) — fresh per render, only
        // incremented for in-bound days, so an out-of-bound day (always
        // at the very start or end of the sorted list — the bound is
        // contiguous) never steals a number from the real sequence.
        let inBoundCounter = 0;
        return visibleDays.map((day: any) => {
        const open = dayOpenFor(day);
        const attention = dayHasAttention(day);
        const inBound = dayInBound(day, data);
        const dayNumber = inBound ? ++inBoundCounter : null;
        const suggestedNumber = inBound ? dayNumber! : day._iso < (data.startIso || day._iso) ? 1 : totalInBoundCount + 1;
        function toggle() {
          setOpenDays((s) => ({ ...s, [day.id]: !open }));
        }
        return (
          <div className={cx("taw-itin-day", !inBound && "taw-itin-day--outbound")} key={day.id} ref={(el) => { dayRefs.current[day.id] = el; }}>
            {/* role="button" div, not a real <button> (2026-09-03) —
                the editable date (EditableText) below renders an
                <input> when clicked, and nesting an input inside a
                button is invalid HTML and breaks its focus/keyboard
                behavior. Manually wired for the same Enter/Space
                activation a real button gets for free. Not draggable
                (corrected 2026-09-03) — days are calendar-ordered, not
                a free-form list; only the items inside a day reorder. */}
            <div
              className={cx("taw-itin-day-h", (attention || !inBound) && "has-attention")}
              role="button"
              tabIndex={0}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }}
            >
              <Icon name="chevron" size={14} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
              {/* Out-of-bound (2026-09-04) — no "Day N" slot at all here;
                  the real date IS the label until the advisor folds it
                  into the sequence (see IncludeDayControl below), plus a
                  pill flagging why. In-bound keeps the original
                  "Day N" + editable-date pair unchanged. */}
              {inBound ? (
                <>
                  <span className="taw-itin-day-label">Day {dayNumber}</span>
                  <EditableText
                    className="taw-itin-day-date"
                    type="date"
                    value={day.date}
                    editValue={day._iso}
                    onCommit={(v) => updateDayDate(day.id, v)}
                  />
                </>
              ) : (
                <>
                  <EditableText className="taw-itin-day-label" type="date" value={day.date} editValue={day._iso} onCommit={(v) => updateDayDate(day.id, v)} />
                  <span className="taw-status taw-status--warn">Outside itinerary dates</span>
                </>
              )}
              <span className="taw-itin-day-route">{day.route}</span>
              <span className="taw-itin-day-total">{dayTotalLabel(day)}</span>
            </div>
            {open ? (
              <div className="taw-itin-day-items">
                {!inBound ? (
                  <div className="taw-itin-outbound-prompt">
                    <div className="taw-itin-outbound-note">
                      <Icon name="alert" size={13} />
                      This date falls outside the itinerary's{" "}
                      {data.dateRange || "committed"} range — decide whether it belongs here before sending the proposal.
                    </div>
                    <IncludeDayControl day={day} suggested={suggestedNumber} onInclude={includeDayInBound} />
                  </div>
                ) : null}
                {day.items.map((item: any) => {
                  const tier = tierOf(item.status);
                  const bucket = STATUS_META[item.status as ItineraryItemStatus].bucket;
                  const itemOpen = itemOpenFor(item);
                  const dragOver = draggingItem && draggingItem.dayId === day.id;
                  return (
                    <div
                      className={cx("taw-itin-item", "taw-itin-item--" + tier, draggingItem?.itemId === item.id && "is-dragging")}
                      key={item.id}
                      onDragOver={(e) => dragOver && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragOver) reorderItems(day.id, draggingItem!.itemId, item.id);
                        setDraggingItem(null);
                      }}
                    >
                      <div className={cx("taw-itin-item-row-wrap", tier === "attention" && "taw-itin-item-row-wrap--" + bucket)}>
                        {/* Drag handle — items reorder within their own
                            day (2026-09-03, corrected from an earlier
                            day-level version — see file docblock); only
                            THIS is draggable, not the whole row, so a
                            plain click still toggles expand/collapse. */}
                        <span
                          className="taw-itin-item-grip"
                          draggable
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggingItem({ dayId: day.id, itemId: item.id });
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDraggingItem(null)}
                          title="Drag to reorder"
                        >
                          <Icon name="grip" size={13} />
                        </span>
                        <button
                          className="taw-itin-item-row"
                          onClick={() => setOpenItems((s: any) => ({ ...s, [item.id]: !itemOpen }))}
                          aria-expanded={itemOpen}
                        >
                          <Icon name={item.type} size={15} />
                          <span className="taw-itin-item-time">{item.time || "—"}</span>
                          <span className="taw-itin-item-title">{item.title}</span>
                          <StatusPill status={item.status} nextStep={item.nextStep} />
                          <span className="taw-itin-item-price">
                            {item.oldPrice ? <s>{inr(item.oldPrice)}</s> : null}
                            {item.priceIsFrom ? "from " : ""}
                            {inr(item.price)}
                          </span>
                        </button>
                      </div>
                      {itemOpen ? (
                        <div className="taw-itin-item-detail">
                          {item.sub ? <div className="taw-itin-item-sub">{item.sub}</div> : null}
                          {/* roomType/cabin (2026-09-03, item #6) — the
                              two fields an advisor can actually change
                              on this item; everything else here (price,
                              confirmation numbers, segment detail) is a
                              supplier-confirmed fact, not editable. */}
                          {item.roomType ? (
                            <div className="taw-itin-item-sub">
                              1 × <EditableText value={item.roomType} onCommit={(v) => updateItem(day.id, item.id, { roomType: v })} />
                              {item.detailRest ? " · " + item.detailRest : ""}
                            </div>
                          ) : null}
                          {item.cabin ? (
                            <div className="taw-itin-item-sub">
                              Cabin: <EditableText value={item.cabin} onCommit={(v) => updateItem(day.id, item.id, { cabin: v })} />
                            </div>
                          ) : null}
                          {item.segments ? (
                            <div className="taw-itin-segs">
                              {item.segments.map((seg: any, i: number) =>
                                seg.layover ? (
                                  <div className="taw-itin-layover" key={i}>
                                    {seg.layover}
                                  </div>
                                ) : (
                                  <div className="taw-itin-seg" key={i}>
                                    <span className="taw-itin-seg-no">{seg.flightNo}</span>
                                    <span>{seg.route}</span>
                                    <span className="taw-muted">{seg.duration}</span>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}
                          {item.chips ? (
                            <div className="taw-itin-chips">
                              {item.chips.map((c: string, i: number) => (
                                <span className="taw-itin-chip" key={i}>
                                  {c}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {item.meta ? <div className="taw-itin-item-meta">{item.meta}</div> : null}
                          {item.note ? <div className="taw-itin-note">{item.note}</div> : null}
                          {/* Remove (2026-09-03, flow-testing hurdle) —
                              there was NO way to undo a wrongly-added
                              item, blocking the whole "iterate until
                              satisfactory" goal. The only per-item action
                              now (2026-09-04) — the curated actions this
                              used to render alongside (Issue ticket,
                              Extend hold, Chase supplier, Accept new
                              rate, Swap, Choose flight, …) were dead
                              buttons with no onClick, and every one was
                              either a booking/supplier-ops action out of
                              scope for a screen that's for composing a
                              proposal (not issuing tickets or chasing
                              suppliers), or redundant with what Remove +
                              Search-add already do for real: swapping a
                              pick is Remove this item, then Add the
                              replacement via the always-visible Search
                              panel — one real path instead of three
                              overlapping fake ones. */}
                          <div className="taw-itin-actions">
                            <button className="taw-btn taw-btn--sm taw-btn--danger" onClick={() => removeItem(day.id, item.id)}>
                              <Icon name="x" size={12} />
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      });
      })() : null}
      </div>
      </SleekScroll>

      {summaryOpen ? <ItinerarySummaryModal data={data} onClose={() => setSummaryOpen(false)} onContinue={sendToProposal} /> : null}
    </div>
  );
}
