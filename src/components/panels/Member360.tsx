"use client";
/* =============================================================================
 * TripAgent — src/components/panels/Member360.tsx
 * Originally ported from web/js/advisor.js's Member360 (a generic member
 * stat/preferences dump + an "Invite Customer" re-invite modal).
 *
 * 2026-09-02 — rebuilt against a specific reference design: this is now the
 * ENQUIRY's request detail (who's asking, what they asked for, what's
 * required, what's on file), not a generic member profile. Needs both the
 * member AND the selected enquiry — `enquiry` is new, passed down from
 * WorkbenchTab's already-computed `selectedEnquiry` via
 * QueueProfileAccordion. The old stat-grid/preferences/visas-held/past-
 * trips sections and the inline Invite-Customer modal are gone — a
 * standalone "Invite Customer" flow already exists at the shell level
 * (src/components/InviteCustomerForm.tsx), so this was a duplicate, not a
 * loss.
 *
 * 2026-09-02, same day: the header's "Reply" button (there per the
 * reference, but never wired to anything — no messaging/thread system
 * exists in this port) was replaced with the trip-purpose chip per direct
 * feedback; that chip used to live duplicated in the Request section
 * header too, now only shows once, up in the header row.
 *
 * Most of this enquiry-level detail (message, ask.*, dateFlex, budgetCap,
 * visa_status, dob/company/customer_code on the member) only exists on the
 * 3 MOCK_ENQUIRIES/MOCK_MEMBERS_BY_ID entries (src/lib/mockEnquiries.ts) —
 * a real Supabase enquiry/member won't have these fields yet. Every
 * section below is conditional on its own data being present so this
 * degrades gracefully (shorter card, not broken/blank fields) for real
 * rows instead of assuming the mock shape.
 * ===========================================================================*/
import { Empty, Icon } from "../ui";
import { fmtDate, capLabel } from "../../lib/advisorHelpers";

// 2026-09-02: was "Mr"/"Ms" — changed to a bare gender letter per direct
// feedback. Keeping the lookup (rather than printing m.gender directly)
// so an unrecognized value degrades to nothing instead of printing raw
// data.
const TITLE_BY_GENDER: Record<string, string> = { M: "M", F: "F" };

// A handful of demo-data destinations that don't already carry an IATA
// code the way `ask.from` does ("Delhi (DEL)") — just enough to render
// the reference's "BOM → SIN" route chip for the 3 mock enquiries. Falls
// back to the plain city name for anything not in this list rather than
// guessing a code.
const DEST_IATA: Record<string, string> = { Singapore: "SIN", Goa: "GOI", Kathmandu: "KTM" };

function originCode(from: string) {
  const m = /\(([^)]+)\)/.exec(from || "");
  return m ? m[1] : from || "";
}

function destCode(dest: string) {
  return DEST_IATA[dest] || dest;
}

function paxLabel(persons: any[]) {
  if (!persons || !persons.length) return null;
  const adults = persons.filter((p: any) => p.age == null || p.age >= 12).length;
  const children = persons.length - adults;
  let label = adults + " adult" + (adults === 1 ? "" : "s");
  if (children) label += ", " + children + " child" + (children === 1 ? "" : "ren");
  return label;
}

function dateFlexChipClass(tag: string) {
  if (tag === "flexible") return "taw-chip--flight"; // info-tinted
  if (tag === "asap") return "taw-chip--noref"; // danger-tinted — urgent, no give
  return "taw-chip--dom"; // "fixed" and anything else — neutral bone
}

