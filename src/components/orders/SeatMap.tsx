"use client";
/* Seat map drawn from TripSure's own seat object (backend flight_ssr_service):
   grid {rows, cols} = sData (rows = highest row NUMBER, cols counts the aisle),
   each seat {code,row,col,pos,price,booked,legroom,exit,wca,window,aisle}.
   A column position that holds no seat is an aisle; a row number with no seats
   (e.g. no row 13) is shown as a gap, never silently skipped. */
import { useMemo, useRef, useState } from "react";
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
  // Each band has its own hue (f = free, p0..p2 = cheapest..dearest paid) so two prices never
  // look alike: shades of one colour were too easy to confuse when picking a seat.
  const bands = [
    ...(prices.includes(0) ? [{ lo: 0, hi: 0, label: "Free", key: "f" }] : []),
    ...groups.filter((g) => g.length).map((g, i) => ({
      lo: g[0], hi: g[g.length - 1], key: `p${i}`,
      label: g[0] === g[g.length - 1] ? inr(g[0]) : `${inr(g[0])} – ${inr(g[g.length - 1])}`,
    })),
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
    const bandKey = (price: number) => (bands.find((b) => price >= b.lo && price <= b.hi) || bands[bands.length - 1])?.key || "p0";
    return { lastRow, positions, letter, at, rowsWithSeats, exitRows, bands, bandKey, hasWca: seats.some((s) => s.wca) };
  }, [seats, grid]);

  const chosen = selected ? seats.find((s) => s.code === selected) || null : null;
  // Price bubble right above the hovered seat, positioned inside the plane outline.
  const planeRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ s: MapSeat; x: number; y: number } | null>(null);
  function showTip(s: MapSeat, el: HTMLElement) {
    setHover(s);
    const box = planeRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (box) setTip({ s, x: r.left - box.left + r.width / 2, y: r.top - box.top });
  }
  function hideTip() { setHover(null); setTip(null); }
  const shown = hover || chosen;
  const rows = Array.from({ length: m.lastRow }, (_, i) => i + 1);

  return (
    <div className="ow-sm">
      <div className="ow-sm-legend">
        {m.bands.map((b, i) => (
          <span key={b.label} className="ow-sm-band"><i className={`ow-sm-seat ${b.key}`} /> {b.label}</span>
        ))}
        <span><i className="ow-sm-seat sel" /> Selected</span>
        <span><i className="ow-sm-seat booked" /> Taken</span>
        <span><i className="ow-sm-seat plain leg" /> Extra legroom</span>
        <span><i className="ow-sm-seat plain exit" /> Exit row</span>
        {m.hasWca ? <span><i className="ow-sm-seat plain wca" /> Wheelchair-accessible</span> : null}
      </div>

      <div className="ow-sm-plane" ref={planeRef} onMouseLeave={hideTip}>
        {tip ? (
          <div className="ow-sm-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
            <b>{tip.s.code}</b> · {tip.s.booked ? "taken" : tip.s.price > 0 ? inr(tip.s.price) : "Free"}
            <small>{feat(tip.s)}</small>
          </div>
        ) : null}
        <div className="ow-sm-nose">Front of cabin</div>
        <div className="ow-sm-row ow-sm-head" aria-hidden>
          <span className="ow-sm-no" />
          {m.positions.map((p) => <span key={p} className={`ow-sm-col${m.letter(p) ? "" : " aisle"}`}>{m.letter(p)}</span>)}
          <span className="ow-sm-no" />
        </div>
        <div className="ow-sm-scroll" onScroll={hideTip}>
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
                  const cls = s.booked ? "booked" : on ? "sel" : s.price === 0 ? "f" : m.bandKey(s.price);
                  return (
                    <button key={p} type="button" disabled={disabled || s.booked}
                      className={`ow-sm-seat ${cls}${s.legroom ? " leg" : ""}${s.exit ? " exit" : ""}${s.wca ? " wca" : ""}`}
                      aria-label={`Seat ${s.code}${s.booked ? ", taken" : `, ${s.price > 0 ? inr(s.price) : "free"}, ${feat(s)}`}`}
                      aria-pressed={on}
                      onMouseEnter={(e) => showTip(s, e.currentTarget)} onFocus={(e) => showTip(s, e.currentTarget)} onBlur={hideTip}
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
