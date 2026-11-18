/* A flight search that came back empty because NO airline supplier answered, as opposed to a route with no seats.
   Tripsure's working answer lists the suppliers it asked (guide 6.2: supplierTraceIds, e.g. { tbo: "..." }). During an
   outage it still answers 200 with an empty searchResult, no errors and no suppliers at all - changing the date, cabin or
   airport cannot help, so the screen should say that instead of "try another date". When the answer carries no
   supplierTraceIds field at all (an older backend) nothing is claimed. */

export function noSupplierAnswered(response: any, offerCount: number): boolean {
  if (offerCount > 0 || !response || typeof response !== "object") return false;
  if (Array.isArray(response.errors) && response.errors.length > 0) return false; // a named failure is shown as such
  const ids = response.supplierTraceIds;
  if (ids === undefined || ids === null) return false;
  return typeof ids === "object" && Object.keys(ids).length === 0;
}
