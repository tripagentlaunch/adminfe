"use client";
/* =============================================================================
 * TripAgent — src/app/visa/page.tsx
 * Mirrors App.jsx's <Route path="/visa" element={<VisaDeskQueue .../>} />
 * — renders the ported VisaDeskQueue, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { VisaDeskQueue } from "../../../../components/panels/VisaDeskQueue";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function VisaPage() {
  const { membersById, advisorId, currentAdvisor, openOrderFromQueue } = useWorkbench();

  return (
    <VisaDeskQueue
      advisorId={advisorId}
      advisorRole={currentAdvisor ? currentAdvisor.role : null}
      membersById={membersById}
      onOpenOrder={openOrderFromQueue}
    />
  );
}
