"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/queue/page.tsx
 * "Console" tab under Enquiries — the REAL Queue/Itinerary Builder/
 * Traveller Profile/Summary flow (WorkbenchTab.tsx), moved here 2026-08-31
 * from (workbench)/workbench/page.tsx. This is an actual move, not a
 * second instance: WorkbenchTab is wired to the SAME WorkbenchContext as
 * every other Advisor Workbench route, now provided once at the app root
 * (see WorkbenchDataProvider.tsx) instead of locally by the old
 * (workbench)/layout.tsx.
 *
 * "Invite someone" moved to Admin (components/InviteSomeoneButton.tsx,
 * 2026-10-27) — not a daily action for advisors.
 * ===========================================================================*/
import { WorkbenchTab } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ConsoleQueuePage() {
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, createOrder, member, selEnqId, pickEnquiry, pickMember, ensureEnquiryForMember } = useWorkbench();

  // A fragment, not a <div>: the columns must be a direct child of .taw-main (a flex column capped at
  // the screen height). A plain wrapper div has no height limit, so the columns grew to the full
  // length of the itinerary and the whole page scrolled instead of each column.
  return (
    <>
      <WorkbenchTab
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        advisorId={advisorId}
        creating={creating}
        onCreateOrder={createOrder}
        member={member}
        selEnqId={selEnqId}
        onSelectEnquiry={pickEnquiry}
        onPickMember={pickMember}
        onEnsureEnquiry={ensureEnquiryForMember}
      />
    </>
  );
}
