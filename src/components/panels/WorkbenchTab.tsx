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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ResizableColumns } from "../ResizableColumns";
import { useRouter } from "next/navigation";
import { getMessagesByPhone, sendMessageByPhone, siteMembers } from "../../services/api";

import { Card, Empty, Icon, Spinner } from "../ui";
import { ChatbotConversationPanel, memberCode } from "./ChatbotConversationPanel";
import { QueueProfileAccordion } from "./QueueProfileAccordion";
import { SearchDesksPanel } from "./SearchDesksPanel";
import { ItineraryView } from "./ItineraryView";
import { TaraItineraryLink } from "./TaraItineraryLink";
import { useWorkbench } from "../../lib/workbenchContext";
import { buildRequirementRows, buildTripFields, emptyLabel } from "../../lib/tripFields";
import { tripDatesFor } from "../../lib/itineraryFromCart";

// ConversationSummaryPanel + ChatWithCustomerPanel (2026-10-05, direct
// request) — a "Conversation Summary" step shown in columns 2+3 BEFORE
// the real Itinerary Builder/Search, for an enquiry that hasn't had its
// itinerary started yet. Its own "Generate Itinerary" button just
// dismisses this step (per enquiry id) — the actual AI/scratch itinerary
// generation is UNCHANGED, still the existing chooser buttons inside
// Itinerary Builder below.
export function ConversationSummaryPanel({ enquiry, member, hasEnquiry, onGenerate, onAnalyze }: any) {
  const [analyzing, setAnalyzing] = useState(false);
  const ask = enquiry && enquiry.ask;
  // Same ask → same builder as Traveller Profile (column 1) — see
  // src/lib/tripFields.ts.
  const rows = buildRequirementRows(ask);

  const cardStyle = { background: "#F7F4EC", border: "1px solid #EDE7D9", borderRadius: 10, padding: 16 };

  return (
    <Card
      title="Conversation Summary"
      icon={<Icon name="chat" size={20} />}
      actions={
        // Calls POST /enquiries/{id}/extract-trip-details (Claude, a few
        // seconds) and refreshes the profile, so Key Requirements and
        // Trip Preferences fill from the real WhatsApp conversation.
        <button
          type="button"
          className="taw-btn taw-btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          disabled={analyzing || !hasEnquiry}
          title={hasEnquiry ? "Read the WhatsApp conversation and fill in trip details" : "Select an enquiry first"}
          onClick={() => {
            setAnalyzing(true);
            Promise.resolve(onAnalyze()).finally(() => setAnalyzing(false));
          }}
        >
          {analyzing ? <Spinner /> : <Icon name="sparkle" size={13} />}
          {analyzing ? "Analyzing…" : "Analyze Conversation"}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {(
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, fontSize: 14, fontWeight: 600, color: "#1F2430" }}>
              <Icon name="sparkle" size={14} style={{ color: "#B8945F" }} />
              Requirements to Build Itinerary
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {rows.map((r, i) => (
                <li
                  key={r.key}
                  style={{
                    display: "flex", gap: 10, padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px solid #EDE7D9",
                  }}
                >
                  <Icon name={r.icon} size={16} style={{ color: "#B8945F", marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#9098A8", marginBottom: 2 }}>{r.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 14, color: "#1F2430", fontWeight: 600 }}>
                      {r.value || (r.key === "special" ? "None" : "—")}
                      {r.tag ? <span className="taw-chip taw-chip--dom">{r.tag}</span> : null}
                    </div>
                    {r.sub ? <div style={{ fontSize: 12.5, color: "#6B6558", marginTop: 3, lineHeight: 1.45 }}>{r.sub}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(
          <div style={cardStyle}>
            <button className="taw-btn taw-btn--primary taw-btn--block" onClick={onGenerate}>
              <Icon name="sparkle" size={16} />
              Generate Itinerary
            </button>
            {/* Static marketing copy, not data-driven. */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
              {[
                { icon: "tag", label: "Best Prices" },
                { icon: "hotel", label: "Handpicked Hotels" },
                { icon: "compass", label: "Curated Experiences" },
              ].map((b) => (
                <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}>
                  <Icon name={b.icon} size={16} style={{ color: "#B8945F" }} />
                  <span style={{ fontSize: 11.5, color: "#6B6558", fontWeight: 500 }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ChatWithCustomerPanel({ member, enquiry }: any) {
  const digits = member && member.phone ? String(member.phone).replace(/[^0-9]/g, "") : "";
  const waLink = digits ? "https://wa.me/" + digits : null;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [takenOver, setTakenOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!digits) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    function load() {
      setLoading(true);
      getMessagesByPhone(digits)
        .then(function (data: any) {
          if (!cancelled) setMessages(Array.isArray(data) ? data : []);
        })
        .catch(function () {
          if (!cancelled) setMessages([]);
        })
        .finally(function () {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    const interval = setInterval(load, 5000); // poll every 5s for live feel
    return function () {
      cancelled = true;
      clearInterval(interval);
    };
  }, [digits]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = draft.trim();
    if (!text || !digits || sending) return;
    setSending(true);
    sendMessageByPhone(digits, text)
      .then(function () {
        setDraft("");
        setMessages(function (prev) {
          return [...prev, { role: "advisor", content: text, created_at: new Date().toISOString() }];
        });
      })
      .catch(function (err: any) {
        alert((err && err.message) || "Could not send message.");
      })
      .finally(function () {
        setSending(false);
      });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Live WhatsApp Chat" icon={<Icon name="chat" size={20} />}>
        {!digits ? (
          <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: "20px 10px" }}>
            No phone number on file
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: 420 }}>
            <div
              style={{
                flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
                padding: "6px 2px", marginBottom: 10,
              }}
            >
              {loading && messages.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: 20 }}>Loading chat…</div>
              ) : messages.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: 20 }}>No messages yet.</div>
              ) : (
                messages.map(function (m: any, i: number) {
                  const isCustomer = m.role === "user" || m.role === "customer";
                  return (
                    <div
                      key={i}
                      style={{
                        alignSelf: isCustomer ? "flex-start" : "flex-end",
                        maxWidth: "80%",
                        background: isCustomer ? "#F1F3F5" : "#DCF8C6",
                        borderRadius: 10,
                        padding: "8px 12px",
                        fontSize: 13.5,
                        color: "#1F2430",
                        lineHeight: 1.45,
                      }}
                    >
                      {m.content}
                      {m.created_at ? (
                        <div style={{ fontSize: 10.5, color: "#8A8070", marginTop: 4, textAlign: "right" }}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
            {takenOver ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={draft}
                  onChange={function (e) {
                    setDraft(e.target.value);
                  }}
                  onKeyDown={function (e) {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message…"
                  autoFocus
                  style={{
                    flex: 1, border: "1px solid #E1E4E8", borderRadius: 8, padding: "9px 12px",
                    fontSize: 13.5, outline: "none",
                  }}
                />
                <button
                  className="taw-btn taw-btn--primary"
                  disabled={!draft.trim() || sending}
                  onClick={handleSend}
                  style={{ padding: "9px 16px" }}
                >
                  {sending ? <Spinner /> : "Send"}
                </button>
              </div>
            ) : (
              <button
                className="taw-btn taw-btn--block"
                onClick={function () {
                  setTakenOver(true);
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  border: "1px solid #B8945F", color: "#8A5A2B", background: "#FDF6EC",
                }}
              >
                <Icon name="user" size={15} />
                Chat with Customer
              </button>
            )}
            {takenOver ? (
              <div style={{ fontSize: 11.5, color: "#8A8070", marginTop: 6, textAlign: "center" }}>
                You're replying as an advisor — the AI assistant has paused for this conversation.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "#8A8070", marginTop: 6, textAlign: "center" }}>
                Click to reply as an advisor. The AI assistant is currently handling this chat.
              </div>
            )}
          </div>
        )}
      </Card>

      {waLink ? (
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12.5, color: "#B8945F", fontWeight: 600, textDecoration: "none", textAlign: "center" }}
        >
          Open in WhatsApp app →
        </a>
      ) : null}
    </div>
  );
}

// With an enquiry selected and no traveller picked from the list, find the
// full traveller object (the one carrying the invitation `code`) by matching
// the enquiry's member on email / phone / id.
function findEnquiryTraveller(travellers: any, convoTarget: any, member: any, travellerProfile: any) {
  if (convoTarget || !Array.isArray(travellers)) return null;
  const m: any = member || (travellerProfile && travellerProfile.member) || {};
  const norm = (v: any) => String(v || "").trim().toLowerCase();
  const last10 = (v: any) => String(v || "").replace(/[^0-9]/g, "").slice(-10);
  return (
    travellers.find((t: any) => t && t.code && (
      (m.email && norm(t.email) === norm(m.email)) ||
      (last10(m.phone) && last10(t.phone) === last10(m.phone)) ||
      (m.id && t.member && t.member.id === m.id)
    )) || null
  );
}

const noSubscribe = () => () => {};

export function WorkbenchTab(props: any) {
  // creating/onCreateOrder: unused now that Quote Builder isn't rendered on
  // this screen — kept in the destructure since the parent still passes
  // them and they'll be needed again once it returns.
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, onCreateOrder, member, selEnqId, onSelectEnquiry, onPickMember, onEnsureEnquiry } = props;
  const { itinerariesByEnquiry, generatingItinerary, initItinerary, addSearchItemToItinerary, addSwapOptionToItinerary, travellerProfile, travellerProfileLoading, analyzeConversation, travellers, convoTarget, setConvoTarget, summaryDismissedFor, backToSummaryFor, parkTaraItinerary } = useWorkbench();

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
  const baseAsk = askReady ? travellerProfile.enquiry.ask : (selectedEnquiry?.ask || {});
  const selectedEnquiryWithAsk = { ...selectedEnquiry, ask: { ...baseAsk } };
  const itineraryData = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
  // generating (2026-09-06) — "Generate AI Itinerary" now waits on a real
  // backend call (POST /enquiries/{id}/generate-itinerary — real Claude
  // latency, not instant mock cloning), so the chooser below needs its
  // own in-flight state to show instead of nothing.
  const generating = selEnqId ? !!generatingItinerary[selEnqId] : false;

  // backToSummaryFor — was set by the Itinerary Builder's old "← Back" (removed 2026-10-20), so
  // nothing sets it from this card. The header's "← Back" now only leaves Tara's itinerary.

  // Conversation panel (2026-10-09, direct request): whenever a customer is
  // selected (from the Traveller Profile list) without an active enquiry, the
  // centre column shows their live Tara (chatbot) conversation instead of the
  // empty "Not yet built" itinerary. convoTarget is the traveller picked in
  // QueueProfileAccordion (carries code + phone); it's lifted here because the
  // panel renders in a sibling column. Falls back to the enquiry-loaded member.
  const convoMember = convoTarget || member || (travellerProfile && travellerProfile.member);
  // The Traveller Profile opens as a popup from the round button at the top left of the
  // Itinerary Builder, so the itinerary and Search get the whole row. It stays mounted
  // while closed: it also drives the Queue dropdown in the Enquiries header.
  const [profileOpen, setProfileOpen] = useState(false);
  // false while server-rendering / hydrating, true in the browser after: <body> exists to portal into.
  const portalReady = useSyncExternalStore(noSubscribe, () => true, () => false);
  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="listbox"]')) setProfileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen]);
  const profileName = String((convoMember && convoMember.name) || "");
  const profileInitials = profileName.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  // ONE flag for both columns: the tabbed summary panel (column 2) and the
  // chat (column 3) show together. Otherwise column 2 is the Itinerary Builder
  // card (chooser / Drafting… / ItineraryView) and column 3 is the search panel.
  // showSummary is already false once an itinerary exists or is generating, and
  // after Generate Itinerary dismisses the summary for this enquiry.
  // startItinerary — with an enquiry selected, seed its itinerary directly; with
  // only a traveller picked, create/reuse their enquiry first (the enquiry is
  // created on click, not on selection).
  const startItinerary = (mode: "ai" | "scratch") => {
    if (selEnqId) {
      initItinerary(selEnqId, mode, selectedEnquiryWithAsk);
      return;
    }
    if (onEnsureEnquiry && convoMember) {
      onEnsureEnquiry(convoMember)
        .then((e: any) => initItinerary(e.id, mode, { ...e, ask: {} }))
        .catch(() => {});
    }
  };
  // The "start this itinerary" content — the Drafting… spinner while
  // generating, else the Generate AI / Start from scratch chooser. Rendered
  // by the Itinerary Builder card below.
  const itineraryStartNode = generating ? (
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
                retry mid-request. Copy now sets real expectations instead.
                Updated 2026-10-21: the spinner now covers only the Claude draft (~10s, measured);
                the real flight/hotel search runs afterwards via /generate-itinerary/refresh while
                the draft is already on screen, so the copy says that instead. */}
            <div className="message">Aanya&apos;s AI is drafting your day-by-day plan — this takes about 10 seconds. Real flights and hotels are then searched city by city and fill in on their own in the background (a multi-city trip can take a minute or two more). No need to refresh or click again.</div>
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
            <button className="taw-btn taw-btn--primary taw-btn--block" onClick={() => startItinerary("ai")}>
              <Icon name="sparkle" size={16} />
              Generate AI Itinerary
            </button>
            <button className="taw-btn taw-btn--block" onClick={() => startItinerary("scratch")}>
              <Icon name="plus" size={16} />
              Start from scratch
            </button>
          </div>
  );

  // Who the Tara link looks up. Plans are filed under the traveller's ACCESS CODE, which the
  // CRM `members` row (what a Queue pick leaves in `member`) does not carry — so resolve the same
  // way the Conversation panel does: the picked traveller, else the traveller list entry matching
  // this member by email/phone/id, else the loaded profile's member; the first one with a code.
  const enquiryTraveller = findEnquiryTraveller(travellers, convoTarget, member, travellerProfile);
  const taraMember =
    [convoTarget, enquiryTraveller, askReady ? travellerProfile.member : null, convoMember].find((m: any) => memberCode(m)) || convoMember;
  // Tara's itinerary is the one on screen (the converted plan carries `taraPlan`).
  const taraShowing = !!(selEnqId && itineraryData && itineraryData.taraPlan);

  const profileColumn = (
      <QueueProfileAccordion
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        travellerProfile={travellerProfile}
        travellerProfileLoading={travellerProfileLoading}
        selEnqId={selEnqId}
        member={member}
        onSelectEnquiry={onSelectEnquiry}
        onPickMember={onPickMember}
        onConvoTarget={setConvoTarget}
      />
  );

  return (
    <>
    {/* Portalled to <body> so it sits above the app sidebar and header. */}
    {portalReady ? createPortal(
      <div className={"taw-prof-pop" + (profileOpen ? " is-open" : "")} aria-hidden={!profileOpen}>
        <div className="taw-prof-pop-back" onClick={() => setProfileOpen(false)} />
        <div className="taw-prof-pop-panel" role="dialog" aria-modal="true" aria-label="Traveller profile">
          <div className="taw-prof-pop-top">
            <button type="button" className="taw-btn taw-btn--sm" onClick={() => setProfileOpen(false)} aria-label="Close the traveller profile">
              <Icon name="x" size={14} /> Close
            </button>
          </div>
          {profileColumn}
        </div>
      </div>,
      document.body,
    ) : null}
    {/* Drag the handle between the columns to widen the Itinerary Builder or Search (saved per browser). */}
    <ResizableColumns storageKey="taw.console.columns.v2" defaults={[1, 1]} className="taw-grid taw-cols-3">
      <Card
        className="taw-itin-card"
        title="Itinerary Builder"
        icon={
          <button type="button" className={"taw-prof-btn" + (profileInitials ? "" : " is-empty")} onClick={() => setProfileOpen(true)}
            title={profileName ? `${profileName} — open the traveller profile` : "Open the traveller profile and travellers list"}
            aria-label="Open the traveller profile" aria-expanded={profileOpen}>
            {profileInitials || <Icon name="user" size={18} />}
          </button>
        }
        sub={convoMember ? "for " + (convoMember.name || "traveller") : "no member selected"}
        actions={
          // "← Back" (2026-10-21) — only while Tara's itinerary is the one showing. It sets that
          // itinerary aside (edits kept) and returns to the Generate / Start-from-scratch chooser;
          // the inline Tara link then offers "Return to Tara's itinerary". This replaces the
          // header's old "Tara Itinerary" button, which only repeated "Generate AI Itinerary".
          taraShowing ? (
            <button
              type="button"
              className="taw-btn taw-btn--sm"
              title="Back to Generate AI Itinerary / Start from scratch — Tara's itinerary is kept and can be reopened"
              onClick={() => parkTaraItinerary(selEnqId as string)}
            >
              ← Back
            </button>
          ) : null
        }
      >
        <TaraItineraryLink member={taraMember} selEnqId={selEnqId} onEnsureEnquiry={onEnsureEnquiry} hidden={taraShowing} />
        {!selectedEnquiry && convoMember ? (
          itineraryStartNode
        ) : !selectedEnquiry ? (
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
        ) : (
          itineraryStartNode
        )}
      </Card>

      <SearchDesksPanel
        // key={selEnqId} (2026-09-03, flow-testing hurdle) — without it,
        // SearchDesksPanel/FlightDesk/HotelDesk/VisaDesk never remount on
        // enquiry switch; key also flips once askReady goes true
        // (2026-09-10) — see selectedEnquiryWithAsk's own comment above.
        key={selEnqId + (askReady ? ":ask" : "")}
        member={member}
        enquiry={selectedEnquiryWithAsk}
        tripDates={tripDatesFor(itineraryData, selectedEnquiryWithAsk.ask)}
        advisorId={advisorId}
        onAdd={(item: any) => selEnqId && addSearchItemToItinerary(selEnqId, item, selectedEnquiryWithAsk)}
        onAddSwap={(item: any) => selEnqId && addSwapOptionToItinerary(selEnqId, item)}
      />
    </ResizableColumns>
    </>
  );
}


// Conversation tab content — State A's columns 2 + 3 relocated from the
// Console tab: Conversation Summary (Key Requirements / Summary / Analyze)
// beside the live chat panel. "Generate Itinerary" reveals the Itinerary
// Builder exactly as before, then jumps to the Console tab where it renders.
export function ConversationTab() {
  const {
    enquiries, member, selEnqId, travellerProfile, travellers, analyzeConversation,
    ensureEnquiryForMember, convoTarget, setConvoTarget, setSummaryDismissedFor, membersById,
  } = useWorkbench();
  const router = useRouter();

  // Opened from the notification bell: /console/conversation?code=<access code> (or the bell's event while this
  // tab is already open) switches the conversation to that customer.
  useEffect(() => {
    let cancelled = false;
    function openByCode(raw: string | null) {
      const code = String(raw || "").trim().toUpperCase();
      if (!code) return;
      const known = Object.values(membersById || {}).find((m: any) => memberCode(m).toUpperCase() === code);
      if (known) { setConvoTarget(known); return; }
      siteMembers("select=*&invitation_code=eq." + encodeURIComponent(code) + "&limit=1")
        .then((rows: any) => {
          if (cancelled) return;
          const m: any = Array.isArray(rows) && rows[0];
          setConvoTarget(m ? { ...m, id: m.id || code, name: m.name || code, invitation_code: code } : { id: code, name: code, invitation_code: code });
        })
        .catch(() => { if (!cancelled) setConvoTarget({ id: code, name: code, invitation_code: code }); });
    }
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) openByCode(fromUrl);
    const onOpen = (e: Event) => openByCode((e as CustomEvent).detail);
    window.addEventListener("ta:open-conversation", onOpen);
    return () => { cancelled = true; window.removeEventListener("ta:open-conversation", onOpen); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersById]);
  const selectedEnquiry = enquiries.find((e: any) => e.id === selEnqId);
  const askReady = !!(travellerProfile && travellerProfile.enquiry && travellerProfile.enquiry.id === selEnqId);
  const baseAsk = askReady ? travellerProfile.enquiry.ask : (selectedEnquiry?.ask || {});
  const selectedEnquiryWithAsk = { ...selectedEnquiry, ask: { ...baseAsk } };
  const convoMember = convoTarget || member || (travellerProfile && travellerProfile.member);
  const enquiryTraveller = findEnquiryTraveller(travellers, convoTarget, member, travellerProfile);

  if (!convoMember) {
    return <Empty icon="chat" title="No traveller selected" message="Pick a traveller or enquiry in the Console tab to see their conversation." />;
  }
  const goBuild = () => router.push("/console/queue");
  return (
    <div className="taw-grid taw-cols-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <ConversationSummaryPanel
        key={selEnqId || "none"}
        enquiry={selectedEnquiryWithAsk}
        hasEnquiry={!!selectedEnquiry}
        onAnalyze={() => analyzeConversation(selEnqId as string)}
        member={convoMember}
        onGenerate={() => {
          if (selEnqId) {
            setSummaryDismissedFor(selEnqId);
            goBuild();
            return;
          }
          ensureEnquiryForMember(convoMember)
            .then((e: any) => { setSummaryDismissedFor(e.id); goBuild(); })
            .catch(() => {});
        }}
      />
      <ChatbotConversationPanel member={convoTarget || enquiryTraveller || convoMember || (travellerProfile && travellerProfile.member) || member} />
    </div>
  );
}
