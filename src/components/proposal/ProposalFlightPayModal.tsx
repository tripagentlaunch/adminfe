"use client";
/* =============================================================================
 * TripAgent — ProposalFlightPayModal.tsx
 * "Pay now" for the flights on the public proposal link (/proposal/[token]).
 *   1. travellers as on their ID -> POST /pay/flights/prepare: the server searches the same
 *      flight again, locks the same fare option, re-reads the same seat / meal / bag and
 *      records the order (price checked live; a change is shown before paying)
 *   2. POST /pay/flights/order/{id}/start: a Razorpay order for the server-priced amount
 *      (or the mock payment page while Razorpay isn't set up on a test server)
 *   3. Razorpay checkout -> POST /pay/flights/confirm (signature + captured check)
 * The amount always comes from the server; nothing here prices anything.
 * ===========================================================================*/
import { useState } from "react";
import { useRouter } from "next/navigation";
import { proposalFlightPayPrepare, inr } from "../../services/api";
import { payHeldOrder } from "../../lib/proposalPayment";
import { errText } from "../../lib/advisorHelpers";
import { Spinner } from "../ui";
import { PayTimer } from "./PayTimer";

export type FlightPayQuote = {
  payable: boolean; amount: number; currency: string; international: boolean; gateway_configured: boolean; mock: boolean;
  pax: { adults: number; children: number; infants: number };
  guest?: { firstName: string; lastName: string; email: string; mobile: string } | null;
  flights: { id: string; title: string; date: string; route: string; fare_name: string | null; extras: { label: string; segment: string }[] }[];
  /** Hotels booked in the same payment (rooms re-checked and locked when the customer presses Pay). */
  stays?: { id: string; name: string; room: string; check_in: string; check_out: string }[];
  /** "all": every flight passenger; "lead": hotels only, just the lead guest. */
  travellers?: "all" | "lead";
  /** Flights: the advisor has entered every passenger (needed before TripSure takes payment). */
  passengers_ready?: boolean;
  /** The proposal's total, and our markup + GST in it (shown on its own line; `amount` is what TripSure charges). */
  trip_total?: number;
  fee?: number;
};

type Pax = {
  pax_type: "adult" | "child" | "infant"; title: string; first_name: string; last_name: string; gender: "male" | "female" | "";
  date_of_birth: string; nationality: string; passport_number: string; passport_expiry: string;
};


const TITLES: Record<Pax["pax_type"], string[]> = { adult: ["Mr", "Mrs", "Ms", "Miss", "Dr"], child: ["Mstr", "Miss"], infant: ["Mstr", "Miss"] };
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export { MOCK_PAY_KEY } from "../../lib/proposalPayment";

