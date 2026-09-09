/* =============================================================================
 * TripAgent — src/lib/proposalFonts.ts
 * Registers the Proposal PDF's own typography with @react-pdf/renderer.
 * 2026-09-08, direct request — the sample template (Switzerland-Iyer-
 * Itinerary.pdf) uses an elegant high-contrast serif for titles/numerals
 * and a tracked small-caps sans for labels, deliberately DIFFERENT from
 * the admin panel's own IBM Plex UI chrome (confirmed: "match exactly").
 * Fraunces (serif) and Inter (sans) are the closest open faces — files
 * downloaded once from Google Fonts into public/fonts/ so react-pdf can
 * embed them without a network fetch at render/export time.
 * ===========================================================================*/
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerProposalFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: "Proposal Serif",
    fonts: [
      { src: "/fonts/Fraunces-300.ttf", fontWeight: 300 },
      { src: "/fonts/Fraunces-400.ttf", fontWeight: 400 },
      { src: "/fonts/Fraunces-500.ttf", fontWeight: 500 },
      { src: "/fonts/Fraunces-600.ttf", fontWeight: 600 },
    ],
  });

  Font.register({
    family: "Proposal Sans",
    fonts: [
      { src: "/fonts/Inter-400.ttf", fontWeight: 400 },
      { src: "/fonts/Inter-500.ttf", fontWeight: 500 },
      { src: "/fonts/Inter-600.ttf", fontWeight: 600 },
    ],
  });

  // react-pdf's line-breaking otherwise tries to hyphenate; the template's
  // tracked all-caps labels read badly split mid-word.
  Font.registerHyphenationCallback((word) => [word]);
}
