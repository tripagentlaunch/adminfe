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

  // Preference rows (2026-09-10, Dubai/v4 reproduction fix) — each of
  // these now comes from the backend as a real three-state object
  // ({state: "not_asked" | "no_preference" | "value", value}), not a
  // plain string that either exists or silently doesn't. Rendered as one
  // row per field, always, so "we never asked" and "they said no
  // preference" read as two visibly different things instead of both
  // just... not showing up. `format` turns a real "value" state into the
  // exact same display text the old flat constraints list used to
  // produce (e.g. "5-star minimum", "Aisle") — cosmetic parity only, the
  // NEW behavior is the row always existing and NOT_ASKED/NO_PREFERENCE
  // rendering distinctly instead of vanishing.
  type PrefState = { state: "not_asked" | "no_preference" | "value"; value: string | null } | undefined;
  // prefRow now also accepts a plain string (2026-09-10, bug fix) —
  // accommodation_style (unlike cabin/seat/meal/airline/stars/location)
  // isn't run through _field_state() on the backend (it's one of
  // summarize_conversation.py's own narrative fields, opportunistically
  // extracted from free text with no dedicated yes/no question a member
  // could answer "no preference" to — see enquiry_service.py's own note),
  // so it arrives here as a bare string or undefined, never a {state,
  // value} object. Normalized to the same shape inline rather than
  // fabricating a "not_asked"/"no_preference" distinction the data doesn't
  // actually support — a plain string always renders as "value".
  function prefRow(label: string, field: PrefState | string | null | undefined, format?: (v: string) => string) {
    const normalized: PrefState | null = typeof field === "string" ? { state: "value", value: field } : field ?? null;
    if (!normalized) return null;
    return { label, state: normalized.state, text: normalized.state === "value" ? format ? format(normalized.value || "") : normalized.value || "" : null };
  }
  const prefRows = ask
    ? [
        prefRow("Cabin class", ask.flight && ask.flight.class),
        prefRow("Flight preference", ask.flight && ask.flight.prefs),
        prefRow("Seat", ask.flight && ask.flight.seat),
        prefRow("Meal", ask.flight && ask.flight.meal),
        prefRow("Airline", ask.flight && ask.flight.airline),
        prefRow("Hotel star rating", ask.hotel && ask.hotel.stars, (v) => v + "-star minimum"),
        prefRow("Hotel location", ask.hotel && ask.hotel.location),
        prefRow("Accommodation style", ask.hotel && ask.hotel.style),
      ].filter((r): r is { label: string; state: "not_asked" | "no_preference" | "value"; text: string | null } => r !== null)
    : [];

  // noteRows (2026-09-10, bug fix) — must_haves/deal_breakers/
  // fixed_commitments were captured in enquiries.detail all along but
  // never reached this panel at all (confirmed during a systematic
  // DETAIL_FIELDS-vs-`ask` audit). Narrative/paragraph-shaped, not the
  // short label:value shape prefRows renders — a small labeled-notes
  // list fits better than forcing them into that list.
  const noteRows = ask
    ? [
        ask.mustHaves ? { label: "Must-haves", text: ask.mustHaves } : null,
        ask.dealBreakers ? { label: "Deal-breakers", text: ask.dealBreakers } : null,
        ask.fixedCommitments ? { label: "Fixed commitments", text: ask.fixedCommitments } : null,
      ].filter((r): r is { label: string; text: string } => r !== null)
    : [];

  const passportYear = m.passport_expiry ? new Date(m.passport_expiry).getFullYear() : null;

  // Service badge ("Hotel & Flight", "Flight", "Hotel") — derived from
  // which legs this enquiry actually asked for, not a stored field.
  const serviceBadge = ask
    ? [ask.flight ? "Flight" : null, ask.hotel ? "Hotel" : null].filter(Boolean).reverse().join(" & ") || null
    : null;

  function prefValue(field: any): string | null {
    if (field == null) return null;
    if (typeof field === "string") return field;
    return field.state === "value" ? field.value : null;
  }

  const mockEmail = "aanya.sharma@email.com";
  const mockPhone = "+91 98765 43210";

  const originLabel = ask && ask.from ? ask.from : null;
  const budgetLabel = ask
    ? ask.budgetPerPerson
      ? capLabel(ask.budgetPerPerson) + "/person"
      : ask.budgetCap
      ? capLabel(ask.budgetCap)
      : null
    : null;
  const travelersLabel = ask ? paxLabel(ask.persons) : null;
  const travelTypeLabel = ask && ask.groupType
    ? ask.groupType.charAt(0).toUpperCase() + ask.groupType.slice(1) + (/trip$/i.test(ask.groupType) ? "" : " Trip")
    : null;

  return (
    <div className="taw-m360 taw-fade-in">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: "50%", background: "#E7ECF2",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: 17, color: "#4A5568", flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#1F2430" }}>{m.name}</span>
            {serviceBadge ? (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
                  background: "#E6EFFA", color: "#3B6EA5",
                }}
              >
                {serviceBadge}
              </span>
            ) : null}
            {m.tier ? <span className="taw-chip taw-chip--tier">{m.tier}</span> : null}
          </div>
          <div style={{ fontSize: 13, color: "#9098A8", marginTop: 1 }}>
            {metaParts.length ? metaParts.join(" · ") : "Primary Traveller"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "#4A5568" }}>
              <Icon name="mail" size={14} style={{ color: "#9098A8" }} />
              {m.email || mockEmail}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "#4A5568" }}>
              <Icon name="phone" size={14} style={{ color: "#9098A8" }} />
              {m.phone || mockPhone}
            </div>
          </div>
        </div>
      </div>

      {originLabel || budgetLabel || travelersLabel || travelTypeLabel ? (
        <div
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 16px",
            padding: "16px 0", borderTop: "1px solid #EDE7D9", borderBottom: "1px solid #EDE7D9",
            marginBottom: 20,
          }}
        >
          {originLabel ? (
            <div style={{ display: "flex", gap: 9 }}>
              <Icon name="compass" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 3 }}>Origin</div>
                <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{originLabel}</div>
              </div>
            </div>
          ) : null}
          {budgetLabel ? (
            <div style={{ display: "flex", gap: 9 }}>
              <Icon name="tag" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 3 }}>Budget</div>
                <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{budgetLabel}</div>
              </div>
            </div>
          ) : null}
          {travelersLabel ? (
            <div style={{ display: "flex", gap: 9 }}>
              <Icon name="user" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 3 }}>Travelers</div>
                <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{travelersLabel}</div>
              </div>
            </div>
          ) : null}
          {travelTypeLabel ? (
            <div style={{ display: "flex", gap: 9 }}>
              <Icon name="swap" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 3 }}>Travel Type</div>
                <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{travelTypeLabel}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Trip Preferences — destination / dates / accommodation / interests
          summary, matching the reference design's dedicated section
          (distinct from the granular Flight & hotel preferences list
          further down, which stays as-is). */}
      {(ask && ask.destinations && ask.destinations[0]) || (ask && ask.dateRange) || (ask && ask.hotel) || (ask && ask.purpose) ? (
        <div className="taw-m360-sec">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Icon name="sparkle" size={15} style={{ color: "#B8945F" }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1F2430", textTransform: "none", letterSpacing: 0 }}>
              Trip Preferences
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ask.destinations && ask.destinations[0] ? (
              <div style={{ display: "flex", gap: 9 }}>
                <Icon name="compass" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 2 }}>Destination</div>
                  <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{ask.destinations[0]}</div>
                </div>
              </div>
            ) : null}
            {ask.dateRange ? (
              <div style={{ display: "flex", gap: 9 }}>
                <Icon name="calendar" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 2 }}>Travel Dates</div>
                  <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>
                    {ask.dateRange}
                    {ask.tripLength ? " (" + ask.tripLength + ")" : ""}
                  </div>
                </div>
              </div>
            ) : null}
            {ask.hotel && (ask.hotel.stars || ask.hotel.style) ? (
              <div style={{ display: "flex", gap: 9 }}>
                <Icon name="hotel" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 2 }}>Accommodation</div>
                  <div style={{ fontSize: 14, color: "#231C13", fontWeight: 500 }}>
                    {[
                      prefValue(ask.hotel.stars) ? prefValue(ask.hotel.stars) + "-star minimum" : null,
                      prefValue(ask.hotel.style),
                    ].filter(Boolean).join(" / ") || "—"}
                  </div>
                </div>
              </div>
            ) : null}
            {ask.purpose ? (
              <div style={{ display: "flex", gap: 9 }}>
                <Icon name="sparkle" size={15} style={{ color: "#9098A8", marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 2 }}>Interests</div>
                  <div style={{ fontSize: 14, color: "#1F2430", fontWeight: 500 }}>{ask.purpose}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}


      <div className="taw-m360-sec" style={{ borderTop: "1px solid #EDE7D9", paddingTop: 18, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Icon name="note" size={15} style={{ color: "#B8945F" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1F2430", textTransform: "none", letterSpacing: 0 }}>
            Documents
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0", borderBottom: "1px solid #F2EDE1",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="note" size={15} style={{ color: "#8A8070" }} />
              <span style={{ fontSize: 14, color: "#231C13" }}>Passport</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                  background: m.passport_number ? "#E3EFE6" : "#F2EDE1",
                  color: m.passport_number ? "#3E7D52" : "#8A8070",
                }}
              >
                {m.passport_number ? "Received" : "Not yet provided"}
                {passportYear ? " · " + passportYear : ""}
              </span>
              <Icon name="chevron" size={13} style={{ color: "#C9C1AE", transform: "rotate(-90deg)" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="visa" size={15} style={{ color: "#8A8070" }} />
              <span style={{ fontSize: 14, color: "#231C13" }}>Visa</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
                  background: m.visa_status ? "#F7EBD9" : "#F2EDE1",
                  color: m.visa_status ? "#8A6D3B" : "#8A8070",
                }}
              >
                {m.visa_status ? m.visa_status.country + " " + m.visa_status.status : "Not required"}
              </span>
              <Icon name="chevron" size={13} style={{ color: "#C9C1AE", transform: "rotate(-90deg)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
