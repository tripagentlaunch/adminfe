"use client";
/* =============================================================================
 * TripAgent — src/app/delivery/page.tsx
 * Mirrors App.jsx's <Route path="/delivery" element={<DeliveryPanel .../>} />
 * — renders the ported DeliveryPanel, wired to the shared state from
 * lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { DeliveryPanel } from "../../../../components/panels/DeliveryPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function DeliveryPage() {
  const { advisorId, membersById } = useWorkbench();

  return <DeliveryPanel advisorId={advisorId} membersById={membersById} />;
}
