"use client";
/* The hotel search form - destination, check-in / check-out, guests & rooms, Search - used by BOTH
   New Booking's hotel step and the Console's Hotels search desk, so the two look and behave the same.
   It owns only what the form shows (which calendar / guests panel is open, editing the rooms); the
   searching itself stays with the caller. */
import { useState } from "react";
import { Icon } from "../ui";
import { AutosuggestInput } from "../AutosuggestInput";
import { drilldownLocation, popularDrilldowns, rankLocationSuggestions } from "../../lib/locationSuggest";
import { citySuggest, instantCitySuggest } from "../../lib/citySuggest";
import { RangeCalendar, fmtPill, localTodayISO } from "./RangeCalendar";
import {
  DEFAULT_CHILD_AGE, MAX_ADULTS_PER_ROOM, MAX_CHILDREN_PER_ROOM, MAX_ROOMS, guestsPill, roomsProblem, totals,
  type RoomGuests,
} from "../../lib/hotelRooms";
import "../../styles/orders-workspace.css"; // the .ow-* / .nb-* rules this form is drawn with (the Console doesn't load them otherwise)

// Same as the Search desk's City field (lib/citySuggest.ts): the built-in city directory answers at once
// (instantSuggestions below), Tripsure's live list replaces it only when it answers within 4s, and a slow
// or down Tripsure is not asked again for a minute - so the box never sits on "Searching..." waiting for it.
const defaultSuggestions = (q: string) => (q ? citySuggest(q, rankLocationSuggestions) : Promise.resolve([]));

