/* Words for an offline price's validity (it is held for 12 hours): "Mon 17 Nov, 6:00 PM IST" and "11h 42m left". Times are shown in IST,
   the advisors' and customers' time, whatever the viewing computer's time zone is. */
import { OFFLINE_HOURS } from "./itineraryFromCart";

const FMT = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** "Mon, 17 Nov, 6:00 pm IST" for an ISO time. */
export function untilText(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  return FMT.format(new Date(t)).replace(/\bam\b/i, "AM").replace(/\bpm\b/i, "PM") + " IST";
}

/** "11h 42m left", "42m left", "under a minute left", or "expired". */
export function leftText(msLeft: number): string {
  if (!(msLeft > 0)) return "expired";
  const mins = Math.floor(msLeft / 60_000);
  if (mins < 1) return "under a minute left";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h ? h + "h " : ""}${m}m left`;
}

export const HELD_HOURS_TEXT = `${OFFLINE_HOURS} hours`;
