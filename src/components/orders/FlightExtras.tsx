"use client";
/* Baggage / meals / seats for a locked fare, from TripSure's SSR catalog. Shared by
   New booking (before the fare is confirmed on an order) and the Console's flight
   search (pricing a flight for the itinerary), so both price add-ons the same way. */
import { Icon } from "../ui";
import { inr } from "../../services/api";
import type { DrawerTab } from "./FlightItinerary";
import { SeatMap } from "./SeatMap";

export type Pick = { code: string; label: string; price: number };
export type SegSel = { seat: Pick | null; baggage: Pick | null; meal: Pick | null };
export const NO_PICK: SegSel = { seat: null, baggage: null, meal: null };
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

export const extrasSum = (sel: SegSel[]) => sel.reduce((n, p) => n + (p.seat?.price || 0) + (p.baggage?.price || 0) + (p.meal?.price || 0), 0);

/** "1 baggage, 2 seat" — what has been added, for the price note. */
export function extrasCounts(sel: SegSel[]) {
  const bag = sel.filter((p) => p.baggage).length, seat = sel.filter((p) => p.seat).length, meal = sel.filter((p) => p.meal).length;
  return { bag, seat, meal, text: [bag ? `${bag} baggage` : "", seat ? `${seat} seat` : "", meal ? `${meal} meal` : ""].filter(Boolean).join(", ") };
}

/** The Baggage / Meals / Seats entries of the drawer menu: a count of what's picked, muted when the airline offers none. */
export function extrasDrawerTabs(ssr: any, rows: any[], detail: any, sel: SegSel[]): DrawerTab[] {
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

/** The picker for one add-on kind: segment tabs, then that segment's baggage cards, meal cards or seat map.
 *  One of each per segment, for the lead traveller (how the booking sends them to TripSure). */
export function FlightExtrasPicker({ ssr, rows, detail, tab, sel, seg: segIdx, onSeg, onPick, busy, asked }: {
  ssr: any;
  rows: any[];
  detail: any;
  tab: ExtrasTab;
  sel: SegSel[];
  seg: number;
  onSeg: (i: number) => void;
  onPick: (i: number, kind: "seat" | "baggage" | "meal", v: Pick | null) => void;
  busy?: boolean;
  /** What the customer asked for, shown above the options. */
  asked?: string | null;
}) {
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
  const cur = sel[si] || NO_PICK;
  const kindOf: Record<ExtrasTab, "baggage" | "meal" | "seat"> = { baggage: "baggage", meals: "meal", seats: "seat" };

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
          const n = sel[i]?.[kindOf[tab]] ? 1 : 0;
          return (
            <button key={i} type="button" role="tab" aria-selected={i === si} className={`fi-seg${i === si ? " on" : ""}`} onClick={() => onSeg(i)}>
              <small>{r?.airlineCode || d.airline || ""}</small>
              {r ? `${r.departureAirport} → ${r.arrivalAirport}` : `Segment ${i + 1}`}
              <em className={n ? "got" : ""}>{n}/1</em>
            </button>
          );
        })}
      </div>
      <div className="ow-sel-title">
        {tab === "baggage" ? "Extra baggage" : tab === "meals" ? "Meals" : "Seat selection"}
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
                    <div className="ow-card-s">{inr(pick.price)}</div>
                  </div>
                  <div className="ow-step" aria-label={`Quantity for ${pick.label}`}>
                    <button type="button" disabled={!on || busy} aria-label={`Remove ${pick.label}`}
                      onClick={() => onPick(si, "baggage", null)}><Icon name="minus" size={13} /></button>
                    <b>{on ? 1 : 0}</b>
                    <button type="button" disabled={on || busy} aria-label={`Add ${pick.label}`}
                      onClick={() => onPick(si, "baggage", pick)}><Icon name="plus" size={13} /></button>
                  </div>
                </div>
              );
            })}
            <div className="ow-sub">One extra-baggage option per segment.</div>
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
                    <div className="ow-card-s">{pick.price > 0 ? inr(pick.price) : "Included"}</div>
                  </div>
                  <button type="button" className={`taw-btn taw-btn--sm${on ? "" : " taw-btn--primary"}`} disabled={busy}
                    onClick={() => onPick(si, "meal", on ? null : pick)}>{on ? "Remove" : "Add"}</button>
                </div>
              );
            })}
            <div className="ow-sub">One meal per segment, for the lead traveller.</div>
          </div>
        )
      ) : !block?.offered?.seats ? (
        <div className="ow-sub" style={{ whiteSpace: "normal" }}>
          {d.airlineName || d.airline} doesn&apos;t offer seat selection for this segment on this fare through TripSure
          {block?.offered?.meals ? " — only meals can be pre-ordered. The seat is assigned by the airline at check-in." : ". The seat is assigned by the airline at check-in."}
        </div>
      ) : (
        <SeatMap
          seats={block.seats}
          grid={block.grid || { rows: 0, cols: 0 }}
          selected={cur.seat?.code || null}
          disabled={!!busy}
          onPick={(x) => onPick(si, "seat", x ? { code: x.code, label: `Seat ${x.code}`, price: Number(x.price) || 0 } : null)}
        />
      )}
      <div className="ow-sub" style={{ whiteSpace: "normal", marginTop: 10 }}>
        Add-ons are priced by the airline and sent with the passengers when the ticket is issued — one of each per segment, for the lead traveller.
      </div>
    </>
  );
}
