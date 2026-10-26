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
import { getChatbotConversation, getRealWhatsAppMessages, sendChatbotReply, siteMembers, getConversationHandoff, setConversationHandoff, getMemberCode } from "../../services/api";
import { Card, Icon, Spinner } from "../ui";

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
      <div role="status" aria-live="polite" style={{ ...HEADER_BOX, color: "#8A7650" }}>
        <span
          aria-hidden="true"
          style={{
            width: 14, height: 14, borderRadius: "50%", display: "inline-block",
            border: "2px solid rgba(184,148,95,.25)", borderTopColor: "#B8945F",
            animation: "tawspin .8s linear infinite",
          }}
        />
        Loading earlier messages…
      </div>
    );
  }
  if (olderError) {
    return (
      <div role="alert" style={{ ...HEADER_BOX, color: "#B03434" }}>
        <span>Couldn&apos;t load earlier messages.</span>
        <button type="button" onClick={loadOlder}
          style={{ background: "none", border: "none", padding: 0, color: "#8A5A2B", fontWeight: 600, cursor: "pointer", fontSize: 11.5 }}>
          Retry
        </button>
      </div>
    );
  }
  if (!hasMore) return <div style={{ ...HEADER_BOX, color: "#A39A88" }}>Start of conversation</div>;
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
  const digits = waDigits(member && member.phone);
  const waLink = digits ? "https://wa.me/" + digits : null;

  const [convo, setConvo] = useState<ConvoState>(() => emptyConvo(""));
  const cur = convo.code === code ? convo : null;
  const messages = cur ? cur.messages : NO_MESSAGES;
  const usage = cur ? cur.usage : null;
  const error = cur ? cur.error : null;
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
  const pendingSendRef = useRef<{ code: string; text: string; id: string } | null>(null);
  const takenOver = mode !== "tara";
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

    // First load / no real thread yet: the newest page of the real WhatsApp thread,
    // falling back to the Tara/chatbot-be view if it's empty. Usage still comes from
    // chatbot-be. A failure is kept distinct from "empty" so an outage never reads as
    // "no conversation".
    function fullLoad(): Promise<void> {
      const realP = getRealWhatsAppMessages(code, { limit: PAGE_SIZE })
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
        getRealWhatsAppMessages(code, { after: newest }),
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

    function load() {
      if (inFlight) return;
      inFlight = true;
      tick += 1;
      const snap = convoRef.current.code === code ? convoRef.current : null;
      const newest = snap && snap.loaded && snap.source === "real" ? newestCursor(snap.messages) : null;
      (newest ? poll(newest, !!(snap && snap.usage)) : fullLoad())
        .catch((err: any) => {
          if (cancelled) return;
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
    reloadRef.current = load;
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
    getRealWhatsAppMessages(code, { limit: PAGE_SIZE, before: snap.nextBefore })
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

  function handleSend() {
    const text = draft.trim();
    if (!text || !code || sending) return;
    setSending(true);
    setSendError(null);
    const pending = pendingSendRef.current;
    if (!pending || pending.code !== code || pending.text !== text) {
      pendingSendRef.current = { code, text, id: newClientMsgId() };
    }
    sendChatbotReply(code, text, pendingSendRef.current!.id)
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
          ? { ...prev, messages: [...prev.messages, { id: "local-" + newClientMsgId(), role: "assistant", content: text, at: Date.now() }] }
          : prev);
        requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
        });
      })
      .catch((err: any) => {
        // Keep the draft so the advisor can retry; show the real reason inline.
        setSendError((err && err.message) || "Could not send reply.");
      })
      .finally(() => setSending(false));
  }

  return (
    <Card
      className="taw-convo-card"
      title="Conversation"
      icon={<Icon name="chat" size={20} />}
      sub={member ? "with " + ((member && member.name) || code) : "no customer selected"}
    >
      {!code ? (
        <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: "24px 10px" }}>
          This traveller has no access code on file, so there&apos;s no Tara conversation to show.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 480 }}>
          {usage && usage.capUsd ? (
            (() => {
              const pct = Math.min(100, Math.round((usage.spentUsd / usage.capUsd!) * 100));
              const danger = pct >= 90;
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#6B6558", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Claude usage</span>
                    <span>
                      ${usage.spentUsd.toFixed(2)} of ${usage.capUsd!.toFixed(2)} used · ${(usage.remainingUsd ?? 0).toFixed(2)} left
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "#ECE7DC", overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: danger ? "#B03434" : "#B8945F" }} />
                  </div>
                </div>
              );
            })()
          ) : usage ? (
            <div style={{ fontSize: 11.5, color: "#6B6558", marginBottom: 12 }}>
              Claude usage: ${usage.spentUsd.toFixed(2)} (no cap set)
            </div>
          ) : null}
          {error && messages.length > 0 ? (
            <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: "#FBEDED", color: "#B03434", fontSize: 12 }}>
              <span>Couldn&apos;t refresh: {error} Showing the last messages loaded.</span>
              <button type="button" onClick={() => reloadRef.current && reloadRef.current()}
                style={{ background: "none", border: "none", padding: 0, color: "#8A5A2B", fontWeight: 600, cursor: "pointer", fontSize: 12, flex: "none" }}>
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
                {/* Gold ring spinner — reuses the app's existing `tawspin` keyframes. */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 28, height: 28, borderRadius: "50%", display: "inline-block",
                    border: "3px solid rgba(184,148,95,.25)", borderTopColor: "#B8945F",
                    animation: "tawspin .8s linear infinite",
                  }}
                />
                <span style={{ fontSize: 13, color: "#8A7650" }}>Loading conversation…</span>
              </div>
            ) : error && messages.length === 0 ? (
              <div role="alert" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }}>
                <div style={{ fontSize: 13, color: "#B03434", textAlign: "center" }}>{error}</div>
                <button type="button" className="taw-btn taw-btn--sm" onClick={() => reloadRef.current && reloadRef.current()}>
                  Retry
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: 20 }}>
                No conversation with Tara yet.
              </div>
            ) : (
              <Virtuoso
                key={code}
                ref={listRef}
                style={{ position: "absolute", inset: 0 }}
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
                  return (
                    <div style={{ display: "flex", flexDirection: "column", paddingBottom: 10 }}>
                      {caption ? (
                        <div
                          title={`Sent ${isCustomer ? "from" : "on"} ${caption.label}`}
                          style={{
                            alignSelf: isCustomer ? "flex-start" : "flex-end",
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 9.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase",
                            color: "#8A8070", margin: "0 4px 3px",
                          }}
                        >
                          <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: caption.dot }} />
                          {caption.label}
                        </div>
                      ) : null}
                      <div
                        style={{
                          alignSelf: isCustomer ? "flex-start" : "flex-end",
                          maxWidth: "82%",
                          background: isCustomer ? "#F1F3F5" : m.tara ? "#E3EEF9" : "#EDE3CF",
                          borderRadius: 10,
                          padding: "8px 12px",
                          fontSize: 13.5,
                          color: "#1F2430",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8070", marginBottom: 3 }}>
                          {isCustomer ? ((member && member.name) || "Customer") : m.tara ? "🤖 Tara" : m.real ? (m.sender || "Advisor") : "Tara"}
                        </div>
                        {m.content}
                        {m.at ? (
                          <div style={{ fontSize: 10, color: "#A39A88", marginTop: 4, textAlign: "right" }}>
                            {fmtTime(m.at)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </div>
          {hasNew ? (
            <button
              type="button"
              onClick={jumpToBottom}
              style={{
                position: "absolute", left: "50%", bottom: 10, transform: "translateX(-50%)",
                border: "1px solid #B8945F", background: "#FDF6EC", color: "#8A5A2B",
                borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,.12)",
              }}
            >
              New messages ↓
            </button>
          ) : null}
          </div>

          <div style={{ flex: "none", border: "1px solid #E9E1CF", borderRadius: 12, background: "#FDFBF6", padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2430", lineHeight: 1.25 }}>Take over the chat with AI</div>
            <div style={{ fontSize: 11.5, color: "#8A8070", margin: "2px 0 8px", lineHeight: 1.3 }}>
              Choose how to proceed. You can let Tara continue, or take over and reply as the advisor.
            </div>
            {handoffStatus === "loading" ? (
              <div role="status" style={{ fontSize: 11.5, color: "#8A7650", marginBottom: 8 }}>Checking who is replying…</div>
            ) : handoffStatus === "error" ? (
              <div role="alert" style={{ fontSize: 11.5, color: "#B03434", marginBottom: 8 }}>
                Couldn&apos;t check whether Tara is paused for this traveller; the choice below may not match.{" "}
                <button type="button" onClick={() => setHandoffTick((t) => t + 1)}
                  style={{ background: "none", border: "none", padding: 0, color: "#8A5A2B", fontWeight: 600, cursor: "pointer", fontSize: 11.5 }}>
                  Retry
                </button>
              </div>
            ) : null}
            {websiteOnly ? (
              <div role="status" style={{ fontSize: 11.5, color: "#8A7650", marginBottom: 8 }}>
                No WhatsApp number on file: your replies go to this traveller&apos;s website chat.
              </div>
            ) : null}
            {waitingLine ? (
              <div
                role="status"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  border: "1px solid #E6D3A8", background: "#FDF6EC", borderRadius: 8, padding: "7px 10px", marginBottom: 8,
                  fontSize: 12, color: "#8A5A2B", fontWeight: 600,
                }}
              >
                <span>{waitingLine}</span>
                {mode === "tara" ? (
                  <button
                    type="button"
                    className="taw-btn taw-btn--sm"
                    disabled={modeSaving || handoffStatus === "loading"}
                    onClick={() => chooseMode("advisor")}
                  >
                    I&apos;ll reply
                  </button>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
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
                    disabled={modeSaving || handoffStatus === "loading"}
                    aria-pressed={active}
                    onClick={() => chooseMode(o.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center",
                      padding: "6px 6px", borderRadius: 8, cursor: modeSaving ? "wait" : "pointer",
                      border: active ? "1.5px solid #B8945F" : "1px solid #E1E4E8",
                      background: active ? "#FDF6EC" : "#fff", color: active ? "#8A5A2B" : "#1F2430",
                    }}
                  >
                    {pendingMode === o.id ? <Spinner /> : <Icon name={o.icon} size={16} style={{ color: active ? "#B8945F" : "#9098A8" }} />}
                    <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>{o.title}</span>
                    <span style={{ fontSize: 10.5, color: "#8A8070", lineHeight: 1.2 }}>{o.sub}</span>
                  </button>
                );
              })}
            </div>

            {takenOver ? (
              <>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type your message..."
                    style={{ flex: 1, border: "1px solid #E1E4E8", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, outline: "none" }}
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
                {sendError ? (
                  <div role="alert" style={{ marginTop: 6, fontSize: 12, color: "#B03434", lineHeight: 1.35 }}>{sendError}</div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11.5, color: "#8A8070" }}>
                  <span>{mode === "both" ? "You and Tara are both replying" : "You are currently in advisor mode"}</span>
                  <button
                    type="button"
                    disabled={modeSaving}
                    onClick={() => chooseMode("tara")}
                    style={{ background: "none", border: "none", padding: 0, color: "#8A5A2B", fontWeight: 600, cursor: "pointer", fontSize: 11.5 }}
                  >
                    ← Return to Tara
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {waLink ? (
            <div style={{ flex: "none", display: "flex", justifyContent: "flex-start" }}>
              <a
                className="taw-btn"
                href={waLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  border: "1px solid #B8945F", color: "#8A5A2B", background: "#FDF6EC", textDecoration: "none",
                }}
              >
                <Icon name="chat" size={15} />
                WhatsApp
              </a>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
