"use client";
/* =============================================================================
 * TripAgent — src/app/advisor-analytics/page.tsx
 * The WORKBENCH-INTERNAL, per-advisor self/peer analytics view
 * (AnalyticsPanel.tsx), distinct from the top-level PLATFORM analytics
 * route (src/app/analytics/page.tsx -> PlatformAnalyticsPanel).
 *
 * Moved here 2026-08-31 from (workbench)/workbench/analytics — that whole
 * "workbench/" folder was deleted once its OTHER page (the real Queue/
 * Itinerary Builder/Traveller Profile/Summary flow) moved to
 * console/queue/page.tsx (see WorkbenchDataProvider.tsx's docblock). This
 * route just needed a new, non-colliding path — "/advisor-analytics"
 * instead of "/workbench/analytics" — see (workbench)/layout.tsx's TABS
 * `path` override on the "analytics" entry, which points here now.
 * ===========================================================================*/
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The per-advisor analytics moved into the sidebar's Analytics page
// ("My performance" view); old links to /advisor-analytics land there.
export default function AdvisorAnalyticsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/analytics?view=mine");
  }, [router]);
  return null;
}
