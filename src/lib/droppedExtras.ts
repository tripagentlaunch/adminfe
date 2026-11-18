/* When the airline would not take the seat / baggage / meal extras, Tripsure prices the booking at the bare fare while the
   customer has already paid for the extras. The backend refuses to ticket that by default and says so; this reads the two
   amounts out of its message so the screen can offer "ticket the fare only" with the right figures. Nothing is offered for
   any other message. */

export interface ExtrasOffer { extras: number; fare: number | null }

const rupees = (m: RegExpExecArray | null): number | null => {
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function extrasOfferFrom(message: unknown): ExtrasOffer | null {
  const text = String(message || "");
  if (!/extras may not have reached the airline/i.test(text)) return null;
  const extras = rupees(/extras\s*₹\s*([\d,]+(?:\.\d+)?)/i.exec(text));
  if (extras === null || extras <= 0) return null;
  return { extras, fare: rupees(/\(fare\s*₹\s*([\d,]+(?:\.\d+)?)/i.exec(text)) };
}
