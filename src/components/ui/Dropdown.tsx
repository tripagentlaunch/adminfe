"use client";
/* =============================================================================
 * TripAgent — src/components/ui/Dropdown.tsx
 * A fixed-list dropdown (button + popup menu) that visually matches
 * AutosuggestInput's typeahead popup (.taw-typeahead-list — card bg, 9px
 * radius, padded rows, bone hover) — built for cases like SearchDesksPanel's
 * Flights/Hotels/Visas picker where a native <select> is right on
 * behavior (a short fixed list, no typing/search) but wrong on looks: a
 * native <select>'s OWN open option-list is the browser's own unstyleable
 * system popup in every browser, so it can never actually match. This
 * swaps just that popup for a real DOM list under our own CSS, no search/
 * typing involved — closer to a menu than to AutosuggestInput's combobox.
 *
 * 2026-09-02: the popup is now rendered via a portal to document.body
 * instead of as a normal in-place child. It used to be clipped whenever
 * an ancestor had overflow:hidden — e.g. SearchDesksPanel's Search
 * card, which needs overflow:hidden for its own rounded corners, was
 * cutting the Cabin dropdown's popup off partway down. Portaling escapes
 * any such ancestor entirely; position is now computed in JS from the
 * trigger's own bounding rect (position:fixed, recomputed on open/
 * scroll/resize) rather than the old position:absolute + a positioned
 * `.taw-dropdown` ancestor, since a fixed/portaled popup has no
 * meaningful CSS-relative parent to anchor against anymore.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/cx";
import { Icon } from "./Icon";

// Dropdown({ value, options: [{key,label,icon?}], onChange(key), ariaLabel, className, triggerClassName, hideOptionIcons? })
// `icon` is an optional Icon name (see ui/Icon.tsx) rendered leading each
// option row — omit it on any option to render that row without one.
// `hideOptionIcons` (2026-09-02) — for a case like the results Sort
// dropdown, where every option intentionally shares the SAME icon so the
// closed trigger always shows it regardless of which is picked, but
// repeating that same icon on every row in the open list is just noise —
// set true to still use `current.icon` on the trigger while suppressing
// icons in the popup's own rows. Default false preserves the original
// per-option-icon list behavior (e.g. the desk-picker's flight/hotel/
// visa icons).
export function Dropdown(props: any) {
  const { value, options, onChange, ariaLabel, className, triggerClassName, hideOptionIcons } = props;
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<any>(null);
  const rootRef = useRef<any>(null);
  const popupRef = useRef<any>(null);

  function updateCoords() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom, left: r.left, width: r.width });
  }

  useEffect(() => {
    if (!open) return;
    updateCoords();
    function onDocClick(e: any) {
      const inRoot = rootRef.current && rootRef.current.contains(e.target);
      const inPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!inRoot && !inPopup) setOpen(false);
    }
    function onKey(e: any) {
      if (e.key === "Escape") setOpen(false);
    }
    // capture:true on scroll — catches scrolling on any inner scrollable
    // ancestor (not just the window), so the popup stays correctly
    // anchored to the trigger instead of drifting or staying put while
    // the trigger scrolls away underneath it.
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

  const current = options.find((o: any) => o.key === value);

  const popup =
    open && coords
      ? createPortal(
          <div
            ref={popupRef}
            className="taw-typeahead-list taw-dropdown-list"
            role="listbox"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          >
            {options.map((o: any) => (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={o.key === value}
                className={cx("taw-typeahead-item", "taw-dropdown-item", o.key === value && "is-active")}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
              >
                {o.icon && !hideOptionIcons ? <Icon name={o.icon} size={15} /> : null}
                <span className="taw-dropdown-item-label">{o.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cx("taw-dropdown", className)} ref={rootRef}>
      <button
        type="button"
        className={cx("taw-dropdown-trigger", triggerClassName)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current && current.icon ? <Icon name={current.icon} size={15} /> : null}
        <span>{current ? current.label : ""}</span>
        <Icon name="chevron" size={14} className="taw-dropdown-chevron" />
      </button>
      {popup}
    </div>
  );
}
