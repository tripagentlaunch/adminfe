"use client";
/* =============================================================================
 * TripAgent — src/app/appointments/page.tsx
 * Mirrors App.jsx's <Route path="/appointments" element={<VisaAppointmentDesk
 * .../>} /> — renders the ported VisaAppointmentDesk, wired to the shared
 * state from lib/workbenchContext.tsx (provided by app/workbench/layout.tsx).
 * ===========================================================================*/
import { VisaAppointmentDesk } from "../../../../components/panels/VisaAppointmentDesk";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function AppointmentsPage() {
  const { advisorId, membersById, openOrderFromQueue } = useWorkbench();

  return <VisaAppointmentDesk advisorId={advisorId} membersById={membersById} onOpenOrder={openOrderFromQueue} />;
}
