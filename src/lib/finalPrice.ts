/* One price table. "What it costs" is the customer's price for each line (flight, hotel, GST ...). When Pay now's live check comes back
   with different supplier prices, that same table is updated in place, so a flight never shows two prices (a quoted one in the table
   and a supplier one in a second box). The check reports each live booking's supplier price before and after (adbe `lines`); each
   moved line is scaled to the table's own basis, the rest of the change (our fee and GST move with it) lands on the GST line, so the
   rows still add up to the final trip total. */

export type CostLine = { label: string; sell: number; type?: string; [k: string]: any };
export type LiveLine = { kind: string; label?: string; was: number; now: number; changed?: boolean };
export type FinalLine = CostLine & { was?: number };

const r = (n: number) => Math.round(n);
const kindOf = (l: CostLine) => String(l.type || "").toLowerCase();

export function finalPriceView(costLines: CostLine[], live: LiveLine[] | null | undefined, shownTotal: number, finalTotal: number | null | undefined):
  { lines: FinalLine[]; total: number; was: number | null; moved: { label: string; was: number; now: number }[] } {
  const lines: FinalLine[] = (costLines || []).map((l) => ({ ...l }));
  if (finalTotal == null || !Number.isFinite(Number(finalTotal))) return { lines, total: shownTotal, was: null, moved: [] };
  const total = Number(finalTotal);
  const diff = r(total - shownTotal);
  if (Math.abs(diff) < 1 && !(live || []).some((l) => l.changed)) return { lines, total: shownTotal, was: null, moved: [] };

  let applied = 0;
  for (const kind of ["flight", "hotel"]) {
    const idx = lines.map((l, i) => (kindOf(l) === kind ? i : -1)).filter((i) => i >= 0);
    const liveK = (live || []).filter((l) => l.kind === kind && Number(l.was) > 0);
    if (!idx.length || !liveK.length) continue;
    const move = (i: number, delta: number) => {
      const before = Number(lines[i].sell) || 0;
      const after = r(before + delta);
      if (after !== r(before)) lines[i].was = before;
      lines[i].sell = after;
      applied += after - r(before);
    };
    if (idx.length === liveK.length) {
      idx.forEach((i, k) => move(i, (Number(liveK[k].now) - Number(liveK[k].was)) * ((Number(lines[i].sell) || 0) / Number(liveK[k].was))));
    } else {
      // the table and the check list this kind differently: share the change out by each line's price
      const sumSell = idx.reduce((n, i) => n + (Number(lines[i].sell) || 0), 0);
      const sumWas = liveK.reduce((n, l) => n + Number(l.was), 0);
      const supplierDelta = liveK.reduce((n, l) => n + (Number(l.now) - Number(l.was)), 0);
      idx.forEach((i) => move(i, sumSell > 0 ? supplierDelta * (sumWas > 0 ? sumSell / sumWas : 1) * ((Number(lines[i].sell) || 0) / sumSell) : 0));
    }
  }
  // Our service fee and the GST move with the supplier prices; the table's GST line carries that, so the rows add up to the final total.
  const rest = diff - applied;
  if (Math.abs(rest) >= 1) {
    const g = lines.findIndex((l) => /^gst\b/i.test(String(l.label || "")));
    if (g >= 0) {
      const before = Number(lines[g].sell) || 0;
      lines[g].was = before;
      lines[g].sell = r(before + rest);
    } else {
      lines.push({ label: "Fees & taxes (updated)", sell: rest, type: "charge" });
    }
  }
  const moved = lines.filter((l) => l.was != null && !/^gst\b/i.test(String(l.label || "")) && l.type !== "charge")
    .map((l) => ({ label: String(l.label), was: Number(l.was), now: Number(l.sell) }));
  return { lines, total, was: shownTotal, moved };
}
