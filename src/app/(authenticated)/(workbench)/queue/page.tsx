"use client";
/* =============================================================================
 * TripAgent — src/app/queue/page.tsx
 * Mirrors App.jsx's <Route path="/queue" element={<EscalationQueue
 * advisorId={advisorId} advisorRole={currentAdvisor ? currentAdvisor.role :
 * null} advisors={advisors} membersById={membersById}
 * onOpenOrder={openOrderFromQueue} />} /> — renders the ported
 * EscalationQueue, wired to the shared state from lib/workbenchContext.tsx
 * (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { EscalationQueue } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function QueuePage() {
  const { advisorId, currentAdvisor, advisors, membersById, openOrderFromQueue } = useWorkbench();

  return (
    <EscalationQueue
      advisorId={advisorId}
      advisorRole={currentAdvisor ? currentAdvisor.role : null}
      advisors={advisors}
      membersById={membersById}
      onOpenOrder={openOrderFromQueue}
    />
  );
}
