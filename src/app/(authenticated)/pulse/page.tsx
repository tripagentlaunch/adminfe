"use client";
/* =============================================================================
 * TripAgent — src/app/pulse/page.tsx
 * Mirrors App.jsx's <Route path="/pulse" element={<TrendingDealsPanel
 * advisorId={...} />} /> — a sibling top-level route under AppShell, thinly
 * wired to advisorId from the shared AdvisorSessionContext (see
 * lib/advisorSessionContext.tsx).
 * ===========================================================================*/
import { TrendingDealsPanel } from "../../../components/panels/TrendingDealsPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";

export default function PulsePage() {
  const { advisorId } = useAdvisorSession();

  return <TrendingDealsPanel advisorId={advisorId} />;
}
