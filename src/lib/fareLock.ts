/* Two small pieces of text for the Orders screens.
 *
 * fareLockNote: the fare lock TripSure gives when passengers are attached (Update Itinerary, flight guide 6.7). The
 * lock pins the final price for 15 minutes; the screen says until when, so payment is collected before it lapses.
 *
 * reconcileSummary: the answer of "re-check with TripSure" (Booking Details for every flight / room left unclear,
 * guide 6.12): how many were checked and settled. */

export interface FareLockNote {
  clock: string;
  minsLeft: number;
  expired: boolean;
  /** five minutes or less: worth saying out loud */
  soon: boolean;
}

export function fareLockNote(payBy: string | null | undefined, now: number = Date.now()): FareLockNote | null {
  if (!payBy) return null;
  const at = new Date(payBy);
  if (Number.isNaN(at.getTime())) return null;
  const minsLeft = Math.floor((at.getTime() - now) / 60_000);
  return {
    clock: at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    minsLeft: Math.max(minsLeft, 0),
    expired: at.getTime() <= now,
    soon: minsLeft <= 5,
  };
}

export interface ReconcileCounts {
  checked?: number;
  settled?: number;
  still_open?: number;
  skipped?: number;
  failed?: number;
}

export function reconcileSummary(flights: ReconcileCounts | null | undefined, hotels: ReconcileCounts | null | undefined): string {
  const sum = (k: keyof ReconcileCounts) => Number(flights?.[k] || 0) + Number(hotels?.[k] || 0);
  const checked = sum("checked"), settled = sum("settled"), open = sum("still_open"), skipped = sum("skipped"), failed = sum("failed");
  if (!checked && !failed) return skipped ? `Nothing could be checked (${skipped} skipped: not yours, being booked right now, or no booking id yet).` : "Nothing is waiting for a check.";
  const tail = [`${settled} settled`];
  if (open) tail.push(`${open} still open`);
  if (failed) tail.push(`${failed} could not be checked`);
  return `Checked ${checked} with TripSure: ${tail.join(", ")}.`;
}
