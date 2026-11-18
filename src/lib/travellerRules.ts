/* =============================================================================
 * TripAgent — src/lib/travellerRules.ts
 *
 * The traveller rules the New booking wizard (Travellers step) and the order page share, with no UI in them:
 * the row shape, one slot per passenger in a searched party, the payload the server takes, and the checks that
 * mirror the server's (_validate_traveller in adbe booking_fulfilment_service.py) so mistakes show while typing.
 * ===========================================================================*/
import type { PaxType } from "./orderTypes";

export type TravellerRow = {
  id?: string;
  pax_type: PaxType;
  title: string;
  first_name: string;
  last_name: string;
  gender: "male" | "female";
  date_of_birth: string;
  is_lead: boolean;
  email: string;
  phone: string;
  nationality: string;
  passport_number: string;
  passport_expiry: string;
  passport_last4?: string | null;
  pan: string;
  has_pan?: boolean;
  /** The saved traveller (customer profile) this card was filled in from: the server attaches their stored passport. */
  profile_id?: string;
};

type Row = TravellerRow;

export const TITLES: Record<PaxType, { t: string; g: "male" | "female" }[]> = {
  adult: [{ t: "Mr", g: "male" }, { t: "Mrs", g: "female" }, { t: "Ms", g: "female" }, { t: "Dr", g: "male" }],
  child: [{ t: "Mstr", g: "male" }, { t: "Miss", g: "female" }],
  infant: [{ t: "Mstr", g: "male" }, { t: "Miss", g: "female" }],
};

export function blank(pax_type: PaxType, is_lead = false): Row {
  const first = TITLES[pax_type][0];
  return {
    pax_type, title: first.t, gender: first.g, first_name: "", last_name: "", date_of_birth: "", is_lead,
    email: "", phone: "", nationality: "IN", passport_number: "", passport_expiry: "", pan: "",
  };
}

export function splitName(name: string): [string, string] {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length > 1 ? [parts.slice(0, -1).join(" "), parts[parts.length - 1]] : [parts[0] || "", ""];
}

/** The body the server takes for one traveller (POST /booking-orders/{id}/travellers). */
export function travellerPayload(r: Row) {
  return {
    id: r.id || null,
    title: r.title,
    first_name: r.first_name.trim(),
    last_name: r.last_name.trim(),
    gender: r.gender,
    pax_type: r.pax_type,
    date_of_birth: r.date_of_birth || null,
    is_lead: r.is_lead,
    email: r.email.trim() || null,
    phone: r.phone.replace(/\D/g, "") || null,
    nationality: (r.nationality || "").trim().toUpperCase() || null,
    passport_number: r.passport_number.trim().toUpperCase() || null,
    passport_expiry: r.passport_expiry || null,
    pan: r.pan.trim().toUpperCase() || null,
    profile_id: r.profile_id || null,
  };
}

/** One slot per passenger in the searched party, adults then children then infants. Rows already typed in
 *  are kept (by type, in order) when the party changes; the lead is the first adult, filled in from the customer. */
export function rowsForParty(
  existing: Row[],
  need: { adult: number; child: number; infant: number },
  who: { name?: string; email?: string; phone?: string },
): Row[] {
  const rows: Row[] = [];
  (["adult", "child", "infant"] as PaxType[]).forEach((type) => {
    const mine = existing.filter((r) => r.pax_type === type);
    for (let i = 0; i < (need[type] || 0); i++) rows.push({ ...(mine[i] || blank(type)), is_lead: false });
  });
  const lead = rows.find((r) => r.pax_type === "adult");
  if (lead) {
    const was = existing.find((r) => r.is_lead && r.pax_type === "adult");
    // Keep the lead the advisor chose if that traveller is still in the party.
    const keep = was ? rows.find((r) => r.first_name === was.first_name && r.last_name === was.last_name && r.pax_type === "adult" && (r.first_name || r.last_name)) : null;
    const chosen = keep || lead;
    chosen.is_lead = true;
    if (!chosen.first_name && !chosen.last_name) [chosen.first_name, chosen.last_name] = splitName(who.name || "");
    chosen.email = chosen.email || who.email || "";
    chosen.phone = chosen.phone || who.phone || "";
  }
  return rows;
}

const _NAME_OK = /^[A-Za-z .'-]*$/;
const _PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Whole years between a date of birth and a day (both YYYY-MM-DD). */
export function ageOn(dob: string, on: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(on);
  if (!a || !b) return null;
  let age = +b[1] - +a[1];
  if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[3] < +a[3])) age -= 1;
  return age;
}

