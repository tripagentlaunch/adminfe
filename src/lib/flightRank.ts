// Which flights to recommend to the advisor (2026-11-13): TripAgent's members are HNI / UHNI, so the best journey comes first and
// price only breaks ties. Every fare of a search is scored on
//   stops 35%   non-stop first, then one stop; two or more barely count
//   duration 25% against the quickest journey in the results
//   carrier 20%  full-service airlines; a budget carrier is hidden by the "full-service only" filter while a full-service one exists
//   timing 10%   no departure in the small hours, no arrival between 1 and 5 am
//   baggage 5%   checked allowance
//   cancel 5%    refundable fares
// Used by the Flights desk's "Recommended" sort and its "Full-service only" filter.

export const FULL_SERVICE = new Set([
  "EK", "QR", "EY", "SQ", "CX", "QF", "LH", "BA", "AF", "KL", "LX", "OS", "TK", "NH", "JL", "VS", "UK", "TG", "MH", "KE",
  "OZ", "AC", "DL", "UA", "AA", "SV", "WY", "GF", "AI", "SK", "AY", "IB", "TP", "EI", "ET", "MS", "SA", "NZ", "VA", "BR", "CI",
]);
export const BUDGET = new Set(["6E", "SG", "I5", "QP", "IX", "G8", "S2", "FZ", "AK", "TR", "3K", "JQ", "FR", "U2", "W6", "VY", "F9", "NK", "XY", "G9", "OD", "D7", "Z2", "5J", "DD", "8I", "9W"]);

export type FlightRec = { score: number; reasons: string[]; rank: number };

const detail = (o: any) => (o && o.detail) || {};
const net = (o: any) => Number(o && (o.base_net != null ? o.base_net : o.baseNet)) || 0;

/** Airline codes of every leg ("EK 507" -> EK), falling back to the offer's own airline code. */
export function legCodes(o: any): string[] {
  const d = detail(o);
  const segs: any[] = d.segments || [];
  const codes = segs.map((s) => String(s.flightNo || "").trim().split(/\s+/)[0].toUpperCase()).filter((c) => /^[A-Z0-9]{2}$/.test(c));
  return codes.length ? codes : d.airline ? [String(d.airline).toUpperCase()] : [];
}

/** 1 full-service on every leg, 0 a budget carrier on any leg, 0.4 unknown. */
export function carrierScore(o: any): number {
  const codes = legCodes(o);
  if (!codes.length) return 0.4;
  return Math.min(...codes.map((c) => (FULL_SERVICE.has(c) ? 1 : BUDGET.has(c) ? 0 : 0.4)));
}

/** The "full-service only" filter: budget-carrier fares are dropped while any full-service fare exists. */
export function withoutBudgetCarriers(offers: any[]): any[] {
  const full = offers.filter((o) => carrierScore(o) > 0);
  return full.length ? full : offers;
}

const hour = (t?: string) => {
  const m = /^(\d{1,2}):\d{2}/.exec(String(t || ""));
  return m ? Number(m[1]) : null;
};

/** `offers` best journey first, each with `_rec` { score, reasons, rank }. */
export function rankFlightOffers(offers: any[]): any[] {
  const durs = offers.map((o) => Number(detail(o).durationMin) || 0).filter((m) => m > 0);
  const quickest = durs.length ? Math.min(...durs) : 0;
  const scored = offers.map((o) => {
    const d = detail(o);
    const stops = Number(d.stops || 0);
    const sStops = [1, 0.5, 0.1][stops] ?? 0;
    const m = Number(d.durationMin) || 0;
    const sDur = quickest && m ? quickest / m : 0.5;
    const dep = hour(d.depTime), arr = hour(d.arrTime);
    const redEyeDep = dep != null && dep < 5, redEyeArr = arr != null && arr >= 1 && arr < 5;
    const sTime = 1 - (redEyeDep ? 0.5 : 0) - (redEyeArr ? 0.5 : 0);
    const kg = d.baggageKg != null ? Number(d.baggageKg) : null;
    const sBag = kg == null ? 0.5 : Math.min(1, kg / 30);
    const carrier = carrierScore(o);
    const score = 0.35 * sStops + 0.25 * sDur + 0.2 * carrier + 0.1 * sTime + 0.05 * sBag + 0.05 * (d.refundable ? 1 : 0);
    const via = ((d.segments || []) as any[]).slice(0, -1).map((s) => s.to).filter(Boolean);
    const reasons = [stops === 0 ? "non-stop" : `${stops} stop${stops > 1 ? "s" : ""}${via.length ? " via " + via.join(", ") : ""}`];
    if (carrier === 1) reasons.push("full-service airline");
    if (d.duration) reasons.push(stops === 0 ? `${d.duration} in the air` : `${d.duration} door to door`);
    if (dep != null && !redEyeDep && !redEyeArr) reasons.push(`leaves ${d.depTime}, no red-eye`);
    if (kg) reasons.push(`${kg} kg checked baggage`);
    if (d.refundable) reasons.push("refundable fare");
    return { o, score, reasons };
  });
  scored.sort((a, b) => b.score - a.score || net(a.o) - net(b.o));
  return scored.map((s, i) => ({ ...s.o, _rec: { score: Math.round(s.score * 1e4) / 1e4, reasons: s.reasons, rank: i + 1 } as FlightRec }));
}
