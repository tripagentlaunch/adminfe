// Hotel swap options on the customer's link: the hotel counterpart of proposalFlightOptions.ts.
// When the link is published, every hotel alternative that can be booked online (a real hotel, a live
// price and the room it was priced for) is built as if it were the chosen one: its stay card and the
// "What it costs" lines and total from a real quote for that version of the trip. The link swaps by
// showing the option's version, and tells the server (proposalHotelPayChoose) so Pay now holds that hotel.

import { buildProposalTemplateData } from "./proposalTemplateData";
import { swapHotelAlternative } from "./itineraryFromCart";
import { quote } from "./proposalFlightOptions";

export type HotelOption = { key: string; stay: any; costLines: any[]; grandTotal: number };
export type HotelOptions = Record<string, HotelOption[]>;

const isReal = (key: any) => !!key && !String(key).startsWith("MOCK-");

/** Can the customer be offered this alternative? Pay now books it the way it books any stay: by hotel key and the room it was priced for. */
export function swappable(alt: any, current: any): boolean {
  return !!alt && isReal(alt.hotelKey) && alt.hotelKey !== current.hotelKey && Number(alt.price) > 0 && !!alt.roomTitle && !alt.manualPrice;
}

/** Every stay's options, the advisor's pick first. A stay with no bookable alternative gets none (it can't be swapped on the link). */
export async function buildHotelOptions(itinerary: any, base: any, member: any, advisorId: any, inclusive: boolean,
  advisor: any, hotelEnrichment: any): Promise<HotelOptions> {
  const out: HotelOptions = {};
  const items = (itinerary?.days || []).flatMap((d: any) => d.items || []).filter((it: any) => it.type === "hotel" && isReal(it.hotelKey));
  for (const it of items) {
    const chosen = (base.stays || []).find((s: any) => s.id === it.id);
    if (!chosen) continue;
    const alts = (it.alternatives || []).filter((a: any) => swappable(a, it));
    if (!alts.length) continue;
    const options: HotelOption[] = [{ key: it.hotelKey, stay: chosen, costLines: base.costLines, grandTotal: base.grandTotal }];
    for (const a of alts) {
      const variant = swapHotelAlternative(itinerary, it.id, a.hotelKey);
      const pricing = await quote(variant, member, advisorId, inclusive);
      if (!pricing) continue;
      const t = buildProposalTemplateData(variant, pricing, member, advisor, hotelEnrichment);
      const stay = (t.stays || []).find((s: any) => s.id === it.id);
      if (stay) options.push({ key: a.hotelKey, stay, costLines: t.costLines, grandTotal: t.grandTotal });
    }
    if (options.length > 1) out[it.id] = options;
  }
  return out;
}

/** The hotel keys offered for each stay on the link (Swap shows only for these). */
export function hotelKeysOf(data: any, stayId: string): string[] {
  return (((data && data._hotelOptions) || {})[stayId] || []).map((o: HotelOption) => o.key);
}

/** The proposal as the customer chose it: each stay with a choice shows that hotel, and the cost lines /
 *  total move by what each choice changes against the advisor's pick (each option's quote differs from
 *  the base only in its own stay). Runs on top of applyFlightChoices: the two changes add up. */
export function applyHotelChoices(data: any, choices: Record<string, string> | null | undefined): any {
  const opts: HotelOptions = (data && data._hotelOptions) || {};
  const picked = Object.entries(choices || {})
    .map(([id, key]) => ({ id, base: (opts[id] || [])[0], opt: (opts[id] || []).find((o) => o.key === key) }))
    .filter((c) => c.base && c.opt && c.opt.key !== c.base.key) as { id: string; base: HotelOption; opt: HotelOption }[];
  if (!picked.length) return data;
  const baseLines: any[] = data.costLines || [];
  const sameShape = picked.every((c) => (c.opt.costLines || []).length === baseLines.length);
  const costLines = sameShape
    ? baseLines.map((ln: any, j: number) => {
        let sell = Number(ln.sell) || 0;
        let line = ln;
        for (const c of picked) {
          const o = c.opt.costLines[j], b = c.base.costLines[j];
          sell += (Number(o?.sell) || 0) - (Number(b?.sell) || 0);
          if (o && b && o.label !== b.label) line = o; // that stay's own line (its label, breakdown)
        }
        return { ...line, sell: Math.round(sell * 100) / 100 };
      })
    : picked[picked.length - 1].opt.costLines;
  const grandTotal = sameShape
    ? picked.reduce((t, c) => t + (Number(c.opt.grandTotal) || 0) - (Number(c.base.grandTotal) || 0), Number(data.grandTotal) || 0)
    : picked[picked.length - 1].opt.grandTotal;
  const byId = Object.fromEntries(picked.map((c) => [c.id, c.opt.stay]));
  return {
    ...data,
    stays: (data.stays || []).map((s: any) => byId[s.id] || s),
    costLines,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}