/** What the server will refuse, found while the advisor types, so nothing waits for a failed save. The same rules as
 *  the server (_validate_traveller in booking_fulfilment_service.py): names as on the ID, date of birth where it is
 *  required, age against the passenger type on the travel date, the lead's contact, passport on international trips. */
export function travellerProblems(rows: Row[], ctx: { intl: boolean; start?: string | null; end?: string | null; hotelOnly?: boolean }): string[] {
  const out: string[] = [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const [adultFrom, childTo] = ctx.hotelOnly ? [18, 17] : [12, 11];
  rows.forEach((r, i) => {
    const who = `Traveller ${i + 1}${r.first_name || r.last_name ? ` (${`${r.first_name} ${r.last_name}`.trim()})` : ""}`;
    if (!r.first_name.trim() || !r.last_name.trim()) out.push(`${who}: first and last name are needed.`);
    else {
      if (!_NAME_OK.test(r.first_name) || !_NAME_OK.test(r.last_name)) out.push(`${who}: the name can only use letters, spaces, apostrophes and hyphens, as printed on the ID.`);
      if (r.first_name.trim().length + r.last_name.trim().length < 3) out.push(`${who}: the full name is too short for an airline booking.`);
    }
    if ((r.pax_type !== "adult" || ctx.intl) && !r.date_of_birth) out.push(`${who}: date of birth is needed.`);
    if (r.date_of_birth) {
      if (r.date_of_birth >= todayISO) out.push(`${who}: date of birth must be in the past.`);
      else if (ctx.start) {
        const age = ageOn(r.date_of_birth, ctx.start);
        if (age != null) {
          if (r.pax_type === "adult" && age < adultFrom) out.push(`${who} is ${age} on the travel date: add them as a child (2-${childTo}) or infant (under 2).`);
          if (r.pax_type === "child" && !(age >= 2 && age <= childTo)) out.push(`${who}: a child must be 2-${childTo} on the travel date (is ${age}).`);
          if (r.pax_type === "infant" && age >= 2) out.push(`${who}: an infant must be under 2 on the travel date (is ${age}).`);
        }
      }
    }
    if (r.is_lead) {
      if (!r.email.includes("@")) out.push(`${who}: the lead traveller needs an email (tickets and vouchers go there).`);
      if (r.phone.replace(/\D/g, "").length < 10) out.push(`${who}: the lead traveller needs a mobile number.`);
    }
    const pp = r.passport_number.trim().toUpperCase();
    if (pp && !(pp.length >= 6 && pp.length <= 9 && /^[A-Z0-9]+$/.test(pp))) out.push(`${who}: the passport number should be 6-9 letters or digits.`);
    if (ctx.intl) {
      if (!pp && !r.passport_last4) out.push(`${who}: passport number is needed for an international trip.`);
      if (!r.passport_expiry) out.push(`${who}: passport expiry is needed for an international trip.`);
      else if (ctx.end && r.passport_expiry <= ctx.end.slice(0, 10)) out.push(`${who}: the passport expires before the trip ends (${r.passport_expiry}).`);
      if (!r.nationality) out.push(`${who}: nationality is needed for an international trip.`);
    }
    if (r.pan.trim() && !_PAN.test(r.pan.trim().toUpperCase())) out.push(`${who}: PAN should look like ABCDE1234F.`);
  });
  if (rows.filter((r) => r.is_lead).length !== 1) out.push("Mark one traveller as the lead.");
  return out;
}

/** A saved traveller (GET /booking-orders/customers/{id}/travellers) as the fields of a card. Never a passport number:
 *  only its last four digits, and the server attaches the real one on save. */
export type SavedTraveller = {
  id: string; title?: string | null; first_name: string; last_name: string; gender?: string | null; date_of_birth?: string | null;
  email?: string | null; phone?: string | null; nationality?: string | null; passport_last4?: string | null; passport_expiry?: string | null;
  has_pan?: boolean; relation?: string | null;
};

export function fillFromSaved(r: TravellerRow, s: SavedTraveller): Partial<TravellerRow> {
  const titles = TITLES[r.pax_type].map((t) => t.t);
  const gender = s.gender === "female" || s.gender === "male" ? s.gender : r.gender;
  return {
    title: s.title && titles.includes(s.title) ? s.title : r.title, first_name: s.first_name, last_name: s.last_name, gender,
    date_of_birth: s.date_of_birth || "", nationality: s.nationality || r.nationality || "IN",
    email: r.is_lead ? s.email || r.email : r.email, phone: r.is_lead ? s.phone || r.phone : r.phone,
    passport_number: "", passport_last4: s.passport_last4 || null, passport_expiry: s.passport_expiry || "", has_pan: !!s.has_pan, pan: "",
    profile_id: s.id,
  };
}
