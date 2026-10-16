/* Shared helpers for the Orders workspace (mock UI). */

export function statusClass(s: string): string {
  if (s === "Confirmed" || s === "Paid" || s === "Approved") return "taw-status taw-status--success";
  if (s === "Cancelled" || s === "Refunded") return "taw-status taw-status--danger";
  if (s === "Applied") return "taw-status taw-status--info";
  return "taw-status taw-status--warn";
}

