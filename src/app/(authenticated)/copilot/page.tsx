"use client";
/* =============================================================================
 * TripAgent — src/app/copilot/page.tsx
 * Mirrors App.jsx's <Route path="/copilot" element={<CallCopilotPanel
 * advisorId={...} />} /> — a sibling top-level route under AppShell, thinly
 * wired to advisorId from the shared AdvisorSessionContext (see
 * lib/advisorSessionContext.tsx).
 * ===========================================================================*/
import { CallCopilotPanel } from "../../../components/panels/CallCopilotPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";

export default function CopilotPage() {
  const { advisorId } = useAdvisorSession();

  return <CallCopilotPanel advisorId={advisorId} />;
}
