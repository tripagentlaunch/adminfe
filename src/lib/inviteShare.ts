/* Sharing an approved person's invitation from the admin panel: the message, the WhatsApp link, and the short labels that tell
 * an advisor what to do next (email failed, a reminder is due, how many places are taken). No React, so it is easy to check. */

/** 8-character code shown in two groups of four. Anything else (an older code) is shown as it is. */
export function prettyCode(code: string | null | undefined): string {
  const c = String(code || "");
  return c.length === 8 && /^[A-Za-z0-9]+$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** The digits wa.me wants. A bare 10-digit Indian mobile gets the 91 country code; "+91 98765 43210" and "0091…" are handled. */
export function waDigits(phone: string | null | undefined): string {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d.length >= 8 ? d : "";
}

/** A WhatsApp link with the text ready. With a phone number it opens that person's chat; without one it opens WhatsApp's own
 * "choose who to send to" screen, so the advisor can still send it. */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const d = waDigits(phone);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export interface ShareInput {
  firstName?: string | null;
  link: string;
  code?: string | null;
  advisorName?: string | null;
}

/** The message an advisor sends: the link does the work (one tap, the code is already in it); the code is there only as a fallback. */
export function shareMessage(i: ShareInput): string {
  const who = (i.firstName || "").trim();
  const lines = [
    `${who ? `Hi ${who}, your` : "Your"} TripAgent invitation is ready. Tap to open it:`,
    i.link,
  ];
  if (i.code) lines.push(`If you're ever asked for the code: ${prettyCode(i.code)}`);
  const by = (i.advisorName || "").trim();
  if (by) lines.push(`— ${by}`);
  return lines.join("\n");
}

export interface InviteRow {
  claim_status?: string;
  email_status?: string | null;
  email_error?: string | null;
  send_count?: number;
  reminder?: string | null;
  days_left?: number | null;
  seats?: number;
  seats_used?: number;
  can_reissue?: boolean;
}

/** What the advisor should know about the email, or null when there is nothing to say. */
export function emailNote(r: InviteRow): { tone: "ok" | "bad" | "wait"; text: string } | null {
  if (r.email_status === "failed") return { tone: "bad", text: "Email didn't go through" + (r.email_error ? `: ${shorten(r.email_error)}` : "") + ". Send it on WhatsApp, or try the email again." };
  if (r.email_status === "sent") return { tone: "ok", text: r.send_count && r.send_count > 1 ? `Email sent (${r.send_count} times)` : "Email sent" };
  if (r.email_status === "sending") return { tone: "wait", text: "Email is being sent" };
  return null;
}

/** The nudge or expiry warning for a waiting invitation. */
export function reminderNote(r: InviteRow): { tone: "warn" | "bad"; text: string } | null {
  if (r.claim_status !== "pending") return null;
  if (r.reminder === "expiring") return { tone: "bad", text: "Ends within a day. Remind them now." };
  if (r.reminder === "nudge") return { tone: "warn", text: "Not claimed after 3 days. Send a reminder." };
  return null;
}

export function daysLeftText(days: number | null | undefined): string {
  if (days == null) return "";
  if (days <= 0) return "ends today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** "2 of 3 places taken" for a shared invitation; "" for a personal one. */
export function seatsText(r: InviteRow): string {
  const seats = r.seats || 1;
  if (seats <= 1) return "";
  return `${r.seats_used || 0} of ${seats} places taken`;
}

/** The seat counts an advisor can pick when approving or changing. */
export const SEAT_CHOICES = [1, 2, 3, 5, 10];

export function seatChoiceLabel(n: number): string {
  return n === 1 ? "Just them" : `Up to ${n} people`;
}

function shorten(s: string): string {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 77) + "…" : t;
}
