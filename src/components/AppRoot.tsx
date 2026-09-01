"use client";
/* =============================================================================
 * TripAgent — src/components/AppRoot.tsx
 * Small client-side wrapper so the root layout (src/app/layout.tsx) can stay
 * a Server Component (keeping its `metadata` export) while still mirroring
 * App.jsx's top-level render exactly: <AdvisorLoginGate render={(advisorId,
 * role, signOut) => <AppShell .../>} />. AdvisorLoginGate's `render` prop is
 * a function — Next.js can't serialise a function prop handed to a Client
 * Component FROM a Server Component, but a function created and consumed
 * entirely INSIDE a Client Component (this one) is fine. So this is that
 * boundary: layout.tsx renders <AppRoot>{children}</AppRoot>, and AppRoot
 * does the actual Gate -> ShellChrome wiring.
 * ===========================================================================*/
import { AdvisorLoginGate } from "./AdvisorLoginGate";
import { ShellChrome } from "./ShellChrome";
import { DevInspector } from "./DevInspector";
import { WorkbenchDataProvider } from "./WorkbenchDataProvider";

export function AppRoot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdvisorLoginGate
        render={(advisorId, role, signOut) => (
          <ShellChrome advisorId={advisorId} role={role} onSignOut={signOut}>
            {/* Hoisted 2026-08-31 from (workbench)/layout.tsx — one shared
                instance for the whole app, so both Enquiries (console/queue)
                and Advisor Workbench's remaining routes read the SAME
                advisors/members/enquiries state, not duplicated copies. */}
            <WorkbenchDataProvider advisorId={advisorId}>{children}</WorkbenchDataProvider>
          </ShellChrome>
        )}
      />
      {/* Mounted alongside the Gate (not inside its `render`) so it's present
          on every stage — including the sign-in screen itself — not just
          once past the gate. No-ops entirely outside dev (see its own file). */}
      <DevInspector />
    </>
  );
}
