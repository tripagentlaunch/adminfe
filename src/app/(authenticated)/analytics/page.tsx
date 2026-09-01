"use client";
/* =============================================================================
 * TripAgent — src/app/analytics/page.tsx
 * Mirrors App.jsx's <Route path="/analytics" element={<PlatformAnalyticsPanel
 * advisorId={...} />} /> — a sibling top-level route under AppShell, thinly
 * wired to advisorId from the shared AdvisorSessionContext (see
 * lib/advisorSessionContext.tsx).
 * ===========================================================================*/
import { PlatformAnalyticsPanel } from "../../../components/panels/PlatformAnalyticsPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";

export default function AnalyticsPage() {
  const { advisorId } = useAdvisorSession();

  return <PlatformAnalyticsPanel advisorId={advisorId} />;
}
