"use client";
/* =============================================================================
 * TripAgent — src/app/servicing/page.tsx
 * Mirrors App.jsx's <Route path="/servicing" element={<ServicingHub .../>} />
 * — renders the ported ServicingHub, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { ServicingHub } from "../../../../components/panels/ServicingHub";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ServicingPage() {
  const { advisorId, membersById, openOrderFromQueue, focusOrderId } = useWorkbench();

  return <ServicingHub advisorId={advisorId} membersById={membersById} onOpenOrder={openOrderFromQueue} focusOrderId={focusOrderId} />;
}
