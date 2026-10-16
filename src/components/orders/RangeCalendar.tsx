"use client";
/* Two-month check-in / check-out range picker. Dates are plain "YYYY-MM-DD"
   strings (same as the form state); all math is done in UTC so a date never
   shifts with the viewer's timezone. First click sets check-in, a later click
   sets check-out; clicking an earlier date (or after a full range) restarts. */
import { useState } from "react";
import { Icon } from "../ui";

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
export const localTodayISO = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
export const fmtPill = (s: string) =>
  s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—";

function Month({ y, m, min, start, end, hover, onPick, onHover }: {
  y: number; m: number; min: string; start: string; end: string; hover: string | null;
  onPick: (d: string) => void; onHover: (d: string | null) => void;
}) {
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  // While choosing a check-out, preview the range up to the hovered day.
  const rangeEnd = end || (start && hover && hover > start ? hover : "");
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(y, m, i + 1))];
  return (
    <div className="ow-cal-month">
      <div className="ow-cal-title">{title}</div>
      <div className="ow-cal-grid">
        {DOW.map((d) => <span key={d} className="ow-cal-dow">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const off = d < min;
          const cls = [
            "ow-cal-day",
            d === start ? "is-start" : "",
            d === rangeEnd ? "is-end" : "",
            start && rangeEnd && d > start && d < rangeEnd ? "in-range" : "",
            start && rangeEnd && d === start && rangeEnd > start ? "has-range" : "",
            d === min ? "is-today" : "",
          ].join(" ");
          return (
            <button key={d} type="button" className={cls} disabled={off}
              onClick={() => onPick(d)} onMouseEnter={() => onHover(d)} onMouseLeave={() => onHover(null)}
              aria-label={fmtPill(d)} aria-pressed={d === start || d === end}>
              {+d.slice(8)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangeCalendar({ checkIn, checkOut, min, onChange, onDone }: {
  checkIn: string; checkOut: string; min: string;
  onChange: (checkIn: string, checkOut: string) => void;
  onDone?: () => void;
}) {
  const base = parse(checkIn || min);
  const [view, setView] = useState({ y: base.y, m: base.m });
  const [hover, setHover] = useState<string | null>(null);
  const next = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
  const prevDisabled = iso(view.y, view.m, 1) <= iso(parse(min).y, parse(min).m, 1);
  const shift = (d: number) => setView((v) => { const t = v.y * 12 + v.m + d; return { y: Math.floor(t / 12), m: t % 12 }; });

  function pick(d: string) {
    if (!checkIn || checkOut || d <= checkIn) {
      onChange(d, ""); // (re)start: this date is the new check-in
    } else {
      onChange(checkIn, d);
      onDone?.();
    }
  }
  const nights = checkIn && checkOut ? Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000) : 0;

  return (
    <div className="ow-cal">
      <div className="ow-cal-pills">
        <div className={`ow-cal-pill${!checkOut ? " on" : ""}`}><small>Check-in</small><b>{fmtPill(checkIn)}</b></div>
        <span className="ow-cal-nights">{nights ? `${nights} night${nights === 1 ? "" : "s"}` : "→"}</span>
        <div className={`ow-cal-pill${checkIn && !checkOut ? " on" : ""}`}><small>Check-out</small><b>{fmtPill(checkOut)}</b></div>
      </div>
      <div className="ow-cal-nav">
        <button type="button" className="ow-cal-arrow" onClick={() => shift(-1)} disabled={prevDisabled} aria-label="Previous month">
          <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
        </button>
        <button type="button" className="ow-cal-arrow" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="chevron" size={14} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
      <div className="ow-cal-months">
        <Month {...view} min={min} start={checkIn} end={checkOut} hover={hover} onPick={pick} onHover={setHover} />
        <Month {...next} min={min} start={checkIn} end={checkOut} hover={hover} onPick={pick} onHover={setHover} />
      </div>
    </div>
  );
}
