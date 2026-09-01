"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/search/page.tsx
 * "Search" tab under Enquiries — re-added 2026-09-01. Was originally row 2
 * of the combined Workbench tab ("Search Desks + Cart") before the
 * 2026-08-31 Queue/Itinerary Builder rewrite pulled it out (see
 * WorkbenchTab.tsx's docblock: "Search still needs a home ... parked").
 * Now its own nested tab, same WorkbenchContext as every other Enquiries/
 * Advisor Workbench route.
 * ===========================================================================*/
import { SearchDesksTab } from "../../../../components/panels";
import { useWorkbench } from "../../../../lib/workbenchContext";

export default function ConsoleSearchPage() {
  const { member, advisorId } = useWorkbench();

  return <SearchDesksTab member={member} advisorId={advisorId} />;
}
