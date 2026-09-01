"use client";
/* =============================================================================
 * TripAgent — src/components/AcceptAdvisorInvite.tsx
 * Public, unauthenticated route (/join?token=...) for a newly-invited advisor
 * to set their own password and activate their account. Counterpart to
 * AdvisorLoginGate's LoginForm, but for FIRST-TIME account creation via a
 * backend/app/routers/advisor_team_router.py invite token instead of an
 * existing Supabase session — so unlike LoginForm/ForgotPasswordModal, this
 * never touches services/auth.ts (there is no session yet); it calls the
 * FastAPI backend directly via services/api.ts's acceptAdvisorInvite().
 *
 * Sits OUTSIDE app/(authenticated)/layout.tsx's AdvisorLoginGate on purpose
 * (see src/app/join/page.tsx) — mirrors App.jsx's own
 * <Route path="/join" element={<AcceptAdvisorInvite />} /> living outside
 * the Gate's <Route path="/*">.
 * ===========================================================================*/
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { acceptAdvisorInvite } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon } from "./ui";
import "../styles/advisor-login.css";

export function AcceptAdvisorInvite() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);

  if (!token) {
    return (
      <div className="tal-shell">
        <div className="tal-card">
          <div className="tal-brand">
            <Icon name="alert" size={20} />
            <span>TripAgent</span>
          </div>
          <h1 className="tal-title">Invitation not available</h1>
          <p className="tal-sub">No invitation token was found in this link. Ask your manager or head of business to send a new one.</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="tal-shell">
        <div className="tal-card">
          <div className="tal-brand">
            <Icon name="check" size={20} />
            <span>TripAgent</span>
          </div>
          <h1 className="tal-title">You're all set</h1>
          <p className="tal-sub">
            Your advisor account ({result.email}) has been created. Sign in with your email and the password you just set.
          </p>
          <a className="tal-btn" href="/">
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  function submit(ev?: React.FormEvent) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!password || !confirm || busy) return;
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    setErr("");
    acceptAdvisorInvite(token, password)
      .then((res: any) => {
        setBusy(false);
        setResult(res);
      })
      .catch((e: any) => {
        setBusy(false);
        setErr(errText(e) || "Could not activate this account.");
      });
  }

  return (
    <div className="tal-shell">
      <form className="tal-card" onSubmit={submit}>
        <div className="tal-brand">
          <Icon name="shield" size={20} />
          <span>TripAgent</span>
        </div>
        <div className="tal-eyebrow">You're invited</div>
        <h1 className="tal-title">Join the advisor team</h1>
        <p className="tal-sub">Set a password to activate your advisor account. You'll use your email and this password to sign in.</p>
        <div className="tal-field">
          <label htmlFor="tal-join-pw">Password</label>
          <input
            id="tal-join-pw"
            type="password"
            value={password}
            autoFocus
            required
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="tal-field">
          <label htmlFor="tal-join-pw-confirm">Confirm password</label>
          <input
            id="tal-join-pw-confirm"
            type="password"
            value={confirm}
            required
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {err ? (
          <div className="tal-error">
            <Icon name="alert" size={14} />
            {err}
          </div>
        ) : null}
        <button className="tal-btn" type="submit" disabled={busy}>
          {busy ? "Activating…" : "Set password & activate account"}
        </button>
        <p className="tal-hint">This link was sent to your work email by your manager or head of business.</p>
      </form>
    </div>
  );
}
