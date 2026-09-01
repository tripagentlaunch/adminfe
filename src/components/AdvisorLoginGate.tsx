"use client";
/* =============================================================================
 * TripAgent — src/components/AdvisorLoginGate.tsx
 * Ported from web/js/advisor-login.js's Gate (window.TA_ADVISOR_LOGIN).
 * The advisor-facing auth gate for the Advisor Workbench:
 *   1. Signs an advisor in via lib/auth.js's signInWithPassword — real
 *      Supabase Auth (Phase 5 wired the real client in).
 *   2. Resolves the caller's DB-verified role by calling the ALREADY-DEPLOYED
 *      `advisor-console` function (action:"desk") via lib/api.js's
 *      callAuthed(). That function resolves a verified session's
 *      advisor_id/role SERVER-SIDE — using it here is reuse, not a new API.
 *   3. Exposes <AdvisorLoginGate render={(advisorId, role, signOut) => ...}>,
 *      matching the original's render-prop shape exactly.
 *
 * A caller who signs in but isn't provisioned as an active advisor row gets
 * an honest "not yet provisioned" screen — never a fabricated role.
 *
 * Dropped defensive checks that are now structurally impossible: the
 * original guarded every call with `if (!TA_AUTH || typeof TA_AUTH.x ===
 * "function")` because TA_AUTH was an optional global that might not have
 * loaded. lib/auth.js's exports are now real ES imports — always functions —
 * so those guards could never fire and were removed, same treatment given to
 * every other `TA_API && typeof TA_API.x === "function"` pattern across this
 * migration (e.g. OrdersBoard.jsx, EscalationQueue.jsx).
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { callAuthed } from "../services/api";
import { accessToken, ready, onChange, signInWithPassword, signOut as authSignOut, resetPasswordForEmail } from "../services/auth";
import { errText } from "../lib/advisorHelpers";
import { DEV_AUTOFILL_AVAILABLE, DEV_AUTOFILL_EMAIL, DEV_AUTOFILL_PASSWORD, IS_DEV } from "../lib/env";
import { Icon } from "./ui";

// Dev-only role-resolution cache (see AdvisorLoginGate's resolve()). Every
// mount — including a full browser reload, or a dev-server restart — re-hits
// the real advisor-console backend to re-verify role. That's the correct,
// deliberate security posture (never trust a stale cached role for a
// money/access-control decision) and stays untouched in production. Locally
// it just means near-every edit that forces a reload retriggers "Verifying
// your desk access…" for no reason, since the underlying Supabase session
// never actually changed. sessionStorage (cleared when the tab closes, never
// touching real persisted auth state) lets a dev skip the redundant network
// round-trip when re-resolving the SAME access token — a new sign-in/token
// always re-verifies for real.
const DEV_RESOLVE_CACHE_KEY = "ta_dev_resolved_session";
function devReadCachedResolve(token: string): { advisorId: string; role: string } | null {
  if (!IS_DEV || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEV_RESOLVE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token === token ? { advisorId: parsed.advisorId, role: parsed.role } : null;
  } catch {
    return null;
  }
}
function devWriteCachedResolve(token: string, advisorId: string, role: string) {
  if (!IS_DEV || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEV_RESOLVE_CACHE_KEY, JSON.stringify({ token, advisorId, role }));
  } catch {
    /* sessionStorage unavailable (private mode, quota) — just skip caching */
  }
}
import "../styles/advisor-login.css";

// Small inline eye / eye-off marks for the password visibility toggle. Local
// to this file (not the shared Icon set) — same stroke style (currentColor,
// 1.5 stroke, 24 viewBox) so it reads as part of the existing icon set.
function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}
function EyeOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.3 6.3C3.7 8 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 4.3-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

