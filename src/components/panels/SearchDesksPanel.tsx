"use client";
/* =============================================================================
 * TripAgent — src/components/panels/SearchDesksPanel.tsx
 * Console's right column (2026-09-01 restructure, second half — see
 * QueueProfileAccordion.tsx for the first). Replaces SearchDesksTab.tsx's
 * standalone Enquiries → Search tab (removed, per the designer's call:
 * "Console is the only home for Search now") — Search is now inline on the
 * Console screen itself, "accessible at all times with fewer clicks."
 *
 * Just the "Search" card (Flights/Hotels/Visas) — no Cart panel of its
 * own. `onAdd` is passed in from WorkbenchTab, which already owns the
 * `cart` state that used to feed the old persistent Summary card. Summary
 * itself is gone from this screen entirely now (per "No more Summary — it
 * will be shown as an overlay... once the advisor clicks Finalize"); the
 * Finalize button + overlay are still undecided/deferred, but removing
 * Summary from the persistent layout was already settled, so it's gone
 * now regardless. `cart` keeps accumulating in WorkbenchTab in the
 * meantime so nothing added via Search is lost once that overlay exists.
 *
 * 2026-09-01, same day: "Search Desks" (three tab-buttons) → "Search"
 * (one dropdown, same line as the title, via Card's `actions` slot) — the
 * right column is narrow (2fr of 2/5/2), so a 3-way tab strip read as
 * cramped. FlightDesk/HotelDesk/VisaDesk's own field rows (`taw-row-2/3/4`,
 * shared grid classes also used elsewhere in the app) are forced to a
 * single stacked column here via `.taw-search-stack`, scoped to just this
 * panel rather than changing those shared classes globally.
 *
 * 2026-09-01, later same day: the desk dropdown now lives inside
 * `.taw-card-h-segment` — a filled segment that spans the header's FULL
 * height and sits flush against its right edge, with a light-grey fill
 * differentiating it from the header's own background; its left border
 * doubles as the divider line separating it from the title.
 *
 * 2026-09-02: the trigger started as a native <select> (`.taw-select-
 * plain`), restyled to sit flush in the segment. That covers the CLOSED
 * state fine, but a native <select>'s own OPEN option-list is always the
 * browser's own unstyleable system popup in every browser — no CSS can
 * touch it — so it could never actually match AutosuggestInput's typeahead
 * popup (from/to airport fields) the way the designer wanted. Swapped it
 * for `<Dropdown>` (src/components/ui/Dropdown.tsx): a button + a real DOM
 * popup styled with the same `.taw-typeahead-list`/`.taw-typeahead-item`
 * classes the from/to fields use — same look, just a fixed 3-item list
 * instead of live search.
 *
 * 2026-09-02: the Search card used to always stretch to match the grid
 * row's full height (Console's 3-column grid defaults to
 * align-items:stretch) regardless of how little the form actually
 * needed — per direct request, it now sizes to fit its own content
 * (`.taw-card--fit`, align-self:start) UNTIL FlightDesk is actually
 * showing search results (searching or loaded), at which point it grows
 * to fill the column's full height so the results have room, animating
 * smoothly between the two. FlightDesk reports that boolean up via
 * `onExpandChange` (only wired for Flights currently — Hotels/Visas keep
 * the old always-stretch behavior, out of scope here). The animation
 * itself is a FLIP: pin the CURRENT height, read the NEW natural height
 * (by briefly clearing height to measure it), then transition between
 * the two pixel values — align-self itself can't be transitioned
 * directly, CSS has no interpolation for it.
 * ===========================================================================*/
import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx";
import { Card, Dropdown, Icon } from "../ui";
import { FlightDesk } from "./FlightDesk";
import { HotelDesk } from "./HotelDesk";
import { VisaDesk } from "./VisaDesk";

const DESKS = [
  { key: "flights", label: "Flights", icon: "flight" },
  { key: "hotels", label: "Hotels", icon: "hotel" },
  { key: "visas", label: "Visas", icon: "visa" },
];

export function SearchDesksPanel(props: any) {
  const { member, enquiry, advisorId, onAdd } = props;
  const [desk, setDesk] = useState("flights");
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<any>(null);
  const firstRender = useRef(true);

  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const startH = el.getBoundingClientRect().height;
    el.style.transition = "none";
    el.style.overflow = "hidden";
    el.style.height = startH + "px";
    void el.offsetHeight; // force layout so the pinned start height actually applies before we read the target
    el.style.height = "auto"; // briefly clear to measure the NEW natural height (align-self already updated by this render)
    const endH = el.getBoundingClientRect().height;
    el.style.height = startH + "px"; // restore instantly — nothing has visibly changed yet
    void el.offsetHeight;
    const raf = requestAnimationFrame(() => {
      el.style.transition = "height 320ms ease";
      el.style.height = endH + "px";
    });
    const t = setTimeout(() => {
      el.style.transition = "";
      el.style.height = "";
      el.style.overflow = "";
    }, 340);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [expanded]);

  return (
    <Card
      containerRef={cardRef}
      className={cx("taw-search-card", !expanded && "taw-card--fit")}
      title="Search"
      icon={<Icon name="search" size={18} />}
      actions={
        <span className="taw-card-h-segment">
          <Dropdown value={desk} options={DESKS} onChange={setDesk} ariaLabel="Search desk" triggerClassName="taw-select-plain" />
        </span>
      }
    >
      <div className="taw-search-stack">
        {desk === "flights" ? (
          <FlightDesk member={member} enquiry={enquiry} advisorId={advisorId} onAdd={onAdd} onExpandChange={setExpanded} />
        ) : null}
        {desk === "hotels" ? (
          <HotelDesk member={member} enquiry={enquiry} advisorId={advisorId} onAdd={onAdd} onExpandChange={setExpanded} />
        ) : null}
        {desk === "visas" ? <VisaDesk member={member} enquiry={enquiry} advisorId={advisorId} onAdd={onAdd} /> : null}
      </div>
    </Card>
  );
}
