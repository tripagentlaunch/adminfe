"use client";
/* =============================================================================
 * TripAgent — src/lib/renderProposalPdf.ts
 * Root cause (2026-09-11, real Dubai proposal reproduction): Proposal
 * Composer got stuck on "Rendering…" forever — no server-side error, no
 * browser console error either, just an unresolved promise. Traced into
 * @react-pdf/renderer's own source: ProposalDocument.tsx's stays page now
 * embeds a real hotel photo (`<Image src={st.image}>`, the hotel-link
 * feature's own new code path) whenever a stay has a real hotelKey/image —
 * @react-pdf/image's fetchRemoteFile() calls plain `fetch(src.uri, ...)`
 * with NO timeout or AbortController at all. Layout's fetchImage() DOES
 * catch a REJECTED fetch gracefully (console.warn, image just omitted —
 * confirmed in this session against a different hotel photo host, which
 * failed fast and still produced a complete PDF) — but nothing catches a
 * fetch that never settles either way, which a slow/unresponsive real-world
 * CDN can absolutely do. Every image asset is awaited via Promise.all
 * before the document finishes building, so ONE such hung fetch blocks
 * pdf(...).toBlob()/toBuffer() forever — exactly "stuck on Rendering...".
 *
 * FIX: temporarily wrap the global `fetch` with an aborting timeout for the
 * duration of the render call only (react-pdf's compiled bundle references
 * the bare global `fetch`, not an imported binding, so this reaches it) —
 * restored immediately after, success or failure, so every OTHER network
 * call in the app (unrelated to PDF rendering) is completely unaffected.
 * An aborted fetch is a real rejection, which fetchImage() already handles
 * by falling back to no image (ProposalDocument.tsx's own `st.image ?
 * <Image/> : <PhotoPlaceholder/>` never sees this — react-pdf omits the
 * image node internally either way) — never invented, just an honest
 * degrade instead of an infinite hang.
 *
 * BUG (found 2026-09-13, real "Couldn't generate an itinerary: signal is
 * aborted without reason" reproduction) — "every OTHER network call... is
 * completely unaffected" above was wrong: the patched fetch unconditionally
 * did `{ ...init, signal: controller.signal }`, which OVERWRITES any signal
 * the actual caller already passed, discarding it. react-pdf's own internal
 * image fetches never pass a signal at all (confirmed above), so this was
 * harmless for THEM — but ProposalPreview.tsx renders on every Proposal
 * Composer visit, and its render effect had no unmount cleanup, so this
 * patch could still be live (window.fetch still swapped) when a completely
 * unrelated fetch elsewhere on the page fired — e.g. "Generate AI
 * Itinerary"'s own fastapiEnquiryCall, which already manages its own 180s
 * AbortController specifically to turn a raw abort into an honest message
 * (see api.ts's own note on that fix). That call's OWN signal got silently
 * replaced by this one's 8s controller; when THAT fired, fastapiEnquiryCall
 * checked its OWN controller (never actually aborted — its signal was the
 * one discarded) and re-threw the raw, unhelpful AbortError instead of its
 * intended message — the exact regression this comment documents.
 *
 * FIX: only ever apply this 8s protective timeout when the caller passed NO
 * signal of its own (react-pdf's own image fetches, matching this file's
 * original purpose exactly). A caller that already owns its cancellation/
 * timeout (fastapiEnquiryCall included) is passed straight through
 * untouched — its own signal, its own timeout, its own abort message.
 *
 * BUG #2 (found 2026-09-13, real "/proposal/{token} page 3 permanently
 * blank + Download PDF broken" reproduction, same night) — the fix above
 * still applied our 8s timeout AND the new externalSignal cancellation
 * (added so ProposalPreview.tsx can cancel a render on unmount) to EVERY
 * asset fetch with no signal of its own — which includes FONT files, not
 * just images. Traced into @react-pdf/font's own source
 * (FontSource.load(), node_modules/@react-pdf/font/lib/index.browser.js):
 * `if (this.loadResultPromise === null) this.loadResultPromise =
 * this._load();` caches the load PROMISE ITSELF the first time a font is
 * requested — success OR REJECTION — for the lifetime of the page. Abort
 * ONE font fetch (Strict Mode's dev-only double-effect-invoke aborting a
 * throwaway first render is enough on its own) and every subsequent
 * render for the rest of that page's life gets the SAME cached rejected
 * promise back instantly, with no retry ever possible short of a full
 * reload. Worse, that rejection isn't caught gracefully the way an
 * aborted IMAGE fetch is (this file's original 2026-09-11 note) — it
 * propagates all the way out of pdf(...).toBlob() as an uncaught
 * rejection, so the render doesn't just lose one asset, it never
 * completes at all — a permanent blank canvas, confirmed live via a
 * Playwright repro against the real dev server.
 *
 * FIX: fonts are never wrapped at all — no 8s cap, no external
 * cancellation, straight through to the real fetch every time. They're
 * our own local static files (public/fonts/*.ttf via proposalFonts.ts),
 * never a slow third-party CDN, so there's no realistic hang to guard
 * against — and given the permanent-cache trap above, "guarding" them
 * here is strictly worse than not touching them.
 *
 * BUG #3 (found 2026-09-14, real "Ferienwohnung Henrich" hotel-photo
 * repro, hotel_snapshots confirmed to have a real, live, fetchable image
 * URL — this was never a data problem) — IMAGES turned out to have the
 * exact same permanent-cache trap as fonts, just one layer up:
 * @react-pdf/image's own resolveImage() (node_modules/@react-pdf/image/
 * lib/index.js) does `IMAGE_CACHE.set(cacheKey, image)` where `image` is
 * the in-flight promise itself, cached BEFORE it settles — success or
 * rejection, same as FontSource.load() above, keyed by URL, for the rest
 * of the page's life. This file's own bug #1/#2 fixes already stopped
 * that from happening to FONTS, but left images going through the 8s-cap
 * + externalSignal-cancel path (deliberately, at the time — this file's
 * original 2026-09-11 design), because a rejected image degrades
 * gracefully (PhotoPlaceholder) rather than crashing the whole render the
 * way a rejected font does. That reasoning covered the SINGLE render an
 * abort happens in, but missed the SAME permanent-cache trap fonts have:
 * one render's cancelled image fetch (Strict Mode's dev-only throwaway
 * first mount is enough on its own, confirmed live via a Playwright
 * repro: a poisoned tab's very next — otherwise completely healthy,
 * unaborted — render came back with NO image for that URL, byte-for-byte
 * smaller than a fresh tab's render of the identical data) permanently
 * blinds every LATER render in that tab to a real, live, perfectly
 * fetchable photo. A silently-wrong "no photo" is worse than occasionally
 * waiting longer for a real one to load, so images now get the exact
 * same treatment as fonts: never wrapped, no cap, no cancellation. A
 * genuinely hung real-world CDN can once again stall a render
 * indefinitely (this file's original 2026-09-11 problem) — a conscious,
 * accepted tradeoff, not an oversight.
 * ===========================================================================*/
