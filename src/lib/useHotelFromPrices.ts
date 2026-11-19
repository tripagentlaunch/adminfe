"use client";
/* Live "from" prices for the hotels on screen in the Add-a-hotel popup. TripSure's listing often carries no price, so the hotels
   being drawn are priced from their cheapest live room (POST /hotels/rates, 5 per call, three calls at a time), once per hotel and
   search, into the same FROM_PRICES cache the Hotels desk uses. Returns a counter that changes as prices arrive so the caller re-renders. */
import { useEffect, useState } from "react";
import { hotelRates } from "../services/api";
import { FROM_PRICES, fromKey } from "./hotelAlternatives";

/** The rates call failed for this hotel (when): shown as "Price on selection", asked again after a minute. */
export const FROM_FAILED = new Map<string, number>();
const RETRY_FAILED_MS = 60_000;

export function useHotelFromPrices(visibleOffers: any[], enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const todo = visibleOffers
      .map((o: any) => o._tripsure)
      .filter((t: any) => t && t.hotelId && t.docKey && t.token && !FROM_PRICES.has(fromKey(t)) && !(Date.now() - (FROM_FAILED.get(fromKey(t)) || 0) < RETRY_FAILED_MS));
    if (!todo.length) return;
    todo.forEach((t: any) => FROM_FAILED.delete(fromKey(t)));
    let live = true;
    const batches: any[][] = [];
    for (let i = 0; i < todo.length; i += 5) batches.push(todo.slice(i, i + 5));
    let next = 0;
    let stopped = false;
    const failRest = (from: number) => batches.slice(from).forEach((b) => b.forEach((t: any) => FROM_FAILED.set(fromKey(t), Date.now())));
    const worker = async () => {
      while (live && !stopped && next < batches.length) {
        const batch = batches[next++].filter((t: any) => !FROM_PRICES.has(fromKey(t)));
        if (!batch.length) continue;
        try {
          const r: any = await hotelRates(batch.map((t: any) => ({ hotelId: String(t.hotelId), docKey: t.docKey, token: t.token })));
          let answered = 0;
          batch.forEach((t: any) => {
            const id = String(t.hotelId);
            if (!r || !(id in r)) { FROM_FAILED.set(fromKey(t), Date.now()); return; } // left out = TripSure's call failed, not "no rooms"
            answered++;
            const x = r[id];
            FROM_PRICES.set(fromKey(t), x ? { price: x.price, board: x.board || null, refundable: x.refundable } : null);
          });
          if (!answered) { stopped = true; failRest(next); } // TripSure is failing for every hotel: stop asking
        } catch {
          stopped = true;
          batch.forEach((t: any) => FROM_FAILED.set(fromKey(t), Date.now()));
          failRest(next);
        }
        if (live) setTick((n) => n + 1);
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOffers, enabled]);
  return tick;
}
