"use client";
/* Every passenger on an order, as printed on their ID. The slots come from the
   passenger mix the flight fares were priced for (2 adults + 1 child -> three
   cards of those types), so the advisor fills in exactly what TripSure needs.
   Passports are asked for on international trips only; a stored passport is
   shown masked and kept unless retyped. */
import { useMemo, useState } from "react";
import { Field, Icon } from "../ui";
import { bookingSaveTravellers } from "../../services/api";
import { errText } from "../../lib/errText";
import { toast } from "../../lib/advisorHelpers";
import type { Order, PaxType } from "../../lib/orderTypes";
import {
  TITLES, blank, splitName, travellerPayload, rowsForParty, ageOn, travellerProblems, type TravellerRow,
} from "../../lib/travellerRules";
export { TITLES, blank, splitName, travellerPayload, rowsForParty, ageOn, travellerProblems };
export type { TravellerRow };
type Row = TravellerRow;


// Airlines: adult 12+, child 2-11. A hotel-only order follows the hotel's rule instead: adult 18+, child 2-17.
export const TYPE_LABEL: Record<PaxType, string> = { adult: "Adult (12+)", child: "Child (2-11)", infant: "Infant (under 2)" };
const HOTEL_TYPE_LABEL: Record<PaxType, string> = { adult: "Adult (18+)", child: "Child (2-17)", infant: "Infant (under 2)" };


function initialRows(order: Order): Row[] {
  const f = order.fulfilment!;
  const existing: Row[] = f.travellers.list.map((t: any) => ({
    id: t.id,
    pax_type: t.pax_type || "adult",
    title: t.title || TITLES[(t.pax_type || "adult") as PaxType][0].t,
    first_name: t.first_name || "",
    last_name: t.last_name || "",
    gender: t.gender || "male",
    date_of_birth: t.date_of_birth || "",
    is_lead: !!t.is_lead,
    email: t.email || "",
    phone: t.phone || "",
    nationality: t.nationality || "IN",
    passport_number: "",
    passport_expiry: t.passport_expiry || "",
    passport_last4: t.passport_last4,
    pan: "",
    has_pan: t.has_pan,
  }));
  const needed = f.travellers.needed;
  if (!needed) {
    if (existing.length) return existing;
    const lead = blank("adult", true);
    [lead.first_name, lead.last_name] = splitName(f.customer.name || order.customerName);
    lead.email = f.customer.email || order.email || "";
    lead.phone = f.customer.phone || "";
    return [lead];
  }
  // One slot per priced passenger: reuse saved travellers of that type first.
  const rows: Row[] = [];
  (["adult", "child", "infant"] as PaxType[]).forEach((type) => {
    const mine = existing.filter((r) => r.pax_type === type);
    for (let i = 0; i < (needed[type] || 0); i++) rows.push(mine[i] || blank(type));
  });
  if (!rows.some((r) => r.is_lead)) {
    const first = rows.find((r) => r.pax_type === "adult");
    if (first) {
      first.is_lead = true;
      if (!first.first_name && !first.last_name) [first.first_name, first.last_name] = splitName(f.customer.name || order.customerName);
      first.email = first.email || f.customer.email || order.email || "";
      first.phone = first.phone || f.customer.phone || "";
    }
  }
  return rows;
}


