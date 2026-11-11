"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ChatbotConversationPanel.tsx
 *
 * "Conversation" panel for the Enquiries Console — shows a customer's live
 * conversation with Tara (the chatbot), fetched by their invitation/access
 * code through adminbe's GET /admin/conversation/{code} (which proxies
 * chatbot-be's /api/ops/history/{code}). Polls every 5s for a live feel.
 *
 * Loads like a chat app: the newest page of the real WhatsApp thread first
 * (GET .../real-messages), older pages as the advisor scrolls up (`before`
 * cursor, prepended without moving the view via react-virtuoso's
 * firstItemIndex), and each 5s poll asks only for what is newer than the last
 * message held (`after`) and merges it in by message id.
 *
 * Action: "WhatsApp" opens wa.me to the customer's number. (The earlier
 *   "Export .txt + WhatsApp" button was removed.)
 *
 * Self-contained + portable: it only needs a `member` with a code field
 * (invitation_code / customer_code / code) and a `phone`. Mount it wherever a
 * customer is selected. In this repo it's rendered by WorkbenchTab's centre
 * column when a member is picked without an enquiry.
 * ===========================================================================*/
import { useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { relTime } from "../../lib/relTime";
import { addConversationBudget, getChatbotConversation, getRealWhatsAppMessages, sendChatbotReply, siteMembers, getConversationHandoff, getCustomerPresence, setConversationHandoff, getMemberCode } from "../../services/api";
import { Card, Icon, Spinner } from "../ui";
import MeshBackdrop from "../chat/MeshBackdrop";
import { isAdmin, toast } from "../../lib/advisorHelpers";
import "../../styles/convo-dark.css"; // the chatbot's dark surface for this card
import { pullTripLinks } from "../../lib/taraTripLinks";
import { TaraTripCard } from "./TaraTripCard";

interface ConvoMessage {
  id: string; // stable and unique: the source row's id (never the array index)
  created_at?: string; // server timestamp, also half of the paging cursor; absent on local/optimistic rows
  role: string;
  content: string;
  at?: number | null;
  sender?: string;
  tara?: boolean; // Tara's AI reply (vs a human advisor)
  real?: boolean; // true = raw WhatsApp message (not Tara's)
  parts?: string[] | null;
  channel?: string; // "web" (the website), "whatsapp", "advisor" (a desk reply) — the caption above the bubble
}

// The small caption above each message: where it was sent from or to (2026-10-22).
const CHANNEL_CAPTION: Record<string, { label: string; dot: string }> = {
  web: { label: "Website", dot: "#3B6FD8" },
  whatsapp: { label: "WhatsApp", dot: "#25A85A" },
  advisor: { label: "Desk", dot: "#B7862F" },
};

interface Usage {
  spentUsd: number;
  capUsd: number | null;
  remainingUsd: number | null;
  /** the base cap every code gets, and what admins have added for this one (both in USD) */
  baseCapUsd?: number | null;
  extraUsd?: number;
}

// WhatsApp's own mark (filled, so it keeps its green), for the "open WhatsApp" link in the header.
function WhatsAppLogo(props: { size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function memberCode(member: any): string {
  if (!member) return "";
  return String(member.invitation_code || member.customer_code || member.code || "").trim();
}

function waDigits(phone: any): string {
  const digits = phone ? String(phone).replace(/[^0-9]/g, "") : "";
  // A bare 10-digit Indian mobile needs the 91 country code for wa.me.
  return digits.length === 10 ? "91" + digits : digits;
}

// A transient connectivity problem on a background poll — the request never
// came back (a timeout, or fetch() itself rejecting when the network drops or a
// sleeping Render service is briefly unreachable). Every browser words the raw
// network failure differently ("Failed to fetch" in Chrome, "Load failed" in
// Safari, "NetworkError…" in Firefox); all of them mean the same thing as a
// timeout, so the panel reassures and keeps retrying rather than flashing the
// raw string. The conversation read hits one origin/path/headers whether it
// loads or polls, so a poll that fails this way is connectivity, not a bug.
function isConnectionError(message?: string | null): boolean {
  return /timed out|failed to fetch|load failed|network\s*error|networkerror|fetch failed/i.test(String(message || ""));
}

function fmtTime(at?: number | null): string {
  if (!at) return "";
  const ms = at < 1e12 ? at * 1000 : at;
  return new Date(ms).toLocaleString([], {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// Last-resort code lookup when the member object carries none: first the URL
// (?code= / ?invitation_code=, or an 6-10 digit path segment), then
// site_members by member.id / member.member_id.
function codeFromUrl(): string {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  const fromQuery = q.get("code") || q.get("invitation_code");
  if (fromQuery) return fromQuery.trim();
  const seg = window.location.pathname.split("/").find((x) => /^\d{6,10}$/.test(x));
  return seg || "";
}

type Mode = "tara" | "advisor" | "both";

// The customer's presence for the header line: online now, last seen, or the time of their last message
// (all WhatsApp ever tells us; it does not share online status or typing with a business).
function presenceLine(p: any, now: number): { text: string; online: boolean } | null {
  if (!p) return null;
  if (p.online) return { text: "Online now", online: true };
  if (!p.last_seen_at) return null;
  if (p.last_seen_source === "website") return { text: "Last seen " + relTime(p.last_seen_at, now), online: false };
  const where = p.last_message_channel === "whatsapp" ? " on WhatsApp" : p.last_message_channel === "web" ? " on the website" : "";
  return { text: "Last message " + relTime(p.last_seen_at, now) + where, online: false };
}

// State that belongs to one traveller is stored WITH its code and read back only
// while that code is still selected, so switching travellers can never show the
// previous traveller's messages or takeover state (and needs no reset effects).
interface ConvoState {
  code: string;
  messages: ConvoMessage[]; // oldest first
  usage: Usage | null;
  error: string | null;
  loaded: boolean; // a load for this code has finished (successfully or not)
  // "real" = the paged WhatsApp thread; "tara" = chatbot-be's unpaged history, used
  // only when there is no real thread; "none" = nothing loaded yet / empty.
  source: "real" | "tara" | "none";
  firstItemIndex: number; // Virtuoso: drops by the number of items put above the first one
  hasMore: boolean; // older messages exist
  nextBefore: string | null; // cursor for the next older page
  olderLoading: boolean;
  olderError: string | null;
}
// websiteOnly: the traveller has no WhatsApp number on file; Tara can still be paused, and a reply goes to their website chat.
interface HandoffState { code: string; mode: Mode; status: "ready" | "error"; websiteOnly?: boolean }

const NO_MESSAGES: ConvoMessage[] = [];
const POLL_MS = 2000; // a customer's message shows within a couple of seconds
const TARA_POLL_TIMEOUT_MS = 25000; // a stuck website-chat refresh is dropped and retried, not waited on for 45s
const TARA_RECHECK_REAL_EVERY = 5; // a website-only chat looks for a WhatsApp thread every 5th refresh
const STALE_BEFORE_WARNING_MS = 20000; // "the connection is slow" only once nothing has refreshed for this long
// Tara starts a reply this long after the customer's message (chatbot-be's TARA_REPLY_DELAY_SECONDS):
// the time the advisor has to press "I'll reply" first.
const TARA_DELAY_S = 5;
const PAGE_SIZE = 30;
const USAGE_EVERY = 15; // refresh the usage meter every 15th poll (~30s) — it needs chatbot-be's full history
const START_INDEX = 1000000; // Virtuoso needs a positive firstItemIndex that can only go down

function emptyConvo(code: string): ConvoState {
  return {
    code, messages: NO_MESSAGES, usage: null, error: null, loaded: false, source: "none",
    firstItemIndex: START_INDEX, hasMore: false, nextBefore: null, olderLoading: false, olderError: null,
  };
}

// A message from /real-messages -> panel shape.
function mapReal(m: any): ConvoMessage {
  return {
    id: String(m.id),
    created_at: m.created_at,
    role: m.sender_type === "customer" ? "user" : "assistant",
    tara: m.sender_type === "tara",
    content: m.message, real: true, sender: m.sender_name,
    at: m.created_at ? new Date(m.created_at).getTime() : null,
    channel: typeof m.channel === "string" ? m.channel : undefined,
  };
}

// Paging cursor of a message: "<created_at>|<id>" (what the backend returns it in).
function cursorOf(m: ConvoMessage): string {
  return (m.created_at || "") + "|" + m.id;
}

function newestCursor(messages: ConvoMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].created_at) return cursorOf(messages[i]);
  return null;
}

function sortKey(m: ConvoMessage): string {
  return m.created_at || "￿"; // local (optimistic) rows sit at the end until the server's copy arrives
}

// Merge messages into the list by id, keeping the server's (created_at, id) order. A
// row can land anywhere — older pages go above, late-stamped rows in the middle of the
// tail — so firstItemIndex is lowered by however many rows end up above the old first
// one: that is what keeps the reader's view still. Returns null when nothing is new.
function mergeMessages(prev: ConvoMessage[], incoming: ConvoMessage[], firstItemIndex: number) {
  const known = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return null;
  // The server's copy of a message we sent optimistically replaces the local one.
  const serverTexts = new Set(fresh.filter((m) => m.role !== "user").map((m) => (m.content || "").trim()));
  const kept = prev.filter((m) => !(m.id.startsWith("local-") && serverTexts.has((m.content || "").trim())));
  const merged = kept.concat(fresh).sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const above = prev.length ? merged.findIndex((m) => m.id === prev[0].id) : 0;
  return { messages: merged, firstItemIndex: firstItemIndex - (above > 0 ? above : 0) };
}

// Top of the list: inline loading / retry / start-of-conversation marker. Every state
// is the same height, so swapping between them never moves the messages below.
const HEADER_BOX = { height: 36, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, fontSize: 11.5 } as const;
function ConvoListHeader({ context }: any) {
  const { hasMore, olderLoading, olderError, loadOlder } = context;
  if (olderLoading) {
    return (
      <div role="status" aria-live="polite" className="cv-listhead" style={HEADER_BOX}>
        <span aria-hidden="true" className="cv-spin" style={{ width: 14, height: 14, borderWidth: 2 }} />
        Loading earlier messages…
      </div>
    );
  }
  if (olderError) {
    return (
      <div role="alert" className="cv-err" style={HEADER_BOX}>
        <span>Couldn&apos;t load earlier messages.</span>
        <button type="button" className="cv-link" onClick={loadOlder}>Retry</button>
      </div>
    );
  }
  if (!hasMore) return <div className="cv-listhead" style={HEADER_BOX}>Start of conversation</div>;
  return <div style={HEADER_BOX} />;
}

export function ChatbotConversationPanel({ member }: any) {
  const baseCode = memberCode(member);
  const [fallback, setFallback] = useState({ key: "", code: "" });
  const memberId = member ? member.id : undefined;
  const memberAltId = member ? member.member_id : undefined;
  const memberKey = String(memberId || memberAltId || "");
  const memberPhone = member ? member.phone : undefined;
  const memberWaPhone = member ? member.wa_phone : undefined;
  const memberEmail = member ? member.email : undefined;
  useEffect(() => {
    if (baseCode) return;
    let cancelled = false;
    (async () => {
      const fromUrl = codeFromUrl();
      if (fromUrl) {
        if (!cancelled) setFallback({ key: memberKey, code: fromUrl });
        return;
      }
      for (const id of [memberId, memberAltId].filter(Boolean)) {
        for (const col of ["id", "member_id"]) {
          try {
            const rows: any = await siteMembers(`select=invitation_code&${col}=eq.${encodeURIComponent(String(id))}`);
            const c = Array.isArray(rows) && rows[0] && rows[0].invitation_code;
            if (c && !cancelled) { setFallback({ key: memberKey, code: String(c) }); return; }
          } catch { /* column may not exist / not allowed — try the next */ }
        }
      }
      // A CRM record (enquiry / queue) with no code and no site_members row: the
      // code from the customer's phone or email (2026-10-22).
      try {
        const c = await getMemberCode(memberPhone || memberWaPhone, memberEmail);
        if (c && !cancelled) setFallback({ key: memberKey, code: String(c) });
      } catch { /* no code found: the panel says so */ }
    })();
    return () => { cancelled = true; };
  }, [baseCode, memberKey, memberId, memberAltId, memberPhone, memberWaPhone, memberEmail]);
  const code = baseCode || (fallback.key === memberKey ? fallback.code : "");
  const digits = waDigits(member && (member.phone || member.wa_phone));
  // Read by the thread loaders below without restarting them when it changes.
  const phoneRef = useRef("");
  useEffect(() => { phoneRef.current = digits; }, [digits]); // declared before the loaders, so it is set before their first read
  const waLink = digits ? "https://wa.me/" + digits : null;
  // The customer's own Tara chat on the website, opened signed in as them: the chatbot signs a member in from the
  // access code in the #fragment (never sent to a server), so the advisor sees the same conversation the customer does.
  const siteChatBase = ((process.env.NEXT_PUBLIC_TARA_CHAT_URL as string | undefined) || "https://chatbot.tripagent.vip/chat").trim();
  const siteChatLink = code ? siteChatBase + "#code=" + encodeURIComponent(code) : null;

  // An admin adding budget for THIS customer's AI-desk conversation (the $5 cap): the amount chosen and whether it is saving.
  const [topAmount, setTopAmount] = useState(5);
  const [topBusy, setTopBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  const [convo, setConvo] = useState<ConvoState>(() => emptyConvo(""));
  const cur = convo.code === code ? convo : null;
  const messages = cur ? cur.messages : NO_MESSAGES;
  const usage = cur ? cur.usage : null;
  const error = cur ? cur.error : null;
  const canAddBudget = isAdmin();
  async function addBudget() {
    if (!code || topBusy) return;
    setTopBusy(true);
    setTopErr(null);
    try {
      const r: any = await addConversationBudget(code, topAmount);
      // Show the new cap at once; the next poll confirms it.
      if (r && r.usage) setConvo((prev) => (prev.code === code ? { ...prev, usage: r.usage } : prev));
      toast("$" + topAmount + " added: Tara can reply to this customer again", "success");
    } catch (e: any) {
      setTopErr(String((e && e.message) || "Could not add the extra budget."));
    } finally {
      setTopBusy(false);
    }
  }
  const firstItemIndex = cur ? cur.firstItemIndex : START_INDEX;
  const hasMore = cur ? cur.hasMore : false;
  const olderLoading = cur ? cur.olderLoading : false;
  const olderError = cur ? cur.olderError : null;
  // The poll and the older-page loader read the latest state without re-subscribing.
  const convoRef = useRef(convo);
  useEffect(() => { convoRef.current = convo; }, [convo]);
  const olderBusyRef = useRef(""); // code whose older page is being fetched
  // First load for this traveller still running. Every request now times out,
  // so this always ends — in messages or in the error + Retry view.
  const loading = !!code && !(cur && cur.loaded);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Takeover mode: "tara" (default) | "advisor" (Tara paused) | "both" (Tara keeps replying).
  // Only trusted once the handoff state for this traveller has been read.
  const [handoff, setHandoff] = useState<HandoffState | null>(null);
  const [handoffTick, setHandoffTick] = useState(0);
  const handoffCur = handoff && handoff.code === code ? handoff : null;
  const mode: Mode = handoffCur ? handoffCur.mode : "tara";
  const handoffStatus: "loading" | "ready" | "error" = !code ? "ready" : handoffCur ? handoffCur.status : "loading";
  const websiteOnly = !!(handoffCur && handoffCur.websiteOnly);
  const [modeSaving, setModeSaving] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // Idempotency key for the message being composed: kept across retries of the
  // same text so a retry after a timeout can't send it to WhatsApp twice.
  const pendingSendRef = useRef<{ code: string; text: string; id: string; channel: "whatsapp" | "web" } | null>(null);
  // Which button was pressed, for its spinner.
  const [sendingTo, setSendingTo] = useState<"whatsapp" | "web" | null>(null);
  const takenOver = mode !== "tara";
  // The customer's presence, checked every 2s while this panel is open: typing (three dots, website only),
  // online (the chatbot is open right now) and last seen.
  const [presence, setPresence] = useState<any>(null);
  const customerTyping = !!(presence && presence.typing);
  useEffect(() => {
    setPresence(null);
    if (!code) return;
    let cancelled = false;
    const check = () => {
      if (document.hidden) return;
      getCustomerPresence(code).then((p: any) => { if (!cancelled) setPresence(p); });
    };
    check();
    const t = setInterval(check, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [code]);
  // The newest message is the customer's and nobody has answered it yet: while Tara is
  // about to reply the advisor sees a countdown and can press "I'll reply".
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const awaitingReply = !!lastMessage && !!lastMessage.at && (lastMessage.role === "user" || lastMessage.role === "customer");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!awaitingReply) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [awaitingReply, lastMessage && lastMessage.id]);
  // Where a desk reply will go: the channel the customer last wrote on, never both (the server
  // decides the same way, on fresh data). Unknown when no message says (older threads).
  let lastCustomerChannel: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if ((m.role === "user" || m.role === "customer") && (m.channel === "web" || m.channel === "whatsapp")) { lastCustomerChannel = m.channel; break; }
  }
  const defaultChannel: "whatsapp" | "web" = websiteOnly || lastCustomerChannel === "web" ? "web" : "whatsapp";
  const replyGoesTo = websiteOnly || lastCustomerChannel === "web" ? "the website chat" : lastCustomerChannel === "whatsapp" ? "WhatsApp" : null;
  const waitedS = awaitingReply && lastMessage && lastMessage.at ? (nowMs - (lastMessage.at < 1e12 ? lastMessage.at * 1000 : lastMessage.at)) / 1000 : 0;
  let waitingLine = "";
  if (awaitingReply && handoffStatus === "ready") {
    if (mode === "advisor") waitingLine = "This customer is waiting for your reply";
    else if (mode === "tara" && waitedS < TARA_DELAY_S) waitingLine = `Tara replies in ${Math.max(1, Math.ceil(TARA_DELAY_S - waitedS))}s`;
    else if (mode === "tara" && waitedS < 60) waitingLine = "Tara is writing the reply…";
    else if (mode === "tara") waitingLine = "This message has no reply yet";
  }
  const listRef = useRef<VirtuosoHandle | null>(null);
  // Follow-the-bottom bookkeeping: true while the reader is at the end of the
  // thread (so new messages should keep scrolling them down). Fed by Virtuoso.
  const atBottomRef = useRef(true);
  const lastIdRef = useRef("");
  // The traveller for whom a "New messages ↓" pill is showing ("" = none).
  const [newFor, setNewFor] = useState("");
  const hasNew = !!code && newFor === code;
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let inFlight = false; // never stack requests behind a slow one
    let again = false; // the last poll was cut short by the server: go again straight away
    let tick = 0;
    let fails = 0; // consecutive failed refreshes: one slow poll is retried quietly, not shown as an error
    let lastOkAt = Date.now(); // the last refresh that worked: the warning is only true once the screen is really out of date

    // First load / no real thread yet: the newest page of the real WhatsApp thread,
    // falling back to the Tara/chatbot-be view if it's empty. Usage still comes from
    // chatbot-be. A failure is kept distinct from "empty" so an outage never reads as
    // "no conversation".
    function fullLoad(): Promise<void> {
      const realP = getRealWhatsAppMessages(code, { limit: PAGE_SIZE, phone: phoneRef.current })
        .then((d: any) => (d && Array.isArray(d.messages) ? d : { messages: [] }))
        .catch((e: any) => ({ __err: e }));
      return Promise.all([getChatbotConversation(code).catch((e: any) => ({ __err: e })), realP])
        .then(([data, real]: any[]) => {
          if (cancelled) return;
          const realOk = !real.__err;
          const dataOk = !(data && data.__err);
          const usage = dataOk && data && data.usage ? data.usage : null;
          if (realOk && real.messages.length > 0) {
            setConvo({
              ...emptyConvo(code), usage, loaded: true, source: "real",
              messages: real.messages.map(mapReal),
              hasMore: !!real.has_more, nextBefore: real.next_before || null,
            });
          } else if (dataOk && Array.isArray(data && data.messages) && data.messages.length > 0) {
            setConvo({
              ...emptyConvo(code), usage, loaded: true, source: "tara",
              messages: data.messages.map((m: any, i: number) => ({ ...m, id: "t-" + i })),
            });
          } else if (!realOk) {
            throw real.__err; // the thread read failed: not the same as an empty thread
          } else if (!dataOk) {
            throw data.__err;
          } else {
            setConvo({ ...emptyConvo(code), usage, loaded: true });
          }
        });
    }

    // Live poll: only what is newer than the last message held, merged in by id.
    function poll(newest: string, hadUsage: boolean): Promise<void> {
      const wantUsage = hadUsage && tick % USAGE_EVERY === 0;
      return Promise.all([
        getRealWhatsAppMessages(code, { after: newest, timeoutMs: 12000, phone: phoneRef.current }),
        wantUsage ? getChatbotConversation(code).catch(() => null) : Promise.resolve(null),
      ]).then(([r, conv]: any[]) => {
        if (cancelled) return;
        const incoming = ((r && r.messages) || []).map(mapReal);
        if (r && r.has_newer) again = true;
        setConvo((prev) => {
          if (prev.code !== code || prev.source !== "real") return prev;
          const merged = mergeMessages(prev.messages, incoming, prev.firstItemIndex);
          const nextUsage = conv && conv.usage ? conv.usage : prev.usage;
          if (!merged && prev.error === null && nextUsage === prev.usage) return prev;
          return { ...prev, ...(merged || {}), error: null, usage: nextUsage };
        });
      });
    }

    // A website-only chat (no WhatsApp thread) has no "only what is newer" read, so each refresh is the whole Tara
    // conversation. Refresh it every other tick (4s) with a limit of its own, and look for a WhatsApp thread
    // only now and then, instead of re-reading both in full every 2s.
    function pollTara(): Promise<void> {
      if (tick % TARA_RECHECK_REAL_EVERY === 0) return fullLoad(); // also notices a WhatsApp thread that has started
      return getChatbotConversation(code, { timeoutMs: TARA_POLL_TIMEOUT_MS }).then((data: any) => {
        if (cancelled) return;
        const next = Array.isArray(data && data.messages) ? data.messages : [];
        setConvo((prev) => {
          if (prev.code !== code || prev.source !== "tara") return prev;
          const a = prev.messages[prev.messages.length - 1], b = next[next.length - 1];
          const same = prev.messages.length === next.length && (a && a.content) === (b && b.content) && (a && a.at) === (b && b.at);
          const nextUsage = data && data.usage ? data.usage : prev.usage;
          if (same && prev.error === null && nextUsage === prev.usage) return prev;
          if (same) return { ...prev, error: null, usage: nextUsage };
          return { ...prev, error: null, usage: nextUsage, messages: next.map((m: any, i: number) => ({ ...m, id: "t-" + i })) };
        });
      });
    }

    function load(force?: boolean) {
      if (inFlight) return;
      const held = convoRef.current.code === code ? convoRef.current : null;
      if (!force && held && held.loaded && held.source === "tara" && tick % 2 === 1) { tick += 1; return; }
      inFlight = true;
      tick += 1;
      const snap = held;
      const newest = snap && snap.loaded && snap.source === "real" ? newestCursor(snap.messages) : null;
      (newest ? poll(newest, !!(snap && snap.usage)) : snap && snap.loaded && snap.source === "tara" ? pollTara() : fullLoad())
        .then(() => { fails = 0; lastOkAt = Date.now(); })
        .catch((err: any) => {
          if (cancelled) return;
          fails += 1;
          // Only worth showing once it has failed twice in a row AND nothing has refreshed for 20s: a stall that
          // the next poll recovers from is not a warning, and a stale screen is.
          if (snap && snap.loaded && (fails < 2 || Date.now() - lastOkAt < STALE_BEFORE_WARNING_MS)) return;
          // Keep whatever is already on screen for this traveller; just flag the failure.
          setConvo((prev) => ({
            ...(prev.code === code ? prev : emptyConvo(code)),
            error: (err && err.message) || "Could not load conversation.",
            loaded: true,
          }));
        })
        .finally(() => {
          inFlight = false;
          if (again && !cancelled) { again = false; load(); }
        });
    }
    reloadRef.current = () => load(true);
    load();
    const interval = setInterval(() => { if (!document.hidden) load(); }, POLL_MS); // live feel, but not in a background tab
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      reloadRef.current = null;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code]);

  // Scrolled to the top: fetch the page older than the oldest message held and
  // prepend it. Does nothing once the start of the thread has been reached.
  const loadOlder = useCallback(() => {
    const snap = convoRef.current;
    if (!code || snap.code !== code || snap.source !== "real" || !snap.hasMore || !snap.nextBefore) return;
    if (olderBusyRef.current === code) return;
    olderBusyRef.current = code;
    setConvo((prev) => (prev.code === code ? { ...prev, olderLoading: true, olderError: null } : prev));
    getRealWhatsAppMessages(code, { limit: PAGE_SIZE, before: snap.nextBefore, phone: phoneRef.current })
      .then((r: any) => {
        setConvo((prev) => {
          if (prev.code !== code) return prev;
          const merged = mergeMessages(prev.messages, ((r && r.messages) || []).map(mapReal), prev.firstItemIndex);
          return {
            ...prev, ...(merged || {}), olderLoading: false, olderError: null,
            hasMore: !!(r && r.has_more), nextBefore: (r && r.next_before) || null,
          };
        });
      })
      .catch((err: any) => {
        setConvo((prev) => (prev.code === code
          ? { ...prev, olderLoading: false, olderError: (err && err.message) || "Could not load earlier messages." }
          : prev));
      })
      .finally(() => { if (olderBusyRef.current === code) olderBusyRef.current = ""; });
  }, [code]);

  // New conversation: start pinned to the bottom. (Declared before the pill
  // effect so it runs first when both fire for the same switch.)
  useEffect(() => {
    atBottomRef.current = true;
    lastIdRef.current = "";
  }, [code]);

  // A message appended at the END while the reader has scrolled up to read
  // history: leave them there, just flag it. (Older pages prepended above, and
  // rows merged into the middle, don't change the last message, so never flag.)
  useEffect(() => {
    const last = messages.length ? messages[messages.length - 1].id : "";
    const prevLast = lastIdRef.current;
    lastIdRef.current = last;
    if (prevLast && last !== prevLast && !atBottomRef.current) setNewFor(code);
  }, [messages, code]);

  function jumpToBottom() {
    atBottomRef.current = true;
    setNewFor("");
    if (listRef.current) listRef.current.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
  }

  // If an advisor already paused Tara for this customer, open in advisor mode.
  // Until this answers (or fails) the mode buttons stay disabled / flagged, so
  // the advisor is never shown "Tara replies" while Tara is in fact paused.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getConversationHandoff(code)
      .then((d: any) => { if (!cancelled) setHandoff({ code, mode: d && d.paused ? "advisor" : "tara", status: "ready", websiteOnly: !!(d && d.no_phone) }); })
      .catch(() => { if (!cancelled) setHandoff({ code, mode: "tara", status: "error" }); });
    return () => { cancelled = true; };
  }, [code, handoffTick]);

  // Switch mode. "I'll reply" pauses Tara (tripagent.whatsapp_handoff.paused=true);
  // "Let Tara reply" and "Both" leave Tara active (paused=false).
  function chooseMode(next: Mode) {
    if (next === mode || modeSaving || !code || handoffStatus === "loading") return;
    const prev: HandoffState = { code, mode, status: handoffStatus, websiteOnly };
    // Optimistic: switch the UI (and reveal the message input) right away; the
    // handoff call runs in the background with a spinner on the buttons only.
    setHandoff({ code, mode: next, status: "ready", websiteOnly });
    setPendingMode(next);
    setModeSaving(true);
    setConversationHandoff(code, next === "advisor")
      .catch((err: any) => {
        setHandoff(prev); // revert
        alert((err && err.message) || "Could not change who replies — switched back.");
      })
      .finally(() => { setModeSaving(false); setPendingMode(null); });
  }

  // The advisor picks where the reply goes: "whatsapp" or "web" (the website chat), there only.
  function handleSend(channel: "whatsapp" | "web") {
    const text = draft.trim();
    if (!text || !code || sending) return;
    setSending(true);
    setSendingTo(channel);
    setSendError(null);
    const pending = pendingSendRef.current;
    if (!pending || pending.code !== code || pending.text !== text || pending.channel !== channel) {
      pendingSendRef.current = { code, text, id: newClientMsgId(), channel };
    }
    sendChatbotReply(code, text, pendingSendRef.current!.id, channel)
      .then((data: any) => {
        pendingSendRef.current = null;
        // Defensive: an older backend answered 200 with whatsapp.ok === false.
        if (data && data.whatsapp && data.whatsapp.ok === false) {
          throw new Error("Message was not delivered to WhatsApp: " + String(data.whatsapp.error || "unknown error").slice(0, 200));
        }
        setDraft("");
        // Optimistic: show it immediately as a desk reply; the next poll
        // confirms it from the database.
        // The `local-` row is swapped for the server's copy (by text) when a poll brings it in.
        atBottomRef.current = true;
        setNewFor("");
        setConvo((prev) => prev.code === code
          ? { ...prev, messages: [...prev.messages, { id: "local-" + newClientMsgId(), role: "assistant", content: text, at: Date.now(), channel: "advisor" }] }
          : prev);
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
        });
      })
      .catch((err: any) => {
        // Keep the draft so the advisor can retry; show the real reason inline.
        setSendError((err && err.message) || "Could not send reply.");
      })
      .finally(() => { setSending(false); setSendingTo(null); });
  }

  // Call: the customer's number, as a tel: link (the phone app / FaceTime / Teams, whatever this machine uses for calls);
  // the number is also copied, like the chatbot's own call button, so it can be pasted into any dialler.
  const callNumber = digits ? "+" + digits : "";
  function copyCallNumber() {
    if (!callNumber) return;
    try { Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(callNumber)).catch(() => {}); } catch { /* clipboard blocked: the tel: link still opens */ }
    toast(callNumber + " copied. Calling " + ((member && member.name) || "the customer") + "…", "success");
  }
  const customerName = (member && member.name) || "the customer";

  return (
    <Card
      className="taw-convo-card cv"
      title="Conversation"
      icon={<Icon name="chat" size={20} />}
      sub={member ? "with " + ((member && member.name) || code) : "no customer selected"}
      actions={member || siteChatLink || waLink ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {siteChatLink ? (
            <a
              href={siteChatLink}
              target="_blank"
              rel="noreferrer"
              className="cv-pill"
              title="Open this customer's Tara chat on the website, the same conversation they see"
              aria-label="Open this customer's Tara chat on the website"
            >
              <Icon name="sparkle" size={15} />
              Tara site
            </a>
          ) : null}
          {callNumber ? (
            <a
              href={"tel:" + callNumber}
              onClick={copyCallNumber}
              className="cv-iconbtn"
              title={"Call " + customerName + " · " + callNumber}
              aria-label={"Call " + customerName}
            >
              <Icon name="phone" size={17} />
            </a>
          ) : member ? (
            <span title="No phone number on file for this customer" style={{ display: "inline-flex" }}>
              <button type="button" className="cv-iconbtn" disabled aria-label="Call (no phone number on file)">
                <Icon name="phone" size={17} />
              </button>
            </span>
          ) : null}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="cv-iconbtn cv-iconbtn--wa"
              title="Open this customer's WhatsApp"
              aria-label="Open this customer's WhatsApp"
            >
              <WhatsAppLogo size={19} />
            </a>
          ) : null}
        </span>
      ) : null}
    >
      <MeshBackdrop id="admin-convo-mesh" />
      {!code ? (
        <div className="cv-muted" style={{ padding: "24px 10px", position: "relative" }}>
          This traveller has no access code on file, so there&apos;s no Tara conversation to show.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 480 }}>
          {(() => {
            const pl = presenceLine(presence, Date.now());
            return pl ? (
              <div aria-live="polite" className={"cv-presence" + (pl.online ? " is-online" : "")}>
                <i />
                {pl.text}
              </div>
            ) : null;
          })()}
          {usage && usage.capUsd ? (
            (() => {
              const pct = Math.min(100, Math.round((usage.spentUsd / usage.capUsd!) * 100));
              const danger = pct >= 90;
              return (
                <div className="cv-usage">
                  <div className="cv-usage__row">
                    <b>Claude usage</b>
                    <span>
                      ${usage.spentUsd.toFixed(2)} of ${usage.capUsd!.toFixed(2)} used · ${(usage.remainingUsd ?? 0).toFixed(2)} left
                    </span>
                  </div>
                  <div className="cv-usage__bar">
                    <div className={danger ? "is-danger" : ""} style={{ width: pct + "%" }} />
                  </div>
                  {usage.extraUsd && usage.extraUsd > 0 ? <div style={{ marginTop: 4 }}>Includes ${usage.extraUsd.toFixed(2)} added for this customer</div> : null}
                  {(usage.remainingUsd ?? 0) <= 0 ? (
                    <div role="alert" style={{ marginTop: 6, color: "var(--cv-amber)" }}>
                      Budget used up: Tara has stopped replying to this customer{canAddBudget ? "." : ". Ask an admin to add more."}
                    </div>
                  ) : null}
                  {canAddBudget ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <select value={topAmount} disabled={topBusy} onChange={(e) => setTopAmount(Number(e.target.value))} aria-label="Amount to add in US dollars"
                        style={{ background: "transparent", color: "inherit", border: "1px solid rgba(242,237,228,0.25)", borderRadius: 8, padding: "2px 6px", font: "inherit" }}>
                        {[5, 10, 20, 50].map((n) => <option key={n} value={n} style={{ color: "#111" }}>${n}</option>)}
                      </select>
                      <button type="button" className="cv-btn" disabled={topBusy} onClick={addBudget}>
                        {topBusy ? "Adding…" : "Add $" + topAmount + " for this customer"}
                      </button>
                      {topErr ? <span role="alert" style={{ color: "var(--cv-amber)" }}>{topErr}</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : usage ? (
            <div className="cv-usage">
              Claude usage: ${usage.spentUsd.toFixed(2)} (no cap set)
            </div>
          ) : null}
          {error && messages.length > 0 ? (
            <div role="alert" className="cv-banner">
              <span>
                {isConnectionError(error)
                  ? "The connection is slow, so new messages may be delayed. Showing the last messages loaded; retrying."
                  : <>Couldn&apos;t refresh: {error} Showing the last messages loaded.</>}
              </span>
              <button type="button" className="cv-link" onClick={() => reloadRef.current && reloadRef.current()}>
                Retry
              </button>
            </div>
          ) : null}
          <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", marginBottom: 12 }}>
          <div
            style={{
              flex: "1 1 auto", minHeight: 240, position: "relative", display: "flex", flexDirection: "column",
              padding: "6px 2px",
            }}
          >
            {loading && messages.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 12, padding: 20,
                }}
              >
                <span aria-hidden="true" className="cv-spin" style={{ width: 28, height: 28 }} />
                <span className="cv-muted">Loading conversation…</span>
              </div>
            ) : error && messages.length === 0 ? (
              <div role="alert" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }}>
                <div className="cv-err">{error}</div>
                <button type="button" className="cv-send" style={{ flex: "none", height: 34 }} onClick={() => reloadRef.current && reloadRef.current()}>
                  Retry
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="cv-muted" style={{ padding: 20 }}>
                No conversation with Tara yet.
              </div>
            ) : (
              <Virtuoso
                key={code}
                ref={listRef}
                style={{ position: "absolute", inset: 0, overflowX: "hidden" }}
                data={messages}
                firstItemIndex={firstItemIndex}
                initialTopMostItemIndex={{ index: "LAST", align: "end" }}
                computeItemKey={(_i, m) => m.id}
                startReached={loadOlder}
                atTopThreshold={120}
                atBottomThreshold={100}
                atBottomStateChange={(atBottom) => {
                  atBottomRef.current = atBottom;
                  if (atBottom) setNewFor("");
                }}
                followOutput={(atBottom) => (atBottom ? "smooth" : false)}
                context={{ hasMore, olderLoading, olderError, loadOlder }}
                components={{ Header: ConvoListHeader }}
                itemContent={(_i, m) => {
                  const isCustomer = m.role === "user" || m.role === "customer";
                  const caption = m.channel ? CHANNEL_CAPTION[m.channel] : undefined;
                  // An itinerary link in Tara's / the advisor's message is a card, as in the customer's chat, not a bare URL.
                  const trip = !isCustomer && typeof m.content === "string" ? pullTripLinks(m.content) : null;
                  const tripLinks = trip && trip.links.length ? trip : null;
                  return (
                    <div className="cv-row">
                      {caption ? (
                        <div
                          className="cv-label"
                          title={`Sent ${isCustomer ? "from" : "on"} ${caption.label}`}
                          style={{ alignSelf: isCustomer ? "flex-start" : "flex-end" }}
                        >
                          <i aria-hidden="true" style={{ background: caption.dot }} />
                          {caption.label}
                        </div>
                      ) : null}
                      <div className={"cv-msg " + (isCustomer ? "cv-msg--customer" : m.tara ? "cv-msg--tara" : "cv-msg--advisor")}>
                        <div className="cv-msg__who">
                          {isCustomer ? ((member && member.name) || "Customer") : m.tara ? "🤖 Tara" : m.real ? (m.sender || "Advisor") : "Tara"}
                        </div>
                        {tripLinks ? tripLinks.rest : m.content}
                        {m.at ? <div className="cv-msg__time">{fmtTime(m.at)}</div> : null}
                      </div>
                      {tripLinks ? tripLinks.links.map((l) => <TaraTripCard key={l.key} code={code} tripKey={l.key} url={l.url} />) : null}
                    </div>
                  );
                }}
              />
            )}
          </div>
          {hasNew ? (
            <button type="button" className="cv-newpill" onClick={jumpToBottom}>
              New messages ↓
            </button>
          ) : null}
          </div>

          {customerTyping ? (
            <div role="status" aria-label="The customer is typing" className="cv-typing">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ animationDelay: i * 0.18 + "s" }} />
              ))}
            </div>
          ) : null}

          <div className="cv-take">
            <div className="cv-take__title">Take over the chat with AI</div>
            <div className="cv-take__sub">
              Choose how to proceed. You can let Tara continue, or take over and reply as the advisor.
            </div>
            {handoffStatus === "loading" ? (
              <div role="status" className="cv-note">Checking who is replying…</div>
            ) : handoffStatus === "error" ? (
              <div role="alert" className="cv-note cv-note--err">
                Couldn&apos;t check whether Tara is paused for this traveller; the choice below may not match.{" "}
                <button type="button" className="cv-link" onClick={() => setHandoffTick((t) => t + 1)}>Retry</button>
              </div>
            ) : null}
            {websiteOnly ? (
              <div role="status" className="cv-note">
                No WhatsApp number on file: your replies go to this traveller&apos;s website chat.
              </div>
            ) : null}
            {waitingLine ? (
              <div role="status" className="cv-wait">
                <span>{waitingLine}</span>
                {mode === "tara" ? (
                  <button
                    type="button"
                    className="cv-send"
                    style={{ flex: "none", height: 32 }}
                    disabled={modeSaving || handoffStatus === "loading"}
                    onClick={() => chooseMode("advisor")}
                  >
                    I&apos;ll reply
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="cv-modes">
              {([
                { id: "tara", icon: "sparkle", title: "Let Tara reply", sub: "Tara will respond to the customer" },
                { id: "advisor", icon: "edit", title: "I'll reply", sub: "Tara waits for you" },
                { id: "both", icon: "people", title: "Both", sub: "You + Tara reply" },
              ] as const).map((o) => {
                const active = mode === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={"cv-mode" + (active ? " is-on" : "")}
                    disabled={modeSaving || handoffStatus === "loading"}
                    aria-pressed={active}
                    onClick={() => chooseMode(o.id)}
                  >
                    {pendingMode === o.id ? <Spinner /> : <Icon name={o.icon} size={16} />}
                    <b>{o.title}</b>
                    <small>{o.sub}</small>
                  </button>
                );
              })}
            </div>

            {takenOver ? (
              <>
                <div className="cv-composer">
                  <input
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        // Enter sends where the customer last wrote; the buttons let the advisor choose.
                        handleSend(defaultChannel);
                      }
                    }}
                    placeholder="Type your message..."
                  />
                </div>
                <div className="cv-sendrow">
                  {([
                    { ch: "whatsapp" as const, label: "Send to WhatsApp", off: websiteOnly },
                    { ch: "web" as const, label: "Send to website", off: false },
                  ]).map((b) => (
                    <button
                      key={b.ch}
                      type="button"
                      className={"cv-send" + (b.ch === defaultChannel ? " is-primary" : "")}
                      disabled={!draft.trim() || sending || b.off}
                      title={b.off ? "No WhatsApp number on file for this traveller" : b.ch === "whatsapp" ? "Send this message to the customer's WhatsApp only" : "Send this message to the customer's website chat only"}
                      onClick={() => handleSend(b.ch)}
                    >
                      {sendingTo === b.ch ? <Spinner /> : null}
                      {b.label}
                    </button>
                  ))}
                </div>
                {sendError ? (
                  <div role="alert" className="cv-note cv-note--err" style={{ marginTop: 6, marginBottom: 0 }}>{sendError}</div>
                ) : null}
                <div className="cv-foot">
                  <span>
                    {mode === "both" ? "You and Tara are both replying" : "You are currently in advisor mode"}
                    {replyGoesTo ? ` · the customer last wrote on ${replyGoesTo}` : ""}
                  </span>
                </div>
              </>
            ) : null}
          </div>

        </div>
      )}
    </Card>
  );
}
