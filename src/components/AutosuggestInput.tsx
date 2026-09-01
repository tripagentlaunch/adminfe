"use client";
/* =============================================================================
 * TripAgent — src/components/AutosuggestInput.tsx
 * Generic typeahead input: types into a normal <input>, debounces, calls a
 * caller-supplied fetch function, and renders a dropdown of results via a
 * caller-supplied render function. No product knowledge (flights/hotels/
 * anything else) lives here — that's entirely in the fetchSuggestions/
 * renderSuggestion/getKey/onSelect props each caller passes in.
 *
 * Fully controlled, same as every other input in this codebase (see
 * FlightDesk.jsx's/HotelDesk.jsx's plain <input value={...} onChange={...}/>
 * pattern) — `value`/`onChange` behave exactly like a normal text input;
 * `onSelect` fires ADDITIONALLY when a suggestion is picked, and it's the
 * caller's job to turn that into whatever the field's next `value` should be
 * (e.g. an IATA code for flights, a city name for hotels).
 *
 * There was no existing typeahead/combobox pattern anywhere in this codebase
 * to copy — the "Visa Destination dropdown" this was modeled after turned
 * out to be a plain hardcoded <select> (VisaDesk.jsx), not a live search.
 * This is new UI, styled to match taw-input/taw-field but built from
 * scratch.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { Spinner } from "./ui";

// AutosuggestInput({
//   id, value, onChange(text), onSelect(item),
//   fetchSuggestions(query) -> Promise<item[]>,
//   renderSuggestion(item) -> JSX, getKey(item) -> string,
//   placeholder?, minChars = 2, debounceMs = 300, className?,
//   showDefaultsOnFocus? = false,
// })
//
// showDefaultsOnFocus (opt-in, default false — every other/future caller of
// this component is unaffected): on focus of an EMPTY field, or on clearing
// the field back to empty while it's still focused, calls
// fetchSuggestions("") immediately — no debounce, no minChars gate. It is
// the caller's fetchSuggestions implementation that decides what an empty
// query means (a real "popular"/default API call, or a hardcoded fallback
// list) — this component has no opinion on that, it just knows to ask
// without the normal typing gates once the field is empty and focused.
export function AutosuggestInput(props: any) {
  const {
    id,
    value,
    onChange,
    onSelect,
    fetchSuggestions,
    renderSuggestion,
    getKey,
    placeholder,
    minChars = 2,
    debounceMs = 300,
    className,
    showDefaultsOnFocus = false,
  } = props;

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const timerRef = useRef<any>(null);
  // Guards against a slow earlier request overwriting a faster later one —
  // e.g. "del" resolves after "delh" did, and would otherwise clobber the
  // more specific result back to the broader one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function runQuery(query: string) {
    const thisRequest = ++requestIdRef.current;
    setLoading(true);
    fetchSuggestions(query)
      .then((items: any) => {
        if (requestIdRef.current !== thisRequest) return; // superseded by a newer keystroke
        setSuggestions(Array.isArray(items) ? items : []);
        setLoading(false);
        setOpen(true);
        setActiveIndex(-1);
      })
      .catch(() => {
        if (requestIdRef.current !== thisRequest) return;
        setSuggestions([]);
        setLoading(false);
        setOpen(true); // stay open to show the "No matches" state
      });
  }

  function handleChange(e: any) {
    const text = e.target.value;
    onChange(text);

    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = text.trim();

    if (!trimmed) {
      requestIdRef.current++; // invalidate any in-flight live-search request
      if (showDefaultsOnFocus) {
        runQuery(""); // cleared back to empty while focused — show defaults again immediately
      } else {
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
      }
      return;
    }

    if (trimmed.length < minChars) {
      requestIdRef.current++; // invalidate any in-flight request — its result would be stale by the time it lands
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => runQuery(trimmed), debounceMs);
  }

  function pick(item: any) {
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onSelect(item);
  }

  function handleKeyDown(e: any) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={cx("taw-typeahead", className)}>
      <input
        id={id}
        className="taw-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (showDefaultsOnFocus && !value.trim()) {
            runQuery(""); // empty field, just focused — show defaults immediately, no debounce/minChars
            return;
          }
          if (suggestions.length) setOpen(true);
        }}
        // Delay the close so a suggestion's onMouseDown (which fires before
        // this blur) still lands — see the button below.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open ? (
        <div className="taw-typeahead-list" role="listbox">
          {loading ? (
            <div className="taw-typeahead-empty">
              <Spinner /> Searching…
            </div>
          ) : suggestions.length ? (
            suggestions.map((item, i) => (
              <button
                key={getKey ? getKey(item) : i}
                type="button"
                role="option"
                aria-selected={i === activeIndex ? "true" : "false"}
                className={cx("taw-typeahead-item", i === activeIndex && "is-active")}
                // onMouseDown (not onClick) fires before the input's onBlur,
                // so the pick registers before the dropdown would otherwise
                // close out from under it.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {renderSuggestion(item)}
              </button>
            ))
          ) : (
            <div className="taw-typeahead-empty">No matches.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
