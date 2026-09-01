"use client";
/* =============================================================================
 * TripAgent — src/app/admin/page.tsx
 * Mirrors App.jsx's <Route path="/admin" element={isAdmin() ? <AdminPanel
 * advisors={advisors} membersById={membersById} /> : null} /> — GATED:
 * renders null (a blank page) when isAdmin() is false, exactly like the
 * original. This is a UX-only gate; the backend re-checks role server-side
 * via get_current_admin on every /admin/* call.
 * ===========================================================================*/
import { AdminPanel } from "../../../../components/panels/AdminPanel";
import { useWorkbench } from "../../../../lib/workbenchContext";
import { isAdmin } from "../../../../lib/advisorHelpers";

export default function AdminPage() {
  const { advisors, membersById } = useWorkbench();

  return isAdmin() ? <AdminPanel advisors={advisors} membersById={membersById} /> : null;
}
