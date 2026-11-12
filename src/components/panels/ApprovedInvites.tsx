"use client";
/* =============================================================================
 * Approved invitations: what an advisor does after approving someone — share the
 * link in one tap (copy / WhatsApp), see whether the email reached them, send it
 * again or a reminder, give a new code when it ran out, let more people join
 * through it (seats), take a seat back. Also the "new super key" form.
 * The backend is adminbe's /admin/access-requests/{id}/... and /admin/super-keys.
 * ===========================================================================*/
import { useState } from "react";
import {
  siteCreateSuperKey,
  siteNudgeInvite,
  siteReissueInvite,
  siteResendInvite,
  siteRevokeInviteSeat,
  siteSetInviteSeats,
} from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, fmtDate, fmtTime } from "../../lib/advisorHelpers";
import { Empty, Spinner, Icon } from "../ui";
import {
  SEAT_CHOICES,
  daysLeftText,
  emailNote,
  prettyCode,
  reminderNote,
  seatChoiceLabel,
  seatsText,
  shareMessage,
  whatsappUrl,
} from "../../lib/inviteShare";

/** Copies text; falls back to a temporary textarea where the clipboard API is not allowed (an http page, an old browser). */
export function copyText(text: string, done: string) {
  const ok = () => toast(done, "success");
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      ok();
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", "error");
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
  else fallback();
}

interface ShareProps {
  code: string;
  link: string;
  phone?: string | null;
  firstName?: string | null;
  advisor?: string | null;
}

/** The ways to hand the invitation over: copy the link, copy the code, copy the whole message, or open it in WhatsApp. */
export function ShareBar({ code, link, phone, firstName, advisor }: ShareProps) {
  const message = shareMessage({ firstName, link, code, advisorName: advisor });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <a
        className="taw-btn taw-btn--accent taw-btn--sm"
        href={whatsappUrl(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        title={phone ? "Open WhatsApp to " + phone + " with the message ready" : "Open WhatsApp and choose who to send it to"}
      >
        <Icon name="chat" size={13} /> WhatsApp
      </a>
      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => copyText(link, "Link copied")}>
        <Icon name="note" size={13} /> Copy link
      </button>
      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => copyText(prettyCode(code).replace("-", ""), "Code copied")}>
        <Icon name="note" size={13} /> Copy code
      </button>
      <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => copyText(message, "Message copied")}>
        <Icon name="note" size={13} /> Copy message
      </button>
    </div>
  );
}

const noteColour: any = { ok: "var(--ok, #2f7d4f)", bad: "var(--danger, #b3441f)", warn: "var(--warn, #a8741a)", wait: "var(--taupe)" };

function Note({ tone, text }: { tone: string; text: string }) {
  return <div style={{ fontSize: 12.5, marginTop: 6, color: noteColour[tone] || "var(--taupe)" }}>{text}</div>;
}

