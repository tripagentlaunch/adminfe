/* Which flights an itinerary still needs, so the Flights tab can search them the way the Hotels tab searches stays.
   A round trip is two legs: out from home on the first day, and back home on the last. A leg that already has a flight in
   the itinerary is not suggested again. An itinerary with only the outbound flight is missing the return; one with only
   a return is missing the outbound. */

export type FlightLeg = { key: string; kind: "outbound" | "return"; origin: string; dest: string; date: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const code = (v: any): string => { const m = String(v || "").toUpperCase().match(/\b[A-Z]{3}\b/); return m ? m[0] : ""; };

function flightsOf(data: any): { origin: string; dest: string }[] {
  return ((data?.days || []) as any[])
    .flatMap((d: any) => d.items || [])
    .filter((it: any) => it && it.type === "flight")
    .map((it: any) => ({ origin: code(it.origin || it.originCode), dest: code(it.dest || it.destCode) }));
}

/** origin/dest are airport codes ("" when unknown). Returns the legs to search, outbound first. */
export function neededFlightLegs(data: any, origin: string, dest: string): FlightLeg[] {
  const O = code(origin);
  if (!O) return [];
  const days = ((data?.days || []) as any[]).filter((d) => d && ISO.test(String(d._iso || ""))).map((d) => String(d._iso)).sort();
  const start = ISO.test(String(data?.startIso || "")) ? String(data.startIso) : days[0] || "";
  const end = ISO.test(String(data?.endIso || "")) ? String(data.endIso) : "";
  const have = flightsOf(data);
  const out = have.find((f) => f.origin === O);
  const D = out?.dest || code(dest);
  const legs: FlightLeg[] = [];
  if (!out && D && start) legs.push({ key: `${O}-${D}-${start}`, kind: "outbound", origin: O, dest: D, date: start });
  const returning = have.some((f) => f.dest === O && f.origin !== O);
  if (!returning && D && end && start && end > start) legs.push({ key: `${D}-${O}-${end}`, kind: "return", origin: D, dest: O, date: end });
  return legs;
}
