// A live-priced flight's add-ons (FlightLivePrice.extras), arranged for reading: a table of
// travellers × seat / meal / baggage per segment, and per-item totals for price lines.
// Extras priced per traveller carry `pax` and a label ending in " · Adult 2"; older ones
// (lead only) carry neither.

type Extra = { segment?: string; kind?: string; code?: string; label?: string; price?: number; pax?: number };
type Kind = "seat" | "meal" | "baggage";
export type AddonCell = { label: string; price: number };
export type AddonRow = { who: string; seat: AddonCell | null; meal: AddonCell | null; baggage: AddonCell | null };
export type AddonTable = { segment: string; kinds: Kind[]; rows: AddonRow[] }[];

// TripSure lists "NoBaggage" at ₹0 next to the real bags: it means no extra bag, so it is not an add-on.
const isNothing = (x: Extra) => !(Number(x.price) > 0) && /^no\s*(baggage|meal)$/i.test(String(x.code || x.label || "").split(" · ")[0].trim());

function split(x: Extra): { item: string; who: string } {
  const label = String(x.label || x.code || "");
  const at = label.lastIndexOf(" · ");
  if (x.pax && at > 0) return { item: label.slice(0, at), who: label.slice(at + 3) };
  return { item: label, who: x.pax ? `Traveller ${x.pax}` : "Lead traveller" };
}
const kindOf = (x: Extra): Kind => (x.kind === "seat" || x.kind === "meal" ? x.kind : "baggage");

export function addonTable(extras: Extra[] | null | undefined): AddonTable {
  const list = (extras || []).filter((x) => !isNothing(x));
  const segs: string[] = [];
  list.forEach((x) => { const s = x.segment || ""; if (!segs.includes(s)) segs.push(s); });
  return segs.map((segment) => {
    const rows: AddonRow[] = [];
    const byWho: Record<string, AddonRow> = {};
    const order: Record<string, number> = {};
    list.filter((x) => (x.segment || "") === segment).forEach((x) => {
      const { item, who } = split(x);
      if (!byWho[who]) { byWho[who] = { who, seat: null, meal: null, baggage: null }; rows.push(byWho[who]); order[who] = x.pax || 0; }
      byWho[who][kindOf(x)] = { label: kindOf(x) === "seat" ? item.replace(/^Seat\s+/i, "") : item, price: Number(x.price) || 0 };
    });
    rows.sort((a, b) => (order[a.who] || 0) - (order[b.who] || 0));
    const kinds = (["seat", "meal", "baggage"] as Kind[]).filter((k) => rows.some((r) => r[k]));
    return { segment, kinds, rows };
  });
}

/** "9 seats · 5 meals · 2 extra bags" — what an option's live price includes, for a one-line note. */
export function addonCount(extras: Extra[] | null | undefined): string {
  const list = (extras || []).filter((x) => !isNothing(x));
  const n = (k: Kind) => list.filter((x) => kindOf(x) === k).length;
  const part = (c: number, one: string, many: string) => (c ? `${c} ${c === 1 ? one : many}` : "");
  return [part(n("seat"), "seat", "seats"), part(n("meal"), "meal", "meals"), part(n("baggage"), "extra bag", "extra bags")].filter(Boolean).join(" · ");
}

/** One line per item and segment: "Corporate Meal Plan × 5 · BLR → DEL", with the summed price.
 *  Seats are one line per segment ("Seats 6A, 6B, 6C"), since each seat is a different code. */
export function addonLines(extras: Extra[] | null | undefined, withSegment = true): { label: string; amount: number }[] {
  const out: { key: string; label: string; amount: number; n: number; seats?: string[]; segment: string }[] = [];
  (extras || []).filter((x) => !isNothing(x)).forEach((x) => {
    const { item } = split(x);
    const kind = kindOf(x);
    const segment = x.segment || "";
    const key = kind === "seat" ? `seat|${segment}` : `${kind}|${item}|${segment}`;
    let row = out.find((r) => r.key === key);
    if (!row) { row = { key, label: item, amount: 0, n: 0, segment, ...(kind === "seat" ? { seats: [] } : {}) }; out.push(row); }
    row.amount += Number(x.price) || 0;
    row.n += 1;
    if (row.seats) row.seats.push(item.replace(/^Seat\s+/i, ""));
  });
  return out.map((r) => ({
    label: (r.seats ? (r.seats.length > 1 ? `Seats ${r.seats.join(", ")}` : `Seat ${r.seats[0]}`) : r.label + (r.n > 1 ? ` × ${r.n}` : ""))
      + (withSegment && r.segment ? ` · ${r.segment}` : ""),
    amount: Math.round(r.amount * 100) / 100,
  }));
}
