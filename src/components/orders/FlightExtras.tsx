"use client";
/* Baggage / meals / seats for a locked fare, from TripSure's SSR catalog. Shared by
   New booking (before the fare is confirmed on an order) and the Console's flight
   search (pricing a flight for the itinerary), so both price add-ons the same way.
   Picks are per segment AND per traveller: TripSure's Update Itinerary takes `ssr` on
   each passenger, so 9 travellers can have 9 seats, 9 meals and 9 bags. */
import { useState } from "react";
import { Icon } from "../ui";
import { inr } from "../../services/api";
import type { DrawerTab } from "./FlightItinerary";
import { SeatMap } from "./SeatMap";

export type Pick = { code: string; label: string; price: number };
export type SegSel = { seat: Pick | null; baggage: Pick | null; meal: Pick | null };
export const NO_PICK: SegSel = { seat: null, baggage: null, meal: null };
/** sel[segment][traveller] */
export type ExtrasSel = SegSel[][];

/** A traveller who can take add-ons. n is the server's pax_index: adults then children,
 *  lead first, the order TripSure lists passengers in. Infants sit on a lap: no add-ons. */
export type PaxSlot = { n: number; label: string };
export function paxSlots(adults?: number, children?: number): PaxSlot[] {
  const a = Math.max(1, Number(adults) || 0), c = Math.max(0, Number(children) || 0);
  return [
    ...Array.from({ length: a }, (_, i) => ({ n: i + 1, label: i === 0 ? (a + c > 1 ? "Adult 1 (lead)" : "Traveller") : `Adult ${i + 1}` })),
    ...Array.from({ length: c }, (_, i) => ({ n: a + i + 1, label: `Child ${i + 1}` })),
  ];
}
export const emptySel = (segments: number, pax: number): ExtrasSel =>
  Array.from({ length: Math.max(1, segments) }, () => Array.from({ length: Math.max(1, pax) }, () => NO_PICK));
export const withPick = (sel: ExtrasSel, seg: number, pax: number, kind: keyof SegSel, v: Pick | null): ExtrasSel =>
  sel.map((row, i) => (i !== seg ? row : row.map((p, j) => (j === pax ? { ...p, [kind]: v } : p))));
/** Every pick as one list, with its segment and traveller. */
export function extrasList(sel: ExtrasSel, pax: PaxSlot[]) {
  const out: { seg: number; pax: PaxSlot; kind: "baggage" | "seat" | "meal"; pick: Pick }[] = [];
  sel.forEach((row, si) => row.forEach((p, pi) => (["baggage", "seat", "meal"] as const).forEach((kind) => {
    const pick = p[kind];
    if (pick) out.push({ seg: si, pax: pax[pi] || { n: pi + 1, label: `Traveller ${pi + 1}` }, kind, pick });
  })));
  return out;
}
/** The confirm request's segments: one entry per segment and traveller with something picked. */
export function selSegments(sel: ExtrasSel) {
  const out: any[] = [];
  sel.forEach((row, si) => row.forEach((p, pi) => {
    if (!(p.seat || p.baggage || p.meal)) return;
    const one = (x: Pick | null) => (x ? { code: x.code, label: x.label, price: x.price } : null);
    out.push({ segment_order: si + 1, pax_index: pi + 1, seat: one(p.seat), baggage: one(p.baggage), meal: one(p.meal) });
  }));
  return out;
}
export type ExtrasTab = "baggage" | "meals" | "seats";
export const EXTRAS_TABS: string[] = ["baggage", "meals", "seats"];

