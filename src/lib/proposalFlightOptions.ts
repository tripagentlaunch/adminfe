// Flight swap options on the customer's link. The link shows a snapshot of the proposal built in
// the composer, so when it is published every live-priced option of every flight is built as if
// it were the chosen one: its flight card (with its own add-ons) and the "What it costs" lines
// and total from a real quote for that version of the trip. The link then swaps by showing the
// option's version, and tells the server (proposalShareChoose) so Pay now books that flight.

import { price } from "../services/api";
import { buildProposalTemplateData } from "./proposalTemplateData";
import { cartFromItinerary, flightKeyOf, swapFlightAlternative } from "./itineraryFromCart";

export type FlightOption = { key: string; flight: any; costLines: any[]; grandTotal: number };
export type FlightOptions = Record<string, FlightOption[]>;

function quote(itinerary: any, member: any, advisorId: any, inclusive: boolean) {
  const items = cartFromItinerary(itinerary).map((it: any) => Object.fromEntries(Object.entries(it).filter(([k]) => k.charAt(0) !== "_")));
  return price({
    cart: { items, inclusive },
    ...(member && member.id ? { member_id: member.id } : {}),
    ...(advisorId ? { advisor_id: advisorId } : {}),
    note: "Proposal link: flight swap option",
  }).then((r: any) => r.pricing || null);
}

/** Every live-priced flight's options, the chosen one first. Only flights that are priced live
 *  and have live-priced options get any (the others can't be swapped on the link). */
export async function buildFlightOptions(itinerary: any, base: any, member: any, advisorId: any, inclusive: boolean,
  advisor: any, hotelEnrichment: any): Promise<FlightOptions> {
  const out: FlightOptions = {};
  const items = (itinerary?.days || []).flatMap((d: any) => d.items || []).filter((it: any) => it.type === "flight" && it.pricing);
  for (const it of items) {
    const alts: number[] = (it.alternatives || []).map((a: any, i: number) => (a.pricing ? i : -1)).filter((i: number) => i >= 0);
    const chosen = (base.flights || []).find((f: any) => f.id === it.id);
    if (!alts.length || !chosen) continue;
    const options: FlightOption[] = [{ key: chosen.key, flight: chosen, costLines: base.costLines, grandTotal: base.grandTotal }];
    for (const i of alts) {
      const variant = swapFlightAlternative(itinerary, it.id, i);
      const pricing = await quote(variant, member, advisorId, inclusive);
      if (!pricing) continue;
      const t = buildProposalTemplateData(variant, pricing, member, advisor, hotelEnrichment);
      const flight = (t.flights || []).find((f: any) => f.id === it.id);
      if (flight) options.push({ key: flightKeyOf(it.alternatives[i]), flight, costLines: t.costLines, grandTotal: t.grandTotal });
    }
    if (options.length > 1) out[it.id] = options;
  }
  return out;
}

/** The proposal as the customer chose it: each flight with a choice shows that option, and the
 *  cost lines / total move by what each choice changes against the advisor's pick (each option's
 *  quote differs from the base only in its own flight and the charges on it). */
export function applyFlightChoices(data: any, choices: Record<string, string> | null | undefined): any {
  const opts: FlightOptions = (data && data._flightOptions) || {};
  const picked = Object.entries(choices || {})
    .map(([id, key]) => ({ id, base: (opts[id] || [])[0], opt: (opts[id] || []).find((o) => o.key === key) }))
    .filter((c) => c.base && c.opt && c.opt.key !== c.base.key) as { id: string; base: FlightOption; opt: FlightOption }[];
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
          if (o && b && o.label !== b.label) line = o; // that flight's own line (its label, breakdown)
        }
        return { ...line, sell: Math.round(sell * 100) / 100 };
      })
    : picked[picked.length - 1].opt.costLines;
  const grandTotal = sameShape
    ? picked.reduce((t, c) => t + (Number(c.opt.grandTotal) || 0) - (Number(c.base.grandTotal) || 0), Number(data.grandTotal) || 0)
    : picked[picked.length - 1].opt.grandTotal;
  const byId = Object.fromEntries(picked.map((c) => [c.id, c.opt.flight]));
  return {
    ...data,
    flights: (data.flights || []).map((f: any) => byId[f.id] || f),
    costLines,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}
