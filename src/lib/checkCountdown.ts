/* The wait while Pay now's live check holds the booking: a countdown from the usual time (20, 19, 18 ...). It is an estimate, so when the
   check takes longer the countdown does not sit at 0: it says so and counts the extra seconds instead. */
export const CHECK_ESTIMATE_S = 20;

export function checkCountdown(elapsedS: number, estimate: number = CHECK_ESTIMATE_S): { remaining: number | null; extra: number; text: string } {
  const e = Math.max(0, Math.floor(elapsedS));
  if (e < estimate) return { remaining: estimate - e, extra: 0, text: `${estimate - e} second${estimate - e === 1 ? "" : "s"} left` };
  const extra = e - estimate;
  return { remaining: null, extra, text: extra < 1 ? "Almost there…" : `Still checking with the airline and hotel… ${extra}s longer than usual` };
}
