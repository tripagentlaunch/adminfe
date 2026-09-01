"use client";
/* =============================================================================
 * TripAgent — src/app/journeys/page.tsx
 * Mirrors App.jsx's <Route path="/journeys" element={<JourneysPanel
 * advisorId={...} />} /> — a sibling top-level route under AppShell, thinly
 * wired to advisorId from the shared AdvisorSessionContext (see
 * lib/advisorSessionContext.tsx).
 * ===========================================================================*/
import { JourneysPanel } from "../../../components/panels/JourneysPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";

export default function JourneysPage() {
  const { advisorId } = useAdvisorSession();

  return <JourneysPanel advisorId={advisorId} />;
}
