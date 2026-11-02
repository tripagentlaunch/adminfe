// "just now", "12 min ago", "today 6:40 PM", "yesterday 6:40 PM", "27 Oct 6:40 PM".
export function relTime(ms: number, now: number): string {
  const mins = Math.floor(Math.max(0, now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const d = new Date(ms);
  const at = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date(now).toDateString()) return "today " + at;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return "yesterday " + at;
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + at;
}