export function Member360(props: any) {
  const m = props.member;
  const enquiry = props.enquiry;

  if (!m) {
    return <Empty icon={<Icon name="user" size={28} />}>Select an enquiry to load the traveller's profile.</Empty>;
  }

  const initials = (m.name || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const title = m.gender ? TITLE_BY_GENDER[m.gender] || "" : "";
  let dobLabel = "";
  if (m.dob) {
    try {
      dobLabel = new Date(m.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) {
      dobLabel = "";
    }
  }
  const metaParts = [title, dobLabel, m.company].filter(Boolean);

  const ask = (enquiry && enquiry.ask) || null;
  const requestDate = enquiry && enquiry.created_at ? fmtDate(enquiry.created_at).toUpperCase() : "";

  const constraints: string[] = [];
  if (ask && ask.flight) {
    const f = ask.flight;
    const bits = [f.class ? f.class + " class" : null, f.seat, f.meal ? f.meal + " meal" : null].filter(Boolean);
    if (bits.length) constraints.push(bits.join(" · "));
    if (f.airline) {
      const airlineBits = [f.airline, f.stops, f.frequentFlyer].filter(Boolean);
      constraints.push(airlineBits.join(" · "));
    }
  }
  if (ask && ask.hotel) {
    const h = ask.hotel;
    const bits = [h.stars ? h.stars + "-star minimum" : null, h.location ? h.location + " radius" : null].filter(Boolean);
    if (bits.length) constraints.push(bits.join(" · "));
    if (h.roomConfig) constraints.push(h.roomConfig);
  }

  const passportYear = m.passport_expiry ? new Date(m.passport_expiry).getFullYear() : null;

  return (
    <div className="taw-m360 taw-fade-in">
      <div className="taw-m360-hero">
        <div className="taw-m360-ava">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="taw-m360-name">{m.name}</div>
          <div className="taw-m360-meta">{metaParts.length ? metaParts.join(" · ") : "—"}</div>
        </div>
        {/* 2026-09-02: this used to show the trip-purpose chip
            ("Business") — that moved down to its own tag row below the
            description, alongside a new group-type tag ("Solo"). This
            slot now shows the member's tier instead (was previously only
            shown as plain eyebrow text on the OUTER accordion header —
            see QueueProfileAccordion.tsx — now a proper chip, and only
            shown once). */}
        {m.tier ? <span className="taw-chip taw-chip--tier">{m.tier}</span> : null}
      </div>

      {enquiry ? (
        <>
          <div className="taw-m360-sec">
            <div className="taw-m360-sec-h">
              <span className="taw-sec-label" style={{ margin: 0 }}>
                Request{requestDate ? " · " + requestDate : ""}
              </span>
            </div>
            {enquiry.message ? <p className="taw-m360-desc">{enquiry.message}</p> : null}
            {ask && (ask.purpose || ask.groupType) ? (
              <div className="taw-tags taw-tags-scroll" style={{ marginTop: 10 }}>
                {ask.purpose ? <span className="taw-chip taw-chip--dom">{ask.purpose}</span> : null}
                {ask.groupType ? <span className="taw-chip taw-chip--dom">{ask.groupType}</span> : null}
              </div>
            ) : null}
          </div>

          {ask && ask.dateRange ? (
            <div className="taw-m360-dates">
              <div>
                <div className="taw-m360-dates-range">{ask.dateRange}</div>
                {ask.dateFlex ? (
                  <div className="taw-m360-dates-note">
                    {ask.dateFlex.tag === "flexible" ? "Flexible" : ask.dateFlex.tag === "asap" ? "Fixed · urgent" : "Fixed"}
                    {ask.dateFlex.note ? " · " + ask.dateFlex.note : ""}
                  </div>
                ) : null}
              </div>
              {ask.dateFlex ? (
                <span className={"taw-chip " + dateFlexChipClass(ask.dateFlex.tag)}>{ask.dateFlex.tag}</span>
              ) : null}
            </div>
          ) : null}

          {ask && (ask.from || ask.destinations || ask.persons || enquiry.budgetCap || ask.budgetCap) ? (
            <div className="taw-tags">
              {ask.from && ask.destinations && ask.destinations[0] ? (
                <span className="taw-tag">
                  {originCode(ask.from)} → {destCode(ask.destinations[0])}
                </span>
              ) : null}
              {paxLabel(ask.persons) ? <span className="taw-tag">{paxLabel(ask.persons)}</span> : null}
              {ask.budgetCap ? <span className="taw-tag">Cap {capLabel(ask.budgetCap)}</span> : null}
            </div>
          ) : null}

          {constraints.length ? (
            <div className="taw-m360-sec">
              <div className="taw-sec-label">Hard constraints</div>
              <ul className="taw-m360-constraints">
                {constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="taw-m360-sec">
        <div className="taw-sec-label">Documents</div>
        <div className="taw-m360-docs">
          <div className="taw-m360-doc taw-m360-doc--ok">
            <div className="taw-m360-doc-label">Passport</div>
            <div className="taw-m360-doc-val">
              {m.passport_number || "—"}
              {passportYear ? " · Valid to " + passportYear : ""}
            </div>
          </div>
          {m.visa_status ? (
            <div className="taw-m360-doc taw-m360-doc--warn">
              <div className="taw-m360-doc-label">Visa</div>
              <div className="taw-m360-doc-val">
                {m.visa_status.country} {m.visa_status.status}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
