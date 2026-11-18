/* A backend on a free or shared host sleeps when it is quiet and restarts whenever the code is updated: for a minute or more it answers 502/503/504
   or not at all. The sign-in check must not hang silently on that, nor mistake it for "no access". fetchWithRetry() gives each try a time limit and
   tries again while the answer is a not-ready one, up to a deadline, telling the screen what it is doing. A real answer (200, 401, 403, 404 ...) is
   returned at once for the caller to judge. */

export type WakeInfo = { attempt: number; elapsedMs: number; reason: "timeout" | "unreachable" | "server" | null };

/** Statuses that mean "the server isn't ready", not "no". */
export const isNotReady = (status: number) => status === 502 || status === 503 || status === 504 || status === 408 || status === 429;

export function backoffMs(attempt: number): number {
  return Math.min(8_000, 1_500 + attempt * 1_500);
}

export class ServerUnreachableError extends Error {
  constructor(message = "server_unreachable") { super(message); this.name = "ServerUnreachableError"; }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { perTryMs?: number; deadlineMs?: number; onWait?: (w: WakeInfo) => void; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<Response> {
  const { perTryMs = 12_000, deadlineMs = 180_000, onWait, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = opts;
  const t0 = now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let reason: WakeInfo["reason"] = null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), perTryMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctl.signal });
      if (!isNotReady(res.status)) return res;
      reason = "server";
    } catch (e: any) {
      reason = e && e.name === "AbortError" ? "timeout" : "unreachable";
    } finally {
      clearTimeout(timer);
    }
    const elapsed = now() - t0;
    if (elapsed + backoffMs(attempt) >= deadlineMs) throw new ServerUnreachableError();
    if (onWait) onWait({ attempt, elapsedMs: elapsed, reason });
    await sleep(backoffMs(attempt));
  }
}

/** Wakes the backend while something else (the sign-in session) is being checked: a cheap call whose answer does not matter. */
export function wakeServer(base: string): void {
  try { void fetch(base.replace(/\/$/, "") + "/health", { method: "GET", cache: "no-store" }).catch(() => {}); } catch { /* nothing to do */ }
}

/** What the waiting screen says: nothing at first, then that the server is waking up with the seconds so far. */
export function wakeMessage(elapsedMs: number): string | null {
  const s = Math.floor(elapsedMs / 1000);
  if (s < 6) return null;
  if (s < 45) return `The server is waking up (${s}s). This happens after a quiet period or an update; it usually takes under a minute.`;
  return `Still waking the server (${s}s). Updates can take a few minutes. This page keeps trying by itself.`;
}
