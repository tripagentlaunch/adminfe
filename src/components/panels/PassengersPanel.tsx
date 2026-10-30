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
import { NATIONALITIES } from "../orders/TravellersForm";

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

  // What a passenger still needs, in words ("gender, date of birth").
  const missing = (r: Passenger, i: number) => [
    !r.first_name.trim() || !r.last_name.trim() ? "name" : "",
    !r.gender ? "gender" : "",
    (r.pax_type !== "adult" || intl) && !r.date_of_birth ? "date of birth" : "",
    intl && !r.passport_number.trim() ? "passport number" : "",
    intl && !r.passport_expiry ? "passport expiry" : "",
    i === 0 && !(r.email || "").includes("@") ? "email" : "",
    i === 0 && !/^\d{10}$/.test(String(r.phone || "").replace(/\D/g, "").slice(-10)) ? "mobile" : "",
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
            Enter each passenger exactly as on {intl ? "their passport" : "a government ID"}. TripSure needs all of them before it takes the flight
            payment, so the customer&apos;s <b>Pay now</b> opens only once every card here is complete.
          </p>
          {rows.map((r, i) => {
            const miss = missing(r, i);
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
                  <label className="taw-psg-f"><span>Date of birth{r.pax_type === "adult" && !intl ? <em> · optional</em> : null}</span>
                    <input className="taw-input" type="date" value={r.date_of_birth} onChange={(e) => set(i, { date_of_birth: e.target.value })} />
                  </label>
                  {intl ? (
                    <>
                      <label className="taw-psg-f"><span>Nationality</span>
                        <select className="taw-input" value={r.nationality || "IN"} onChange={(e) => set(i, { nationality: e.target.value })}>
                          {NATIONALITIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                        </select>
                      </label>
                      <label className="taw-psg-f"><span>Passport number</span>
                        <input className="taw-input" value={r.passport_number} placeholder="e.g. Z1234567" onChange={(e) => set(i, { passport_number: e.target.value.toUpperCase() })} />
                      </label>
                      <label className="taw-psg-f"><span>Passport expiry</span>
                        <input className="taw-input" type="date" value={r.passport_expiry} onChange={(e) => set(i, { passport_expiry: e.target.value })} />
                      </label>
                    </>
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
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
