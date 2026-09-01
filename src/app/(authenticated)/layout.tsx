/* =============================================================================
 * TripAgent — src/app/(authenticated)/layout.tsx
 * Route group for every page that sits BEHIND the advisor login gate. This is
 * where App.jsx's top-level render (<AdvisorLoginGate render={(advisorId,
 * role, signOut) => <AppShell .../>} />) actually lives now — moved out of
 * the root layout so that /join (AcceptAdvisorInvite, a public route for a
 * newly-invited advisor with no session yet) can sit OUTSIDE this group as a
 * sibling and never hit the gate, mirroring App.jsx's own route split:
 *   <Route path="/join" element={<AcceptAdvisorInvite />} />
 *   <Route path="/*" element={<AdvisorLoginGate render={...} />} />
 * The parens in "(authenticated)" add no URL segment — every route nested
 * here (/, /workbench, /orders, /broadcast, ...) keeps its original path.
 * ===========================================================================*/
import { AppRoot } from "../../components/AppRoot";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppRoot>{children}</AppRoot>;
}
