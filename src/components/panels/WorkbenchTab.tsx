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
import { useEffect, useRef, useState } from "react";
import { getMessagesByPhone, sendMessageByPhone } from "../../services/api";

async function parseWhatsAppChat(text: string): Promise<Record<string, any>> {
  const res = await fetch("/api/parse-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  try { return await res.json(); } catch { return {}; }
}
import { Card, Empty, Icon, Spinner } from "../ui";
import { ChatbotConversationPanel } from "./ChatbotConversationPanel";
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

function ConversationSummaryPanel({ enquiry, member, onGenerate, onParsed }: any) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
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

        {(member || (ask && ask.traveller_name)) ? (
          <div style={{ background: "#F7F4EC", border: "1px solid #EDE7D9", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, fontSize: 14, fontWeight: 600, color: "#1F2430" }}>
              <Icon name="user" size={14} style={{ color: "#4A5568" }} />
              Traveller Profile for Itinerary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Traveller Name</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{(member && member.name) || (ask && ask.traveller_name) || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{(member && member.email) || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9098A8", marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 13.5, color: "#1F2430", fontWeight: 500 }}>{(member && member.phone) || "—"}</div>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2430", marginBottom: 10 }}>Parse WhatsApp Chat (test)</div>
          <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setParsing(true);
            try {
              const text = await file.text();
              console.log("[parse] file read, length:", text.length);
              const parsed = await parseWhatsAppChat(text);
              console.log("[parse] parsed result:", parsed);
              onParsed(parsed);
            } catch (err) {
              console.error("[parse] ERROR:", err);
            } finally {
              setParsing(false);
              if (fileRef.current) fileRef.current.value = "";
            }
          }} />
          <button className="taw-btn taw-btn--block" disabled={parsing} onClick={() => fileRef.current?.click()} style={{ marginBottom: 10 }}>
            {parsing ? <Spinner /> : <Icon name="inbox" size={15} />}
            {parsing ? "Parsing with Haiku…" : "Upload WhatsApp .txt export"}
          </button>
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
  const [parsedAsk, setParsedAskRaw] = useState<Record<string, any>>(() => {
    try { return JSON.parse(sessionStorage.getItem("parsedAsk") || "{}"); } catch { return {}; }
  });
  const setParsedAsk = (v: Record<string, any>) => {
    try { sessionStorage.setItem("parsedAsk", JSON.stringify(v)); } catch {}
    setParsedAskRaw(v);
  };
  const askReady = !!(travellerProfile && travellerProfile.enquiry && travellerProfile.enquiry.id === selEnqId);
  const baseAsk = askReady ? travellerProfile.enquiry.ask : (selectedEnquiry?.ask || {});
  const selectedEnquiryWithAsk = { ...selectedEnquiry, ask: { ...baseAsk, ...parsedAsk } };
  const itineraryData = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
  // generating (2026-09-06) — "Generate AI Itinerary" now waits on a real
  // backend call (POST /enquiries/{id}/generate-itinerary — real Claude
  // latency, not instant mock cloning), so the chooser below needs its
  // own in-flight state to show instead of nothing.
  const generating = selEnqId ? !!generatingItinerary[selEnqId] : false;

  const [summaryDismissedFor, setSummaryDismissedFor] = useState<string | null>(null);
  const showSummary = !!selectedEnquiry && !itineraryData && !generating && summaryDismissedFor !== selEnqId;

  // Conversation panel (2026-10-09, direct request): whenever a customer is
  // selected (from the Traveller Profile list) without an active enquiry, the
  // centre column shows their live Tara (chatbot) conversation instead of the
  // empty "Not yet built" itinerary. convoTarget is the traveller picked in
  // QueueProfileAccordion (carries code + phone); it's lifted here because the
  // panel renders in a sibling column. Falls back to the enquiry-loaded member.
  const [convoTarget, setConvoTarget] = useState<any>(null);
  const convoMember = convoTarget || member || (travellerProfile && travellerProfile.member);
  const showConversation = !!convoMember && !selectedEnquiry;

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
        member={member}
        onSelectEnquiry={onSelectEnquiry}
        onPickMember={onPickMember}
        onConvoTarget={setConvoTarget}
      />

      {showSummary ? (
        <ConversationSummaryPanel
          enquiry={selectedEnquiryWithAsk}
          member={member || (travellerProfile && travellerProfile.member)}
          onGenerate={() => setSummaryDismissedFor(selEnqId)}
          onParsed={(parsed: Record<string, any>) => { console.log("[WorkbenchTab] onParsed called with:", parsed); setParsedAsk(parsed); }}
        />
      ) : showConversation ? (
        <ChatbotConversationPanel member={convoMember} />
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
