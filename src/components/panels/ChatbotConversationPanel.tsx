"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ChatbotConversationPanel.tsx
 *
 * "Conversation" panel for the Enquiries Console — shows a customer's live
 * conversation with Tara (the chatbot), fetched by their invitation/access
 * code through adminbe's GET /admin/conversation/{code} (which proxies
 * chatbot-be's /api/ops/history/{code}). Polls every 5s for a live feel.
 *
 * Action: "WhatsApp" opens wa.me to the customer's number. (The earlier
 *   "Export .txt + WhatsApp" button was removed.)
 *
 * Self-contained + portable: it only needs a `member` with a code field
 * (invitation_code / customer_code / code) and a `phone`. Mount it wherever a
 * customer is selected. In this repo it's rendered by WorkbenchTab's centre
 * column when a member is picked without an enquiry.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { getChatbotConversation, getRealWhatsAppMessages, sendChatbotReply, siteMembers, getConversationHandoff, setConversationHandoff } from "../../services/api";
import { Card, Icon, Spinner } from "../ui";

interface ConvoMessage {
  role: string;
  content: string;
  at?: number | null;
  sender?: string;
  tara?: boolean; // Tara's AI reply (vs a human advisor)
  real?: boolean; // true = raw WhatsApp message (not Tara's)
  parts?: string[] | null;
}

interface Usage {
  spentUsd: number;
  capUsd: number | null;
  remainingUsd: number | null;
}

