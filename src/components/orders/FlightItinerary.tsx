"use client";
/* The "Flight itinerary" side panel of New booking, laid out like TripSure's own:
   a left menu (Timeline, Fare options, then Baggage / Meals / Seats once the fare
   is locked), the chosen section on the right, and the price with the next action
   at the bottom. It slides over the results list, so the advisor never leaves the
   booking. */
import type { ReactNode } from "react";
import { Icon } from "../ui";
import { AIRPORTS } from "../../lib/airports";
import { durationLabel } from "../../lib/realOrders";

export type DrawerTab = { key: string; label: string; icon: string; badge?: string | null; muted?: boolean };

export function ItineraryDrawer({ title = "Flight itinerary", tabs, active, onTab, onClose, closeLabel = "Close", busy, children, price, priceNote, actions }: {
  title?: string;
  tabs: DrawerTab[];
  active: string;
  onTab: (key: string) => void;
  onClose: () => void;
  closeLabel?: string;
  busy?: boolean;
  children: ReactNode;
  price: ReactNode;
  priceNote: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="fi-back" role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="fi-panel">
        <div className="fi-head">
          <h3>{title}</h3>
          <button type="button" className="nb-close" onClick={onClose} disabled={busy} aria-label={closeLabel}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="fi-body">
          <nav className="fi-nav" role="tablist" aria-orientation="vertical">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={active === t.key}
                className={`fi-tab${active === t.key ? " on" : ""}${t.muted ? " muted" : ""}`} onClick={() => onTab(t.key)}>
                <Icon name={t.icon} size={16} />
                <span>{t.label}</span>
                {t.badge ? <em>{t.badge}</em> : null}
              </button>
            ))}
          </nav>
          <div className="fi-main" role="tabpanel">{children}</div>
        </div>
        <div className="fi-foot">
          <div className="fi-price"><b>{price}</b><small>{priceNote}</small></div>
          <div className="fi-actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ts?: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(ts || "");
  return m ? `${m[1]}:${m[2]}` : "--:--";
};
const dayOf = (ts?: string) => (ts || "").slice(0, 10);
const mins = (a?: string, b?: string) => {
  const x = Date.parse(`${(a || "").slice(0, 16)}:00Z`), y = Date.parse(`${(b || "").slice(0, 16)}:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 60_000) : null;
};
const dayLabel = (ts?: string) => {
  const d = dayOf(ts);
  return d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }) : "";
};
const airportName = (code?: string) => AIRPORTS.find((a) => a.airport_code === code)?.airport_name || "";
const terminal = (s: any, side: "dep" | "arr") =>
  side === "dep" ? s.departureTerminal ?? s.depTerminal ?? s.originTerminal : s.arrivalTerminal ?? s.arrTerminal ?? s.destinationTerminal;
// "+1" when a time falls on a later day than the leg's departure.
const plusDays = (from?: string, to?: string) => {
  const a = Date.parse(`${dayOf(from)}T00:00:00Z`), b = Date.parse(`${dayOf(to)}T00:00:00Z`);
  const n = Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : 0;
  return n > 0 ? `+${n}` : null;
};

/** Every leg of the chosen flight(s), segment by segment: times, airports and
 *  terminals, the airline and flight number, and each layover (flagged when long
 *  or when the terminal changes). */
export function FlightTimeline({ legs }: { legs: { label?: string; segments: any[] }[] }) {
  return (
    <div className="fi-tl-legs">
      {legs.map((leg, li) => {
        const segs = leg.segments || [];
        if (!segs.length) return null;
        const first = segs[0], last = segs[segs.length - 1];
        return (
          <section className="fi-tl" key={li}>
            <div className="fi-tl-head">
              {leg.label ? <span className="fi-tl-leg">{leg.label}</span> : null}
              <b>{first.departureAirport} → {last.arrivalAirport}</b>
              <span>· {dayLabel(first.departureDateTime)}</span>
            </div>
            {segs.map((s: any, i: number) => {
              const next = segs[i + 1];
              const wait = next ? mins(s.arrivalDateTime, next.departureDateTime) : null;
              const tArr = terminal(s, "arr"), tNext = next ? terminal(next, "dep") : null;
              const terminalChange = next && tArr && tNext && String(tArr) !== String(tNext);
              return (
                <div key={i}>
                  <div className="fi-tl-row">
                    <span className="fi-tl-time">{clock(s.departureDateTime)}{i > 0 ? <sup>{plusDays(first.departureDateTime, s.departureDateTime)}</sup> : null}</span>
                    <span className="fi-tl-dot" />
                    <span className="fi-tl-place">
                      <b>{s.departureAirport}{terminal(s, "dep") ? ` · Terminal ${terminal(s, "dep")}` : ""}</b>
                      <small>{airportName(s.departureAirport)}</small>
                    </span>
                  </div>
                  <div className="fi-tl-row fi-tl-fly">
                    <span className="fi-tl-time small">{s.durationInMins ? durationLabel(s.durationInMins) : ""}</span>
                    <span className="fi-tl-line" />
                    <span className="fi-tl-place">
                      <b>{s.airlineName || s.airlineCode}</b>
                      <small>{[s.airlineCode && s.flightNumber ? `${s.airlineCode} ${s.flightNumber}` : s.flightNumber, s.aircraft || s.equipment].filter(Boolean).join(" · ")}</small>
                    </span>
                  </div>
                  <div className="fi-tl-row">
                    <span className="fi-tl-time">{clock(s.arrivalDateTime)}<sup>{plusDays(first.departureDateTime, s.arrivalDateTime)}</sup></span>
                    <span className={`fi-tl-dot${next ? " open" : ""}`} />
                    <span className="fi-tl-place">
                      <b>{s.arrivalAirport}{tArr ? ` · Terminal ${tArr}` : ""}</b>
                      <small>{airportName(s.arrivalAirport)}</small>
                    </span>
                  </div>
                  {next ? (
                    <div className={`fi-tl-layover${wait != null && wait >= 240 ? " long" : ""}`}>
                      <span className="fi-tl-time small">{wait != null ? `${Math.floor(wait / 60)}h ${pad(wait % 60)}m` : ""}</span>
                      <span className="fi-tl-wait" />
                      <span className="fi-tl-place">
                        <b>{wait != null && wait >= 240 ? "Long layover" : "Layover"} in {s.arrivalAirport}</b>
                        <small>{terminalChange ? `Change of terminal: ${tArr} → ${tNext}` : tArr && tNext ? "Same terminal" : "Check the terminal at the airport"}</small>
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
