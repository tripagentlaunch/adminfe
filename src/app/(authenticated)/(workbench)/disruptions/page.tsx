"use client";
/* =============================================================================
 * TripAgent — src/app/disruptions/page.tsx
 * Mirrors App.jsx's <Route path="/disruptions" element={<DisruptionQueue
 * advisorId={advisorId} advisors={advisors} membersById={membersById}
 * onOpenOrder={openOrderFromQueue} />} /> — renders the ported
 * DisruptionQueue, wired to the shared state from lib/workbenchContext.tsx
 * (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { DisruptionQueue } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function DisruptionsPage() {
  const { advisorId, advisors, membersById, openOrderFromQueue } = useWorkbench();

  return (
    <DisruptionQueue
      advisorId={advisorId}
      advisors={advisors}
      membersById={membersById}
      onOpenOrder={openOrderFromQueue}
    />
  );
}