function memberCode(member: any): string {
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

export function ChatbotConversationPanel({ member }: any) {
  const baseCode = memberCode(member);
  const [fallbackCode, setFallbackCode] = useState("");
  const memberKey = member ? String(member.id || member.member_id || "") : "";
  useEffect(() => {
    setFallbackCode("");
    if (baseCode) return;
    const fromUrl = codeFromUrl();
    if (fromUrl) {
      setFallbackCode(fromUrl);
      return;
    }
    const ids = member ? [member.id, member.member_id].filter(Boolean) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const id of ids) {
        for (const col of ["id", "member_id"]) {
          try {
            const rows: any = await siteMembers(`select=invitation_code&${col}=eq.${encodeURIComponent(String(id))}`);
            const c = Array.isArray(rows) && rows[0] && rows[0].invitation_code;
            if (c && !cancelled) { setFallbackCode(String(c)); return; }
          } catch { /* column may not exist / not allowed — try the next */ }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [baseCode, memberKey]);
  const code = baseCode || fallbackCode;
  const digits = waDigits(member && member.phone);
  const waLink = digits ? "https://wa.me/" + digits : null;

  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Takeover mode: "tara" (default) | "advisor" (Tara paused) | "both" (Tara keeps replying).
  const [mode, setMode] = useState<"tara" | "advisor" | "both">("tara");
  const [modeSaving, setModeSaving] = useState(false);
  const [pendingMode, setPendingMode] = useState<"tara" | "advisor" | "both" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const takenOver = mode !== "tara";
  const listRef = useRef<HTMLDivElement | null>(null);
  // Follow-the-bottom bookkeeping: true while the reader is within ~100px of the
  // end of the thread (so new messages should keep scrolling them down).
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!code) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    function load() {
      setLoading(true);
      // Prefer the real WhatsApp thread; fall back to the Tara/chatbot-be view
      // if it's empty or the call fails. Usage still comes from chatbot-be.
      const realP = getRealWhatsAppMessages(code)
        .then((d: any) => (Array.isArray(d) ? d : []))
        .catch(() => []);
      Promise.all([getChatbotConversation(code).catch((e: any) => ({ __err: e })), realP])
        .then(([data, real]: any[]) => {
          if (cancelled) return;
          if (data && data.__err && real.length === 0) throw data.__err;
          if (real.length > 0) {
            setMessages(real.map((m: any) => ({
              role: m.sender_type === "customer" ? "user" : "assistant",
              tara: m.sender_type === "tara",
              content: m.message, real: true, sender: m.sender_name,
              at: m.created_at ? new Date(m.created_at).getTime() : null,
            })));
          } else {
            setMessages(Array.isArray(data && data.messages) ? data.messages : []);
          }
          setUsage(data && data.usage ? data.usage : null);
          setError(null);
        })
        .catch((err: any) => {
          if (cancelled) return;
          setError((err && err.message) || "Could not load conversation.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    const interval = setInterval(load, 5000); // poll for a live feel
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [code]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const grew = messages.length > prevCountRef.current;
    const first = prevCountRef.current === 0;
    prevCountRef.current = messages.length;
    if (atBottomRef.current) {
      // Reader is following the thread: stay pinned to the newest message.
      // (Scrolls the list itself, never the page around it.)
      el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
    } else if (grew) {
      // Reader scrolled up to read history: leave them there, just flag it.
      setHasNew(true);
    }
  }, [messages]);

  // New conversation: start pinned to the bottom with nothing flagged.
  useEffect(() => {
    atBottomRef.current = true;
    prevCountRef.current = 0;
    setHasNew(false);
  }, [code]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    atBottomRef.current = near;
    if (near) setHasNew(false);
  }

  function jumpToBottom() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = true;
    setHasNew(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // If an advisor already paused Tara for this customer, open in advisor mode.
  useEffect(() => {
    setMode("tara");
    if (!code) return;
    let cancelled = false;
    getConversationHandoff(code)
      .then((d: any) => { if (!cancelled && d && d.paused) setMode("advisor"); })
      .catch(() => { /* leave the default; the card still works */ });
    return () => { cancelled = true; };
  }, [code]);

  // Switch mode. "I'll reply" pauses Tara (tripagent.whatsapp_handoff.paused=true);
  // "Let Tara reply" and "Both" leave Tara active (paused=false).
  function chooseMode(next: "tara" | "advisor" | "both") {
    if (next === mode || modeSaving || !code) return;
    const prev = mode;
    // Optimistic: switch the UI (and reveal the message input) right away; the
    // handoff call runs in the background with a spinner on the buttons only.
    setMode(next);
    setPendingMode(next);
    setModeSaving(true);
    setConversationHandoff(code, next === "advisor")
      .catch((err: any) => {
        setMode(prev); // revert
        alert((err && err.message) || "Could not change who replies — switched back.");
      })
      .finally(() => { setModeSaving(false); setPendingMode(null); });
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !code || sending) return;
    setSending(true);
    setSendError(null);
    sendChatbotReply(code, text)
      .then((data: any) => {
        // Defensive: an older backend answered 200 with whatsapp.ok === false.
        if (data && data.whatsapp && data.whatsapp.ok === false) {
          throw new Error("Message was not delivered to WhatsApp: " + String(data.whatsapp.error || "unknown error").slice(0, 200));
        }
        setDraft("");
        // Optimistic: show it immediately as a desk reply; the next poll
        // confirms it from the database.
        atBottomRef.current = true;
        setMessages((prev) => [...prev, { role: "assistant", content: text, at: Date.now() }]);
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
          This traveller has no access code on file, so there's no Tara conversation to show.
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
          <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", marginBottom: 12 }}>
          <div
            ref={listRef}
            onScroll={onListScroll}
            style={{
              flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
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
              <div style={{ fontSize: 13, color: "#B03434", textAlign: "center", padding: 20 }}>{error}</div>
            ) : messages.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: 20 }}>
                No conversation with Tara yet.
              </div>
            ) : (
              messages.map((m, i) => {
                const isCustomer = m.role === "user" || m.role === "customer";
                return (
                  <div
                    key={i}
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
                );
              })
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {([
                { id: "tara", icon: "sparkle", title: "Let Tara reply", sub: "Tara will respond to the customer" },
                { id: "advisor", icon: "edit", title: "I'll reply", sub: "You send the message" },
                { id: "both", icon: "people", title: "Both", sub: "You + Tara reply" },
              ] as const).map((o) => {
                const active = mode === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={modeSaving}
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
