/* =============================================================================
 * TripAgent — src/lib/useHotelWebsites.ts
 * Fetches backend-verified hotel enrichment (website + its verification
 * status, plus image status) for every real hotelKey in an itinerary
 * (2026-09-11, extended 2026-09-11 for the official-website-status gate) —
 * feeds proposalTemplateData.ts's hotelUrl()/officialWebsiteUrl, which must
 * NEVER show a "Visit official website" link unless the backend has
 * actually marked it verified (see hotel_service.set_website's own note:
 * this is a human-verification step, not a raw unchecked write — the LLM
 * is never involved in producing or approving this URL at all). Same
 * "separate hook feeding a memoized builder" shape as useQuotePricing.ts.
 *
 * hotelPublicGet() is the same unauthenticated GET /hotels/public/{hotelKey}
 * the public hotel page itself calls — reused here rather than adding a
 * second, authenticated read path, since the data returned is identical and
 * this call is display-only (no price/rate). Tolerant of the pre-enrichment-
 * migration response shape too: `status`/`imageStatus` just come back
 * undefined until supabase/migrations/20260911190000_hotel_enrichment.sql
 * has been applied, and every consumer here already treats that as "not
 * verified" rather than erroring.
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { hotelPublicGet } from "../services/api";

export type HotelEnrichment = {
  website: string | null;
  status: string | null; // "verified" | "pending" | "unavailable" | "failed" | null (not yet enriched)
  image: string | null;
  imageStatus: string | null; // "present" | "unavailable" | null
  // imageSource/imageCredit (2026-09-16, Pexels stock photo; priority
  // changed 2026-09-15 — direct request) — "pexels" whenever the backend
  // found a generic city-exterior stock photo, WHICH IT NOW PREFERS AS
  // THE DISPLAYED IMAGE even when a real TripSure photo also exists on
  // file (get_hotel_public's own note: a real interior room shot is
  // often less appealing than a clean exterior, and this stays honest
  // because the label below is keyed off "is this a stock photo", not
  // "did we have no other choice"). "tripsure" only when no Pexels
  // result was available, null when neither exists. NEVER treat a
  // "pexels" image as a real photo of this property — proposalTemplateData.ts/
  // ProposalDocument.tsx use this to render a "Representative image"
  // label rather than silently presenting stock art as the actual hotel.
  imageSource: "tripsure" | "pexels" | null;
  imageCredit: string | null;
};

function hotelKeysIn(itinerary: any): string[] {
  const days: any[] = (itinerary && itinerary.days) || [];
  const keys = new Set<string>();
  days.forEach((day: any) => {
    (day.items || []).forEach((it: any) => {
      if (it.type === "hotel" && it.hotelKey) keys.add(String(it.hotelKey));
    });
  });
  return Array.from(keys);
}

export function useHotelWebsites(itinerary: any): Record<string, HotelEnrichment> {
  const [enrichment, setEnrichment] = useState<Record<string, HotelEnrichment>>({});
  const reqRef = useRef(0);

  const keys = useMemo(() => hotelKeysIn(itinerary), [itinerary]);
  const sig = keys.join("|");

  useEffect(() => {
    if (!keys.length) {
      setEnrichment({});
      return;
    }
    const myReq = ++reqRef.current;
    Promise.all(
      keys.map((k) =>
        hotelPublicGet(k)
          .then(
            (r: any) =>
              [
                k,
                {
                  website: (r && r.website) || null,
                  status: (r && r.official_website_status) || null,
                  image: (r && r.image) || null,
                  imageStatus: (r && r.image_status) || null,
                  imageSource: (r && r.imageSource) || null,
                  imageCredit: (r && r.imageCredit) || null,
                },
              ] as const
          )
          .catch(() => [k, { website: null, status: null, image: null, imageStatus: null, imageSource: null, imageCredit: null }] as const)
      )
    ).then((pairs) => {
      if (myReq !== reqRef.current) return;
      const next: Record<string, HotelEnrichment> = {};
      pairs.forEach(([k, rec]) => {
        next[k] = rec;
      });
      setEnrichment(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return enrichment;
}
