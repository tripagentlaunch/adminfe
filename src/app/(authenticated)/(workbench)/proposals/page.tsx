"use client";
/* =============================================================================
 * TripAgent — src/app/proposals/page.tsx
 * Mirrors App.jsx's <Route path="/proposals" element={<ProposalsPanel .../>} />
 * — renders the ported ProposalsPanel, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { ProposalsPanel } from "../../../../components/panels/ProposalsPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ProposalsPage() {
  const { advisorId, members, membersById } = useWorkbench();

  return <ProposalsPanel advisorId={advisorId} members={members} membersById={membersById} />;
}
