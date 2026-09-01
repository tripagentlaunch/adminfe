"use client";
/* =============================================================================
 * TripAgent — src/app/recon/page.tsx
 * Mirrors App.jsx's <Route path="/recon" element={canSeeMargin() ?
 * <ReconciliationPanel advisorId={advisorId} membersById={membersById}
 * onOpenOrder={openOrderFromQueue} /> : null} /> — GATED: renders null (a
 * blank page) when canSeeMargin() is false, exactly like the original. This
 * is a UX-only gate; the backend hard-gates server-side.
 * ===========================================================================*/
import { ReconciliationPanel } from "../../../../components/panels/ReconciliationPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";
import { canSeeMargin } from "../../../../lib/advisorHelpers";

export default function ReconPage() {
  const { advisorId, membersById, openOrderFromQueue } = useWorkbench();

  return canSeeMargin() ? <ReconciliationPanel advisorId={advisorId} membersById={membersById} onOpenOrder={openOrderFromQueue} /> : null;
}
