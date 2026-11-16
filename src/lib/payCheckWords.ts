/* What Pay now says it is checking. Only the flights and hotels the live check really covers (online prices) are called "live"; a flight or
   hotel the advisor priced by hand (quoted by another vendor, held 12 hours) is not re-checked, and the page says so plainly. */
import { untilText } from "./offlineBanner";

type Quote = {
  flights?: unknown[]; stays?: unknown[];
  offline?: { items?: { type?: string }[]; valid_until?: string | null; expired?: boolean } | null;
} | null | undefined;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function payCheckWords(q: Quote) {
  const flights = !!(q && q.flights && q.flights.length);
  const hotels = !!(q && q.stays && q.stays.length);
  const kinds = [flights ? "flight" : "", hotels ? "hotel" : ""].filter(Boolean);
  // before the quote is known, say both rather than guess
  const live = kinds.length ? kinds.join(" and ") : "flight and hotel";
  const supplier = flights && !hotels ? "the airline" : hotels && !flights ? "the hotel" : "the airline and hotel";
  const items = (q && q.offline && q.offline.items) || [];
  const offKinds = Array.from(new Set(items.map((i) => (i.type === "flight" ? "flight" : "hotel")))).sort((a, b) => (a === "hotel" ? -1 : 1) - (b === "hotel" ? -1 : 1));
  const off = offKinds.join(" and ");
  const until = q && q.offline && q.offline.valid_until && !q.offline.expired ? untilText(q.offline.valid_until) : "";
  const many = items.length > 1;
  return {
    live,
    supplier,
    /** The row for what Pay now takes through TripSure. */
    liveRow: flights && hotels ? "Airline & hotel" : flights ? "Flights (checked live)" : hotels ? "Hotel (checked live)" : "Airline & hotel",
    buttonChecking: `Checking live ${live} prices…`,
    checking: `Checking live ${live} prices with ${supplier}…`,
    ready: `✓ Live ${live} prices confirmed`,
    idle: `Secure payment · ${live} prices are re-checked with ${supplier} when you press Pay now`,
    summaryNote: `${cap(live)} prices are checked live when you press Pay now; the final price then replaces the prices above, before you pay.`,
    changedIntro: `Since your proposal was prepared, ${supplier} has changed the ${live} price.`,
    /** Said beside the live check: the vendor-quoted items are not part of it. */
    offlineLine: off ? `The ${off} ${many ? "prices are" : "price is"} quoted by our vendor, so ${many ? "they don't" : "it doesn't"} change when you pay${until ? `: held until ${until}` : ""}.` : null,
    /** Said in the price-change popup, so nobody wonders about the hotel. */
    offlineUnchanged: off ? `Your ${off} ${many ? "prices haven't" : "price hasn't"} changed: ${many ? "they're" : "it's"} quoted by our vendor${until ? ` and held until ${until}` : ""}.` : null,
    /** The summary row for vendor-quoted items. */
    otherRow: off ? `${cap(off)} (quoted by our vendor, not re-checked)` : "Quoted offline & other items, confirmed by your advisor",
  };
}