import { pdf } from "@react-pdf/renderer";

// No more window.fetch patching at all (2026-09-14) — with fonts (bug #2)
// and now images (bug #3) both always passed straight through untouched,
// and a caller-supplied signal (bug #1) also always passed straight
// through untouched, EVERY branch of the old patched fetch reduced to
// `originalFetch(input, init)` unconditionally — a pure identity wrapper
// doing nothing a plain, unpatched fetch doesn't already do. Keeping it
// only added indirection and a temporarily-reassigned global for no
// behavioral benefit, so it's gone; this function is now exactly what it
// looks like. A render can no longer be externally cancelled (dropped
// along with the patch — see ProposalPreview.tsx's own note on why its
// unmount cleanup went with it) and a genuinely hung real-world CDN can
// once again stall a render indefinitely — both are the SAME conscious,
// accepted tradeoff bug #3 above explains: a silently-wrong "no photo"
// forever is worse than occasionally waiting longer for a real one.
export function renderProposalPdfBlob(documentEl: React.ReactElement): Promise<Blob> {
  // Same pre-existing @react-pdf/renderer/React type mismatch every other
  // pdf(<Doc/>) call site in this codebase already has (ProposalPreview.tsx
  // included) — not introduced here.
  return pdf(documentEl as any).toBlob();
}
