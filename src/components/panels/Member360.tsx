"use client";
/* =============================================================================
 * TripAgent — src/components/panels/Member360.tsx
 * Ported from web/js/advisor.js: Member360 (line ~1505) + its modal,
 * InviteCustomerModal (line ~1474, colocated here — it's only ever used by
 * Member360 in the original module too).
 * ===========================================================================*/
import { useState } from "react";
import { inviteCustomer } from "../../services/api";
import { errText, toast, pointsOn } from "../../lib/advisorHelpers";
import { Empty, Icon } from "../ui";

function InviteCustomerModal(props: any) {
  const { form, busy, error } = props;
  return (
    <div className="taw-modal-overlay" onClick={props.onCancel}>
      <div className="taw-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="taw-modal-title">Invite Customer</div>
        {error ? <div className="taw-banner taw-banner--err">{error}</div> : null}
        <div className="taw-field">
          <label>Customer name</label>
          <input
            className="taw-input"
            type="text"
            value={form.name}
            disabled={busy}
            onChange={(e) => props.onChange({ name: e.target.value, email: form.email })}
          />
        </div>
        <div className="taw-field">
          <label>Customer email</label>
          <input
            className="taw-input"
            type="email"
            value={form.email}
            disabled={busy}
            onChange={(e) => props.onChange({ name: form.name, email: e.target.value })}
          />
        </div>
        <div className="taw-modal-actions">
          <button className="taw-btn" disabled={busy} onClick={props.onCancel}>
            Cancel
          </button>
          <button className="taw-btn taw-btn--primary" disabled={busy} onClick={props.onSubmit}>
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Member360(props: any) {
  const m = props.member;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");

  if (!m) {
    return <Empty icon={<Icon name="user" size={28} />}>Select an enquiry to load the member's 360° profile.</Empty>;
  }

  const initials = (m.name || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const prefs = m.preferences || {};
  const visas = m.visa_held || {};
  const visaKeys = Object.keys(visas);
  const trips = m.past_trips || [];

  function openInvite() {
    setInviteForm({ name: m.name || "", email: m.email || "" });
    setInviteError("");
    setInviteOpen(true);
  }
  function closeInvite() {
    if (inviteBusy) return;
    setInviteOpen(false);
  }
  function submitInvite() {
    if (!inviteForm.name || !inviteForm.email) {
      setInviteError("Name and email are required.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    inviteCustomer({ customer_name: inviteForm.name, customer_email: inviteForm.email })
      .then(() => {
        setInviteBusy(false);
        setInviteOpen(false);
        toast("Invitation sent successfully.", "success");
      })
      .catch((e: any) => {
        setInviteBusy(false);
        setInviteError(errText(e));
      });
  }

  return (
    <div className="taw-m360 taw-fade-in">
      <div className="taw-m360-hero">
        <div className="taw-m360-ava">{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div className="taw-m360-name">
            {m.name}
            <span className="taw-chip taw-chip--tier" style={{ marginLeft: 8 }}>
              {m.tier || "STANDARD"}
            </span>
          </div>
          <div className="taw-m360-meta">
            {m.email || "—"}
            {m.phone ? " · " + m.phone : ""}
          </div>
        </div>
        <button className="taw-btn" style={{ marginLeft: "auto" }} onClick={openInvite}>
          Invite Customer
        </button>
      </div>

      {inviteOpen ? (
        <InviteCustomerModal
          form={inviteForm}
          busy={inviteBusy}
          error={inviteError}
          onChange={setInviteForm}
          onCancel={closeInvite}
          onSubmit={submitInvite}
        />
      ) : null}

      <div className="taw-stat-grid">
        {pointsOn() ? (
          <div className="taw-stat">
            <div className="k">Points balance</div>
            <div className="v ta-num">{(Number(m.points_balance) || 0).toLocaleString("en-IN")}</div>
          </div>
        ) : null}
        <div className="taw-stat">
          <div className="k">Nationality</div>
          <div className="v">{m.nationality || "—"}</div>
        </div>
        <div className="taw-stat">
          <div className="k">Passport</div>
          <div className="v">{m.passport_number || "—"}</div>
        </div>
        <div className="taw-stat">
          <div className="k">Passport expiry</div>
          <div className="v">{m.passport_expiry || "—"}</div>
        </div>
      </div>

      {prefs && Object.keys(prefs).length ? (
        <div>
          <div className="taw-sec-label">Preferences</div>
          <div className="taw-tags">
            {prefs.cabin ? <span className="taw-tag">Cabin: {prefs.cabin}</span> : null}
            {prefs.seat ? <span className="taw-tag">Seat: {prefs.seat}</span> : null}
            {prefs.meal ? <span className="taw-tag">Meal: {prefs.meal}</span> : null}
            {prefs.hotel_tier ? <span className="taw-tag">Hotel: {prefs.hotel_tier}</span> : null}
            {(prefs.airlines || []).map((a: any, i: number) => (
              <span key={"a" + i} className="taw-tag taw-icrow">
                <Icon name="flight" size={12} />
                {a}
              </span>
            ))}
            {(prefs.interests || []).map((it: any, i: number) => (
              <span key={"i" + i} className="taw-tag">
                {it}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {visaKeys.length ? (
        <div>
          <div className="taw-sec-label">Visas held</div>
          <div className="taw-tags">
            {visaKeys.map((k) => {
              const v = visas[k] || {};
              return (
                <span key={k} className="taw-tag taw-icrow">
                  <Icon name="visa" size={12} />
                  {k + (v.expiry ? " · exp " + v.expiry : "")}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {trips.length ? (
        <div>
          <div className="taw-sec-label">Past trips</div>
          <div className="taw-tags">
            {trips.map((t: any, i: number) => (
              <span key={i} className="taw-tag">
                {(t.dest || "?") + " · " + (t.year || "") + (t.product ? " · " + t.product : "")}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
