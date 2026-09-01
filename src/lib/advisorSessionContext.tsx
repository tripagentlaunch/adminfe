"use client";
/* =============================================================================
 * TripAgent — src/lib/advisorSessionContext.tsx
 * NEW in the Next.js port. The original App.jsx/AppShell.jsx got advisorId/
 * role/onSignOut as plain props, threaded down from <AdvisorLoginGate
 * render={(advisorId, role, signOut) => <AppShell .../>} /> through the
 * component tree. Next.js's App Router layouts can't pass props to their
 * `children` (pages) directly, so ShellChrome (the ported AppShell nav
 * chrome) provides this context instead — any nested layout/page reads the
 * same advisorId/role/onSignOut the Gate resolved, without prop-drilling
 * through the file-based route tree.
 * ===========================================================================*/
import { createContext, useContext } from "react";

export interface AdvisorSession {
  advisorId: string;
  role: string;
  onSignOut: () => void;
}

export const AdvisorSessionContext = createContext<AdvisorSession | null>(null);

export function useAdvisorSession(): AdvisorSession {
  const ctx = useContext(AdvisorSessionContext);
  if (!ctx) {
    throw new Error("useAdvisorSession() must be called within an AdvisorSessionContext provider (ShellChrome).");
  }
  return ctx;
}
