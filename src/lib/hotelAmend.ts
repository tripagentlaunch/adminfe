/* Hotel amendment (before -> after) — pure helpers behind ServicingIntakePanel's "Hotel change" form.
   The backend (hotel_amend_service) is authoritative: it re-validates the form and re-derives the rate
   difference. Everything here is for the live preview and for catching mistakes before a case is opened. */

export const BOARD_OPTIONS = [
  { code: "RO", label: "Room Only" },
  { code: "BB", label: "Breakfast Included" },
  { code: "HB", label: "Half Board" },
  { code: "FB", label: "Full Board" },
] as const;

export const MAX_GUESTS = 20;

/** What is booked now, as the servicing-intake `hotel_leg` action returns it. */
export interface HotelBefore {
  leg_id?: string;
  hotelName?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  roomType?: string | null;
  board?: string | null;
  boardCode?: string | null;
  pax?: number | null;
  sell: number;
}

/** The "after" form. Inputs are strings, as they come off the fields. */
export interface AmendForm {
  checkIn: string;
  checkOut: string;
  roomType: string;
  board: string; // board code (RO/BB/HB/FB) or ""
  pax: string;
  newSell: string;
}

export function seedForm(b: HotelBefore): AmendForm {
  return {
    checkIn: b.checkIn || "",
    checkOut: b.checkOut || "",
    roomType: b.roomType || "",
    board: b.boardCode || "",
    pax: b.pax != null ? String(b.pax) : "",
    newSell: "",
  };
}

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** New sell minus the booked sell; 0 until a new price is entered. Positive = add-collect, negative = refund. */
export function rateDelta(b: HotelBefore, form: AmendForm): number {
  const n = num(form.newSell);
  return n == null ? 0 : Math.round(n - Math.round(b.sell || 0));
}

export type DeltaKind = "collect" | "refund" | "none" | "pending";

export function describeDelta(b: HotelBefore, form: AmendForm): { kind: DeltaKind; amount: number } {
  if (num(form.newSell) == null) return { kind: "pending", amount: 0 };
  const d = rateDelta(b, form);
  return { kind: d > 0 ? "collect" : d < 0 ? "refund" : "none", amount: Math.abs(d) };
}

const nights = (ci: string, co: string): number | null => {
  const a = Date.parse(ci), z = Date.parse(co);
  return Number.isNaN(a) || Number.isNaN(z) ? null : Math.round((z - a) / 86_400_000);
};

/** Fields that differ from the booking, by the names the backend reports in `changed`. */
export function changedFields(b: HotelBefore, form: AmendForm): string[] {
  const out: string[] = [];
  if (form.checkIn && form.checkIn !== (b.checkIn || "")) out.push("checkIn");
  if (form.checkOut && form.checkOut !== (b.checkOut || "")) out.push("checkOut");
  if (form.roomType.trim() && form.roomType.trim() !== (b.roomType || "")) out.push("roomType");
  if (form.board && form.board !== (b.boardCode || "")) out.push("boardCode");
  const pax = num(form.pax);
  if (pax != null && pax !== (b.pax ?? null)) out.push("pax");
  const sell = num(form.newSell);
  if (sell != null && Math.round(sell) !== Math.round(b.sell || 0)) out.push("sell");
  return out;
}

/** First problem with the form, or null when it can be sent. Mirrors the backend's checks. */
export function validateAmend(b: HotelBefore, form: AmendForm): string | null {
  const ci = form.checkIn || b.checkIn || "";
  const co = form.checkOut || b.checkOut || "";
  if (form.checkIn && Number.isNaN(Date.parse(form.checkIn))) return "Check-in isn't a valid date.";
  if (form.checkOut && Number.isNaN(Date.parse(form.checkOut))) return "Check-out isn't a valid date.";
  const n = ci && co ? nights(ci, co) : null;
  if (n != null && n <= 0) return "Check-out must be after check-in.";
  if (form.pax.trim() !== "") {
    const p = num(form.pax);
    if (p == null || !Number.isInteger(p) || p < 1 || p > MAX_GUESTS) return `Guests must be a whole number from 1 to ${MAX_GUESTS}.`;
  }
  if (form.newSell.trim() !== "") {
    const s = num(form.newSell);
    if (s == null || s < 0) return "New stay price must be a number, zero or more.";
  }
  if (!changedFields(b, form).length) return "Change at least one thing — nothing differs from the booking yet.";
  return null;
}

/** The `detail` blob for servicing-case `open` (type "amendment"). The rate difference is deliberately NOT sent:
 *  the server derives it from the booked sell and the new price. */
export function buildAmendDetail(b: HotelBefore, form: AmendForm) {
  const pax = num(form.pax);
  const sell = num(form.newSell);
  return {
    amend_kind: "hotel" as const,
    leg_id: b.leg_id,
    after: {
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
      roomType: form.roomType.trim() || undefined,
      board: form.board || undefined,
      pax: pax ?? undefined,
      sell: sell == null ? undefined : Math.round(sell),
    },
  };
}

export const FIELD_LABELS: Record<string, string> = {
  checkIn: "Check-in", checkOut: "Check-out", roomType: "Room type", boardCode: "Board", pax: "Guests", sell: "Price",
};
