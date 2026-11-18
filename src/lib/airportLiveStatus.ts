// Whether a failed live lookup means TripSure is unavailable (so stop asking for a minute): no answer at all,
// a 5xx, or a 429 (too many requests). A 400/401/404/422 is about THIS request and says nothing about TripSure.
export function meansTripsureIsDown(e: any): boolean {
  const status = Number(e && e.status);
  return !status || status >= 500 || status === 429;
}
