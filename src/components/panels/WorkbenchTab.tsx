"use client";
/* =============================================================================
 * TripAgent — src/components/panels/WorkbenchTab.tsx
 * The /workbench route's composite — ported from the tab === "workbench"
 * render block inside `View` (web/js/advisor.js line ~6726-6767). Originally
 * Enquiry Inbox + Member 360 (row 1), Search Desks + Cart (row 2), Quote
 * Builder (row 3).
 *
 * Renamed/restructured 2026-08-31 per the Queue/Itinerary Builder/Traveller
 * Profile flow discussion — v2, correcting the first pass (see
 * DESIGN-CHANGES.md for both):
 *   - "Enquiry Inbox" → "Queue", "Member 360" → "Traveller Profile".
 *   - No separate "AI Draft" card — "Itinerary Builder" (center column)
 *     IS that job: the detailed, editable view where the advisor checks
 *     the AI-collected draft closely, one thing at a time (just flights,
 *     just Day 1, etc.), not an overview.
 *   - THREE columns, proportional widths (2fr/5fr/2fr — Itinerary Builder
 *     "considerable but not too much," ~5/9 of the row): (Queue/Traveller
 *     Profile accordion) | Itinerary Builder | Search Desks.
 *
 * 2026-09-01 restructure, done in two passes:
 *   1. Queue and Traveller Profile no longer get their own columns — they
 *      now SHARE the left column via QueueProfileAccordion ("Mode H" from
 *      the interaction-lab comparison, src/app/lab/queue-profile/ —
 *      gitignored/local-only): a manual accordion (either section opens on
 *      click, any time) plus auto-collapse-on-select (picking an enquiry
 *      also collapses Queue into Profile, no extra click for the common
 *      path).
 *   2. The right column is now Search Desks (SearchDesksPanel) instead of
 *      Summary — Search moved inline onto this screen ("accessible at all
 *      times with fewer clicks"), which is also why the standalone
 *      Enquiries → Search tab/route was deleted. Summary itself is GONE
 *      from this screen entirely, not just relocated.
 *   - Itinerary Builder shows what the AI suggested — it is NOT the
 *     search UI (2026-08-31 correction). FlightDesk/HotelDesk/VisaDesk
 *     render in the right column now (SearchDesksPanel), not here.
 *   - Quote Builder REMOVED from this screen for now — "will be in the
 *     next part" per the designer, not deleted from the codebase, just not
 *     rendered here.
 *
 * 2026-09-03 — Search → Itinerary, direct, no cart (explicit scope call:
 * "Cart is not necessary at all for this flow"). The `cart` state +
 * `ta:add-to-cart` listener this file used to hold (a staging area
 * nothing ever read) is GONE — SearchDesksPanel's `onAdd` now calls
 * WorkbenchContext's `addSearchItemToItinerary` directly, writing into
 * the selected enquiry's itinerary (see itineraryFromCart.ts). The
 * `buildMode` local-state chooser is gone too, replaced by a simpler
 * rule: show the AI/scratch chooser only while this enquiry has NO
 * itinerary data yet; the moment it has any — via the chooser OR via a
 * Search "Add" arriving first — render the real ItineraryView. That's
 * also why "Start from scratch" no longer shows its own placeholder:
 * a blank itinerary is now a real state (empty day list), not a stand-in.
 *
 * `member`/`selEnqId` — and the pickEnquiry/pickMember setters — are NOT
 * local here: View held them at the top level because CommsPanel (the
 * /comms route) reads the SAME `member` (web/js/advisor.js line ~6818), so
 * they're lifted into WorkbenchShell (App.jsx) alongside advisors/members/
 * enquiries/membersById, and passed down as props instead.
 * ===========================================================================*/
import { useState } from "react";
import { Card, Empty, Icon, Spinner } from "../ui";
import { QueueProfileAccordion } from "./QueueProfileAccordion";
import { SearchDesksPanel } from "./SearchDesksPanel";
import { ItineraryView } from "./ItineraryView";
import { useWorkbench } from "../../lib/workbenchContext";

