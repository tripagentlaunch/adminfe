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
 * ===========================================================================*/
import { WorkbenchTab } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ConsoleQueuePage() {
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, createOrder, member, selEnqId, pickEnquiry, pickMember } = useWorkbench();

  return (
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
    />
  );
}
