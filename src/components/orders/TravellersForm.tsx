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

type Row = {
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
};

const TITLES: Record<PaxType, { t: string; g: "male" | "female" }[]> = {
  adult: [{ t: "Mr", g: "male" }, { t: "Mrs", g: "female" }, { t: "Ms", g: "female" }, { t: "Dr", g: "male" }],
  child: [{ t: "Mstr", g: "male" }, { t: "Miss", g: "female" }],
  infant: [{ t: "Mstr", g: "male" }, { t: "Miss", g: "female" }],
};
const TYPE_LABEL: Record<PaxType, string> = { adult: "Adult (12+)", child: "Child (2-11)", infant: "Infant (under 2)" };

function blank(pax_type: PaxType, is_lead = false): Row {
  const first = TITLES[pax_type][0];
  return {
    pax_type, title: first.t, gender: first.g, first_name: "", last_name: "", date_of_birth: "", is_lead,
    email: "", phone: "", nationality: "IN", passport_number: "", passport_expiry: "", pan: "",
  };
}

function splitName(name: string): [string, string] {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length > 1 ? [parts.slice(0, -1).join(" "), parts[parts.length - 1]] : [parts[0] || "", ""];
}

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
function passportNote(expiry: string, travelEnd?: string | null): { tone: "bad" | "warn" | "ok"; text: string } | null {
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

export function TravellersForm({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const f = order.fulfilment!;
  const intl = f.international;
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
      travellers: rows.map((r) => ({
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
      })),
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
            <div className="ow-tf-pax" key={r.id || `new-${i}`}>
              <div className="ow-tf-pax-head">
                <b>Traveller {i + 1} · {TYPE_LABEL[r.pax_type]}</b>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {r.pax_type === "adult" ? (
                    <label className="ow-tf-lead">
                      <input type="radio" name="lead" checked={r.is_lead} onChange={() => setLead(i)} /> Lead traveller
                    </label>
                  ) : null}
                  {!fixedMix && rows.length > 1 ? (
                    <button type="button" className="taw-btn taw-btn--sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
                  ) : null}
                </span>
              </div>
              <div className="ow-tf-grid">
                <Field label="Title" htmlFor={`tf-title-${i}`}>
                  <select className="taw-input" value={r.title} onChange={(e) => {
                    const t = TITLES[r.pax_type].find((x) => x.t === e.target.value);
                    setRow(i, { title: e.target.value, ...(t && e.target.value !== "Dr" ? { gender: t.g } : {}) });
                  }}>
                    {TITLES[r.pax_type].map((x) => <option key={x.t} value={x.t}>{x.t}</option>)}
                  </select>
                </Field>
                <Field label="First & middle name" htmlFor={`tf-fn-${i}`}>
                  <input className="taw-input" autoComplete="off" value={r.first_name} onChange={(e) => setRow(i, { first_name: e.target.value })} />
                </Field>
                <Field label="Last name" htmlFor={`tf-ln-${i}`}>
                  <input className="taw-input" autoComplete="off" value={r.last_name} onChange={(e) => setRow(i, { last_name: e.target.value })} />
                </Field>
                <Field label="Gender" htmlFor={`tf-g-${i}`}>
                  <select className="taw-input" value={r.gender} onChange={(e) => setRow(i, { gender: e.target.value as Row["gender"] })}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
                <Field label={r.pax_type !== "adult" || intl ? "Date of birth" : "Date of birth (optional)"} htmlFor={`tf-dob-${i}`}>
                  <input className="taw-input" type="date" max={today} value={r.date_of_birth} onChange={(e) => setRow(i, { date_of_birth: e.target.value })} />
                </Field>
                {r.is_lead ? (
                  <>
                    <Field label="Email" htmlFor={`tf-em-${i}`}>
                      <input className="taw-input" type="email" value={r.email} onChange={(e) => setRow(i, { email: e.target.value })} />
                    </Field>
                    <Field label="Mobile" htmlFor={`tf-ph-${i}`}>
                      <input className="taw-input" inputMode="tel" placeholder="98xxxxxxxx" value={r.phone} onChange={(e) => setRow(i, { phone: e.target.value })} />
                    </Field>
                  </>
                ) : null}
                {/* Nationality and passport on every trip (kept on file for next time); required for international. */}
                <Field label="Nationality" htmlFor={`tf-nat-${i}`}>
                  <select id={`tf-nat-${i}`} className="taw-input" value={r.nationality || "IN"} onChange={(e) => setRow(i, { nationality: e.target.value })}>
                    {(NATIONALITIES.some(([c]) => c === r.nationality) || !r.nationality ? NATIONALITIES : [[r.nationality, r.nationality] as [string, string], ...NATIONALITIES])
                      .map(([c, name]) => <option key={c} value={c}>{name} ({c})</option>)}
                  </select>
                </Field>
                <Field label={r.passport_last4 ? `Passport (•••• ${r.passport_last4} on file)` : intl ? "Passport number" : "Passport number (optional)"} htmlFor={`tf-pp-${i}`}>
                  <input id={`tf-pp-${i}`} className="taw-input" autoComplete="off" maxLength={9} placeholder={r.passport_last4 ? "Leave blank to keep" : "e.g. Z1234567"} value={r.passport_number}
                    onChange={(e) => setRow(i, { passport_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
                </Field>
                <Field label={intl ? "Passport expiry" : "Passport expiry (optional)"} htmlFor={`tf-px-${i}`}>
                  <input id={`tf-px-${i}`} className="taw-input" type="date" value={r.passport_expiry} onChange={(e) => setRow(i, { passport_expiry: e.target.value })} />
                </Field>
                {(() => {
                  const note = passportNote(r.passport_expiry, order.travelEnd);
                  return note ? <div className={`ow-tf-pp ${note.tone}`} role={note.tone === "bad" ? "alert" : undefined}>{note.text}</div> : null;
                })()}
                {r.is_lead ? (
                  <Field label={r.has_pan ? "PAN (on file — leave blank to keep)" : "PAN (if the fare or hotel rate asks for it)"} htmlFor={`tf-pan-${i}`}>
                    <input className="taw-input" maxLength={10} placeholder="ABCDE1234F" value={r.pan} onChange={(e) => setRow(i, { pan: e.target.value.toUpperCase() })} />
                  </Field>
                ) : null}
              </div>
            </div>
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
