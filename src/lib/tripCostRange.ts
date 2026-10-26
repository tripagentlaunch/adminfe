/* tripCostRange — the "What it costs" range for a generated itinerary (2026-10-22).
 *
 * One line per flight leg and per hotel block; `low`/`high` span the chosen option and its
 * alternatives, so the total is a range (cheapest to dearest combination) and `recommended` is what is
 * currently chosen. Recomputed from the live itinerary, so it follows Swap. Mirrors the backend's
 * itinerary_service._cost_summary (which applies the budget cap and does the first fit): a line with no
 * usable price is listed under `unpriced` and left out of the sums, never shown as ₹0. */

export type CostLine = { id: string; kind: "flight" | "hotel"; label: string; recommended: number; low: number; high: number; estimate: boolean };
export type CostRange = {
  lines: CostLine[];
  recommended: number;
  low: number;
  high: number;
  unpriced: string[];
  estimateLabels: string[];
  budgetCap: number | null;
  withinBudget: boolean | null;
};

const positive = (n: any): number => (typeof n === "number" && isFinite(n) && n > 0 ? n : 0);

export function computeCostRange(days: any[], pax: number, budgetCap?: number | null): CostRange | null {
  const lines: CostLine[] = [];
  const unpriced: string[] = [];
  const push = (id: string, kind: CostLine["kind"], label: string, price: number, options: number[], estimate: boolean) => {
    const opts = options.filter((o) => o > 0);
    if (!price || !opts.length) unpriced.push(label);
    else lines.push({ id, kind, label, recommended: price, low: Math.min(...opts), high: Math.max(...opts), estimate });
  };
  for (const day of days || []) {
    const hotels: any[] = [];
    for (const it of day.items || []) {
      if (it.type === "flight") {
        const estimate = it.status === "draft";
        // A drafted flight's figure is per traveller; a real TripSure fare already covers the party.
        const price = positive(it.price) * (estimate ? Math.max(1, pax || 1) : 1);
        push(it.id, "flight", it.title || "Flight", price, [price, ...(it.alternatives || []).map((a: any) => positive(a.price))], estimate);
      } else if (it.type === "hotel") hotels.push(it);
    }
    if (hotels.length) {
      const first = hotels[0];
      const options = [...hotels.map((h) => positive(h.price)), ...(first.alternatives || []).map((a: any) => positive(a.price))];
      push(first.id, "hotel", first.area ? `${first.title} · ${first.area}` : first.title || "Hotel", positive(first.price), options, !!first.priceIsEstimate);
    }
  }
  if (!lines.length && !unpriced.length) return null;
  const sum = (f: (l: CostLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const recommended = sum((l) => l.recommended);
  const cap = positive(budgetCap) || null;
  return {
    lines,
    recommended,
    low: sum((l) => l.low),
    high: sum((l) => l.high),
    unpriced,
    estimateLabels: lines.filter((l) => l.estimate).map((l) => l.label),
    budgetCap: cap,
    withinBudget: cap && recommended ? recommended <= cap : null,
  };
}
