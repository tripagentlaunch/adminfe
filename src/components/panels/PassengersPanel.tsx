"use client";
/* Passengers for the trip's flights, entered by the advisor in the Itinerary Builder before the
   proposal link goes out. TripSure takes a flight's payment only after Update Itinerary, which
   needs every passenger (name as on the ID, gender, date of birth for children / infants and
   international trips, passport for international) — so the customer's Pay now stays one tap.
   Saved on the itinerary (itinerary.passengers, advisor-only: the public proposal never carries
   it); the server reads it when the customer pays (proposal_flight_pay_service._passengers). */
import { useState } from "react";
import { Icon } from "../ui";
import { paxText, type PaxMix } from "../../lib/flightRequests";

export type Passenger = {
  pax_type: "adult" | "child" | "infant"; title: string; first_name: string; last_name: string; gender: "male" | "female" | "";
  date_of_birth: string; nationality: string; passport_number: string; passport_expiry: string;
  is_lead?: boolean; email?: string; phone?: string;
};

const TITLES: Record<Passenger["pax_type"], string[]> = { adult: ["Mr", "Mrs", "Ms", "Miss", "Dr"], child: ["Mstr", "Miss"], infant: ["Mstr", "Miss"] };

/** The passengers the trip's live-priced flights were priced for, and whether any is international. */
export function flightPax(data: any): { mix: PaxMix; intl: boolean } | null {
  const flights = (data?.days || []).flatMap((d: any) => (d.items || []).filter((it: any) => it.type === "flight" && it.pricing));
  if (!flights.length) return null;
  const mix = flights[0].paxMix || { adults: 1, children: 0, infants: 0 };
  return { mix, intl: flights.some((f: any) => f.international) };
}

/** Whether every passenger has what TripSure needs (the same rule the server applies). */
export function passengersComplete(rows: Passenger[], mix: PaxMix, intl: boolean): boolean {
  const n = (k: string) => rows.filter((r) => r.pax_type === k).length;
  if (n("adult") !== mix.adults || n("child") !== mix.children || n("infant") !== mix.infants) return false;
  return rows.every((r, i) => r.first_name.trim() && r.last_name.trim() && r.gender
    && ((r.pax_type === "adult" && !intl) || r.date_of_birth)
    && (!intl || (r.passport_number.trim() && r.passport_expiry))
    && (i !== 0 || ((r.email || "").includes("@") && /^\d{10}$/.test(String(r.phone || "").replace(/\D/g, "").slice(-10)))));
}

function blank(kind: Passenger["pax_type"], lead: boolean, member: any): Passenger {
  const parts = String((lead && member?.name) || "").trim().split(/\s+/).filter(Boolean);
  return {
    pax_type: kind, title: TITLES[kind][0], first_name: parts[0] || "", last_name: parts.slice(1).join(" "), gender: "",
    date_of_birth: "", nationality: (lead && member?.nationality && String(member.nationality).length === 2 ? member.nationality : "IN"),
    passport_number: (lead && member?.passport_number) || "", passport_expiry: (lead && member?.passport_expiry) || "",
    ...(lead ? { is_lead: true, email: member?.email || "", phone: String(member?.phone || member?.wa_phone || "").replace(/\D/g, "").slice(-10) } : {}),
  };
}

