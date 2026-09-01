"use client";
/* =============================================================================
 * TripAgent — src/app/desk/page.tsx
 * Mirrors App.jsx's <Route path="/desk" element={<DeskHub .../>} /> —
 * renders the ported DeskHub, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { DeskHub } from "../../../../components/panels/DeskHub";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function DeskPage() {
  const { advisorId, membersById, openOrderFromQueue } = useWorkbench();

  return <DeskHub advisorId={advisorId} membersById={membersById} onOpenOrder={openOrderFromQueue} />;
}