// Nationality choices (ISO 3166 alpha-2), most common first; any other code can be typed.
export const NATIONALITIES: [string, string][] = [
  ["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["AE", "United Arab Emirates"], ["CA", "Canada"],
  ["AU", "Australia"], ["SG", "Singapore"], ["NZ", "New Zealand"], ["DE", "Germany"], ["FR", "France"], ["IT", "Italy"],
  ["ES", "Spain"], ["NL", "Netherlands"], ["CH", "Switzerland"], ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["OM", "Oman"],
  ["KW", "Kuwait"], ["BH", "Bahrain"], ["MY", "Malaysia"], ["TH", "Thailand"], ["JP", "Japan"], ["LK", "Sri Lanka"],
  ["NP", "Nepal"], ["BD", "Bangladesh"], ["ZA", "South Africa"], ["IE", "Ireland"],
];

// Soft passport check against the trip: a passport that lapses before the trip ends can't
// be used (the server refuses it for international trips); many countries also ask for
// 6 months' validity beyond the stay. Advice only — the advisor decides.
export function passportNote(expiry: string, travelEnd?: string | null): { tone: "bad" | "warn" | "ok"; text: string } | null {
  if (!expiry) return null;
  const exp = Date.parse(expiry + "T00:00:00Z");
  if (!Number.isFinite(exp)) return null;
  const fmt = new Date(exp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const end = travelEnd ? Date.parse(travelEnd.slice(0, 10) + "T00:00:00Z") : NaN;
  if (Number.isFinite(end)) {
    if (exp <= end) return { tone: "bad", text: `Expires ${fmt} — before the trip ends. Renew it before booking.` };
    const six = new Date(end); six.setUTCMonth(six.getUTCMonth() + 6);
    if (exp < six.getTime()) {
      const m = Math.max(0, Math.round((exp - end) / (30.44 * 86_400_000)));
      return { tone: "warn", text: `Valid ${m} month${m === 1 ? "" : "s"} past the trip (to ${fmt}). Many countries require 6 months — check the destination's rule.` };
    }
    return { tone: "ok", text: `Valid to ${fmt} — 6+ months past the trip.` };
  }
  return exp < Date.now() ? { tone: "bad", text: `Expired on ${fmt}.` } : { tone: "ok", text: `Valid to ${fmt}.` };
}

// ── Shared with the New booking wizard (Travellers step) ─────────────────────────────────────

/** One traveller's fields: the card both the New booking wizard and the order page show. */
export function TravellerCard({ row: r, index: i, intl, typeLabel, travelEnd, canRemove, onRemove, onChange, onMakeLead, idPrefix = "tf", saved, onPickSaved }: {
  row: Row; index: number; intl: boolean; typeLabel: Record<PaxType, string>; travelEnd?: string | null;
  canRemove?: boolean; onRemove?: () => void; onChange: (patch: Partial<Row>) => void; onMakeLead: () => void; idPrefix?: string;
  /** The customer's saved travellers not already used on another card, and what to do when one is picked. */
  saved?: { id: string; label: string }[]; onPickSaved?: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const id = (k: string) => `${idPrefix}-${k}-${i}`;
  return (
    <div className="ow-tf-pax">
      <div className="ow-tf-pax-head">
        <b>Traveller {i + 1} · {typeLabel[r.pax_type]}</b>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {r.pax_type === "adult" ? (
            <label className="ow-tf-lead">
              <input type="radio" name={`${idPrefix}-lead`} checked={r.is_lead} onChange={onMakeLead} /> Lead traveller
            </label>
          ) : null}
          {canRemove ? <button type="button" className="taw-btn taw-btn--sm" onClick={onRemove}>Remove</button> : null}
        </span>
      </div>
      {saved && saved.length && onPickSaved ? (
        <label className="ow-tf-saved">
          <span>Fill in from a saved traveller</span>
          <select className="taw-input" aria-label="Fill in from a saved traveller" value={r.profile_id || ""}
            onChange={(e) => { if (e.target.value) onPickSaved(e.target.value); }}>
            <option value="">{r.profile_id ? "Saved traveller used" : "Choose…"}</option>
            {saved.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      ) : null}
      <div className="ow-tf-grid">
        <Field label="Title" htmlFor={id("title")}>
          <select id={id("title")} className="taw-input" value={r.title} onChange={(e) => {
            const t = TITLES[r.pax_type].find((x) => x.t === e.target.value);
            onChange({ title: e.target.value, ...(t && e.target.value !== "Dr" ? { gender: t.g } : {}) });
          }}>
            {TITLES[r.pax_type].map((x) => <option key={x.t} value={x.t}>{x.t}</option>)}
          </select>
        </Field>
        <Field label="First & middle name" htmlFor={id("fn")}>
          <input id={id("fn")} className="taw-input" autoComplete="off" value={r.first_name} onChange={(e) => onChange({ first_name: e.target.value })} />
        </Field>
        <Field label="Last name" htmlFor={id("ln")}>
          <input id={id("ln")} className="taw-input" autoComplete="off" value={r.last_name} onChange={(e) => onChange({ last_name: e.target.value })} />
        </Field>
        <Field label="Gender" htmlFor={id("g")}>
          <select id={id("g")} className="taw-input" value={r.gender} onChange={(e) => onChange({ gender: e.target.value as Row["gender"] })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </Field>
        <Field label={r.pax_type !== "adult" || intl ? "Date of birth" : "Date of birth (optional)"} htmlFor={id("dob")}>
          <input id={id("dob")} className="taw-input" type="date" max={today} value={r.date_of_birth} onChange={(e) => onChange({ date_of_birth: e.target.value })} />
        </Field>
        {r.is_lead ? (
          <>
            <Field label="Email" htmlFor={id("em")}>
              <input id={id("em")} className="taw-input" type="email" value={r.email} onChange={(e) => onChange({ email: e.target.value })} />
            </Field>
            <Field label="Mobile" htmlFor={id("ph")}>
              <input id={id("ph")} className="taw-input" inputMode="tel" placeholder="98xxxxxxxx" value={r.phone} onChange={(e) => onChange({ phone: e.target.value })} />
            </Field>
          </>
        ) : null}
        {/* Nationality and passport on every trip (kept on file for next time); required for international. */}
        <Field label="Nationality" htmlFor={id("nat")}>
          <select id={id("nat")} className="taw-input" value={r.nationality || "IN"} onChange={(e) => onChange({ nationality: e.target.value })}>
            {(NATIONALITIES.some(([c]) => c === r.nationality) || !r.nationality ? NATIONALITIES : [[r.nationality, r.nationality] as [string, string], ...NATIONALITIES])
              .map(([c, name]) => <option key={c} value={c}>{name} ({c})</option>)}
          </select>
        </Field>
        <Field label={r.passport_last4 ? `Passport (•••• ${r.passport_last4} on file)` : intl ? "Passport number" : "Passport number (optional)"} htmlFor={id("pp")}>
          <input id={id("pp")} className="taw-input" autoComplete="off" maxLength={9} placeholder={r.passport_last4 ? "Leave blank to keep" : "e.g. Z1234567"} value={r.passport_number}
            onChange={(e) => onChange({ passport_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
        </Field>
        <Field label={intl ? "Passport expiry" : "Passport expiry (optional)"} htmlFor={id("px")}>
          <input id={id("px")} className="taw-input" type="date" value={r.passport_expiry} onChange={(e) => onChange({ passport_expiry: e.target.value })} />
        </Field>
        {(() => {
          const note = passportNote(r.passport_expiry, travelEnd);
          return note ? <div className={`ow-tf-pp ${note.tone}`} role={note.tone === "bad" ? "alert" : undefined}>{note.text}</div> : null;
        })()}
        {r.is_lead ? (
          <Field label={r.has_pan ? "PAN (on file — leave blank to keep)" : "PAN (if the fare or hotel rate asks for it)"} htmlFor={id("pan")}>
            <input id={id("pan")} className="taw-input" maxLength={10} placeholder="ABCDE1234F" value={r.pan} onChange={(e) => onChange({ pan: e.target.value.toUpperCase() })} />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

export function TravellersForm({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const f = order.fulfilment!;
  const intl = f.international;
  const hotelOnly = f.items.some((x) => x.kind === "hotel") && !f.items.some((x) => x.kind === "flight");
  const typeLabel = hotelOnly ? HOTEL_TYPE_LABEL : TYPE_LABEL;
  const fixedMix = !!f.travellers.needed;
  const [rows, setRows] = useState<Row[]>(() => initialRows(order));
  const [gst, setGst] = useState({ open: !!f.customer.gst_number, number: f.customer.gst_number || "", company: f.customer.gst_company_name || "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setLead = (i: number) => setRows((rs) => rs.map((r, j) => ({ ...r, is_lead: j === i })));

  // Light client checks; the server applies the full rules (ages vs travel date, passport validity, mix).
  const missing = useMemo(() => {
    const out: string[] = [];
    rows.forEach((r, i) => {
      const n = `Traveller ${i + 1}`;
      if (!r.first_name.trim() || !r.last_name.trim()) out.push(`${n}: first and last name`);
      if ((r.pax_type !== "adult" || intl) && !r.date_of_birth) out.push(`${n}: date of birth`);
      if (r.is_lead && (!r.email.includes("@") || r.phone.replace(/\D/g, "").length < 10)) out.push(`${n}: lead email and mobile`);
      if (intl && !r.passport_number.trim() && !r.passport_last4) out.push(`${n}: passport number`);
      if (intl && !r.passport_expiry) out.push(`${n}: passport expiry`);
    });
    if (rows.filter((r) => r.is_lead).length !== 1) out.push("one lead traveller");
    return out;
  }, [rows, intl]);

  function save() {
    setSaving(true);
    setErr(null);
    bookingSaveTravellers(order.dbId, {
      travellers: rows.map(travellerPayload),
      customer_phone: rows.find((r) => r.is_lead)?.phone.replace(/\D/g, "") || null,
      gst_number: gst.open ? gst.number.trim().toUpperCase() || null : null,
      gst_company_name: gst.open ? gst.company.trim() || null : null,
    })
      .then(() => { toast("Travellers saved", "success"); onSaved(); })
      .catch((e: any) => setErr(errText(e)))
      .finally(() => setSaving(false));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="taw-modal-overlay" role="dialog" aria-modal="true" aria-label="Travellers"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="taw-modal-panel ow-modal ow-modal--wide">
        <div className="ow-modal-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Travellers</div>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>
              Names exactly as on the {intl ? "passport" : "government ID"}.{intl ? " International trip — passports are required." : ""}
            </div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" onClick={onClose} disabled={saving} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
        {err ? <div className="taw-banner taw-banner--danger">{err}</div> : null}

        <div className="ow-tf">
          {rows.map((r, i) => (
            <TravellerCard key={r.id || `new-${i}`} row={r} index={i} intl={intl} typeLabel={typeLabel} travelEnd={order.travelEnd}
              canRemove={!fixedMix && rows.length > 1} onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              onChange={(patch) => setRow(i, patch)} onMakeLead={() => setLead(i)} />
          ))}

          {!fixedMix ? (
            <button type="button" className="taw-btn taw-btn--sm" style={{ justifySelf: "start" }} onClick={() => setRows((rs) => [...rs, blank("adult")])}>
              <Icon name="plus" size={13} /> Add guest
            </button>
          ) : null}

          <label className="ow-tf-lead">
            <input type="checkbox" checked={gst.open} onChange={(e) => setGst((g) => ({ ...g, open: e.target.checked }))} /> Business booking — add GST details for the invoice
          </label>
          {gst.open ? (
            <div className="ow-grid2">
              <Field label="GSTIN" htmlFor="tf-gst"><input className="taw-input" maxLength={15} value={gst.number} onChange={(e) => setGst((g) => ({ ...g, number: e.target.value.toUpperCase() }))} /></Field>
              <Field label="Registered company name" htmlFor="tf-gstco"><input className="taw-input" value={gst.company} onChange={(e) => setGst((g) => ({ ...g, company: e.target.value }))} /></Field>
            </div>
          ) : null}
        </div>

        <div className="ow-modal-foot">
          <span className="ow-sub" style={{ whiteSpace: "normal" }}>{missing.length ? `Still needed: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "…" : ""}` : "Ready to save."}</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="taw-btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="taw-btn taw-btn--primary" onClick={save} disabled={saving || missing.length > 0}>
              {saving ? "Saving…" : "Save travellers"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
