"use client";
/* =============================================================================
 * TripAgent — src/app/leads/page.tsx
 * Mirrors App.jsx's <Route path="/leads" element={<LeadsPanel .../>} /> —
 * renders the ported LeadsPanel, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { LeadsPanel } from "../../../../components/panels/LeadsPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function LeadsPage() {
  const { advisorId, advisors, membersById } = useWorkbench();

  return <LeadsPanel advisorId={advisorId} advisors={advisors} membersById={membersById} />;
}
