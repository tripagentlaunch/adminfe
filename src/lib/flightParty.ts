// A TripSure flight fare is for the WHOLE party that was searched (3 adults' fare is 3 x one adult's),
// so a price is always shown with who it covers: "₹5,795 for 3 adults · ₹1,932 each". The total is never
// recomputed here; "each" is only worked out when everyone pays the same fare (adults only).
export type Party = { adults: number; children: number; infants: number };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function partyText(p: Party): string {
  const parts = [
    p.adults ? plural(p.adults, "adult", "adults") : "",
    p.children ? plural(p.children, "child", "children") : "",
    p.infants ? plural(p.infants, "infant", "infants") : "",
  ].filter(Boolean);
  return parts.join(", ") || "1 adult";
}

export const partySize = (p: Party): number => p.adults + p.children + p.infants;

/** One adult's share of the group fare — only when the party is adults alone (children and infants pay other fares). */
export function eachAdult(total: number, p: Party): number | null {
  return p.children === 0 && p.infants === 0 && p.adults > 1 && total > 0 ? Math.round(total / p.adults) : null;
}

/** "for 3 adults · ₹1,932 each" — `fmt` formats rupees. */
export function priceCovers(total: number, p: Party, fmt: (n: number) => string): string {
  const each = eachAdult(total, p);
  return `for ${partyText(p)}${each != null ? ` · ${fmt(each)} each` : ""}`;
}

/** The earliest date a search can ask for: today, in the advisor's own timezone (not UTC). */
export function localISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
