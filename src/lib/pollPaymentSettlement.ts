// Polls a hotel payment's settlement after verify. TripSure only moves the
// payment to VERIFIED on /payment/verify and confirms settlement (SUCCESS)
// asynchronously, so we poll /payment/status with exponential backoff + jitter,
// bounded by a deadline AND a max attempt count, and stop on any terminal answer.
// The cadence/caps live here so they are easy to tune in one place.

export const POLL_BASE_MS = 3000;       // first wait, and the backoff base
export const POLL_FACTOR = 1.6;         // growth per attempt: 3 → 5 → 8 → 13 → 20s
export const POLL_MAX_MS = 20000;       // ceiling on a single wait
export const POLL_JITTER_MS = 1000;     // ± spread so parallel pollers don't sync up
export const POLL_DEADLINE_MS = 120000; // give up after 2 minutes…
export const POLL_MAX_ATTEMPTS = 12;    // …or this many polls, whichever comes first

export interface PaymentStatus {
  payment_status: "pending" | "success" | "failed";
  settled: boolean;
  terminal: boolean;
  due?: number;
}

export interface PollHandle {
  cancel: () => void;
}

interface PollCallbacks {
  onUpdate?: (s: PaymentStatus) => void;
  onSettled: (s: PaymentStatus) => void;
  onFailed?: (s: PaymentStatus) => void;
  onTimeout?: () => void;
  onError?: (e: unknown) => void;
}

// Returns a handle whose cancel() stops the loop (call it on unmount). Transient
// fetch errors don't stop polling — the deadline/attempt caps still bound it.
export function pollPaymentSettlement(fetchStatus: () => Promise<PaymentStatus>, cb: PollCallbacks): PollHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const started = Date.now();
  let attempt = 0;

  async function tick() {
    if (cancelled) return;
    attempt += 1;
    try {
      const s = await fetchStatus();
      if (cancelled) return;
      cb.onUpdate?.(s);
      if (s.terminal) {
        if (s.settled) cb.onSettled(s);
        else cb.onFailed?.(s);
        return;
      }
    } catch (e) {
      if (cancelled) return;
      cb.onError?.(e);
    }
    if (attempt >= POLL_MAX_ATTEMPTS || Date.now() - started >= POLL_DEADLINE_MS) {
      cb.onTimeout?.();
      return;
    }
    const base = Math.min(POLL_BASE_MS * Math.pow(POLL_FACTOR, attempt - 1), POLL_MAX_MS);
    const jitter = (Math.random() * 2 - 1) * POLL_JITTER_MS;
    timer = setTimeout(tick, Math.max(1000, base + jitter));
  }

  // Settlement is rarely instant, so the first poll waits one base interval too.
  timer = setTimeout(tick, POLL_BASE_MS);
  return { cancel: () => { cancelled = true; if (timer) clearTimeout(timer); } };
}