// ConversationSummaryPanel + ChatWithCustomerPanel (2026-10-05, direct
// request) — a "Conversation Summary" step shown in columns 2+3 BEFORE
// the real Itinerary Builder/Search, for an enquiry that hasn't had its
// itinerary started yet. Its own "Generate Itinerary" button just
// dismisses this step (per enquiry id) — the actual AI/scratch itinerary
// generation is UNCHANGED, still the existing chooser buttons inside
// Itinerary Builder below.
function prefValue(field: any): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field;
  return field.state === "value" ? field.value : null;
}

function ConversationSummaryPanel({ enquiry, member, onGenerate }: any) {
  const ask = enquiry && enquiry.ask;
  const stars = ask && ask.hotel ? prefValue(ask.hotel.stars) : null;
  const style = ask && ask.hotel ? prefValue(ask.hotel.style) : null;
  const requirements = ask
    ? [
        ask.destinations && ask.destinations[0] ? "Destination: " + ask.destinations[0] : null,
        ask.dateRange ? "Dates: " + ask.dateRange + (ask.tripLength ? " (" + ask.tripLength + ")" : "") : null,
        ask.budgetPerPerson ? "Budget: ~" + ask.budgetPerPerson + " per person" : ask.budgetCap ? "Budget: ~" + ask.budgetCap : null,
        ask.groupType || ask.purpose ? "Trip Type: " + [ask.groupType, ask.purpose].filter(Boolean).join(" / ") : null,
        stars || style ? "Preferences: " + [stars ? stars + "-star" : null, style].filter(Boolean).join(", ") : null,
      ].filter((r): r is string => !!r)
    : [];

  return (
    <Card title="Conversation Summary" icon={<Icon name="chat" size={20} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {enquiry && enquiry.message ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#4A5568" }}>{enquiry.message}</p>
        ) : null}

        {requirements.length ? (
          <div
            style={{
              background: "#F7F4EC", border: "1px solid #EDE7D9", borderRadius: 10, padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, fontSize: 14, fontWeight: 600, color: "#1F2430" }}>
              <Icon name="sparkle" size={14} style={{ color: "#B8945F" }} />
              Key Requirements
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {requirements.map((r: string) => (
                <li key={r} style={{ fontSize: 13.5, color: "#4A5568", marginBottom: 6 }}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {member ? (
          <div style={{ background: "#F7F4EC", border: "1px solid #EDE7D9", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, fontSize: 14, fontWeight: 600, color: "#1F2430" }}>
              <Icon name="user" size={14} style={{ color: "#4A5568" }} />
              Traveller Profile for Itinerary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Traveller Name</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{member.name || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{member.email || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{member.phone || "—"}</div>
              </div>
              {ask && ask.from ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Origin</div>
                  <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{ask.from}</div>
                </div>
              ) : null}
              {ask && ask.destinations && ask.destinations[0] ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Destination</div>
                  <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{ask.destinations[0]}</div>
                </div>
              ) : null}
              {ask && ask.dateRange ? (
                <div>
                  <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Travel Dates</div>
                  <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{ask.dateRange}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div style={{ background: "#F7F4EC", border: "1px solid #EDE7D9", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2430", marginBottom: 10 }}>Next Step</div>
          <button className="taw-btn taw-btn--primary taw-btn--block" onClick={onGenerate}>
            <Icon name="sparkle" size={16} />
            Generate Itinerary
          </button>
        </div>
      </div>
    </Card>
  );
}

function ChatWithCustomerPanel({ member, enquiry }: any) {
  const digits = member && member.phone ? String(member.phone).replace(/[^0-9]/g, "") : "";
  const waLink = digits ? "https://wa.me/" + digits : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Chat with Customer" icon={<Icon name="chat" size={20} />}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 10px" }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: "50%", background: "#E3F3E8",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
            }}
          >
            <Icon name="chat" size={24} style={{ color: "#3E7D52" }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2430", marginBottom: 6 }}>
            View full conversation with the customer in WhatsApp
          </div>
          <div style={{ fontSize: 13, color: "#8A8070", marginBottom: 16 }}>
            See the complete chat history between the customer and TripAgent&apos;s AI assistant.
          </div>
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="taw-btn taw-btn--block"
              style={{ textDecoration: "none", textAlign: "center" }}
            >
              Open WhatsApp Chat
            </a>
          ) : (
            <div style={{ fontSize: 13, color: "#9098A8" }}>No phone number on file</div>
          )}
        </div>
      </Card>

      <Card title="Recent Messages (Summary)" icon={<Icon name="chat" size={20} />}>
        {enquiry && enquiry.message ? (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: "50%", background: "#E7ECF2",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <Icon name="user" size={15} style={{ color: "#4A5568" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2430", marginBottom: 2 }}>Customer</div>
                <div style={{ fontSize: 13.5, color: "#4A5568", lineHeight: 1.5 }}>{enquiry.message}</div>
              </div>
            </div>
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: "#B8945F", fontWeight: 600, textDecoration: "none" }}
              >
                View full chat in WhatsApp →
              </a>
            ) : null}
          </>
        ) : (
          <Empty icon="chat">No message history yet.</Empty>
        )}
      </Card>
    </div>
  );
}

export function WorkbenchTab(props: any) {
  // creating/onCreateOrder: unused now that Quote Builder isn't rendered on
  // this screen — kept in the destructure since the parent still passes
  // them and they'll be needed again once it returns.
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, onCreateOrder, member, selEnqId, onSelectEnquiry, onPickMember } = props;
  const { itinerariesByEnquiry, generatingItinerary, initItinerary, addSearchItemToItinerary, travellerProfile, travellerProfileLoading } = useWorkbench();

  const selectedEnquiry = enquiries.find((e: any) => e.id === selEnqId);
  // selectedEnquiryWithAsk (2026-09-10, bug fix) — `selectedEnquiry` above
  // is the RAW enquiries-table row (WorkbenchDataProvider's plain
  // fetchEnquiries() read); a real Supabase row has no `ask` field at all
  // (confirmed repeatedly this session) — only the 3 MOCK_ENQUIRIES
  // entries carry one hardcoded in mockEnquiries.ts. So every "seed
  // Search/scratch-itinerary defaults from ask.*" path fed by
  // `selectedEnquiry` (FlightDesk/HotelDesk/VisaDesk's origin/destination/
  // date defaults, addSearchItemToItinerary/initItinerary's date-bound
  // seeding) has silently only ever worked for the 3 mock enquiries,
  // never a real one — confirmed live while wiring the Search panel's
  // Departure date to a real enquiry's real dates (this same investigation
  // pass). `travellerProfile.enquiry.ask` — GET /enquiries/{id}/
  // traveller-profile's own real, backend-shaped output — is the correct
  // source; merged in here (once loaded) rather than fixed at each
  // individual consumer, so every one of them benefits from a single fix.
  const askReady = !!(travellerProfile && travellerProfile.enquiry && travellerProfile.enquiry.id === selEnqId);
  const selectedEnquiryWithAsk = askReady ? { ...selectedEnquiry, ask: travellerProfile.enquiry.ask } : selectedEnquiry;
  const itineraryData = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
  // generating (2026-09-06) — "Generate AI Itinerary" now waits on a real
  // backend call (POST /enquiries/{id}/generate-itinerary — real Claude
  // latency, not instant mock cloning), so the chooser below needs its
  // own in-flight state to show instead of nothing.
  const generating = selEnqId ? !!generatingItinerary[selEnqId] : false;

  const [summaryDismissedFor, setSummaryDismissedFor] = useState<string | null>(null);
  const showSummary = !!selectedEnquiry && !itineraryData && !generating && summaryDismissedFor !== selEnqId;

  return (
    <div className="taw-grid taw-cols-3">
      <QueueProfileAccordion
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        travellerProfile={travellerProfile}
        travellerProfileLoading={travellerProfileLoading}
        selEnqId={selEnqId}
        onSelectEnquiry={onSelectEnquiry}
        onPickMember={onPickMember}
      />

      {showSummary ? (
        <ConversationSummaryPanel
          enquiry={selectedEnquiryWithAsk}
          member={member || (travellerProfile && travellerProfile.member)}
          onGenerate={() => setSummaryDismissedFor(selEnqId)}
        />
      ) : (
      <Card
        className="taw-itin-card"
        title="Itinerary Builder"
        icon={<Icon name="sliders" size={20} />}
        sub={member ? "for " + member.name : "no member selected"}
      >
        {!selectedEnquiry ? (
          <Empty
            icon="sparkle"
            title="Not yet built"
            message="Select an enquiry from the Queue to start an itinerary — generated by AI from what was asked, or from scratch — for you to build out and check before confirming."
          />
        ) : itineraryData ? (
          // Real content (2026-09-03) — exists once EITHER the chooser
          // below was used OR something was added from Search first;
          // either path lands here, on the same real (editable, not a
          // static mock) itinerary. No "Back" control — once an
          // itinerary exists, it IS the working view; switching
          // enquiries in the Queue is what shows a different one.
          <ItineraryView enquiryId={selEnqId} member={member} />
        ) : generating ? (
          // Real loading state (2026-09-06) — "Generate AI Itinerary" now
          // waits on a real Claude call (POST /enquiries/{id}/generate-
          // itinerary), not instant mock cloning, so there's real time to
          // cover here instead of nothing.
          <div className="taw-itin-choose">
            <Spinner />
            <div className="title">Drafting your itinerary…</div>
            {/* "a few seconds" (2026-09-06) was wrong and misleading once
                real per-city TripSure flight/hotel search landed here
                (2026-09-11 investigation: a real multi-city trip takes
                40s-2min, not seconds) — an advisor watching a spinner that
                broke its own promise is exactly what tempts a reload/
                retry mid-request. Copy now sets real expectations instead. */}
            <div className="message">Aanya&apos;s AI is searching real flights and hotels city by city for this trip — a multi-city itinerary can take a minute or two. No need to refresh or click again.</div>
          </div>
        ) : (
          // The chooser (2026-09-02) — both paths seed the SAME real,
          // editable itinerary via WorkbenchContext's initItinerary; this
          // only decides whether it starts pre-filled (mock AI draft) or
          // blank. Only shows while this enquiry has no itinerary data
          // yet — see the itineraryData branch above.
          <div className="taw-itin-choose">
            <Icon name="sparkle" size={28} />
            <div className="title">Start this itinerary</div>
            <div className="message">Generate a draft from what the enquiry asked for, or build it from scratch — either way, everything stays fully editable.</div>
            <button className="taw-btn taw-btn--primary taw-btn--block" onClick={() => initItinerary(selEnqId, "ai", selectedEnquiryWithAsk)}>
              <Icon name="sparkle" size={16} />
              Generate AI Itinerary
            </button>
            <button className="taw-btn taw-btn--block" onClick={() => initItinerary(selEnqId, "scratch", selectedEnquiryWithAsk)}>
              <Icon name="plus" size={16} />
              Start from scratch
            </button>
          </div>
        )}
      </Card>
      )}

      {showSummary ? (
        <ChatWithCustomerPanel member={member || (travellerProfile && travellerProfile.member)} enquiry={selectedEnquiryWithAsk} />
      ) : (
      <SearchDesksPanel
        // key={selEnqId} (2026-09-03, flow-testing hurdle) — without it,
        // SearchDesksPanel/FlightDesk/HotelDesk/VisaDesk never remount on
        // enquiry switch; key also flips once askReady goes true
        // (2026-09-10) — see selectedEnquiryWithAsk's own comment above.
        key={selEnqId + (askReady ? ":ask" : "")}
        member={member}
        enquiry={selectedEnquiryWithAsk}
        advisorId={advisorId}
        onAdd={(item: any) => selEnqId && addSearchItemToItinerary(selEnqId, item, selectedEnquiryWithAsk)}
      />
      )}
    </div>
  );
}
