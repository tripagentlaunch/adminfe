"use client";
/* =============================================================================
 * TripAgent — src/components/orders/TicketingWatchPanel.tsx
 *
 * "Paid, but not ticketed": the strip at the top of the Orders list for orders where the customer has
 * paid but the ticket or hotel room is not done (GET /booking-orders/ticketing-watch). Each row says
 * why, how long it has been waiting, and what to do next; flights also have "Ask TripSure" (read-only),
 * which shows TripSure's own status for the order. Shows nothing while everything is fine.
 * It only points at the order: the fix is the order's own Check status / Issue ticket / Record refund.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../ui";
import { bookingAskTripsure, bookingTicketingWatch } from "../../services/api";
import { errText } from "../../lib/errText";

type Finding = {
  order_id: string; order_number?: string; customer_name?: string; kind: "flight" | "hotel"; label: string;
  code: string; severity: "high" | "medium"; headline: string; next_step: string; paid: number; currency?: string;
  minutes_waiting: number; itinerary_id: string; item_id: string;
};
type Asked = { tripsure_status?: string | null; meaning?: string; pnrs?: string[]; out_of_sync?: boolean } | { error: string } | "loading";

const REFRESH_MS = 60000;

/** 45 -> "45 min", 130 -> "2 h 10 min", 1229 -> "20 h 29 min", 3000 -> "2 days". */
export function waitText(min: number): string {
  if (min < 60) return `${Math.max(min, 1)} min`;
  if (min < 2880) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(min / 1440)} days`;
}
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function TicketingWatchPanel({ onOpenOrder }: { onOpenOrder: (orderNumber: string) => void }) {
  const [items, setItems] = useState<Finding[]>([]);
  const [open, setOpen] = useState(true);
  const [asked, setAsked] = useState<Record<string, Asked>>({});

  const load = useCallback(() => {
    bookingTicketingWatch()
      .then((r: any) => setItems(Array.isArray(r && r.items) ? r.items : []))
      .catch(() => { /* a missing strip never blocks the list: keep what is shown */ });
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  if (!items.length) return null;
  const high = items.filter((i) => i.severity === "high").length;

  function ask(f: Finding) {
    setAsked((m) => ({ ...m, [f.item_id]: "loading" }));
    bookingAskTripsure(f.itinerary_id)
      .then((r: any) => setAsked((m) => ({ ...m, [f.item_id]: r })))
      .catch((e: any) => setAsked((m) => ({ ...m, [f.item_id]: { error: errText(e) } })));
  }

  return (
    <div className={"ow-tw" + (high ? " is-high" : "")} role="region" aria-label="Paid but not ticketed">
      <button type="button" className="ow-tw-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="alert" size={15} />
        <b>Paid, but not ticketed</b>
        <span className="ow-tw-n">{items.length}</span>
        <span className="ow-tw-sub">{high ? `${high} need action now` : "worth a look"}</span>
        <Icon name="chevron" size={13} />
      </button>
      {open ? (
        <ul className="ow-tw-list">
          {items.map((f) => {
            const a = asked[f.item_id];
            return (
              <li key={f.item_id + f.code} className={"ow-tw-item is-" + f.severity}>
                <div className="ow-tw-top">
                  <b>{f.order_number || "Order"}</b>
                  <span>{f.customer_name}</span>
                  <span className="ow-tw-wait">{inr(f.paid)} paid · waiting {waitText(f.minutes_waiting)}</span>
                </div>
                <div className="ow-tw-what"><Icon name={f.kind === "flight" ? "flight" : "hotel"} size={13} /> {f.label}</div>
                <div className="ow-tw-why">{f.headline}</div>
                <div className="ow-tw-next">{f.next_step}</div>
                {a && a !== "loading" && !("error" in a) ? (
                  <div className={"ow-tw-ans" + (a.out_of_sync ? " is-sync" : "")} role="status">
                    <b>TripSure: {a.tripsure_status || "no status"}</b>{a.pnrs && a.pnrs.length ? ` · PNR ${a.pnrs.join(", ")}` : ""}. {a.meaning}
                  </div>
                ) : null}
                {a && a !== "loading" && "error" in a ? <div className="ow-tw-ans is-err" role="alert">{a.error}</div> : null}
                <div className="ow-tw-acts">
                  <button type="button" className="taw-btn taw-btn--sm taw-btn--primary" onClick={() => f.order_number && onOpenOrder(f.order_number)}>Open order</button>
                  {f.kind === "flight" ? (
                    <button type="button" className="taw-btn taw-btn--sm" disabled={a === "loading"} onClick={() => ask(f)}>
                      {a === "loading" ? "Asking TripSure…" : "Ask TripSure"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
