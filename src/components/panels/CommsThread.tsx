"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsThread.tsx
 * Ported from web/js/advisor.js: CommsThread (line ~3750). A single
 * conversation transcript, with a live reply composer (comms-orchestrate).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime, commsChannelClass, threadStateClass, deliveryStateClass } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner } from "../ui";

export function CommsThread(props: any) {
  const conversationId = props.conversationId;
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const callComms = props.callComms;
  const onBack = props.onBack || (() => {});

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);

  // Reply composer state — the advisor REPLIES from the Workbench (was read-only).
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // Optimistically-shown sent replies (so the advisor sees their message land
  // immediately; the next thread refresh reconciles with the persisted spine).
  const [localSent, setLocalSent] = useState<any[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    callComms({ action: "thread", conversation_id: conversationId, limit: 100 })
      .then((res: any) => {
        setData(res || {});
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Send the advisor's reply to the member via the LIVE deployed comms spine
  // (comms-orchestrate). It composes the member-facing send, applies consent /
  // quiet-hours, and records the outbound row. Real WhatsApp/email transport is
  // gated on the BSP/Resend A-gate, so the response's `simulated` flag tells us
  // whether it actually went over a wire or is recorded for delivery once live.
  function sendReply() {
    const text = (reply || "").trim();
    if (!text || sending) return;
    const conv = (data && data.conversation) || {};
    const memberId = conv.member_id || null;
    if (!memberId) {
      toast("This conversation has no member to reply to.", "error");
      return;
    }
    if (typeof apiCall !== "function") {
      toast("Send transport unavailable.", "error");
      return;
    }
    setSending(true);
    const optimistic = {
      id: "local_" + Date.now(),
      body: text,
      direction: "outbound",
      channel: conv.channel || "advisor",
      delivery_status: "sending",
      created_at: new Date().toISOString(),
      sender: "You",
    };
    setLocalSent(localSent.concat([optimistic]));
    setReply("");
    // Pick a deliverable channel. In-app advisor threads (advisor/web/concierge)
    // have no real WhatsApp 24h window, so route those over durable email to
    // avoid the HSM-template gate; honour a real wa/sms/email channel otherwise.
    const convCh = String(conv.channel || "").toLowerCase();
    const sendCh = convCh === "whatsapp" || convCh === "sms" || convCh === "email" ? convCh : "email";
    apiCall("comms-orchestrate", {
      action: "orchestrate",
      advisor_id: advisorId || undefined,
      member_id: memberId,
      conversation_id: conversationId,
      kind: "advisor_reply",
      send_class: "transactional",
      channel: sendCh,
      subject: conv.subject || "A note from your advisor",
      body: text,
    })
      .then((res: any) => {
        const disp = res && res.disposition;
        const sent = res && (res.sent || disp === "send");
        const simulated = res && res.simulated;
        // Reflect the real outcome on the optimistic bubble.
        setLocalSent((prev) => prev.map((m: any) => (m.id === optimistic.id ? Object.assign({}, m, { delivery_status: sent ? (simulated ? "recorded" : "sent") : disp || "queued" }) : m)));
        if (sent && simulated) toast("Reply recorded — it will reach the member once live delivery is switched on.", "ok");
        else if (sent) toast("Reply sent to the member.", "ok");
        else toast("Reply held: " + (disp || "not delivered") + ".", "warn");
        // Reconcile against the persisted thread shortly after.
        window.setTimeout(load, 600);
      })
      .catch((e: any) => {
        setLocalSent((prev) => prev.map((m: any) => (m.id === optimistic.id ? Object.assign({}, m, { delivery_status: "failed" }) : m)));
        toast(errText(e), "error");
      })
      .then(() => setSending(false));
  }
  function onReplyKey(e: any) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendReply();
    }
  }

  const conv = (data && data.conversation) || {};
  const persisted = (data && data.messages) || [];
  const mem = conv.member_id ? membersById[conv.member_id] : null;
  const who = conv.member_name || (mem ? mem.name : null) || (conv.member_id ? "Member " + shortId(conv.member_id) : "Conversation");

  // Show persisted thread + any optimistic replies not yet reflected server-side
  // (matched out by identical body to avoid a brief duplicate after reconcile).
  const persistedBodies: any = {};
  persisted.forEach((m: any) => {
    if (m && m.body) persistedBodies[String(m.body).trim()] = true;
  });
  const pendingLocal = (localSent || []).filter((m: any) => !persistedBodies[String(m.body).trim()]);
  const messages = persisted.concat(pendingLocal);

  return (
    <div>
      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={onBack} aria-label="Back to inbox">
          <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
          Inbox
        </button>
        <span className="taw-icrow">
          <Icon name="compass" size={13} />
          {who}
        </span>
        {conv.channel ? <span className={cx("taw-qstate", commsChannelClass(conv.channel))}>{String(conv.channel)}</span> : null}
        {conv.status ? <span className={cx("taw-qstate", threadStateClass(conv.status))}>{String(conv.status)}</span> : null}
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh thread" style={{ marginLeft: "auto" }}>
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      </div>
      {conv.subject ? (
        <div className="taw-muted" style={{ marginBottom: 12 }}>
          {conv.subject}
        </div>
      ) : null}
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}

      {loading && data == null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="taw-skel" style={{ height: 52 }} />
          ))}
        </div>
      ) : messages.length ? (
        <div className="taw-thread" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m: any) => {
            const inbound = String(m.direction || "").toLowerCase() === "inbound";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: inbound ? "flex-start" : "flex-end" }}>
                <div
                  style={{
                    maxWidth: "78%",
                    borderRadius: 12,
                    padding: "10px 13px",
                    background: inbound ? "var(--bone,#FAF6EF)" : "var(--champagne,#F3E9D6)",
                    border: "1px solid var(--line2)",
                  }}
                >
                  <div className="taw-icrow" style={{ gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                    <span className={cx("taw-qstate", inbound ? "info" : "ok")}>{inbound ? "Member" : "TripAgent"}</span>
                    {m.channel ? <span className={cx("taw-qstate", commsChannelClass(m.channel))}>{String(m.channel)}</span> : null}
                    {m.delivery_status ? <span className={cx("taw-qstate", deliveryStateClass(m.delivery_status))}>{String(m.delivery_status)}</span> : null}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13 }}>{m.body || ""}</div>
                  {m.created_at ? (
                    <div className="taw-muted" style={{ marginTop: 5, fontSize: 11 }}>
                      {fmtDate(m.created_at) + " " + fmtTime(m.created_at) + (m.sender ? " · " + m.sender : "")}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Icon name="inbox" size={28} />}>No messages in this conversation yet.</Empty>
      )}

      {/* --- Reply composer — the advisor REPLIES from the Workbench ----------- */}
      <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div className="taw-icrow" style={{ gap: 8, marginBottom: 8 }}>
          <span className="taw-icrow" style={{ fontSize: 12, fontWeight: 600 }}>
            <Icon name="send" size={13} />
            Reply to {who}
          </span>
          {conv.channel ? <span className={cx("taw-qstate", commsChannelClass(conv.channel))}>{String(conv.channel)}</span> : null}
        </div>
        <textarea
          className="taw-input"
          style={{ width: "100%", minHeight: 76, resize: "vertical", lineHeight: 1.5, fontSize: 13 }}
          placeholder="Write a reply to the member… (⌘/Ctrl + Enter to send)"
          value={reply}
          disabled={sending}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={onReplyKey}
          aria-label="Reply to the member"
        />
        <div className="taw-icrow" style={{ gap: 10, marginTop: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="taw-muted" style={{ fontSize: 11, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Icon name="shield" size={12} />
            Sent via the secure comms spine. Live WhatsApp/email delivery activates with the BSP/Resend gate.
          </span>
          <button className="taw-btn taw-btn--primary taw-btn--sm" disabled={sending || !reply.trim()} onClick={sendReply} aria-label="Send reply to member">
            {sending ? <Spinner /> : <Icon name="send" size={14} />}
            {sending ? " Sending…" : " Send reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
