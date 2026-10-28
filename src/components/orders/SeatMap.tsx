"use client";
/* Seat map drawn from TripSure's own seat object (backend flight_ssr_service):
   grid {rows, cols} = sData (rows = highest row NUMBER, cols counts the aisle),
   each seat {code,row,col,pos,price,booked,legroom,exit,wca,window,aisle}.
   A column position that holds no seat is an aisle; a row number with no seats
   (e.g. no row 13) is shown as a gap, never silently skipped. */
import { useMemo, useState } from "react";
import { inr } from "../../services/api";

export type MapSeat = {
  code: string; row: number; col: string; pos: number | null; price: number;
  booked: boolean; legroom: boolean; exit: boolean; wca: boolean; window: boolean; aisle: boolean;
};

// Price bands from this flight's own prices: each distinct price up to 4, else 4 quantile groups.
function bandsOf(seats: MapSeat[]) {
  const prices = Array.from(new Set(seats.filter((s) => !s.booked).map((s) => s.price))).sort((a, b) => a - b);
  const paid = prices.filter((p) => p > 0);
  const groups: number[][] = [];
  if (paid.length <= 3) paid.forEach((p) => groups.push([p]));
  else for (let i = 0; i < 3; i++) groups.push(paid.slice(Math.floor((paid.length * i) / 3), Math.floor((paid.length * (i + 1)) / 3)));
  const bands = [
    ...(prices.includes(0) ? [{ lo: 0, hi: 0, label: "Free" }] : []),
    ...groups.filter((g) => g.length).map((g) => ({ lo: g[0], hi: g[g.length - 1], label: g[0] === g[g.length - 1] ? inr(g[0]) : `${inr(g[0])} – ${inr(g[g.length - 1])}` })),
  ];
  return bands;
}

const feat = (s: MapSeat) =>
  [s.window ? "window" : s.aisle ? "aisle" : "middle", s.legroom ? "extra legroom" : "", s.exit ? "exit row" : "", s.wca ? "wheelchair-accessible" : ""].filter(Boolean).join(" · ");

export function SeatMap({ seats, grid, selected, disabled, onPick }: {
  seats: MapSeat[]; grid: { rows: number; cols: number }; selected: string | null; disabled: boolean; onPick: (s: MapSeat | null) => void;
}) {
  const [hover, setHover] = useState<MapSeat | null>(null);
  const m = useMemo(() => {
    const lastRow = Math.max(grid.rows || 0, ...seats.map((s) => s.row));
    const cols = Math.max(grid.cols || 0, ...seats.map((s) => s.pos || 0));
    const byPos = new Map<number, MapSeat[]>();
    seats.forEach((s) => { if (s.pos) byPos.set(s.pos, [...(byPos.get(s.pos) || []), s]); });
    const letter = (p: number) => byPos.get(p)?.[0]?.col || "";
    const at = new Map(seats.map((s) => [`${s.row}:${s.pos}`, s]));
    const rowsWithSeats = new Set(seats.map((s) => s.row));
    const exitRows = new Set(seats.filter((s) => s.exit).map((s) => s.row));
    const positions = Array.from({ length: cols }, (_, i) => i + 1);
    const bands = bandsOf(seats);
    const bandIdx = (price: number) => bands.findIndex((b) => price >= b.lo && price <= b.hi);
    return { lastRow, positions, letter, at, rowsWithSeats, exitRows, bands, bandIdx, hasWca: seats.some((s) => s.wca) };
  }, [seats, grid]);

  const chosen = selected ? seats.find((s) => s.code === selected) || null : null;
  const shown = hover || chosen;
  const rows = Array.from({ length: m.lastRow }, (_, i) => i + 1);

  return (
    <div className="ow-sm">
      <div className="ow-sm-legend">
        {m.bands.map((b, i) => (
          <span key={b.label}><i className={`ow-sm-seat b${b.lo === 0 && b.hi === 0 ? "f" : Math.min(i, 3)}`} /> {b.label}</span>
        ))}
        <span><i className="ow-sm-seat sel" /> Selected</span>
        <span><i className="ow-sm-seat booked" /> Taken</span>
        <span><i className="ow-sm-seat b1 leg" /> Extra legroom</span>
        <span><i className="ow-sm-seat b1 exit" /> Exit row</span>
        {m.hasWca ? <span><i className="ow-sm-seat b1 wca" /> Wheelchair-accessible</span> : null}
      </div>

      <div className="ow-sm-plane" onMouseLeave={() => setHover(null)}>
        <div className="ow-sm-nose">Front of cabin</div>
        <div className="ow-sm-row ow-sm-head" aria-hidden>
          <span className="ow-sm-no" />
          {m.positions.map((p) => <span key={p} className={`ow-sm-col${m.letter(p) ? "" : " aisle"}`}>{m.letter(p)}</span>)}
          <span className="ow-sm-no" />
        </div>
        <div className="ow-sm-scroll">
          {rows.map((r) => {
            if (!m.rowsWithSeats.has(r)) {
              return <div key={r} className="ow-sm-gap">Row {r} · no seats</div>;
            }
            return (
              <div key={r} className={`ow-sm-row${m.exitRows.has(r) ? " exitrow" : ""}`}>
                <span className="ow-sm-no">{r}</span>
                {m.positions.map((p) => {
                  const s = m.at.get(`${r}:${p}`);
                  if (!s) return <span key={p} className={`ow-sm-col${m.letter(p) ? " blank" : " aisle"}`} />;
                  const on = selected === s.code;
                  const cls = s.booked ? "booked" : on ? "sel" : `b${s.price === 0 ? "f" : Math.min(Math.max(m.bandIdx(s.price), 0), 3)}`;
                  return (
                    <button key={p} type="button" disabled={disabled || s.booked}
                      className={`ow-sm-seat ${cls}${s.legroom ? " leg" : ""}${s.exit ? " exit" : ""}${s.wca ? " wca" : ""}`}
                      aria-label={`Seat ${s.code}${s.booked ? ", taken" : `, ${s.price > 0 ? inr(s.price) : "free"}, ${feat(s)}`}`}
                      aria-pressed={on}
                      onMouseEnter={() => setHover(s)} onFocus={() => setHover(s)} onBlur={() => setHover(null)}
                      onClick={() => onPick(on ? null : s)} />
                  );
                })}
                <span className="ow-sm-no">{r}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ow-sm-info" aria-live="polite">
        {shown ? (
          <>
            <b>Seat {shown.code}</b>
            <span>{shown.booked ? "Already taken" : shown.price > 0 ? inr(shown.price) : "Free"}</span>
            <small>{feat(shown)}</small>
          </>
        ) : <small>Hover a seat to see its price, tap to choose it.</small>}
        {chosen ? (
          <button type="button" className="taw-btn taw-btn--sm" disabled={disabled} onClick={() => onPick(null)}>
            Remove {chosen.code} ({chosen.price > 0 ? inr(chosen.price) : "free"})
          </button>
        ) : null}
      </div>
    </div>
  );
}
