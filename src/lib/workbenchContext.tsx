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
  // proposalQueue (2026-09-03) — the "Send to Proposal" handoff, upgraded
  // from a single itinerary slot to a real per-enquiry queue (direct
  // request: Proposal Composer needed its own Queue, showing only
  // enquiries with an itinerary actually waiting to be composed).
  // ItineraryView writes one entry per enquiry when the advisor confirms
  // in the Summary window (re-sending the same enquiry replaces its
  // entry rather than duplicating it); console/proposal-composer/page.tsx
  // reads the list. Session-local only, same as everything else here.
  proposalQueue: ProposalQueueEntry[];
  selectedProposalEnqId: string | null;
  sendItineraryToProposal: (enquiryId: string, member: any, data: any) => void;
  selectProposal: (enquiryId: string) => void;
  // setProposalOutcome (2026-09-08) — the Pipeline tab's "Accepted" /
  // "Revision Requested" / "Rejected" stages need SOME record of what
  // the client said back, and there's no real channel for that (no
  // backend endpoint even exists for sending a proposal in the first
  // place — see BACKEND-HANDOFF.md). So this is a manual status an
  // advisor sets on Proposal Composer after hearing back, same "100%
  // local state, no persistence" honesty as proposalQueue itself.
  setProposalOutcome: (enquiryId: string, outcome: ProposalOutcome) => void;
  // itinerariesByEnquiry (2026-09-03) — Search → Itinerary, direct, no
  // cart in between (explicit scope call). Was local state inside
  // ItineraryView (a clone of MOCK_ITINERARY, gone the moment you
  // navigated away); now lives here per enquiryId so Search's "Add"
  // button and the Itinerary Builder read/write the SAME object.
  // initItinerary seeds one (mock data for "ai", a real empty shell for
  // "scratch") ONLY if that enquiry doesn't already have one — it's a
  // no-op once data exists, so it can't clobber items already added via
  // Search. addSearchItemToItinerary auto-seeds a blank shell too, so
  // "Add" works even before the advisor has gone through the AI/scratch
  // chooser at all.
  itinerariesByEnquiry: Record<string, any>;
  // `enquiry` (2026-09-04) — used to seed the itinerary's own committed
  // date bound (startIso/endIso) from the enquiry's ask.dateRange when
  // there's no mock data to derive it from (see WorkbenchDataProvider).
  initItinerary: (enquiryId: string, mode: "ai" | "scratch", enquiry?: any) => void;
  updateItineraryData: (enquiryId: string, updater: (d: any) => any) => void;
  addSearchItemToItinerary: (enquiryId: string, cartItem: any, enquiry?: any) => void;
}

// ProposalOutcome (2026-09-08) — see setProposalOutcome above.
// "awaiting" is the default the moment a proposal is sent (matches the
// Pipeline tab's "Sent to Proposal" stage); the other three map 1:1 to
// its "Accepted" / "Revision Requested" / "Rejected" stages.
export type ProposalOutcome = "awaiting" | "accepted" | "revision_requested" | "rejected";

export interface ProposalQueueEntry {
  enquiryId: string;
  member: any;
  data: any;
  sentAt: number;
  outcome: ProposalOutcome;
}

export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) {
    throw new Error("useWorkbench() must be called within a WorkbenchContext provider (app/workbench/layout.tsx).");
  }
  return ctx;
}
