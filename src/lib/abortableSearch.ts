// One in-flight search with a hard deadline and a manual cancel (Flights and
// Hotels desks). fetch() never times out on its own, and TripSure preprod's
// hotel listing alone can run 12-30s per attempt with backend retries on top
// (adbe hotel_service._with_retry), so a stalled call used to leave the desk
// on its loading state forever with no way out.
//
// The desk passes `signal` down to the api.ts call and, in its catch, asks
// timedOut()/cancelled() why the call ended: a timeout is shown as an error
// on the form, a cancel just returns to the form quietly.
//
// 45s sits above one slow-but-successful TripSure attempt (~30s) plus a
// retry that lands, and below the point where waiting any longer is useful.
export const SEARCH_TIMEOUT_MS = 45000;

export type SearchHandle = {
  signal: AbortSignal;
  timedOut: () => boolean;
  cancelled: () => boolean;
  cancel: () => void;
  done: () => void;
};

export function startSearch(timeoutMs: number = SEARCH_TIMEOUT_MS): SearchHandle {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cancelled: () => cancelled,
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    },
    done: () => clearTimeout(timer),
  };
}
