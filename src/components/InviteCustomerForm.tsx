"use client";
/* =============================================================================
 * TripAgent — src/components/InviteCustomerForm.tsx
 * NEW in Phase 5 — not a port of an existing original component. The original
 * codebase only had a per-member "Invite Customer" modal colocated inside
 * Member360 (web/js/advisor.js line ~1474-1503), which pre-fills from an
 * already-selected member and is really a re-invite affordance. inviteCustomer()
 * (lib/api.js) itself takes only { customer_name, customer_email } — it isn't
 * tied to an existing member row — so this is a standalone, shell-level form
 * for inviting a brand-new prospective customer from anywhere in the
 * Workbench, reusing the same taw-modal-* markup/classes as Member360's modal
 * for visual consistency.
 *
 * 2026-10-09: now issues the same invitation as everything else — an
 * 8-character code in site_invitation_codes via adminbe's
 * /admin/invite-customer-named-code (inviteCustomerNamedCode), the table
 * Customerfe's /claim redeems from. It used to call the legacy
 * inviteCustomer() (customer_invites, TRIP… codes), which /claim never
 * reads, so those invitations could not be claimed.
 * ===========================================================================*/
import { useState } from "react";
import { inviteCustomerNamedCode } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon } from "./ui";

export function InviteCustomerForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ code: string; emailSent: boolean; emailError: string } | null>(null);

  // Same rule as the website's Request Access form: 10 digits, starting 6-9.
  const phoneOk = /^[6-9]\d{9}$/.test(form.phone);

  function submit(ev?: any) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!form.name || !form.email || busy) return;
    if (!phoneOk) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    inviteCustomerNamedCode({ customer_name: form.name.trim(), customer_email: form.email.trim(), customer_phone: "+91" + form.phone })
      .then((data: any) => {
        setBusy(false);
        setSuccess({ code: data.code, emailSent: data.email_sent !== false, emailError: data.email_error || "" });
      })
      .catch((e: any) => {
        setBusy(false);
        setError(errText(e));
      });
  }

  return (
    <div className="taw-modal-overlay" onClick={onClose}>
      <div className="taw-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="taw-modal-title">Invite Customer</div>
        {error ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {error}
          </div>
        ) : null}
        {success ? (
          <>
            <div className={success.emailSent ? "taw-banner taw-banner--info" : "taw-banner taw-banner--err"}>
              <Icon name={success.emailSent ? "check" : "alert"} size={16} />
              {success.emailSent
                ? "Invitation sent to " + form.email + "."
                : "Code issued, but the email to " + form.email + " didn't send" + (success.emailError ? " (" + success.emailError + ")" : "") + " — share the code directly."}
            </div>
            <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: 22, letterSpacing: "0.14em", padding: "14px 0" }}>{success.code}</div>
            <div className="taw-modal-actions">
              <button className="taw-btn taw-btn--primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="taw-field">
              <label>Customer name</label>
              <input className="taw-input" type="text" value={form.name} disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="taw-field">
              <label>Customer email</label>
              <input className="taw-input" type="email" value={form.email} disabled={busy} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="taw-field">
              <label>Mobile number</label>
              <input
                className="taw-input"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={form.phone}
                disabled={busy}
                onChange={(e) => {
                  let d = e.target.value.replace(/\D/g, "");
                  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
                  else if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
                  setForm({ ...form, phone: d.slice(0, 10) });
                }}
              />
            </div>
            <div className="taw-modal-actions">
              <button className="taw-btn" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button className="taw-btn taw-btn--primary" disabled={busy || !form.name || !form.email || !phoneOk} onClick={submit}>
                {busy ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
