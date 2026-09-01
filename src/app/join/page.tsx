/* =============================================================================
 * TripAgent — src/app/join/page.tsx
 * "/join?token=..." — sits OUTSIDE app/(authenticated)/layout.tsx's route
 * group, so it never hits AdvisorLoginGate (a brand-new advisor accepting an
 * invite has no session yet). Mirrors App.jsx's
 * <Route path="/join" element={<AcceptAdvisorInvite />} />.
 *
 * Wrapped in Suspense because AcceptAdvisorInvite reads the URL via
 * next/navigation's useSearchParams(), which Next.js requires to be inside a
 * Suspense boundary (it can otherwise force the whole route to de-opt to
 * fully client-side rendering with no loading state).
 * ===========================================================================*/
import { Suspense } from "react";
import { AcceptAdvisorInvite } from "../../components/AcceptAdvisorInvite";

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <AcceptAdvisorInvite />
    </Suspense>
  );
}
