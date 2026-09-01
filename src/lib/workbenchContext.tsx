"use client";
/* =============================================================================
 * TripAgent — src/lib/workbenchContext.tsx
 * NEW in the Next.js port. Ported STATE (not markup — see
 * app/workbench/layout.tsx for that) from WorkbenchShell (src/App.jsx, line
 * ~131-243): advisors/members/enquiries/membersById fetched on mount,
 * pickEnquiry/pickMember, createOrder, openOrderFromQueue, and the
 * justCreated/focusOrderId order-creation/queue-focus handoff.
 *
 * The original held this state in WorkbenchShell (a component InSIDE the
 * react-router tree) because every one of its 17 routed tabs needed a slice
 * of it. Next.js layouts can't pass props to `children` (pages) directly, so
 * this Context does what WorkbenchShell's props used to: app/workbench/
 * layout.tsx is the Provider (owns the state + effects, exactly as
 * WorkbenchShell did), and app/workbench/page.tsx (today) — plus every
 * future /orders, /queue, etc. page — consumes it via useWorkbench().
 * ===========================================================================*/
import { createContext, useContext } from "react";

export interface WorkbenchContextValue {
  advisors: any[];
  advisorId: string | null;
  setAdvisorId: (id: string) => void;
  members: any[];
  membersById: Record<string, any>;
  enquiries: any[];
  inboxLoading: boolean;
  creating: boolean;
  justCreated: string | null;
  focusOrderId: string | null;
  selEnqId: string | null;
  member: any;
  pickEnquiry: (e: any, m?: any) => void;
  pickMember: (m: any) => void;
  openOrderFromQueue: (orderId: string) => void;
  createOrder: (quoteId: string) => void;
  consumeCreated: () => void;
  currentAdvisor: any;
}

export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) {
    throw new Error("useWorkbench() must be called within a WorkbenchContext provider (app/workbench/layout.tsx).");
  }
  return ctx;
}
