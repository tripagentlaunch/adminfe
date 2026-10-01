"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/queue/page.tsx
 * "Console" tab under Enquiries — the REAL Queue/Itinerary Builder/
 * Traveller Profile/Summary flow (WorkbenchTab.tsx), moved here 2026-08-31
 * from (workbench)/workbench/page.tsx. This is an actual move, not a
 * second instance: WorkbenchTab is wired to the SAME WorkbenchContext as
 * every other Advisor Workbench route, now provided once at the app root
 * (see WorkbenchDataProvider.tsx) instead of locally by the old
 * (workbench)/layout.tsx.
 *
 * InviteSomeoneButton (2026-09-29, direct spec) — a standalone "Invite
 * someone" button + modal, visible on this page. Generates a named
 * invite code (first 2 letters of customer name + HHMM generation time,
 * 12-hour no am/pm + first 2 letters of advisor name, e.g. BH0325AN) via
 * the backend's /admin/invite-customer-named-code endpoint (added
 * alongside invite_service.py's existing create_invitation_code()
 * pipeline — same email + site_invitation_codes row, just a different
 * code shape). No sign-in required on the recipient's end: the code is
 * entered directly on Customerfe's ClaimPage.
 * ===========================================================================*/
import { useState } from "react";
import { WorkbenchTab } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://127.0.0.1:8001";

