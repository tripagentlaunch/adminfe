"use client";
/* =============================================================================
 * TripAgent — src/services/auth.ts
 * Supabase Auth session provider. Ported from web/js/auth.js (window.TA_AUTH)
 * into real ES module exports.
 *
 * Phase 5: now uses the real @supabase/supabase-js npm package's createClient()
 * instead of checking for a window.supabase UMD global loaded by a CDN
 * <script> tag. Every exported function name/behavior is unchanged from the
 * Phase 1 port — only how `_client` gets constructed differs. The fail-open
 * shape is preserved for the one case that can still happen with a real
 * import (createClient() throwing on bad config): every auth method still
 * guards on `_client` and rejects/no-ops rather than throwing.
 *
 * WHY THIS EXISTS (Gate 0, Stage 2 — see docs/adr/0001-auth-and-isolation.md)
 * Today api.js sends only the PUBLISHABLE (anon) key as the Authorization bearer,
 * so edge functions cannot tell who is calling and fall back to trusting the
 * client-supplied member_id. This shim creates a Supabase Auth client and, WHEN a
 * real user session exists, exposes its access JWT *synchronously* so api.js can
 * attach it as the Authorization bearer. The verifySession()-adopting functions
 * (data-read, refund-status, servicing-case, visa-application, quote-price) then
 * derive a TRUSTED member_id from that token instead of from the request body.
 *
 * The cached token is kept fresh via onAuthStateChange so the accessor stays
 * synchronous (header builders cannot await).
 * ===========================================================================*/
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseConfig";

// Same project + publishable key as api.ts (anon key is browser-safe).
const URL = SUPABASE_URL;
const KEY = SUPABASE_KEY;

// Where Supabase sends the advisor back to after they click the password
// reset email link. Must also be added to Supabase Dashboard -> Authentication
// -> URL Configuration -> Redirect URLs, or resetPasswordForEmail's link will
// be rejected at click-time even though the email send itself succeeds.
const RESET_PASSWORD_REDIRECT_URL = "http://localhost:3000/web/reset-password.html";

var _token: string | null = null; // current access JWT; null => legacy (anon) path
var _client: any = null;
var _listeners: Array<(t: string | null) => void> = [];
// Resolves once the initial persisted-session probe has completed and
// _token is authoritative (populated or definitively null). A second,
// independent getSession() call (as advisor-login.js's Gate used to run)
// races this one and can resolve first, reading _token before it's set —
// callers needing a guaranteed-fresh accessToken() must await this promise
// instead of calling getSession() themselves.
var _ready: Promise<any> = Promise.resolve(null);

function notify() {
  for (var i = 0; i < _listeners.length; i++) {
    try {
      _listeners[i](_token);
    } catch (e) {
      /* never let a listener throw */
    }
  }
}