// TEMP DEBUG (remove after root-causing "Not yet provisioned") ---------------
// Kept from the original verbatim — same precedent as lib/api.js's
// callAuthed() debug logging from Phase 1 (a port, not a rewrite).
const DEBUG_TAG = "[TAL_DEBUG]";
function maskJwt(t: any) {
  if (!t || typeof t !== "string") return t === "" ? "<empty>" : String(t);
  if (t.length <= 20) return t.slice(0, 4) + "…(" + t.length + " chars)";
  return t.slice(0, 12) + "…" + t.slice(-6) + " (" + t.length + " chars)";
}
// -----------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  advisor: "Advisor",
  agent: "Advisor",
  manager: "Manager",
  duty_manager: "Manager",
  ops: "Manager",
  supervisor: "Manager",
  finance: "Admin",
  head_of_business: "Admin",
  admin: "Admin",
};
export function roleLabel(role: any) {
  return ROLE_LABEL[String(role || "").toLowerCase()] || "Advisor";
}

// resolveAdvisorSession() — after a Supabase Auth session exists, ask the
// already-deployed advisor-console function to resolve who this caller is.
// lib/api.js already attaches the session JWT as the bearer whenever one
// exists, so this call is server-verified, not client-asserted.
function resolveAdvisorSession(): Promise<any> {
  const jwt = accessToken();
  console.log(DEBUG_TAG, "1. accessToken() ->", maskJwt(jwt));
  if (!jwt) {
    // No verified session JWT yet — never let this call go out under the
    // anon key (server would read that as "not provisioned" for a reason
    // that has nothing to do with provisioning). Caller must await
    // auth.js's ready() before invoking resolve().
    console.warn(DEBUG_TAG, "no_session_jwt — refusing to call advisor-console under the anon key");
    return Promise.reject(new Error("no_session_jwt"));
  }
  console.log(DEBUG_TAG, "2. calling callAuthed('advisor-console', {action:'desk'}) with Authorization: Bearer", maskJwt(jwt));
  return callAuthed("advisor-console", { action: "desk" })
    .then((res: any) => {
      console.log(DEBUG_TAG, "3. advisor-console raw response ->", JSON.stringify(res));
      if (!res || !res.ok || !res.advisor_id) {
        console.warn(
          DEBUG_TAG,
          "6. advisor_not_provisioned thrown because:",
          !res ? "res is falsy (no body parsed)" : !res.ok ? "res.ok is false, server error = " + JSON.stringify(res.error || res) : "res.ok is true but res.advisor_id is missing/empty:",
          res
        );
        throw new Error("advisor_not_provisioned");
      }
      console.log(DEBUG_TAG, "4/5. resolved advisor_id =", res.advisor_id, " caller_role =", res.caller_role);
      return { advisorId: String(res.advisor_id), role: res.caller_role || "advisor" };
    })
    .catch((e: any) => {
      console.error(DEBUG_TAG, "resolveAdvisorSession() rejected ->", e && e.message, e);
      throw e;
    });
}