function InviteSomeoneButton({ advisorName }: { advisorName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string } | null>(null);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setErr("Name, email and mobile are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${FASTAPI_BASE}/admin/invite-customer-named-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim(),
          advisor_name: advisorName,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setResult({ code: data.code });
    } catch (e: any) {
      setErr(e.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
    setResult(null);
    setErr("");
    setSubmitting(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #D9D2C0",
          background: "#785C12",
          color: "#FAF6EB",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Invite someone
      </button>

      {open ? (
        <div className="invite-overlay" onClick={reset}>
          <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="invite-hero">
              <button type="button" className="invite-close" onClick={reset}>
                ×
              </button>
              <div className="invite-hero-content">
                <h2>Invite someone</h2>
                <p>SHARE ACCESS TO THE TRAVEL CONSOLE</p>
                <span />
              </div>
            </div>

            <div className="invite-content">
              {!result ? (
                <>
                  <p className="invite-description">
                    Add a customer to TripAgent — they&apos;ll receive an email with a claim code, no sign-in required to accept.
                  </p>

                  <div className="invite-field">
                    <div className="invite-icon">♙</div>
                    <div className="invite-field-content">
                      <label htmlFor="invite-name">Name</label>
                      <input
                        id="invite-name"
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="invite-field">
                    <div className="invite-icon">✉</div>
                    <div className="invite-field-content">
                      <label htmlFor="invite-email">Email address</label>
                      <input
                        id="invite-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="invite-field">
                    <div className="invite-icon">⌕</div>
                    <div className="invite-field-content">
                      <label htmlFor="invite-phone">Mobile number</label>
                      <input
                        id="invite-phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  {err ? (
                    <p style={{ color: "#b03434", fontSize: 13, margin: "0 0 14px" }}>{err}</p>
                  ) : null}

                  <div className="invite-actions">
                    <button type="button" className="invite-cancel" onClick={reset}>
                      Cancel
                    </button>
                    <button type="button" className="invite-send" onClick={submit} disabled={submitting}>
                      <span>◇</span>
                      {submitting ? "Sending…" : "Send invitation"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="invite-description">
                    Invitation sent to <strong>{email}</strong>. Their code:
                  </p>
                  <div
                    style={{
                      textAlign: "center",
                      padding: "18px 0",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "#302a26",
                      border: "1px solid #d9d0c5",
                      borderRadius: 8,
                      marginBottom: 20,
                    }}
                  >
                    {result.code}
                  </div>
                  <div className="invite-actions">
                    <button type="button" className="invite-send" onClick={reset}>
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .invite-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(38, 32, 29, 0.48);
          backdrop-filter: blur(2px);
          z-index: 9999;
          padding: 24px;
        }
        .invite-modal {
          width: 475px;
          max-width: 100%;
          background: #fffdf9;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 30px 80px rgba(40, 28, 22, 0.28), 0 8px 25px rgba(40, 28, 22, 0.12);
          animation: inviteAppear 0.25s ease;
        }
        @keyframes inviteAppear {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .invite-hero {
          height: 200px;
          position: relative;
          background-image: linear-gradient(90deg, rgba(35, 29, 27, 0.18), rgba(35, 29, 27, 0.03)),
            url("/img/invite-mountain.jpg");
          background-size: cover;
          background-position: center;
        }
        .invite-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.22);
          color: white;
          font-size: 23px;
          line-height: 1;
          cursor: pointer;
          backdrop-filter: blur(5px);
          transition: 0.2s ease;
        }
        .invite-close:hover {
          background: rgba(255, 255, 255, 0.36);
        }
        .invite-hero-content {
          position: absolute;
          left: 32px;
          bottom: 26px;
          color: white;
        }
        .invite-hero-content h2 {
          margin: 0 0 8px;
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: 38px;
          font-weight: 600;
          line-height: 1;
        }
        .invite-hero-content p {
          margin: 0;
          font-family: Arial, sans-serif;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 2.3px;
        }
        .invite-hero-content span {
          display: block;
          width: 38px;
          height: 2px;
          background: #c58c8a;
          margin-top: 15px;
        }
        .invite-content {
          padding: 30px 32px 27px;
        }
        .invite-description {
          margin: 0 0 21px;
          color: #403a35;
          font-family: Inter, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.55;
        }
        .invite-field {
          height: 57px;
          display: flex;
          align-items: center;
          border: 1px solid #d9d0c5;
          background: #fffdfa;
          border-radius: 8px;
          margin-bottom: 14px;
          padding: 0 14px;
          transition: 0.2s ease;
        }
        .invite-field:focus-within {
          border-color: #6e2a38;
          box-shadow: 0 0 0 3px rgba(110, 42, 56, 0.08);
        }
        .invite-icon {
          width: 30px;
          color: #4d4540;
          font-size: 17px;
        }
        .invite-field-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .invite-field-content label {
          font-size: 10px;
          font-weight: 600;
          color: #514943;
          margin-bottom: 2px;
        }
        .invite-field-content input {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          padding: 0;
          color: #302a26;
          font-size: 13px;
          font-family: Inter, Arial, sans-serif;
        }
        .invite-field-content input::placeholder {
          color: #a69d95;
        }
        .invite-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 18px;
          margin-top: 25px;
        }
        .invite-cancel {
          border: none;
          background: transparent;
          color: #6c625c;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 12px 5px;
        }
        .invite-send {
          min-width: 180px;
          height: 43px;
          border: none;
          border-radius: 7px;
          background: #6e2a38;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: 0.2s ease;
        }
        .invite-send:hover {
          background: #54202b;
          transform: translateY(-1px);
        }
        .invite-send span {
          margin-right: 5px;
        }
        @media (max-width: 600px) {
          .invite-modal {
            width: 100%;
          }
          .invite-hero {
            height: 175px;
          }
          .invite-content {
            padding: 24px 22px;
          }
          .invite-hero-content {
            left: 24px;
          }
          .invite-hero-content h2 {
            font-size: 33px;
          }
          .invite-actions {
            flex-direction: column-reverse;
            align-items: stretch;
          }
          .invite-send,
          .invite-cancel {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

export default function ConsoleQueuePage() {
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, createOrder, member, selEnqId, pickEnquiry, pickMember, currentAdvisor } = useWorkbench();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px" }}>
        <InviteSomeoneButton advisorName={currentAdvisor ? currentAdvisor.name : ""} />
      </div>
      <WorkbenchTab
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        advisorId={advisorId}
        creating={creating}
        onCreateOrder={createOrder}
        member={member}
        selEnqId={selEnqId}
        onSelectEnquiry={pickEnquiry}
        onPickMember={pickMember}
      />
    </div>
  );
}