// Sector keys look like "2_DEL$BOM" ({providerId}_{origin}${dest}).
export function ssrSector(catalog: any, o?: string, d?: string): any | null {
  const data = catalog && typeof catalog.data === "object" && catalog.data ? catalog.data : catalog || {};
  const suffix = `_${o}$${d}`;
  const hits = Object.keys(data).filter((k) => k.endsWith(suffix));
  return hits.length === 1 ? data[hits[0]] : null;
}
// The server's normalized SSR (flight_ssr_service): same sector keys, stable
// baggage / meals / seats lists. Seats the airline lists as booked are left out,
// so the grid shows them as occupied.
export function ssrNorm(catalog: any, o?: string, d?: string): any | null {
  const n = catalog?.normalized || {};
  const hits = Object.keys(n).filter((k) => k.endsWith(`_${o}$${d}`));
  return hits.length === 1 ? n[hits[0]] : null;
}
const baggageLabel = (b: any) => b.text || (b.weight ? `Extra ${b.weight} kg` : b.code);

function fmtDay(ts?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ts || "");
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

const blockFor = (ssr: any, seg: any, detail: any) =>
  seg ? ssrNorm(ssr, seg.departureAirport, seg.arrivalAirport) : ssrNorm(ssr, detail.originCode, detail.destCode);

export const extrasSum = (sel: ExtrasSel) => sel.flat().reduce((n, p) => n + (p.seat?.price || 0) + (p.baggage?.price || 0) + (p.meal?.price || 0), 0);

