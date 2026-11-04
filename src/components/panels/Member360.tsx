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
import { useEffect, useState } from "react";
import { Empty, Icon } from "../ui";
import { getDestinationPhoto } from "../../services/api";
import { useWorkbench } from "../../lib/workbenchContext";
import { fmtDate } from "../../lib/advisorHelpers";
import { buildTripFields, emptyLabel } from "../../lib/tripFields";
import { tripPaxLabel } from "../../lib/itineraryFromCart";

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

function dateFlexChipClass(tag: string) {
  if (tag === "flexible") return "taw-chip--flight"; // info-tinted
  if (tag === "asap") return "taw-chip--noref"; // danger-tinted — urgent, no give
  return "taw-chip--dom"; // "fixed" and anything else — neutral bone
}

export function Member360(props: any) {
  const m = props.member;
  const enquiry = props.enquiry;
  const { itinerariesByEnquiry, generatingItinerary, pipelineStatusByEnquiry } = useWorkbench();

  // Hero photo — one Pexels stock photo for the destination, via adminbe's
  // GET /enquiries/destination-photo. Any failure / no key / no result leaves
  // heroUrl null, and the hero draws its gradient instead (never a broken img).
  const heroDestination = enquiry && enquiry.ask && enquiry.ask.destinations ? enquiry.ask.destinations[0] : null;
  const [hero, setHero] = useState<{ dest: string; url: string; credit: string | null } | null>(null);
  const heroUrl = hero && hero.dest === heroDestination ? hero.url : null;
  const heroCredit = hero && hero.dest === heroDestination ? hero.credit : null;
  useEffect(() => {
    if (!heroDestination) return;
    let cancelled = false;
    getDestinationPhoto(heroDestination)
      .then((r: any) => { if (!cancelled && r && r.url) setHero({ dest: heroDestination, url: r.url, credit: r.photographer || null }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [heroDestination]);

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
  // adminbe sets passport_number to "Not yet provided — pending advisor
  // follow-up" on purpose (Aanya never collects one), so a truthy value alone
  // doesn't mean a passport is on file.
  const passportProvided = !!m.passport_number && !/^not yet provided/i.test(String(m.passport_number));
  // members.nationality is an ISO code ("IN") on CRM members; the traveller-
  // profile endpoint doesn't send it, so this row only appears when present.
  let nationalityLabel: string | null = m.nationality ? String(m.nationality) : null;
  if (nationalityLabel && /^[A-Za-z]{2}$/.test(nationalityLabel)) {
    try {
      nationalityLabel = new (Intl as any).DisplayNames(["en"], { type: "region" }).of(nationalityLabel.toUpperCase()) || nationalityLabel;
    } catch (e) { /* keep the raw code */ }
  }
  const itineraryStarted = !!(enquiry && itinerariesByEnquiry[enquiry.id]);
  // Paid on its booking order (any screen) or locked by a payment: the trip is booked.
  const tripPaid = !!(enquiry && ((pipelineStatusByEnquiry?.[enquiry.id]?.booking?.paid || 0) > 0 || itinerariesByEnquiry[enquiry.id]?.locked));
  const itineraryGenerating = !!(enquiry && generatingItinerary[enquiry.id]);
  const enquiryClosed = !!(enquiry && enquiry.status === "closed");
  // Quick Note: the AI-written conversation summary (enquiries.message, set
  // from summarize_conversation's `summary`) — first two sentences, as-is.
  const quickNote = enquiry && enquiry.message
    ? (String(enquiry.message).match(/[^.!?]+[.!?]+(\s|$)/g) || [String(enquiry.message)]).slice(0, 2).join("").trim()
    : null;

  // Service badge ("Hotel & Flight", "Flight", "Hotel") — derived from
  // which legs this enquiry actually asked for, not a stored field.
  // An advisor-created enquiry starts with an empty `ask` shell: no badge and no
  // "AI Collected" until something was actually collected.
  const askCollected = !!(ask && (
    (ask.destinations && ask.destinations.length) || (ask.persons && ask.persons.length) || ask.dateRange || ask.from || ask.purpose || ask.groupType
  ));
  const serviceBadge = askCollected
    ? [ask.flight ? "Flight" : null, ask.hotel ? "Hotel" : null].filter(Boolean).reverse().join(" & ") || null
    : null;

  function prefValue(field: any): string | null {
    if (field == null) return null;
    if (typeof field === "string") return field;
    return field.state === "value" ? field.value : null;
  }

  // Empty trip fields fall back to what the itinerary already says (a trip
  // built from Search: destination, travellers, origin, dates).
  const itin = enquiry ? itinerariesByEnquiry[enquiry.id] : null;
  const firstFlight = itin && (itin.days || []).flatMap((d: any) => d.items || []).find((it: any) => it.type === "flight");
  const fromItinerary: Record<string, string | null> = {
    travellers: tripPaxLabel(itin),
    destination: (itin && itin.destination && itin.destination !== "New itinerary" ? itin.destination : null),
    origin: (firstFlight && firstFlight.origin) || null,
    dates: (itin && itin.dateRange) || null,
  };
  const tripFields = buildTripFields(ask).map((f: any) => (f.value || !fromItinerary[f.key] ? f : { ...f, value: fromItinerary[f.key] }));

  const heroPill: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
    background: "rgba(255,255,255,0.92)", color: "var(--ink)",
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 15, fontWeight: 600, color: "var(--ink)", textTransform: "none", letterSpacing: 0,
  };
  const field = (key: string) => tripFields.find((f) => f.key === key)!;
  const detailRows: { label: string; value: React.ReactNode }[] = [
    { label: "Email", value: m.email || "—" },
    { label: "Phone", value: m.phone || "—" },
    // Residence is deliberately absent: no `residence`/home-city field exists
    // on `member`, `ask` or enquiries.detail (DETAIL_FIELDS), so there is
    // nothing real to show. Nationality only renders when m.nationality is set.
    ...(nationalityLabel ? [{ label: "Nationality", value: nationalityLabel }] : []),
    {
      label: "Passport",
      value: passportProvided ? (
        "Received" + (passportYear ? " · " + passportYear : "")
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Not provided
          <button type="button" className="taw-btn taw-btn--sm" onClick={props.onAddPassport}>Add</button>
        </span>
      ),
    },
  ];

  // Avatar + name + badges + subtitle. Overlaid on the hero's gradient when the
  // hero exists (white text), otherwise a compact standalone row. Email and
  // phone live only in Traveller Details.
  const identity = (onDark: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: "50%", background: onDark ? "rgba(255,255,255,0.92)" : "#E7ECF2",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 13, color: onDark ? "var(--ink)" : "#4A5568", flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: onDark ? "#fff" : "var(--ink)" }}>{m.name}</span>
          {serviceBadge ? (
            <span
              style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                background: "#E6EFFA", color: "#3B6EA5",
              }}
            >
              {serviceBadge}
            </span>
          ) : null}
          {askCollected ? <span className="taw-chip taw-chip--star">AI Collected</span> : null}
          {m.tier ? <span className="taw-chip taw-chip--tier">{m.tier}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: onDark ? "rgba(255,255,255,0.85)" : "var(--muted)", marginTop: 1 }}>
          {metaParts.length ? metaParts.join(" · ") : "Primary Traveller"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="taw-m360 taw-fade-in" style={{ gap: 12 }}>
      {heroDestination ? (
        <div
          style={{
            position: "relative", minHeight: 142, borderRadius: 14, overflow: "hidden",
            background: "linear-gradient(135deg, var(--gold-ink), var(--ink))",
          }}
        >
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary Pexels host, not in next/image's allowlist
            <img
              src={heroUrl}
              alt=""
              onError={() => setHero(null)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : null}
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0) 85%)",
            }}
          />
          {/* Google Places requires showing the photo author; kept for Pexels too. */}
          {heroUrl && heroCredit ? (
            <span style={{ position: "absolute", right: 10, bottom: 2, fontSize: 9.5, color: "rgba(255,255,255,0.8)" }}>
              Photo: {heroCredit}
            </span>
          ) : null}
          <div
            style={{
              position: "relative", minHeight: 142, boxSizing: "border-box", padding: "10px 12px 16px",
              display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", minHeight: 22 }}>
              {enquiry ? (
                <>
                  <span style={heroPill}>{enquiryClosed ? "Closed" : "Active"}</span>
                  <span style={heroPill}>
                    {tripPaid ? "Paid" : itineraryGenerating ? "Generating" : itineraryStarted ? "In Progress" : "Not Started"}
                  </span>
                </>
              ) : null}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{heroDestination} Trip</div>
              {field("dates").value ? <div style={{ fontSize: 12, marginBottom: 8, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{field("dates").value}</div> : <div style={{ marginBottom: 8 }} />}
              {/* Dark rounded plate behind just the identity row, so it stays
                  readable on any photo. */}
              <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 10, padding: "6px 8px", backdropFilter: "blur(2px)" }}>
                {identity(true)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        identity(false)
      )}

      {/* Four stat chips — Trip Type / Travellers / Origin / Destination,
          from buildTripFields (src/lib/tripFields.ts, shared with column 2). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {["tripType", "travellers", "origin", "destination"].map((k) => {
          const f = field(k);
          return (
            <div
              key={k}
              style={{
                border: "1px solid var(--line)", borderRadius: 10, padding: "8px 6px",
                display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4, minWidth: 0,
              }}
            >
              <Icon name={f.icon} size={16} style={{ color: "var(--gold)" }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflowWrap: "anywhere", lineHeight: 1.25 }}>
                {f.value || emptyLabel(f)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{f.label}</div>
            </div>
          );
        })}
      </div>

      <div className="taw-m360-sec">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon name="user" size={15} style={{ color: "var(--gold)" }} />
          <span style={sectionTitle}>Traveller Details</span>
        </div>
        <ul className="taw-m360-pref-list" style={{ gap: 0 }}>
          {detailRows.map((r, i) => (
            <li
              key={r.label}
              className="taw-m360-pref"
              style={{ padding: "6px 0", borderBottom: i < detailRows.length - 1 ? "1px solid var(--line)" : "none" }}
            >
              <span className="taw-m360-pref-label">{r.label}</span>
              <span className="taw-m360-pref-val">{r.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="taw-m360-sec">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon name="sparkle" size={15} style={{ color: "var(--gold)" }} />
          <span style={sectionTitle}>Trip Preferences</span>
        </div>
        {/* Two cells per row; each cell stacks icon + label over the value, with
            the tag chip inline at the end of the value text (plain inline flow,
            not flex, so the chip wraps WITH the text instead of dropping to its
            own line). Equal min-height keeps the grid even. Special Requests is
            the lone fifth cell, so it takes the full last row and is clamped to
            two lines. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16 }}>
          {["accommodation", "budget", "flight", "interests", "special"].map((k) => {
            const f = field(k);
            const wide = k === "special";
            return (
              <div
                key={k}
                style={{
                  padding: "7px 0", minHeight: wide ? undefined : 52, boxSizing: "border-box", minWidth: 0,
                  borderBottom: wide ? "none" : "1px solid var(--line)",
                  gridColumn: wide ? "1 / -1" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--taupe)", marginBottom: 3 }}>
                  <Icon name={f.icon} size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
                  {f.label}
                </div>
                <div
                  title={wide && f.value ? f.value : undefined}
                  style={{
                    fontSize: 13.5, fontWeight: 500, color: "var(--ink)", lineHeight: 1.35, overflowWrap: "anywhere",
                    ...(wide ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}),
                  }}
                >
                  {f.value || emptyLabel(f)}
                  {f.tag ? (
                    <span className="taw-chip taw-chip--dom" style={{ display: "inline-block", marginLeft: 6, verticalAlign: "middle" }}>
                      {f.tag}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {quickNote ? (
        <div className="taw-m360-sec">
          <div style={{ background: "var(--bone)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              <Icon name="note" size={14} style={{ color: "var(--gold)" }} />
              Quick Note
            </div>
            <div
              title={quickNote}
              style={{ fontSize: 13.5, color: "var(--taupe)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {quickNote}
            </div>
          </div>
        </div>
      ) : null}

      <div className="taw-m360-sec" style={{ borderTop: "1px solid #EDE7D9", paddingTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Icon name="note" size={15} style={{ color: "#B8945F" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1F2430", textTransform: "none", letterSpacing: 0 }}>
            Documents
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
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
