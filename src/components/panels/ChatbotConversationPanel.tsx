"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ChatbotConversationPanel.tsx
 *
 * "Conversation" panel for the Enquiries Console — shows a customer's live
 * conversation with Tara (the chatbot), fetched by their invitation/access
 * code through adminbe's GET /admin/conversation/{code} (which proxies
 * chatbot-be's /api/ops/history/{code}). Polls every 5s for a live feel.
 *
 * Two actions:
 *   - "Export .txt + WhatsApp": downloads the transcript as a .txt to the
 *     advisor's machine AND opens WhatsApp to the customer's number. (A web
 *     link can't attach a file to WhatsApp, so the advisor drags the saved
 *     .txt into the chat that opens — closest possible to a one-click send.)
 *   - "Open WhatsApp": just opens wa.me to the customer's number.
 *
 * Self-contained + portable: it only needs a `member` with a code field
 * (invitation_code / customer_code / code) and a `phone`. Mount it wherever a
 * customer is selected. In this repo it's rendered by WorkbenchTab's centre
 * column when a member is picked without an enquiry.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { getChatbotConversation, sendChatbotReply } from "../../services/api";
import { Card, Icon, Spinner } from "../ui";

interface ConvoMessage {
  role: string;
  content: string;
  at?: number | null;
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

function buildTranscript(member: any, code: string, messages: ConvoMessage[]): string {
  const name = (member && member.name) || "Customer";
  const header = [
    `TripAgent — Tara conversation`,
    `Customer: ${name}`,
    `Access code: ${code}`,
    `Exported: ${new Date().toLocaleString()}`,
    "",
    "----------------------------------------",
    "",
  ];
  const lines = messages.map((m) => {
    const who = m.role === "assistant" ? "Tara" : m.role === "user" ? name : m.role;
    const stamp = m.at ? `[${fmtTime(m.at)}] ` : "";
    return `${stamp}${who}: ${m.content}`;
  });
  return header.concat(lines).join("\n") + "\n";
}

export function ChatbotConversationPanel({ member }: any) {
  const code = memberCode(member);
  const digits = waDigits(member && member.phone);
  const waLink = digits ? "https://wa.me/" + digits : null;

  const [messages, setMessages] = useState<ConvoMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [takenOver, setTakenOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!code) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    function load() {
      setLoading(true);
      getChatbotConversation(code)
        .then((data: any) => {
          if (cancelled) return;
          setMessages(Array.isArray(data && data.messages) ? data.messages : []);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function downloadTxt() {
    const text = buildTranscript(member, code, messages);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = ((member && member.name) || code || "customer").replace(/[^a-zA-Z0-9]+/g, "-");
    a.href = url;
    a.download = `tara-conversation-${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportToWhatsApp() {
    downloadTxt();
    if (waLink) window.open(waLink, "_blank", "noopener,noreferrer");
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !code || sending) return;
    setSending(true);
    sendChatbotReply(code, text)
      .then(() => {
        setDraft("");
        // Optimistic: show it immediately as a desk reply; the next poll
        // confirms it from the database.
        setMessages((prev) => [...prev, { role: "assistant", content: text, at: Date.now() }]);
      })
      .catch((err: any) => {
        alert((err && err.message) || "Could not send reply.");
      })
      .finally(() => setSending(false));
  }

  return (
    <Card
      title="Conversation"
      icon={<Icon name="chat" size={20} />}
      sub={member ? "with " + ((member && member.name) || code) : "no customer selected"}
    >
      {!code ? (
        <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: "24px 10px" }}>
          This traveller has no access code on file, so there's no Tara conversation to show.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: 480 }}>
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
          <div
            style={{
              flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10,
              padding: "6px 2px", marginBottom: 12,
            }}
          >
            {loading && messages.length === 0 ? (
              <div style={{ fontSize: 13, color: "#9098A8", textAlign: "center", padding: 20 }}>
                Loading conversation…
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
                      background: isCustomer ? "#F1F3F5" : "#EDE3CF",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontSize: 13.5,
                      color: "#1F2430",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8070", marginBottom: 3 }}>
                      {isCustomer ? ((member && member.name) || "Customer") : "Tara"}
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
            <div ref={bottomRef} />
          </div>

          {takenOver ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Reply as the desk — appears in the customer's chatbot…"
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
          ) : (
            <button
              className="taw-btn taw-btn--block"
              onClick={() => setTakenOver(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: "1px solid #B8945F", color: "#8A5A2B", background: "#FDF6EC", marginBottom: 6,
              }}
            >
              <Icon name="user" size={15} />
              Chat with Customer
            </button>
          )}
          {takenOver ? (
            <div style={{ fontSize: 11.5, color: "#8A8070", marginBottom: 10, textAlign: "center" }}>
              You're replying as an advisor — the AI assistant has paused for this conversation.
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="taw-btn taw-btn--primary"
              onClick={exportToWhatsApp}
              disabled={messages.length === 0}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
            >
              <Icon name="inbox" size={15} />
              Export .txt + WhatsApp
            </button>
            {waLink ? (
              <a
                className="taw-btn"
                href={waLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  border: "1px solid #B8945F", color: "#8A5A2B", background: "#FDF6EC", textDecoration: "none",
                }}
              >
                <Icon name="chat" size={15} />
                WhatsApp
              </a>
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: "#9098A8", marginTop: 8, textAlign: "center" }}>
            WhatsApp can't attach files via a link — the .txt downloads to your computer; drag it into the chat that opens.
          </div>
        </div>
      )}
    </Card>
  );
}
