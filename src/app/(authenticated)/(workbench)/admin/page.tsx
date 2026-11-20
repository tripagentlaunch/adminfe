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

export default function AdminPage() {
  const { advisors, membersById } = useWorkbench();

  // Every signed-in advisor gets the Admin tools; Agents and Advisor work inside are for admins (the server enforces both).
  return <AdminPanel advisors={advisors} membersById={membersById} />;
}