// ApprovedRequestsList: requests an advisor approved, each with whether the person has
// claimed their code yet (Claimed / Pending / Expired / No code), and everything needed to
// share it, chase it and widen it.
export function ApprovedRequestsList({ rows, loading, onChanged }: { rows: any[]; loading: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const claimed = rows.filter((r) => r.claim_status === "claimed").length;
  const waiting = rows.filter((r) => r.claim_status === "pending").length;
  const due = rows.filter((r) => r.reminder).length;

  const badge = (r: any) => {
    if (r.claim_status === "claimed") return { cls: "success", text: "Claimed" + (r.claimed_at ? " " + fmtDate(r.claimed_at) : "") };
    if (r.claim_status === "pending") {
      const left = daysLeftText(r.days_left);
      return { cls: "warn", text: "Pending" + (left ? ", " + left : r.expires_at ? ", code expires " + fmtDate(r.expires_at) : "") };
    }
    if (r.claim_status === "expired") return { cls: "danger", text: "Code expired, not claimed" };
    return { cls: "info", text: "No code issued" };
  };

  function run(key: string, call: () => Promise<any>, done: (out: any) => string) {
    setBusy(key);
    call()
      .then((out: any) => {
        setBusy(null);
        const bad = out && out.email_sent === false && out.email_error;
        toast(bad ? done(out) + " The email did not go through: " + out.email_error : done(out), bad ? "error" : "success");
        onChanged();
      })
      .catch((e: any) => {
        setBusy(null);
        toast(errText(e), "error");
      });
  }

  if (loading && !rows.length) return <div className="taw-skel" style={{ height: 96 }} />;
  if (!rows.length) return <Empty icon={<Icon name="inbox" size={28} />}>No approved requests yet.</Empty>;
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 10 }}>
        {claimed} claimed · {waiting} waiting to claim · {rows.length} approved
        {due ? " · " + due + (due === 1 ? " needs a reminder" : " need a reminder") : ""}
      </div>
      <div className="taw-qlist">
        {rows.map((r: any) => {
          const b = badge(r);
          const mail = emailNote(r);
          const remind = reminderNote(r);
          const seats = seatsText(r);
          const pending = r.claim_status === "pending";
          const choices = SEAT_CHOICES.includes(r.seats) ? SEAT_CHOICES : [...SEAT_CHOICES, r.seats].sort((a, c) => a - c);
          return (
            <div key={r.id} className="taw-qrow" style={{ display: "block" }}>
              <div className="taw-qrow-top">
                <span className="taw-qtype taw-icrow">
                  <Icon name="user" size={13} />
                  {r.name}
                </span>
                <span className={cx("taw-status", "taw-status--" + b.cls)}>{b.text}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
                {r.email} · {r.phone}
                {r.city ? " · " + r.city : ""}
              </div>
              {r.destination || r.travel_date ? (
                <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 5 }}>
                  {r.destination ? "Wants to go: " + r.destination : ""}
                  {r.destination && r.travel_date ? " · " : ""}
                  {r.travel_date ? "When: " + r.travel_date : ""}
                </div>
              ) : null}
              <div style={{ fontSize: 12, color: "var(--taupe)", marginTop: 5 }}>
                Approved{r.approved_by ? " by " + r.approved_by : ""}
                {r.approved_at ? " on " + fmtDate(r.approved_at) + " " + fmtTime(r.approved_at) : ""}
                {r.code ? " · Code " : ""}
                {r.code ? <b style={{ fontFamily: "monospace" }}>{r.pretty_code || r.code}</b> : null}
                {seats ? " · " + seats : ""}
              </div>

              {mail ? <Note tone={mail.tone} text={mail.text} /> : null}
              {remind ? <Note tone={remind.tone} text={remind.text} /> : null}

              {pending && r.link ? <ShareBar code={r.code} link={r.link} phone={r.phone} firstName={r.first_name} advisor={r.approved_by} /> : null}

              {r.claim_status === "pending" || r.claim_status === "expired" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {pending ? (
                    <>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy === r.id + ":resend"} onClick={() => run(r.id + ":resend", () => siteResendInvite(r.id), () => "Invitation email sent again to " + r.email + ".")}>
                        {busy === r.id + ":resend" ? <Spinner /> : <Icon name="mail" size={13} />} Email again
                      </button>
                      <button
                        className={cx("taw-btn", r.reminder ? "taw-btn--accent" : "taw-btn--ghost", "taw-btn--sm")}
                        disabled={busy === r.id + ":nudge"}
                        onClick={() => run(r.id + ":nudge", () => siteNudgeInvite(r.id), () => "Reminder sent to " + r.email + ".")}
                      >
                        {busy === r.id + ":nudge" ? <Spinner /> : <Icon name="bell" size={13} />} Send reminder
                      </button>
                    </>
                  ) : null}
                  <button
                    className={cx("taw-btn", r.claim_status === "expired" ? "taw-btn--accent" : "taw-btn--ghost", "taw-btn--sm")}
                    disabled={busy === r.id + ":reissue"}
                    onClick={() => {
                      if (pending && !window.confirm("Make a new code for " + r.name + "? The current one stops working straight away.")) return;
                      run(r.id + ":reissue", () => siteReissueInvite(r.id), () => "New code made and emailed to " + r.email + ".");
                    }}
                  >
                    {busy === r.id + ":reissue" ? <Spinner /> : <Icon name="refresh" size={13} />} New code
                  </button>
                </div>
              ) : null}
              {r.claim_status === "expired" && r.link ? (
                <div style={{ fontSize: 12.5, color: "var(--taupe)", marginTop: 6 }}>Their old code no longer works. New code makes a fresh one and sends it.</div>
              ) : null}

              {r.code && r.claim_status !== "expired" ? (
                <div style={{ marginTop: 10, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Icon name="people" size={13} />
                  <label htmlFor={"seats-" + r.id}>Who can join with this invitation</label>
                  <select
                    id={"seats-" + r.id}
                    className="taw-sel taw-sel--sm"
                    value={r.seats}
                    disabled={busy === r.id + ":seats"}
                    onChange={(e) => run(r.id + ":seats", () => siteSetInviteSeats(r.id, Number(e.target.value)), (o: any) => (o.seats > 1 ? "Up to " + o.seats + " people can now join with " + r.name + "'s invitation." : "Only " + r.name + " can use this invitation."))}
                  >
                    {choices.map((n: number) => (
                      <option key={n} value={n}>
                        {seatChoiceLabel(n)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {Array.isArray(r.joined) && r.joined.length ? (
                <div style={{ marginTop: 8, fontSize: 12.5 }}>
                  <div style={{ color: "var(--taupe)", marginBottom: 4 }}>Joined through this invitation</div>
                  {r.joined.map((j: any) => (
                    <div key={j.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                      <span style={{ flex: 1 }}>
                        <b>{j.name || "Guest"}</b>
                        {j.email ? " · " + j.email : ""}
                        {j.claimed_at ? " · " + fmtDate(j.claimed_at) : ""}
                        {j.status === "revoked" ? " · access taken back" : ""}
                      </span>
                      {j.status !== "revoked" ? (
                        <button
                          className="taw-btn taw-btn--ghost taw-btn--sm"
                          disabled={busy === j.code}
                          onClick={() => {
                            if (!window.confirm("Take back " + (j.name || "this person") + "'s access? They are signed out and cannot sign back in. The place becomes free.")) return;
                            run(j.code, () => siteRevokeInviteSeat(j.code), () => (j.name || "Their") + " access has been taken back.");
                          }}
                        >
                          {busy === j.code ? <Spinner /> : <Icon name="x" size={12} />} Take back
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

// NewSuperKeyForm: a fixed code anyone can enter, with a label so you know what it was for and an optional end date.
const KEY_DAYS = [
  { v: "", label: "Never ends" },
  { v: "1", label: "1 day" },
  { v: "7", label: "7 days" },
  { v: "30", label: "30 days" },
  { v: "90", label: "90 days" },
];

export function NewSuperKeyForm({ onCreated }: { onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);

  function create() {
    if (!label.trim()) {
      toast("Give the key a label, so you can tell what it was for.", "error");
      return;
    }
    setBusy(true);
    siteCreateSuperKey({ label: label.trim(), code: code.trim() || undefined, expires_in_days: days ? Number(days) : undefined })
      .then((k: any) => {
        setBusy(false);
        setLabel("");
        setCode("");
        setDays("");
        toast("Super key " + prettyCode(k.code) + " is on. Anyone can enter with it" + (k.expires_at ? " until " + fmtDate(k.expires_at) : "") + ".", "success");
        onCreated();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  return (
    <div className="taw-qrow" style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>New super key</div>
      <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 10 }}>
        A fixed code anyone can enter with no approval, good for an event or a campaign. Each person who enters gets a private guest login.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input className="taw-input" style={{ minWidth: 190, padding: "6px 10px", fontSize: 12.5 }} placeholder="Label, e.g. Jaipur gala" aria-label="Super key label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        <input className="taw-input" style={{ width: 150, padding: "6px 10px", fontSize: 12.5, fontFamily: "monospace", textTransform: "uppercase" }} placeholder="Code (optional)" aria-label="Super key code, optional" value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 9))} />
        <select className="taw-sel taw-sel--sm" aria-label="When the key ends" value={days} onChange={(e) => setDays(e.target.value)}>
          {KEY_DAYS.map((d) => (
            <option key={d.v} value={d.v}>
              {d.label}
            </option>
          ))}
        </select>
        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busy} onClick={create}>
          {busy ? <Spinner /> : <Icon name="plus" size={13} />} Create super key
        </button>
      </div>
    </div>
  );
}
