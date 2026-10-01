/* =============================================================================
 * TripAgent — src/app/hotel/[hotelKey]/page.tsx
 * "/hotel/{hotelKey}" — where a hotel name/photo in the Proposal PDF (and its
 * in-app preview) links to (2026-09-10). Sits OUTSIDE app/(authenticated)/
 * layout.tsx's route group, same reasoning as app/proposal/[token]/page.tsx:
 * the intended viewer is whoever received the proposal, with no TripAgent
 * account at all.
 *
 * TripSure has no public, customer-facing hotel URL of its own to link to
 * directly instead (confirmed against tripsure_hotel_guide.pdf — a pure
 * server-to-server API whose details()/priceCheck() calls need a docKey/
 * token pair minted by a LIVE search, not something a bare hotelKey can
 * re-fetch on its own days later) — this is our own minimal page, backed by
 * the display-only hotel_snapshots row hotel_service._upsert_snapshots
 * writes every time a real listing() search runs.
 *
 * A plain (non-"use client") Server Component, same "just unwrap the
 * dynamic route param" shape as proposal/[token]/page.tsx.
 * ===========================================================================*/
import { PublicHotelView } from "../../../components/PublicHotelView";

export default async function HotelPublicPage({ params }: { params: Promise<{ hotelKey: string }> }) {
  const { hotelKey } = await params;
  return <PublicHotelView hotelKey={hotelKey} />;
}
