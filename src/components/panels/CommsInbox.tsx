"use client";
/* =============================================================================
 * TripAgent — src/components/panels/CommsInbox.tsx
 * Ported from web/js/advisor.js: CommsInbox (line ~3647). Inbox sub-view:
 * thread list ⇄ transcript.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { errText, shortId, fmtDate, fmtTime, queueSla, commsChannelClass, threadStateClass } from "../../lib/advisorHelpers";
import { Empty, Icon, Spinner } from "../ui";
import { CommsThread } from "./CommsThread";

export function CommsInbox(props: any) {
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const callComms = props.callComms;

  const [rows, setRows] = useState<any>(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<any>(null); // conversation_id when in transcript

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    if (!advisorId) {
      setRows([]);
      setNotice("Select an advisor to load their inbox.");
      setLoading(false);
      return;
    }
    const payload: any = { action: "inbox", advisor_id: advisorId, limit: 50 };
    if (channel) payload.channel = channel;
    if (status) payload.status = status;
    callComms(payload)
      .then((res: any) => {
        const list = (res && res.threads) || [];
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = errText(e);
        if (/advisor_id_required|403|forbidden|not permitted|unavailable|not found|404/i.test(msg)) {
          setRows([]);
          setNotice("The communications inbox is not live yet for this advisor.");
        } else {
          setErr(msg);
          setRows([]);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId, channel, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (openId) {
    return (
      <CommsThread
        conversationId={openId}
        advisorId={advisorId}
        membersById={membersById}
        callComms={callComms}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  const visible = rows || [];

  return (
    <div>
      <div className="taw-icrow" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select className="taw-sel taw-sel--sm" aria-label="Filter by channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
        <select className="taw-sel taw-sel--sm" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="waiting">Waiting</option>
          <option value="closed">Closed</option>
        </select>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh inbox">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="bell" size={16} />
          {notice}
        </div>
      ) : null}

      {loading && rows == null ? (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="taw-skel" style={{ height: 64 }} />
          ))}
        </div>
      ) : visible.length ? (
        <div className="taw-qlist">
          {visible.map((t: any) => {
            const mem = t.member_id ? membersById[t.member_id] : null;
            const name = t.member_name || (mem ? mem.name : null) || "Member " + shortId(t.member_id);
            const lastAt = t.last_inbound_at || t.last_outbound_at || null;
            const sla = queueSla(t.sla_due_at);
            return (
              <div
                key={t.id}
                className="taw-qrow"
                style={{ cursor: "pointer" }}
                onClick={() => setOpenId(t.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setOpenId(t.id);
                  }
                }}
              >
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-icrow">
                      <Icon name="compass" size={13} />
                      {name}
                    </span>
                    <span className={cx("taw-qstate", commsChannelClass(t.channel))}>{String(t.channel || "—")}</span>
                    {t.status ? <span className={cx("taw-qstate", threadStateClass(t.status))}>{String(t.status)}</span> : null}
                    {t.priority && Number(t.priority) > 0 ? <span className="taw-qbadge ta-num">P{Number(t.priority)}</span> : null}
                    {t.unread_count && Number(t.unread_count) > 0 ? <span className="taw-qbadge ta-num">{Number(t.unread_count)} unread</span> : null}
                  </div>
                  <div className="taw-qrow-meta">
                    {t.subject ? <span>{t.subject}</span> : null}
                    {lastAt ? <span className="taw-muted">Last activity {fmtDate(lastAt)} {fmtTime(lastAt)}</span> : null}
                    {t.sla_due_at ? (
                      <span className={cx("taw-qsla", sla.cls)}>
                        <Icon name="clock" size={11} />
                        {sla.label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="taw-qrow-actions">
                  <button
                    className="taw-btn taw-btn--ghost taw-btn--sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setOpenId(t.id);
                    }}
                  >
                    <Icon name="compass" size={13} />
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Icon name="inbox" size={28} />}>No conversations in this advisor's inbox.</Empty>
      )}
    </div>
  );
}
