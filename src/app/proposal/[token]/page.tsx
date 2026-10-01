/* =============================================================================
 * TripAgent — src/app/proposal/[token]/page.tsx
 * "/proposal/{token}" — Proposal Composer's "Web link" button (2026-09-10).
 * Sits OUTSIDE app/(authenticated)/layout.tsx's route group, so it never
 * hits AdvisorLoginGate — the intended viewer is a prospect/member with no
 * TripAgent account at all, same posture as app/join/page.tsx for a new
 * advisor's invite link.
 *
 * A plain (non-"use client") Server Component on purpose, thin enough to
 * just unwrap the dynamic route param and hand it to the real client
 * component — `params` is a Promise as of this Next.js version, same
 * `await params` shape every route here would need; keeping that await out
 * of PublicProposalView.tsx (a client component) avoids re-deriving it
 * around hooks/state there.
 * ===========================================================================*/
import { PublicProposalView } from "../../../components/PublicProposalView";

export default async function ProposalSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicProposalView token={token} />;
}
