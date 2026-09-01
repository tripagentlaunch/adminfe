// TripAgent — src/lib/env.ts
// App-level environment flag, deliberately separate from Next.js's own
// NODE_ENV (which is always "development" under `next dev` and
// "production" under any real build, regardless of where it's deployed —
// so it can't tell a local dev machine apart from staging). NEXT_PUBLIC_
// APP_ENV is set explicitly per deployment (.env.local locally, the
// hosting provider's env config for staging/production) so dev-only UI —
// like the sign-in screen's Autofill button — can never leak into a real
// deployment even if a real build happens to run somewhere non-production.
//
// This flag gates UI CONVENIENCES ONLY. It never bypasses auth or swaps
// out an API call for fake data — every request still goes through the
// real Supabase session + FastAPI/edge-function backend in every
// environment. See DEV_AUTOFILL_* below for the one thing it currently
// gates.
export const APP_ENV: "development" | "production" =
  process.env.NEXT_PUBLIC_APP_ENV === "production" ? "production" : "development";
export const IS_DEV = APP_ENV === "development";

// Dev-only advisor credentials for the sign-in screen's Autofill button
// (see AdvisorLoginGate.tsx). Read from env — never hardcoded in source —
// so a real, already-provisioned advisor login can be dropped into
// .env.local locally (gitignored, never committed) without ever appearing
// in the codebase. The button still calls the real signInWithPassword()
// Supabase call with these values; it does not skip authentication.
export const DEV_AUTOFILL_EMAIL = process.env.NEXT_PUBLIC_DEV_AUTOFILL_EMAIL || "";
export const DEV_AUTOFILL_PASSWORD = process.env.NEXT_PUBLIC_DEV_AUTOFILL_PASSWORD || "";
export const DEV_AUTOFILL_AVAILABLE = IS_DEV && !!DEV_AUTOFILL_EMAIL && !!DEV_AUTOFILL_PASSWORD;