/** "1 baggage, 2 seat" — what has been added, for the price note. */
export function extrasCounts(sel: ExtrasSel) {
  const all = sel.flat();
  const bag = all.filter((p) => p.baggage).length, seat = all.filter((p) => p.seat).length, meal = all.filter((p) => p.meal).length;
  return { bag, seat, meal, text: [bag ? `${bag} baggage` : "", seat ? `${seat} seat${seat > 1 ? "s" : ""}` : "", meal ? `${meal} meal${meal > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ") };
}

/** The Baggage / Meals / Seats entries of the drawer menu: a count of what's picked, muted when the airline offers none. */
export function extrasDrawerTabs(ssr: any, rows: any[], detail: any, sel: ExtrasSel): DrawerTab[] {
  const offered = (k: string) => rows.some((r) => !!blockFor(ssr, r, detail)?.offered?.[k]);
  const c = extrasCounts(sel);
  return [
    { key: "baggage", label: "Baggage", icon: "luggage", badge: c.bag ? String(c.bag) : null, muted: !offered("baggage") },
    { key: "meals", label: "Meals", icon: "note", badge: c.meal ? String(c.meal) : null, muted: !offered("meals") },
    { key: "seats", label: "Seats", icon: "flight", badge: c.seat ? String(c.seat) : null, muted: !offered("seats") },
  ];
}

/** The first add-on tab the airline actually offers something for on the first segment (Air India often has meals only). */
export function firstExtrasTab(ssr: any, seg: any, detail: any): ExtrasTab {
  const first = blockFor(ssr, seg, detail)?.offered;
  return first?.baggage ? "baggage" : first?.seats ? "seats" : first?.meals ? "meals" : "baggage";
}

/** The picker for one add-on kind: segment tabs, traveller tabs, then that traveller's
 *  baggage cards, meal cards or seat map. One of each per traveller per segment. */
export function FlightExtrasPicker({ ssr, rows, detail, tab, sel, pax, infants, seg: segIdx, onSeg, onPick, busy, asked }: {
  ssr: any;
  rows: any[];
  detail: any;
  tab: ExtrasTab;
  sel: ExtrasSel;
  /** Travellers who can take add-ons (paxSlots). */
  pax: PaxSlot[];
  /** Infants on the fare: named in a note, they take no add-ons. */
  infants?: number;
  seg: number;
  onSeg: (i: number) => void;
  onPick: (seg: number, pax: number, kind: "seat" | "baggage" | "meal", v: Pick | null) => void;
  busy?: boolean;
  /** What the customer asked for, shown above the options. */
  asked?: string | null;
}) {
  const [whoRaw, setWho] = useState(0);
  const d = detail || {};
  const si = Math.min(segIdx, rows.length - 1);
  const seg = rows[si];
  const block = blockFor(ssr, seg, d);
  const bagOpts: any[] = (block?.baggage || []).map((b: any) => ({ ...b, text: b.label }));
  const mealOpts: any[] = block?.meals || [];
  const noneAtAll = rows.every((s: any) => {
    const b = blockFor(ssr, s, d);
    return !b?.offered?.baggage && !b?.offered?.seats && !b?.offered?.meals;
  });
  const kindOf: Record<ExtrasTab, "baggage" | "meal" | "seat"> = { baggage: "baggage", meals: "meal", seats: "seat" };
  const kind = kindOf[tab];
  const row: SegSel[] = sel[si] || [];
  const who = Math.min(whoRaw, pax.length - 1);
  const cur = row[who] || NO_PICK;
  const many = pax.length > 1;
  // After a pick, move on to the next traveller who still has none of this kind.
  const pickFor = (v: Pick | null) => {
    onPick(si, who, kind, v);
    if (!v || !many) return;
    const next = pax.findIndex((_, j) => j > who && !row[j]?.[kind]);
    if (next >= 0) setWho(next);
  };
  const pickAll = (v: Pick) => pax.forEach((_, j) => onPick(si, j, kind, v));
  const allHave = (code: string) => pax.every((_, j) => row[j]?.[kind]?.code === code);
  // Seats other travellers already hold on this segment can't be picked again.
  const heldBy: Record<string, string> = {};
  row.forEach((p, j) => { if (j !== who && p?.seat) heldBy[p.seat.code] = pax[j]?.label || `Traveller ${j + 1}`; });
  const summary = (p: SegSel | undefined) => {
    const x = p?.[kind];
    return x ? (kind === "seat" ? x.code : x.label) : "None";
  };

  if (noneAtAll) {
    return (
      <div className="ow-empty">
        <Icon name="luggage" size={20} />
        <div><b>No add-ons available for this fare</b></div>
        <div className="ow-sub">The airline returned no seat map, extra baggage or meals for this flight ({d.airlineName || d.airline}). That is the airline&apos;s answer for this fare, not an error — the fare goes ahead without add-ons.</div>
      </div>
    );
  }
  return (
    <>
      {asked ? <div className="taw-banner taw-banner--info" style={{ whiteSpace: "normal" }}>The customer asked for: {asked}.</div> : null}
      <div className="fi-segs" role="tablist" aria-label="Flight segments">
        {rows.map((r: any, i: number) => {
          const n = (sel[i] || []).filter((p) => p?.[kind]).length;
          return (
            <button key={i} type="button" role="tab" aria-selected={i === si} className={`fi-seg${i === si ? " on" : ""}`} onClick={() => onSeg(i)}>
              <small>{r?.airlineCode || d.airline || ""}</small>
              {r ? `${r.departureAirport} → ${r.arrivalAirport}` : `Segment ${i + 1}`}
              <em className={n ? "got" : ""}>{n}/{pax.length}</em>
            </button>
          );
        })}
      </div>
      {many ? (
        <div className="fi-segs fi-pax" role="tablist" aria-label="Travellers">
          {pax.map((p, j) => (
            <button key={p.n} type="button" role="tab" aria-selected={j === who} className={`fi-seg${j === who ? " on" : ""}${row[j]?.[kind] ? " got" : ""}`} onClick={() => setWho(j)}>
              <small>{p.label}</small>
              <span>{summary(row[j])}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="ow-sel-title">
        {tab === "baggage" ? "Extra baggage" : tab === "meals" ? "Meals" : "Seat selection"}
        {many ? ` for ${pax[who].label}` : ""}
        <span className="ow-sub">
          {seg ? `${seg.departureAirport} → ${seg.arrivalAirport} · ${fmtDay(seg.departureDateTime)}` : "Flight preferences"}
        </span>
      </div>
      {tab === "baggage" ? (
        bagOpts.length === 0 ? (
          <div className="ow-sub" style={{ whiteSpace: "normal" }}>{d.airlineName || d.airline} offers no extra baggage for this segment on this fare — the fare&apos;s included baggage applies.</div>
        ) : (
          <div className="ow-cards">
            {bagOpts.map((b: any) => {
              const on = cur.baggage?.code === b.code;
              const pick: Pick = { code: b.code, label: baggageLabel(b), price: Number(b.price) || 0 };
              return (
                <div key={b.code} className={`ow-card${on ? " on" : ""}`}>
                  <span className="ow-card-ic"><Icon name="luggage" size={18} /></span>
                  <div className="ow-card-main">
                    <div className="ow-card-t">{pick.label}</div>
                    <div className="ow-card-s">{inr(pick.price)}{many ? " per traveller" : ""}</div>
                  </div>
                  {many ? (
                    <button type="button" className="taw-btn taw-btn--sm" disabled={busy || allHave(b.code)} onClick={() => pickAll(pick)}>
                      Add for all {pax.length}
                    </button>
                  ) : null}
                  <button type="button" className={`taw-btn taw-btn--sm${on ? "" : " taw-btn--primary"}`} disabled={busy}
                    onClick={() => pickFor(on ? null : pick)}>{on ? "Remove" : "Add"}</button>
                </div>
              );
            })}
            <div className="ow-sub">One extra-baggage option per traveller per segment.</div>
          </div>
        )
      ) : tab === "meals" ? (
        mealOpts.length === 0 ? (
          <div className="ow-sub">No meals can be pre-ordered for this segment.</div>
        ) : (
          <div className="ow-cards">
            {mealOpts.map((m: any) => {
              const on = cur.meal?.code === m.code;
              const pick: Pick = { code: m.code, label: m.label, price: Number(m.price) || 0 };
              return (
                <div key={m.code} className={`ow-card${on ? " on" : ""}`}>
                  <span className="ow-card-ic"><Icon name="note" size={18} /></span>
                  <div className="ow-card-main">
                    <div className="ow-card-t">{m.label}{m.special ? " · special" : ""}</div>
                    <div className="ow-card-s">{pick.price > 0 ? inr(pick.price) + (many ? " per traveller" : "") : "Included"}</div>
                  </div>
                  {many ? (
                    <button type="button" className="taw-btn taw-btn--sm" disabled={busy || allHave(m.code)} onClick={() => pickAll(pick)}>
                      Add for all {pax.length}
                    </button>
                  ) : null}
                  <button type="button" className={`taw-btn taw-btn--sm${on ? "" : " taw-btn--primary"}`} disabled={busy}
                    onClick={() => pickFor(on ? null : pick)}>{on ? "Remove" : "Add"}</button>
                </div>
              );
            })}
            <div className="ow-sub">One meal per traveller per segment.</div>
          </div>
        )
      ) : !block?.offered?.seats ? (
        <div className="ow-sub" style={{ whiteSpace: "normal" }}>
          {d.airlineName || d.airline} doesn&apos;t offer seat selection for this segment on this fare through TripSure
          {block?.offered?.meals ? " — only meals can be pre-ordered. The seat is assigned by the airline at check-in." : ". The seat is assigned by the airline at check-in."}
        </div>
      ) : (
        <SeatMap
          seats={Object.keys(heldBy).length ? block.seats.map((x: any) => (heldBy[x.code] ? { ...x, booked: true } : x)) : block.seats}
          grid={block.grid || { rows: 0, cols: 0 }}
          selected={cur.seat?.code || null}
          disabled={!!busy}
          onPick={(x) => pickFor(x ? { code: x.code, label: `Seat ${x.code}`, price: Number(x.price) || 0 } : null)}
        />
      )}
      <div className="ow-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
        Add-ons are priced by the airline and sent on each traveller&apos;s own booking when the ticket is issued.
        {many ? " Picking one moves on to the next traveller." : ""}
        {infants ? ` ${infants === 1 ? "The infant travels" : `The ${infants} infants travel`} on an adult's lap, without a seat, meal or extra bag.` : ""}
      </div>
    </>
  );
}
