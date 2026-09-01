"use client";
/* =============================================================================
 * TripAgent — src/app/earnings/page.tsx
 * Mirrors App.jsx's <Route path="/earnings" element={canSeeMargin() ?
 * <EarningsPanel advisorId={advisorId} /> : null} /> — GATED: renders null
 * (a blank page) when canSeeMargin() is false, exactly like the original.
 * This is a UX-only gate; the backend hard-gates on advisor_id server-side.
 * ===========================================================================*/
import { EarningsPanel } from "../../../../components/panels/EarningsPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";
import { canSeeMargin } from "../../../../lib/advisorHelpers";

export default function EarningsPage() {
  const { advisorId } = useWorkbench();

  return canSeeMargin() ? <EarningsPanel advisorId={advisorId} /> : null;
}
