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
 * ===========================================================================*/
import { useState } from "react";
import { inviteCustomer } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon } from "./ui";

export function InviteCustomerForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function submit(ev?: any) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!form.name || !form.email || busy) return;
    setBusy(true);
    setError("");
    inviteCustomer({ customer_name: form.name, customer_email: form.email })
      .then(() => {
        setBusy(false);
        setSuccess(true);
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
            <div className="taw-banner taw-banner--info">
              <Icon name="check" size={16} />
              Invitation sent to {form.email}.
            </div>
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
              <input className="taw-input" type="text" value={form.name} disabled={busy} onChange={(e) => setForm({ name: e.target.value, email: form.email })} />
            </div>
            <div className="taw-field">
              <label>Customer email</label>
              <input className="taw-input" type="email" value={form.email} disabled={busy} onChange={(e) => setForm({ name: form.name, email: e.target.value })} />
            </div>
            <div className="taw-modal-actions">
              <button className="taw-btn" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button className="taw-btn taw-btn--primary" disabled={busy || !form.name || !form.email} onClick={submit}>
                {busy ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
