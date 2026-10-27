/* The Console Search desks' last search, per enquiry, so leaving the Console
   (Proposal Composer, Orders, another desk) and coming back — or reloading
   the page — shows the same search, results and filters instead of an empty
   form, and doesn't hit TripSure again for the same thing.

   Kept for the whole working session (SESSION_TTL_MS):
   - in memory (this tab, instant), and
   - in sessionStorage (survives a reload or a dev hot reload of this tab).
     Writes are debounced; if a very large result (thousands of hotels) doesn't
     fit, only the light part — form, travellers/rooms, filters — is stored and
     one click re-runs the search.

   Prices age: the desks show "Searched N min ago · Refresh" after
   STALE_AFTER_MS. Booking always re-prices live, so a kept search is never
   what gets charged. */
import { useEffect, useState } from "react";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 15 * 60 * 1000;
const STORE_PREFIX = "taw.desk.";
const WRITE_DELAY_MS = 800;

const mem = new Map<string, { at: number; value: any }>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function recallDesk<T = any>(key: string): (T & { _restoredAt?: number }) | null {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return { ...hit.value, _restoredAt: hit.at };
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + key);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && Date.now() - (v._at || 0) < SESSION_TTL_MS) {
        mem.set(key, { at: v._at, value: v });
        return v;
      }
    }
  } catch {
    /* storage blocked: nothing to restore */
  }
  return null;
}

export function rememberDesk(key: string, value: any, light?: any) {
  if (mem.size > 60) {
    const oldest = Array.from(mem.entries()).sort((a, b) => a[1].at - b[1].at).slice(0, 15);
    oldest.forEach(([k]) => mem.delete(k));
  }
  mem.set(key, { at: Date.now(), value });
  clearTimeout(writeTimers.get(key));
  writeTimers.set(
    key,
    setTimeout(() => {
      writeTimers.delete(key);
      const at = Date.now();
      try {
        window.sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify({ ...value, _at: at }));
      } catch {
        // Too big for sessionStorage (or blocked): keep at least the search itself.
        try {
          if (light !== undefined) window.sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify({ ...light, _at: at }));
        } catch {
          /* not critical */
        }
      }
    }, WRITE_DELAY_MS),
  );
}

/** "3 min ago" for a restored search's age. */
export function ageLabel(at?: number | null): string {
  if (!at) return "";
  const min = Math.round((Date.now() - at) / 60000);
  return min < 1 ? "just now" : min < 60 ? min + " min ago" : Math.round(min / 60) + " h ago";
}

/** The current time, refreshed every minute — for "searched N min ago" labels
    without reading the clock during render. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