// ForgotPasswordModal — asks for the registered advisor email, then calls
// Supabase's resetPasswordForEmail. Supabase does not confirm whether an
// account exists for a given email (anti-enumeration by design), so a
// successful call always shows the same "sent" message regardless of
// whether the address is registered; only a genuine request failure (bad
// email format, network error, rate limit) surfaces as an error.
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  function submit(ev?: any) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setErr("");
    resetPasswordForEmail(email)
      .then((res: any) => {
        setBusy(false);
        if (res && res.error) {
          const msg = (res.error.message || "").toLowerCase();
          if (msg.indexOf("not found") !== -1 || msg.indexOf("invalid") !== -1) {
            setErr("Email not found.");
          } else {
            setErr(res.error.message || "Could not send reset email.");
          }
          return;
        }
        setSent(true);
      })
      .catch((e: any) => {
        setBusy(false);
        setErr(errText(e) || "Email not found.");
      });
  }

  return (
    <div
      className="tal-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tal-modal">
        <div className="tal-brand">
          <Icon name="mail" size={20} />
          <span>TripAgent</span>
        </div>
        <h1 className="tal-title" style={{ fontSize: "20px" }}>
          Reset your password
        </h1>
        {sent ? (
          <div>
            <div className="tal-success">
              <Icon name="check" size={14} />
              Password reset email sent.
            </div>
            <p className="tal-sub">Check {email} for a link to set a new password.</p>
            <button className="tal-btn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="tal-sub">Enter your registered advisor email — we'll send a link to reset your password.</p>
            <div className="tal-field">
              <label htmlFor="tal-forgot-email">Work email</label>
              <input id="tal-forgot-email" type="email" value={email} autoFocus required autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
            </div>
            {err ? (
              <div className="tal-error">
                <Icon name="alert" size={14} />
                {err}
              </div>
            ) : null}
            <div className="tal-modal-row">
              <button className="tal-btn tal-btn--ghost" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="tal-btn" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Accepts optional overrides so Autofill can sign in with the just-set
  // values immediately, instead of racing React's state batching (email/pw
  // state wouldn't be updated yet if this read them via closure in the same
  // tick setEmail/setPw were called). Goes through the SAME real
  // signInWithPassword() Supabase call either way — never a bypass.
  function submit(ev?: any, overrideEmail?: string, overridePw?: string) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const e = overrideEmail ?? email;
    const p = overridePw ?? pw;
    if (!e || !p || busy) return;
    setBusy(true);
    setErr("");
    console.log(DEBUG_TAG, "0. signInWithPassword(", e, ") called");
    signInWithPassword(e, p)
      .then((res: any) => {
        console.log(DEBUG_TAG, "0. signInWithPassword resolved, session present =", !!(res && res.data && res.data.session), " error =", res && res.error);
        if (res && res.error) throw new Error(res.error.message || "Sign-in failed.");
        setBusy(false);
        onSignedIn();
      })
      .catch((e: any) => {
        setBusy(false);
        setErr(errText(e) || "Sign-in failed. Check your details and try again.");
      });
  }

  // Autofill — dev-only convenience (see src/lib/env.ts). Fills the visible
  // fields AND immediately signs in with them, so design work isn't blocked
  // on typing real credentials each time. Never rendered outside
  // NEXT_PUBLIC_APP_ENV=development, and never renders at all unless a real
  // advisor login is set in .env.local.
  function autofillAndSignIn() {
    setEmail(DEV_AUTOFILL_EMAIL);
    setPw(DEV_AUTOFILL_PASSWORD);
    submit(undefined, DEV_AUTOFILL_EMAIL, DEV_AUTOFILL_PASSWORD);
  }

  return (
    <>
      <form className="tal-card" onSubmit={submit}>
        <div className="tal-brand">
          <Icon name="shield" size={20} />
          <span>TripAgent</span>
        </div>
        <div className="tal-eyebrow">Advisor Desk</div>
        <h1 className="tal-title">Sign in</h1>
        <p className="tal-sub">Internal access for TripAgent advisors, managers and admins.</p>
        <div className="tal-field">
          <label htmlFor="tal-email">Work email</label>
          <input id="tal-email" type="email" value={email} autoFocus required autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="tal-field">
          <label htmlFor="tal-pw">Password</label>
          <div className="tal-pwrow">
            <input id="tal-pw" type={showPw ? "text" : "password"} value={pw} required autoComplete="current-password" onChange={(e) => setPw(e.target.value)} />
            <button
              type="button"
              className="tal-pw-toggle"
              aria-label={showPw ? "Hide password" : "Show password"}
              title={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw(!showPw)}
            >
              {showPw ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
        </div>
        <div className="tal-form-row">
          <button type="button" className="tal-forgot" onClick={() => setForgotOpen(true)}>
            Forgot password?
          </button>
          {DEV_AUTOFILL_AVAILABLE ? (
            <button type="button" className="tal-autofill" onClick={autofillAndSignIn} disabled={busy}>
              Autofill
            </button>
          ) : null}
        </div>
        {err ? (
          <div className="tal-error">
            <Icon name="alert" size={14} />
            {err}
          </div>
        ) : null}
        <button className="tal-btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="tal-hint">Access is limited to provisioned advisor accounts. Contact an admin if you don't have one yet.</p>
      </form>
      {forgotOpen ? <ForgotPasswordModal onClose={() => setForgotOpen(false)} /> : null}
    </>
  );
}

function NotProvisioned({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="tal-card">
      <div className="tal-brand">
        <Icon name="alert" size={20} />
        <span>TripAgent</span>
      </div>
      <h1 className="tal-title">Not yet provisioned</h1>
      <p className="tal-sub">You're signed in, but this account isn't linked to an active advisor desk yet. Ask an admin to provision your access.</p>
      <button className="tal-btn tal-btn--ghost" type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdvisorLoginGate — wraps the whole app. Stages: checking -> signedout ->
// resolving -> (ready | denied). Only "ready" calls props.render(advisorId,
// role, signOut).
// ---------------------------------------------------------------------------
export function AdvisorLoginGate({ render }: { render: (advisorId: string, role: string, signOut: () => void) => any }) {
  const [stage, setStage] = useState("checking");
  const [sess, setSess] = useState<any>(null);
  // A ref (not state) so the onChange listener below — registered once and
  // never re-registered — always reads the LATEST in-flight status instead
  // of the value captured when the effect first ran.
  const busyRef = useRef(false);

  function resolve() {
    if (busyRef.current) {
      console.log(DEBUG_TAG, "resolve() skipped — already busy");
      return;
    }
    // Dev-only shortcut — see devReadCachedResolve()'s docblock. Production
    // always falls through to the real resolveAdvisorSession() call below.
    const token = accessToken();
    const cached = token ? devReadCachedResolve(token) : null;
    if (cached) {
      console.log(DEBUG_TAG, "Gate.resolve() — dev cache hit, skipping advisor-console round-trip", cached);
      (window as any).TA_ROLE = cached.role;
      setSess(cached);
      setStage("ready");
      return;
    }
    busyRef.current = true;
    console.log(DEBUG_TAG, "Gate.resolve() starting -> stage=resolving");
    setStage("resolving");
    resolveAdvisorSession()
      .then((s: any) => {
        console.log(DEBUG_TAG, "Gate.resolve() succeeded -> stage=ready", s);
        busyRef.current = false;
        (window as any).TA_ROLE = s.role; // read throughout the workbench (canSeeMargin/canDecideVisa)
        if (token) devWriteCachedResolve(token, s.advisorId, s.role);
        setSess(s);
        setStage("ready");
      })
      .catch((e: any) => {
        console.warn(DEBUG_TAG, 'Gate.resolve() failed -> stage=denied ("Not yet provisioned") reason:', e && e.message);
        busyRef.current = false;
        setStage("denied");
      });
  }

  function signOut() {
    authSignOut();
    (window as any).TA_ROLE = null;
    if (IS_DEV && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(DEV_RESOLVE_CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
    setSess(null);
    setStage("signedout");
  }

  useEffect(() => {
    // Await the SAME promise auth.js uses internally to set _token, instead
    // of running our own independent getSession() — two parallel calls race,
    // and this one used to sometimes win before _token was populated, so
    // resolve() fired and sent the anon key instead of the real JWT.
    ready()
      .then(() => {
        const jwt = accessToken();
        console.log(DEBUG_TAG, "initial ready() settled, accessToken() ->", maskJwt(jwt));
        if (jwt) resolve();
        else setStage("signedout");
      })
      .catch((e: any) => {
        console.error(DEBUG_TAG, "initialCheck rejected", e);
        setStage("signedout");
      });
    onChange((tok: any) => {
      console.log(DEBUG_TAG, "onChange fired, token ->", maskJwt(tok));
      if (tok) {
        resolve();
      } else {
        (window as any).TA_ROLE = null;
        busyRef.current = false;
        setSess(null);
        setStage("signedout");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "checking" || stage === "resolving") {
    return (
      <div className="tal-shell">
        <div className="tal-card tal-card--loading">
          <span className="tal-spin" />
          <p>{stage === "checking" ? "Checking your session…" : "Verifying your desk access…"}</p>
        </div>
      </div>
    );
  }
  if (stage === "signedout") {
    return (
      <div className="tal-shell">
        <LoginForm onSignedIn={resolve} />
      </div>
    );
  }
  if (stage === "denied") {
    return (
      <div className="tal-shell">
        <NotProvisioned onSignOut={signOut} />
      </div>
    );
  }
  return render(sess.advisorId, sess.role, signOut);
}
