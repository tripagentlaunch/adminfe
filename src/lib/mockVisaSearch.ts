/* =============================================================================
 * TripAgent — src/lib/mockVisaSearch.ts
 * Same fallback contract as mockFlightSearch.ts/mockHotelSearch.ts (see
 * those files' own docblocks) — the real visa API call (VisaDesk.tsx's
 * run(), searchVisa()) runs first always; only on failure does the UI fall
 * back to this. Per-destination visa type/processing time/document
 * checklist/fee based on two REAL captured results (2026-09-03) against
 * the deployed advisor-panel (https://tripagent-admin.vercel.app) — UAE
 * (e-Visa tourist 30/60 day, 3 days, 4 docs, ₹13,000/2 pax) and Schengen
 * (Short-Stay Type C, 15 days, 7 docs, ₹17,600/2 pax) — the other five
 * destinations in VisaDesk's own dropdown (UK/USA/Singapore/Thailand/Bali)
 * are filled in from realistic public visa-requirement info for Indian
 * passport holders, not captured from the reference site.
 *
 * `source` is deliberately NOT "db"/"onevasco" (what the two captured
 * results carry) — visa_duration/entries_allowed are OneVasco-only fields
 * per VisaDesk.tsx's own comment ("absent on the local-fallback path,
 * where processing_days carries the equivalent info instead"), so this
 * mock omits them too rather than inventing fields the real fallback path
 * never actually has.
 * ===========================================================================*/

function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const VISA_PROFILES: Record<string, { visa_type: string; processing_days: number; documents: string[]; feePerPax: number }> = {
  UAE: {
    visa_type: "e-Visa (tourist 30/60 day)",
    processing_days: 3,
    documents: ["Passport (6 months validity)", "Passport-size photo", "Confirmed return ticket", "Hotel booking"],
    feePerPax: 6500,
  },
  UK: {
    visa_type: "UK Standard Visitor Visa",
    processing_days: 15,
    documents: [
      "Passport (10 years validity)",
      "Bank statements (6 months)",
      "ITR / payslips",
      "Employment letter",
      "Travel itinerary",
      "Accommodation proof",
      "Passport-size photo",
    ],
    feePerPax: 12500,
  },
  USA: {
    visa_type: "B1/B2 Visitor Visa",
    processing_days: 45,
    documents: [
      "DS-160 confirmation",
      "Passport (6+ months validity)",
      "Passport-size photo",
      "Visa interview appointment",
      "Bank statements (6 months)",
      "Employment letter",
      "Travel itinerary",
    ],
    feePerPax: 15400,
  },
  Schengen: {
    visa_type: "Schengen Short-Stay (Type C)",
    processing_days: 15,
    documents: ["Passport", "Travel insurance (EUR 30k)", "Bank statements (6 months)", "ITR", "Flight reservation", "Hotel bookings", "Cover letter"],
    feePerPax: 8800,
  },
  Singapore: {
    visa_type: "eVisa (tourist)",
    processing_days: 3,
    documents: ["Passport (6 months validity)", "Passport-size photo", "Confirmed return ticket", "Hotel booking", "Bank statement"],
    feePerPax: 4200,
  },
  Thailand: {
    visa_type: "Visa on Arrival / eVOA",
    processing_days: 2,
    documents: ["Passport (6 months validity)", "Passport-size photo", "Confirmed return ticket", "Hotel booking", "Proof of funds (THB 20,000/person)"],
    feePerPax: 3800,
  },
  Bali: {
    visa_type: "Visa on Arrival (e-VOA)",
    processing_days: 1,
    documents: ["Passport (6 months validity)", "Passport-size photo", "Confirmed return ticket", "Proof of onward travel"],
    feePerPax: 3300,
  },
};

export function buildMockVisaOffer(opts: any) {
  const { nationality, destination, pax = 1 } = opts;
  const profile = VISA_PROFILES[destination] || VISA_PROFILES.UAE;
  const seed = hashSeed(nationality + "-" + destination + "-" + pax);
  const feeVariance = 1 + ((seed % 7) - 3) / 100; // ±3% so repeat searches for the same inputs stay stable but aren't a flat table lookup
  const net = Math.round((profile.feePerPax * pax * feeVariance) / 100) * 100;

  return {
    offers: [
      {
        id: destination + "-visa-" + seed,
        base_net: net,
        detail: {
          destination,
          visa_required: true,
          visa_type: profile.visa_type,
          processing_days: profile.processing_days,
          pax,
          source: "mock",
          documents: profile.documents,
        },
      },
    ],
  };
}
