"use client";
/* Passengers for the trip's flights, entered by the advisor in the Itinerary Builder before the
   proposal link goes out. TripSure takes a flight's payment only after Update Itinerary, which
   needs every passenger — so the customer's Pay now stays one tap. Only what THIS trip needs is
   asked (passengerRules): passport for international trips, a fare that asks for one, or a
   non-Indian passenger; date of birth for children, infants and international trips; the lead's
   PAN when the fare asks for it. The server applies the same rules (_passengers / _doc_rules).
   Saved on the itinerary (itinerary.passengers, advisor-only: the public proposal never carries
   it); the server reads it when the customer pays (proposal_flight_pay_service._passengers). */
import { useState } from "react";
import { Icon } from "../ui";
import { paxText, type PaxMix } from "../../lib/flightRequests";
import { NATIONALITIES } from "../orders/TravellersForm";

export type Passenger = {
  pax_type: "adult" | "child" | "infant"; title: string; first_name: string; last_name: string; gender: "male" | "female" | "";
  date_of_birth: string; nationality: string; passport_number: string; passport_expiry: string;
  is_lead?: boolean; email?: string; phone?: string; pan?: string;
};

/** What the trip's flights ask for: international, and the fare's own conditions (pricing.needs). */
export type TripRules = { intl: boolean; passport: boolean; pan: boolean };