export function ProposalFlightPayModal({ token, quote, onClose }: { token: string; quote: FlightPayQuote; onClose: (paid: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "working" | "changed" | "done">("form");
  const [err, setErr] = useState<string | null>(null);
  const [prep, setPrep] = useState<{ order_id: string; order_number?: string; amount: number; quoted: number; pay_by?: string | null } | null>(null);
  const [paidRef, setPaidRef] = useState<string | null>(null);
  const stays = quote.stays || [];
  const kinds: Pax["pax_type"][] = quote.travellers === "lead" ? ["adult"] : [
    ...Array(quote.pax.adults).fill("adult"), ...Array(quote.pax.children).fill("child"), ...Array(quote.pax.infants).fill("infant"),
  ];
  const [pan, setPan] = useState("");
  const panBad = pan !== "" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
  // The enquiry's traveller fills the lead passenger and the contact; everything stays editable.
  const guest = quote.guest || null;
  const [pax, setPax] = useState<Pax[]>(() => kinds.map((k, i) => ({
    pax_type: k, title: TITLES[k][0], first_name: i === 0 && guest ? guest.firstName : "", last_name: i === 0 && guest ? guest.lastName : "",
    gender: "", date_of_birth: "", nationality: "IN", passport_number: "", passport_expiry: "",
  })));
  const [contact, setContact] = useState({ email: guest?.email || "", mobile: guest?.mobile || "" });
  const setP = (i: number, k: keyof Pax, v: string) => setPax((cur) => cur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const intl = quote.international;
  const paxOk = pax.every((p) => p.first_name.trim() && p.last_name.trim() && p.gender
    && (p.pax_type === "adult" && !intl ? true : !!p.date_of_birth)
    && (!intl || (p.passport_number.trim() && p.passport_expiry)));
  const ready = paxOk && !panBad && contact.email.includes("@") && /^\d{10}$/.test(contact.mobile.replace(/\D/g, "").slice(-10));

  async function prepare() {
    setErr(null);
    setStep("working");
    try {
      const travellers = pax.map((p, i) => ({
        title: p.title, first_name: p.first_name.trim(), last_name: p.last_name.trim(), gender: p.gender, pax_type: p.pax_type,
        date_of_birth: p.date_of_birth || null, is_lead: i === 0,
        email: i === 0 ? contact.email.trim() : null, phone: i === 0 ? contact.mobile.replace(/\D/g, "").slice(-10) : null,
        nationality: p.nationality || null,
        passport_number: intl ? p.passport_number.trim().toUpperCase() : null, passport_expiry: intl ? p.passport_expiry : null,
      }));
      const r: any = await proposalFlightPayPrepare(token, { travellers, pan: stays.length && pan ? pan : null });
      setPrep(r);
      // The airline's price moved since the proposal: show it before taking any money.
      if (r.price_changed) { setStep("changed"); return; }
      await pay(r);
    } catch (e) {
      setErr(errText(e));
      setStep("form");
    }
  }

  async function pay(p: { order_id: string; amount: number; pay_by?: string | null }) {
    setErr(null);
    setStep("working");
    try {
      const out = await payHeldOrder(token, p, (url) => router.push(url));
      if (out.kind === "redirected") return;
      setPaidRef(out.orderNumber);
      setStep("done");
    } catch (e) {
      setErr(errText(e));
      setStep(prep && prep.amount !== prep.quoted ? "changed" : "form");
    }
  }

  const busy = step === "working";
  return (
    <div role="dialog" aria-modal="true" aria-label="Pay for your flights" onClick={() => !busy && onClose(step === "done")}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", color: "#1a1a1a", borderRadius: 16, padding: 24, maxWidth: 560, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        {step === "done" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <h2 style={{ margin: "8px 0" }}>Payment received</h2>
            <p style={{ color: "#555" }}>Thank you — {quote.flights.length ? "your advisor is issuing your tickets now and will send them" : "your stay is being confirmed; your advisor will send the voucher"} to {contact.email || "your email"}.{paidRef ? ` Booking ${paidRef}.` : ""}</p>
            <button type="button" onClick={() => onClose(true)} style={btn(true)}>Done</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: "0 0 6px" }}>{quote.flights.length && stays.length ? "Pay for your trip" : quote.flights.length ? "Pay for your flights" : "Pay for your stay"}</h2>
            <div style={{ display: "grid", gap: 8, margin: "0 0 14px" }}>
              {quote.flights.map((f) => (
                <div key={f.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px", fontSize: 13.5 }}>
                  <b>{f.title}</b> · {f.route} · {fmtDate(f.date)}
                  {f.fare_name && f.fare_name !== "Searched fare" ? <span style={{ color: "#777" }}> · {f.fare_name} fare</span> : null}
                  {f.extras.length ? <div style={{ color: "#666", marginTop: 3 }}>{f.extras.map((x) => x.label).join(" · ")}</div> : null}
                </div>
              ))}
              {stays.map((h) => (
                <div key={h.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px", fontSize: 13.5 }}>
                  <b>{h.name}</b>{h.room ? ` · ${h.room}` : ""}
                  <div style={{ color: "#666", marginTop: 3 }}>{fmtDate(h.check_in)} → {fmtDate(h.check_out)}</div>
                </div>
              ))}
            </div>

            {!quote.gateway_configured ? <div style={banner("warn")}>Online payment isn&apos;t set up yet. Please contact your advisor to complete this booking.</div> : null}
            {quote.mock ? <div style={banner("info")}>Test server: payment opens a mock payment page instead of Razorpay. No money moves.</div> : null}
            {err ? <div style={banner("err")}>{err}</div> : null}

            {step === "changed" && prep ? (
              <>
                <PayTimer payBy={prep.pay_by} onExpire={() => { setPrep(null); setStep("form"); setErr("Your 15 minutes ran out and the booking was released. Press Pay to start again with a fresh price."); }} />
                <div style={banner("warn")}>
                  The airline&apos;s price has changed since your proposal: was <s>{inr(prep.quoted)}</s>, now <b>{inr(prep.amount)}</b>.
                  The same flight, fare and add-ons are held for you at the new price.
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button type="button" onClick={() => onClose(false)} style={btn(false)}>Not now</button>
                  <button type="button" onClick={() => pay(prep)} style={btn(true)}>Pay {inr(prep.amount)}</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: "#555", fontSize: 13, margin: "0 0 10px" }}>
                  Names exactly as on {intl ? "the passport" : "a government ID"}. We check the live price with the airline before you pay.
                </p>
                <div style={{ display: "grid", gap: 14 }}>
                  {pax.map((p, i) => (
                    <fieldset key={i} style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px 12px", margin: 0 }}>
                      <legend style={{ fontSize: 12, color: "#777", padding: "0 4px" }}>
                        {p.pax_type === "adult" ? `Adult ${kinds.slice(0, i + 1).filter((k) => k === "adult").length}` : p.pax_type === "child" ? "Child (2–11)" : "Infant (under 2)"}
                        {i === 0 ? " · lead traveller" : ""}
                      </legend>
                      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 1fr", gap: 8 }}>
                        <select aria-label="Title" value={p.title} onChange={(e) => setP(i, "title", e.target.value)} style={inp}>
                          {TITLES[p.pax_type].map((t) => <option key={t}>{t}</option>)}
                        </select>
                        <input aria-label="First name" placeholder="First name" value={p.first_name} onChange={(e) => setP(i, "first_name", e.target.value)} style={inp} />
                        <input aria-label="Last name" placeholder="Last name" value={p.last_name} onChange={(e) => setP(i, "last_name", e.target.value)} style={inp} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <select aria-label="Gender" value={p.gender} onChange={(e) => setP(i, "gender", e.target.value)} style={inp}>
                          <option value="">Gender</option><option value="male">Male</option><option value="female">Female</option>
                        </select>
                        <label style={lbl}>
                          <span>Date of birth{p.pax_type === "adult" && !intl ? " (optional)" : ""}</span>
                          <input type="date" value={p.date_of_birth} onChange={(e) => setP(i, "date_of_birth", e.target.value)} style={inp} />
                        </label>
                      </div>
                      {intl ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                          <input aria-label="Passport number" placeholder="Passport number" value={p.passport_number}
                            onChange={(e) => setP(i, "passport_number", e.target.value.toUpperCase())} style={inp} />
                          <label style={lbl}><span>Passport expiry</span>
                            <input type="date" value={p.passport_expiry} onChange={(e) => setP(i, "passport_expiry", e.target.value)} style={inp} />
                          </label>
                        </div>
                      ) : null}
                    </fieldset>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input aria-label="Email" placeholder="Email (tickets go here)" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} style={inp} />
                    <input aria-label="Mobile" placeholder="Mobile (10 digits)" inputMode="numeric" value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} style={inp} />
                  </div>
                  {stays.length ? (
                    <input aria-label="PAN" placeholder="PAN (if the hotel asks for it)" maxLength={10} value={pan}
                      onChange={(e) => setPan(e.target.value.toUpperCase())} style={{ ...inp, borderColor: panBad ? "#c0392b" : "#ddd" }} />
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button type="button" onClick={() => onClose(false)} disabled={busy} style={btn(false)}>Cancel</button>
                  <button type="button" onClick={prepare} disabled={!ready || !quote.gateway_configured || busy} style={{ ...btn(true), opacity: !ready || busy ? 0.6 : 1 }}>
                    {busy ? <><Spinner /> Checking the live price…</> : `Pay ${inr(quote.amount)}`}
                  </button>
                </div>
                <p style={{ color: "#999", fontSize: 11.5, marginTop: 12, textAlign: "center" }}>
                  Secured by Razorpay. Price includes taxes and fees; it is re-checked with the airline{stays.length ? " and the hotel" : ""} when you press Pay.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff", color: "#1a1a1a" };
const lbl: React.CSSProperties = { display: "grid", gap: 3, fontSize: 11.5, color: "#777" };
function btn(primary: boolean): React.CSSProperties {
  return { flex: 1, padding: "12px 16px", borderRadius: 10, border: primary ? "none" : "1px solid #ddd", fontSize: 14, fontWeight: 600, cursor: "pointer",
    background: primary ? "#1a1a1a" : "#fff", color: primary ? "#fff" : "#1a1a1a", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 };
}
function banner(kind: "warn" | "err" | "info"): React.CSSProperties {
  return { padding: "10px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13,
    background: kind === "err" ? "#fdecea" : kind === "info" ? "#eaf2fb" : "#fff6e5", color: kind === "err" ? "#a3261a" : kind === "info" ? "#1d4f80" : "#8a6400" };
}
