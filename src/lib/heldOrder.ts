/* The live price check runs once per set of traveller details: Next makes it and holds the booking for 15 minutes. Going Back and pressing Next
   again with the same details, while that hold is still running, goes straight back to the final price instead of checking (and holding) again. */
export function canReuseHold(args: { payBy?: string | null; heldFor: string; key: string; now: number; marginMs?: number }): boolean {
  const { payBy, heldFor, key, now, marginMs = 5_000 } = args;
  if (!payBy || !heldFor || heldFor !== key) return false;
  const until = Date.parse(payBy);
  return Number.isFinite(until) && until > now + marginMs;
}