function init() {
  try {
    _client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (e) {
    _client = null;
    return;
  }

  // Seed the cached token from any persisted session, then track changes.
  // This is the ONE canonical initial session probe — _ready is the same
  // promise instance every caller awaits, so nobody can observe _token
  // before it's set.
  _ready = _client.auth
    .getSession()
    .then(function (res: any) {
      var s = res && res.data ? res.data.session : null;
      _token = s && s.access_token ? s.access_token : null;
      notify();
      return s;
    })
    .catch(function () {
      /* no session yet */
      _token = null;
      return null;
    });

  _client.auth.onAuthStateChange(function (_evt: any, session: any) {
    _token = session && session.access_token ? session.access_token : null;
    notify();
  });
}

// Synchronous accessor used by api.ts header builders. null => legacy path.
function accessToken() {
  return _token;
}

function isAuthed() {
  return !!_token;
}

function client() {
  return _client;
}

function getSession() {
  return _client
    ? _client.auth.getSession()
    : Promise.resolve({ data: { session: null } });
}

// Awaits the ONE canonical initial session probe. Resolves only after
// _token is authoritative — use this (not a fresh getSession() call)
// whenever the caller is about to read accessToken() and needs it fresh.
function ready() {
  return _ready;
}

function signInWithPassword(email: string, password: string) {
  if (!_client) return Promise.reject(new Error("auth unavailable"));
  return _client.auth.signInWithPassword({
    email: email,
    password: password,
  });
}

function signInWithOtp(email: string) {
  if (!_client) return Promise.reject(new Error("auth unavailable"));
  return _client.auth.signInWithOtp({ email: email });
}

function signOut() {
  if (!_client) return Promise.resolve();
  return _client.auth.signOut();
}

// resetPasswordForEmail(email) -> Promise<{data,error}>. Sends Supabase's
// built-in recovery email (delivered via the project's configured Resend/SMTP
// provider — no new backend endpoint). Supabase intentionally does not
// reveal whether the email is registered (anti-enumeration); a resolved
// promise with no error means the request was accepted, not that the
// account exists.
function resetPasswordForEmail(email: string) {
  if (!_client) return Promise.reject(new Error("auth unavailable"));
  return _client.auth.resetPasswordForEmail(email, {
    redirectTo: RESET_PASSWORD_REDIRECT_URL,
  });
}

// updatePassword(newPassword) -> Promise<{data,error}>. Used on
// reset-password.html once Supabase has established a recovery session
// from the emailed link (supabase-js auto-detects the token in the URL).
function updatePassword(newPassword: string) {
  if (!_client) return Promise.reject(new Error("auth unavailable"));
  return _client.auth.updateUser({ password: newPassword });
}

// -----------------------------------------------------------------------
// Passwordless member login (Gate 0, Stage 1/2). These talk to the
// `auth-otp` edge function with the SAME anon-key headers api.ts uses, then
// exchange the returned one-time token_hash for a real Supabase session via
// verifyOtp — at which point onAuthStateChange (above) updates _token and
// api.ts starts sending the user JWT as the bearer. Safe no-ops if the
// supabase-js client failed to load (CDN blocked).
// -----------------------------------------------------------------------

// requestCode(identifier[, channel]) -> Promise<parsed JSON>
// identifier = phone (any format) or email; channel optional ('sms' etc).
function requestCode(identifier: string, channel?: string) {
  var payload: any = { action: "request_code", identifier: identifier };
  if (channel) payload.channel = channel;
  return fetch(URL + "/functions/v1/auth-otp", {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then(function (res) {
    return res.json().catch(function () {
      return { ok: false, reason: "BAD_RESPONSE" };
    });
  });
}

// verifyCode(identifier, code) -> Promise<{ ok, member_id? }>
// On a verified response carrying session_bridge, exchanges the one-time
// token_hash for a real session. The existing onAuthStateChange then caches
// the access token, so api.ts immediately authenticates as this member.
function verifyCode(identifier: string, code: string) {
  return fetch(URL + "/functions/v1/auth-otp", {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "verify_code",
      identifier: identifier,
      code: code,
    }),
  })
    .then(function (res) {
      return res.json().catch(function () {
        return { ok: false, reason: "BAD_RESPONSE" };
      });
    })
    .then(function (data: any) {
      if (!data || !data.ok || !data.session_bridge) {
        return {
          ok: false,
          reason: (data && data.reason) || "VERIFY_FAILED",
        };
      }
      if (!_client) {
        // No supabase-js to exchange the bridge — surface the gap honestly.
        return { ok: false, reason: "AUTH_UNAVAILABLE" };
      }
      var sb = data.session_bridge;
      return _client.auth
        .verifyOtp({
          token_hash: sb.token_hash,
          type: sb.type || "magiclink",
        })
        .then(function (res: any) {
          if (res && res.error) {
            return {
              ok: false,
              reason: res.error.message || "EXCHANGE_FAILED",
            };
          }
          // onAuthStateChange has now (or will imminently) set _token.
          var s = res && res.data ? res.data.session : null;
          if (s && s.access_token) {
            _token = s.access_token;
            notify();
          }
          return { ok: true, member_id: data.member_id || null };
        })
        .catch(function (e: any) {
          return {
            ok: false,
            reason: (e && e.message) || "EXCHANGE_FAILED",
          };
        });
    });
}

// Subscribe to token changes (fn receives the new token or null).
function onChange(fn: (t: string | null) => void) {
  if (typeof fn === "function") _listeners.push(fn);
}

init();

export {
  accessToken,
  isAuthed,
  client,
  getSession,
  ready,
  signInWithPassword,
  signInWithOtp,
  signOut,
  resetPasswordForEmail,
  updatePassword,
  requestCode,
  verifyCode,
  onChange,
};
