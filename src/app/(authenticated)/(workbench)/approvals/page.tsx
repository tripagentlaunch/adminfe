"use client";
/* =============================================================================
 * TripAgent — src/app/approvals/page.tsx
 * Mirrors App.jsx's <Route path="/approvals" element={<ApprovalsPanel
 * advisorId={advisorId} membersById={membersById}
 * onOpenOrder={openOrderFromQueue} />} /> — renders the ported
 * ApprovalsPanel, wired to the shared state from lib/workbenchContext.tsx
 * (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { ApprovalsPanel } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ApprovalsPage() {
  const { advisorId, membersById, openOrderFromQueue } = useWorkbench();

  return <ApprovalsPanel advisorId={advisorId} membersById={membersById} onOpenOrder={openOrderFromQueue} />;
}
