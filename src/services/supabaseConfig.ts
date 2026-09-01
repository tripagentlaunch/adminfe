// TripAgent — src/services/supabaseConfig.ts
// Single source of truth for the Supabase project URL + publishable anon key
// (same values web/js/api.js and web/js/auth.js each independently declared
// in the original). Extracted to its own module — rather than having auth.ts
// import them from api.ts — because api.ts already imports auth.ts (for
// accessToken()); a reverse import would create a circular dependency where
// auth.ts's module-level init() could run before api.ts finishes evaluating
// its own URL/KEY constants.
//
// Ported to Next.js: values come from NEXT_PUBLIC_ env vars only (set in
// .env.local) — no hardcoded fallback, so the real credentials live in
// exactly one place, not duplicated into source.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY — set them in .env.local."
  );
}
export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_KEY;
