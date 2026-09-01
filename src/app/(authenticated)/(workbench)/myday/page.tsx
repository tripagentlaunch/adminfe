"use client";
/* =============================================================================
 * TripAgent — src/app/myday/page.tsx
 * Mirrors App.jsx's <Route path="/myday" element={<MyDayPanel
 * advisorId={advisorId} advisorRole={currentAdvisor ? currentAdvisor.role :
 * null} advisors={advisors} membersById={membersById}
 * onOpenOrder={openOrderFromQueue} />} /> — renders the ported MyDayPanel,
 * wired to the shared state from lib/workbenchContext.tsx (provided by
 * app/workbench/layout.tsx).
 * ===========================================================================*/
import { MyDayPanel } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function MyDayPage() {
  const { advisorId, currentAdvisor, advisors, membersById, openOrderFromQueue } = useWorkbench();

  return (
    <MyDayPanel
      advisorId={advisorId}
      advisorRole={currentAdvisor ? currentAdvisor.role : null}
      advisors={advisors}
      membersById={membersById}
      onOpenOrder={openOrderFromQueue}
    />
  );
}