/** Which fields one passenger needs on this trip. */
export function passengerRules(r: Passenger, lead: boolean, t: TripRules) {
  const foreign = (r.nationality || "IN").toUpperCase() !== "IN";
  return {
    dob: r.pax_type !== "adult" || t.intl,
    passport: t.intl || t.passport || foreign,
    pan: lead && t.pan,
  };
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** What a passenger still needs, in words ("gender, date of birth"). */
export function missingFor(r: Passenger, lead: boolean, t: TripRules): string[] {
  const need = passengerRules(r, lead, t);
  return [
    !r.first_name.trim() || !r.last_name.trim() ? "name" : "",
    !r.gender ? "gender" : "",
    need.dob && !r.date_of_birth ? "date of birth" : "",
    need.passport && !r.passport_number.trim() ? "passport number" : "",
    need.passport && !r.passport_expiry ? "passport expiry" : "",
    lead && !(r.email || "").includes("@") ? "email" : "",
    lead && !/^\d{10}$/.test(String(r.phone || "").replace(/\D/g, "").slice(-10)) ? "mobile" : "",
    need.pan && !PAN_RE.test(String(r.pan || "").toUpperCase()) ? "PAN" : "",
  ].filter(Boolean);
}

const TITLES: Record<Passenger["pax_type"], string[]> = { adult: ["Mr", "Mrs", "Ms", "Miss", "Dr"], child: ["Mstr", "Miss"], infant: ["Mstr", "Miss"] };

/** The passengers the trip's live-priced flights were priced for, and what the trip asks of them. */
export function flightPax(data: any): { mix: PaxMix; rules: TripRules } | null {
  const flights = (data?.days || []).flatMap((d: any) => (d.items || []).filter((it: any) => it.type === "flight" && it.pricing));
  if (!flights.length) return null;
  const mix = flights[0].paxMix || { adults: 1, children: 0, infants: 0 };
  const needs = new Set<string>(flights.flatMap((f: any) => (f.pricing.needs || []).map((n: string) => String(n).toLowerCase())));
  return { mix, rules: { intl: flights.some((f: any) => f.international), passport: needs.has("passport"), pan: needs.has("pan") } };
}

/** Whether every passenger has what TripSure needs (the same rule the server applies). */
export function passengersComplete(rows: Passenger[], mix: PaxMix, rules: TripRules): boolean {
  const n = (k: string) => rows.filter((r) => r.pax_type === k).length;
  if (n("adult") !== mix.adults || n("child") !== mix.children || n("infant") !== mix.infants) return false;
  return rows.every((r, i) => missingFor(r, i === 0, rules).length === 0);
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
  // Domestic trips start every passenger as an Indian national (nothing more to ask);
  // "Not an Indian national?" opens nationality, and a passport with it, for that one person.
  const [natOpen, setNatOpen] = useState<Record<number, boolean>>({});
  if (!need) return null;
  const { mix, rules } = need;
  const intl = rules.intl;
  const kinds: Passenger["pax_type"][] = [...Array(mix.adults).fill("adult"), ...Array(mix.children).fill("child"), ...Array(mix.infants).fill("infant")];
  const saved: Passenger[] = Array.isArray(data.passengers) ? data.passengers : [];
  // One row per passenger the fare was priced for, keeping whatever was typed before.
  const rows: Passenger[] = kinds.map((k, i) => (saved[i] && saved[i].pax_type === k ? saved[i] : blank(k, i === 0, member)));
  const done = passengersComplete(rows, mix, rules);
  const set = (i: number, patch: Partial<Passenger>) => onChange(rows.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    // A title that contradicts the gender just picked follows it (Mr ↔ Ms, Mstr ↔ Miss).
    if (patch.gender === "female" && (next.title === "Mr" || next.title === "Mstr")) next.title = r.pax_type === "adult" ? "Ms" : "Miss";
    if (patch.gender === "male" && ["Mrs", "Ms", "Miss"].includes(next.title)) next.title = r.pax_type === "adult" ? "Mr" : "Mstr";
    return next;
  }));
  const filled = rows.filter((r, i) => missingFor(r, i === 0, rules).length === 0).length;
  const missing = (r: Passenger, i: number) => missingFor(r, i === 0, rules);
  // One line on what this trip asks for, so the advisor knows why a field is (or isn't) there.
  const asks = [
    intl ? "passports and dates of birth (international trip)" : rules.passport ? "passports (this fare asks for them)" : "",
    !intl && mix.children + mix.infants ? "children's / infants' dates of birth" : "",
    rules.pan ? "the lead's PAN (this fare asks for it)" : "",
  ].filter(Boolean);

  return (
    <div className={"taw-psg" + (done ? " is-done" : "")}>
      <button type="button" className="taw-psg-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="taw-psg-ic"><Icon name="people" size={16} /></span>
        <span className="taw-psg-title">
          <b>Passengers</b>
          <small>{paxText(mix)}{intl ? " · international trip" : ""}</small>
        </span>
        <span className={"taw-psg-state" + (done ? " ok" : "")}>
          {done ? "✓ Ready for payment" : `${filled} of ${rows.length} complete · needed before the customer can pay`}
        </span>
        <span className="taw-psg-toggle">{open ? "Close" : done ? "View" : "Fill in"}<Icon name="chevron" size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s" }} /></span>
      </button>
      {open ? (
        <div className="taw-psg-b">
          <p className="taw-psg-note">
            Enter each passenger exactly as on {intl || rules.passport ? "their passport" : "a government ID"}. TripSure needs all of them before it takes
            the flight payment, so the customer&apos;s <b>Pay now</b> opens only once every card here is complete.{" "}
            {asks.length ? <>This trip also needs {asks.join(" and ")}.</> : <>Domestic trip: name, gender and the lead&apos;s contact are all it needs.</>}
          </p>
          {rows.map((r, i) => {
            const miss = missing(r, i);
            const need = passengerRules(r, i === 0, rules);
            const showNat = intl || natOpen[i] || (r.nationality || "IN").toUpperCase() !== "IN";
            const kindLabel = r.pax_type === "adult" ? `Adult ${kinds.slice(0, i + 1).filter((k) => k === "adult").length}` : r.pax_type === "child" ? "Child (2–11 yrs)" : "Infant (under 2)";
            return (
              <section key={i} className={"taw-psg-card" + (miss.length ? "" : " ok")} aria-label={kindLabel}>
                <header>
                  <b>{kindLabel}</b>
                  {i === 0 ? <span className="taw-psg-lead">Lead · booking contact</span> : null}
                  <span className={"taw-psg-miss" + (miss.length ? "" : " ok")}>{miss.length ? `Needs: ${miss.join(", ")}` : "✓ Complete"}</span>
                </header>
                <div className="taw-psg-grid">
                  <label className="taw-psg-f"><span>Title</span>
                    <select className="taw-input" value={r.title} onChange={(e) => set(i, { title: e.target.value })}>
                      {TITLES[r.pax_type].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="taw-psg-f"><span>First name</span>
                    <input className="taw-input" value={r.first_name} placeholder="As on the ID" onChange={(e) => set(i, { first_name: e.target.value })} />
                  </label>
                  <label className="taw-psg-f"><span>Last name</span>
                    <input className="taw-input" value={r.last_name} placeholder="As on the ID" onChange={(e) => set(i, { last_name: e.target.value })} />
                  </label>
                  <label className="taw-psg-f"><span>Gender</span>
                    <select className="taw-input" value={r.gender} onChange={(e) => set(i, { gender: e.target.value as Passenger["gender"] })}>
                      <option value="">Select</option><option value="male">Male</option><option value="female">Female</option>
                    </select>
                  </label>
                  {need.dob ? (
                    <label className="taw-psg-f"><span>Date of birth</span>
                      <input className="taw-input" type="date" value={r.date_of_birth} onChange={(e) => set(i, { date_of_birth: e.target.value })} />
                    </label>
                  ) : null}
                  {showNat ? (
                    <label className="taw-psg-f"><span>Nationality</span>
                      <select className="taw-input" value={r.nationality || "IN"} onChange={(e) => set(i, { nationality: e.target.value })}>
                        {NATIONALITIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {need.passport ? (
                    <>
                      <label className="taw-psg-f"><span>Passport number</span>
                        <input className="taw-input" value={r.passport_number} placeholder="e.g. Z1234567" onChange={(e) => set(i, { passport_number: e.target.value.toUpperCase() })} />
                      </label>
                      <label className="taw-psg-f"><span>Passport expiry</span>
                        <input className="taw-input" type="date" value={r.passport_expiry} onChange={(e) => set(i, { passport_expiry: e.target.value })} />
                      </label>
                    </>
                  ) : null}
                  {need.pan ? (
                    <label className="taw-psg-f"><span>PAN · this fare asks for it</span>
                      <input className="taw-input" value={r.pan || ""} maxLength={10} placeholder="ABCDE1234F" onChange={(e) => set(i, { pan: e.target.value.toUpperCase() })} />
                    </label>
                  ) : null}
                  {i === 0 ? (
                    <>
                      <label className="taw-psg-f taw-psg-wide"><span>Email · tickets are sent here</span>
                        <input className="taw-input" type="email" value={r.email || ""} placeholder="name@example.com" onChange={(e) => set(i, { email: e.target.value })} />
                      </label>
                      <label className="taw-psg-f taw-psg-wide"><span>Mobile</span>
                        <input className="taw-input" inputMode="numeric" value={r.phone || ""} placeholder="10 digits" onChange={(e) => set(i, { phone: e.target.value })} />
                      </label>
                    </>
                  ) : null}
                </div>
                {!intl && !showNat ? (
                  <button type="button" className="taw-psg-more" onClick={() => setNatOpen((m) => ({ ...m, [i]: true }))}>
                    Indian national · not an Indian national?
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
