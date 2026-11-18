/* The price breakup of a searched flight fare, from Tripsure's own PriceSummaries entry (guide 6.2:
   baseFare, totalTax, totalFare). The total is what the fare costs; whatever it holds beyond base fare and
   taxes (supplier / airline fees) is shown as "Other charges" rather than hidden, so the three lines always add
   up to the total. When Tripsure sent no base fare or tax, nothing is invented: there is no breakup. */

export interface BreakupLine { key: "base" | "taxes" | "other" | "total"; label: string; amount: number }
export interface FareBreakup { lines: BreakupLine[]; total: number }

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const cents = (n: number) => Math.round(n * 100) / 100;

/** `price` is one PriceSummaries entry (`{ baseFare, totalTax, totalFare }`), or anything else -> null. */
export function fareBreakup(price: any): FareBreakup | null {
  const p = price && typeof price === "object" ? price : {};
  const total = num(p.totalFare);
  const base = num(p.baseFare);
  const taxes = num(p.totalTax ?? p.taxes);
  if (total === null || total <= 0 || base === null || taxes === null || base < 0 || taxes < 0) return null;
  const other = cents(total - base - taxes);
  // A negative gap means the three figures don't describe one fare: show nothing rather than a wrong sum.
  if (other < -1) return null;
  const lines: BreakupLine[] = [
    { key: "base", label: "Base fare", amount: cents(base) },
    { key: "taxes", label: "Taxes & fees", amount: cents(taxes) },
  ];
  // Under a rupee is rounding, not a charge.
  if (other >= 1) lines.push({ key: "other", label: "Other charges (airline / supplier fees)", amount: other });
  lines.push({ key: "total", label: "Total", amount: cents(total) });
  return { lines, total: cents(total) };
}
