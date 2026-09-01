"use client";
/* =============================================================================
 * TripAgent — src/app/comms/page.tsx
 * Mirrors App.jsx's <Route path="/comms" element={<CommsPanel .../>} /> —
 * renders the ported CommsPanel, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { CommsPanel } from "../../../../components/panels/CommsPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function CommsPage() {
  const { advisorId, member, membersById } = useWorkbench();

  return <CommsPanel advisorId={advisorId} member={member} membersById={membersById} />;
}