export function HotelSearchBar({
  city, onCity, location, onLocation, checkIn, checkOut, onDates, rooms, onRooms, busy, onSearch, onProblem,
  fetchSuggestions = defaultSuggestions, showDefaultsOnFocus = false,
}: {
  city: string;
  onCity: (v: string) => void;
  /** The Tripsure location picked from the list (null while only text is typed, or a directory city was picked). */
  location: any | null;
  onLocation: (l: any | null) => void;
  checkIn: string;
  checkOut: string;
  onDates: (checkIn: string, checkOut: string) => void;
  rooms: RoomGuests[];
  onRooms: (r: RoomGuests[]) => void;
  busy: boolean;
  onSearch: () => void;
  /** Called with what is wrong (and the matching panel is opened) instead of searching; null when it clears. */
  onProblem?: (msg: string | null) => void;
  fetchSuggestions?: (q: string) => Promise<any[]>;
  showDefaultsOnFocus?: boolean;
}) {
  const [panel, setPanel] = useState<null | "dates" | "guests">(null); // inline calendar / guests panel
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  const tot = totals(rooms);
  const nRooms = rooms.length;
  const problem = roomsProblem(rooms);
  // Places inside the picked destination (TripSure's popular_locations / popular_poi / popular_hotels).
  const drilldowns = popularDrilldowns(location);

  // ── editing the rooms: each has its own adults and children (with ages) ──
  const editRoom = (i: number, fn: (r: RoomGuests) => RoomGuests) => onRooms(rooms.map((r, j) => (j === i ? fn(r) : r)));
  const addRoom = () => { if (nRooms < MAX_ROOMS) onRooms(rooms.concat([{ adults: 2, childAges: [] }])); };
  const removeRoom = (i: number) => { if (nRooms > 1) onRooms(rooms.filter((_, j) => j !== i)); };
  const setAdults = (i: number, n: number) => editRoom(i, (r) => ({ ...r, adults: Math.max(1, Math.min(MAX_ADULTS_PER_ROOM, n)) }));
  const addChild = (i: number) => editRoom(i, (r) => (r.childAges.length >= MAX_CHILDREN_PER_ROOM ? r : { ...r, childAges: r.childAges.concat([DEFAULT_CHILD_AGE]) }));
  const dropChild = (i: number) => editRoom(i, (r) => ({ ...r, childAges: r.childAges.slice(0, -1) }));
  const setAge = (i: number, k: number, age: number) => editRoom(i, (r) => ({ ...r, childAges: r.childAges.map((a, j) => (j === k ? age : a)) }));

  function search() {
    const say = (m: string | null) => { if (onProblem) onProblem(m); };
    if (!city.trim()) { say("Enter a city or destination."); return; }
    if (!checkOut) { setPanel("dates"); say("Pick a check-out date."); return; }
    if (!(nights >= 1)) { setPanel("dates"); say("Check-out must be after check-in."); return; }
    if (problem) { setPanel("guests"); say(problem); return; }
    say(null);
    setPanel(null);
    onSearch();
  }

  // One small +/- control (inside the guests panel).
  const stepper = (label: string, value: number, min: number, max: number, change: (n: number) => void) => (
    <div className="ow-gstep">
      <span>{label}</span>
      <div className="ow-step">
        <button type="button" disabled={value <= min} aria-label={`Fewer ${label}`} onClick={() => change(value - 1)}><Icon name="minus" size={13} /></button>
        <b>{value}</b>
        <button type="button" disabled={value >= max} aria-label={`More ${label}`} onClick={() => change(value + 1)}><Icon name="plus" size={13} /></button>
      </div>
    </div>
  );

  return (
    <div className="hsb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ow-sbar ow-sbar--hotel">
        <label className={`ow-pill ow-pill--field ow-sbar-where nb-dest${location ? " set" : ""}`}>
          <span className="ow-pill-l"><Icon name="pin" size={12} /> Where to?</span>
          <AutosuggestInput
            className="ow-pill-input"
            value={city}
            onChange={(v: any) => { onCity(String(v)); onLocation(null); }}
            // A directory city has no Tripsure location id behind it: leave `location` empty so Search resolves it live.
            onSelect={(l: any) => { onCity(l.name); onLocation(l._isFallbackDefault ? null : l); }}
            fetchSuggestions={fetchSuggestions}
            instantSuggestions={(q: string) => (q ? instantCitySuggest(q, rankLocationSuggestions) : [])}
            showDefaultsOnFocus={showDefaultsOnFocus}
            floating
            renderSuggestion={(l: any) => (
              <span className="ow-sug">
                <span className="ow-sug-ic"><Icon name="hotel" size={16} /></span>
                <span className="ow-sug-t">
                  <b>{l.name}</b>
                  <small>{[l.type, l.fullName && l.fullName !== l.name ? l.fullName : [l.state, l.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</small>
                </span>
              </span>
            )}
            getKey={(l: any) => String(l.id)}
            placeholder="City, area or hotel"
          />
          {/* Only once a place is picked, and in full: half a line reads worse than none. */}
          {location ? (
            <span className="ow-pill-s nb-place">
              <b>{location.fullName || [location.name, location.state, location.country].filter(Boolean).join(", ")}</b>
              {location.type ? ` · ${location.type}` : ""}
            </span>
          ) : null}
        </label>

        <div className={`ow-pill ow-pill--btn ow-sbar-date${panel === "dates" ? " open" : ""}`}>
          <span className="ow-pill-l nb-start"><i className="nb-dot" /> Check-in</span>
          <button type="button" className="ow-pillbtn" aria-expanded={panel === "dates"}
            onClick={() => setPanel(panel === "dates" ? null : "dates")}>
            <Icon name="calendar" size={14} />
            <span>{fmtPill(checkIn)}</span>
          </button>
        </div>

        <div className={`ow-pill ow-pill--btn ow-sbar-date${panel === "dates" ? " open" : ""}`}>
          <span className="ow-pill-l nb-end"><i className="nb-dot" /> Check-out{nights >= 1 ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}</span>
          <button type="button" className="ow-pillbtn" aria-expanded={panel === "dates"}
            onClick={() => setPanel(panel === "dates" ? null : "dates")}>
            <Icon name="calendar" size={14} />
            <span>{fmtPill(checkOut)}</span>
          </button>
        </div>

        <div className={`ow-pill ow-pill--btn ow-sbar-guests${panel === "guests" ? " open" : ""}`}>
          <span className="ow-pill-l">Guests &amp; rooms</span>
          <button type="button" className="ow-pillbtn" aria-expanded={panel === "guests"}
            onClick={() => setPanel(panel === "guests" ? null : "guests")}>
            <Icon name="people" size={14} />
            <span>{guestsPill(rooms)}</span>
          </button>
        </div>

        <button type="button" className="ow-searchbtn" onClick={search} disabled={busy}>
          <Icon name="search" size={15} />
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {drilldowns.length ? (
        <div className="hsb-drill" aria-label={`More specific places in ${location.name}`}>
          {drilldowns.map((g) => (
            <div className="hsb-drill-row" key={g.key}>
              <span className="hsb-drill-l">{g.label}</span>
              <div className="hsb-drill-chips">
                {g.items.map((it: any) => (
                  <button type="button" className="hsb-chip" key={String(it.id)} title={it.fullName || it.name}
                    onClick={() => { onCity(String(it.name)); onLocation(drilldownLocation(location, it, g)); }}>
                    {it.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {panel === "dates" ? (
        <RangeCalendar
          checkIn={checkIn} checkOut={checkOut} min={localTodayISO()}
          onChange={(i, o) => onDates(i, o)}
          onDone={() => setPanel(null)}
        />
      ) : null}
      {panel === "guests" ? (
        <div className="ow-gpanel ow-rooms" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          {rooms.map((r, i) => (
            <div className="ow-room" key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="ow-gstep" style={{ justifyContent: "space-between" }}>
                <b>Room {i + 1}</b>
                {nRooms > 1 ? <button type="button" className="ow-link" onClick={() => removeRoom(i)} aria-label={`Remove room ${i + 1}`}>Remove</button> : null}
              </div>
              {stepper("Adults 18+", r.adults, 1, MAX_ADULTS_PER_ROOM, (n) => setAdults(i, n))}
              {stepper("Children 0-17", r.childAges.length, 0, MAX_CHILDREN_PER_ROOM, (n) => (n > r.childAges.length ? addChild(i) : dropChild(i)))}
              {r.childAges.length > 0 ? (
                <div className="ow-gstep" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span style={{ width: "100%" }}>Age of each child on the day of travel</span>
                  {r.childAges.map((age, k) => (
                    <select key={k} className="taw-input" aria-label={`Room ${i + 1}, age of child ${k + 1}`} value={age} style={{ width: 92 }}
                      onChange={(e) => setAge(i, k, Number(e.target.value))}>
                      {Array.from({ length: 18 }, (_, a) => <option key={a} value={a}>{a === 0 ? "Under 1" : `${a} yr${a === 1 ? "" : "s"}`}</option>)}
                    </select>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div className="ow-gstep" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="button" className="taw-btn taw-btn--sm" onClick={addRoom} disabled={nRooms >= MAX_ROOMS}><Icon name="plus" size={13} /> Add another room</button>
            <span className="ow-sub">{tot.adults} adult{tot.adults === 1 ? "" : "s"}{tot.children ? `, ${tot.children} child${tot.children === 1 ? "" : "ren"}` : ""} in {nRooms} room{nRooms === 1 ? "" : "s"}</span>
            <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => setPanel(null)} disabled={!!problem}>Done</button>
          </div>
          {problem ? <div className="ow-sub" role="alert" style={{ color: "var(--danger, #b00020)", whiteSpace: "normal" }}>{problem}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