export function PassengersPanel({ data, member, onChange }: { data: any; member: any; onChange: (rows: Passenger[]) => void }) {
  const need = flightPax(data);
  const [open, setOpen] = useState(false);
  if (!need) return null;
  const { mix, intl } = need;
  const kinds: Passenger["pax_type"][] = [...Array(mix.adults).fill("adult"), ...Array(mix.children).fill("child"), ...Array(mix.infants).fill("infant")];
  const saved: Passenger[] = Array.isArray(data.passengers) ? data.passengers : [];
  // One row per passenger the fare was priced for, keeping whatever was typed before.
  const rows: Passenger[] = kinds.map((k, i) => (saved[i] && saved[i].pax_type === k ? saved[i] : blank(k, i === 0, member)));
  const done = passengersComplete(rows, mix, intl);
  const set = (i: number, patch: Partial<Passenger>) => onChange(rows.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    // A title that contradicts the gender just picked follows it (Mr ↔ Ms, Mstr ↔ Miss).
    if (patch.gender === "female" && (next.title === "Mr" || next.title === "Mstr")) next.title = r.pax_type === "adult" ? "Ms" : "Miss";
    if (patch.gender === "male" && ["Mrs", "Ms", "Miss"].includes(next.title)) next.title = r.pax_type === "adult" ? "Mr" : "Mstr";
    return next;
  }));
  const filled = rows.filter((r) => r.first_name && r.last_name && r.gender).length;

  return (
    <div className={"taw-pax" + (done ? " is-done" : "")}>
      <button type="button" className="taw-pax-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="people" size={16} />
        <b>Passengers</b>
        <span className="taw-pax-sub">{paxText(mix)}{intl ? " · international" : ""}</span>
        <span className={"taw-pax-state" + (done ? " ok" : "")}>
          {done ? "✓ Ready for payment" : `${filled} of ${rows.length} filled — needed before the customer can pay`}
        </span>
        <Icon name="chevron" size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s" }} />
      </button>
      {open ? (
        <div className="taw-pax-b">
          <p className="taw-pax-note">
            Names exactly as on {intl ? "the passport" : "a government ID"}. TripSure needs every passenger before it takes the flight payment, so the
            customer&apos;s Pay now on the proposal link opens only once these are complete.
          </p>
          {rows.map((r, i) => (
            <fieldset key={i} className="taw-pax-row">
              <legend>
                {r.pax_type === "adult" ? `Adult ${kinds.slice(0, i + 1).filter((k) => k === "adult").length}` : r.pax_type === "child" ? "Child (2–11)" : "Infant (under 2)"}
                {i === 0 ? " · lead (contact for the booking)" : ""}
              </legend>
              <div className="taw-pax-grid">
                <select className="taw-input" aria-label="Title" value={r.title} onChange={(e) => set(i, { title: e.target.value })}>
                  {TITLES[r.pax_type].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className="taw-input" aria-label="First name" placeholder="First name" value={r.first_name} onChange={(e) => set(i, { first_name: e.target.value })} />
                <input className="taw-input" aria-label="Last name" placeholder="Last name" value={r.last_name} onChange={(e) => set(i, { last_name: e.target.value })} />
                <select className="taw-input" aria-label="Gender" value={r.gender} onChange={(e) => set(i, { gender: e.target.value as Passenger["gender"] })}>
                  <option value="">Gender</option><option value="male">Male</option><option value="female">Female</option>
                </select>
                <label className="taw-pax-l">Date of birth{r.pax_type === "adult" && !intl ? " (optional)" : ""}
                  <input className="taw-input" type="date" value={r.date_of_birth} onChange={(e) => set(i, { date_of_birth: e.target.value })} />
                </label>
                {intl ? (
                  <>
                    <input className="taw-input" aria-label="Passport number" placeholder="Passport number" value={r.passport_number}
                      onChange={(e) => set(i, { passport_number: e.target.value.toUpperCase() })} />
                    <label className="taw-pax-l">Passport expiry
                      <input className="taw-input" type="date" value={r.passport_expiry} onChange={(e) => set(i, { passport_expiry: e.target.value })} />
                    </label>
                    <input className="taw-input" aria-label="Nationality" placeholder="Nationality (IN)" maxLength={2} value={r.nationality}
                      onChange={(e) => set(i, { nationality: e.target.value.toUpperCase() })} />
                  </>
                ) : null}
                {i === 0 ? (
                  <>
                    <input className="taw-input" aria-label="Email" type="email" placeholder="Email (tickets go here)" value={r.email || ""} onChange={(e) => set(i, { email: e.target.value })} />
                    <input className="taw-input" aria-label="Mobile" inputMode="numeric" placeholder="Mobile (10 digits)" value={r.phone || ""} onChange={(e) => set(i, { phone: e.target.value })} />
                  </>
                ) : null}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
    </div>
  );
}
