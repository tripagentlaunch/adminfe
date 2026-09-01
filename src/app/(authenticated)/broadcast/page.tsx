"use client";
/* =============================================================================
 * TripAgent — src/app/broadcast/page.tsx
 * Mirrors App.jsx's <Route path="/broadcast" element={<SupplierBroadcastPanel
 * advisorId={...} />} /> — a sibling top-level route under AppShell, thinly
 * wired to advisorId from the shared AdvisorSessionContext (see
 * lib/advisorSessionContext.tsx).
 * ===========================================================================*/
import { SupplierBroadcastPanel } from "../../../components/panels/SupplierBroadcastPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";

export default function BroadcastPage() {
  const { advisorId } = useAdvisorSession();

  return <SupplierBroadcastPanel advisorId={advisorId} />;
}
