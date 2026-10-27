"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/analytics/page.tsx
 * The one Analytics page (sidebar → Analytics). Two views:
 *   - Platform: PlatformAnalyticsPanel (/analytics/platform-summary)
 *   - My performance: AnalyticsPanel, the per-advisor view that used to be the
 *     Workbench's own "Analytics" tab (/advisor-analytics, which now lands here).
 * ===========================================================================*/
import { useState } from "react";
import { PlatformAnalyticsPanel } from "../../../components/panels/PlatformAnalyticsPanel";
import { AnalyticsPanel } from "../../../components/panels/AnalyticsPanel";
import { useAdvisorSession } from "../../../lib/advisorSessionContext";
import { useWorkbench } from "../../../lib/workbenchContext";
import { cx } from "../../../lib/cx";

export default function AnalyticsPage() {
  const { advisorId } = useAdvisorSession();
  const { advisors, currentAdvisor } = useWorkbench();
  const [view, setView] = useState<"platform" | "mine">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "mine" ? "mine" : "platform"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 0 8px" }}>
        <div className="taw-segrp" role="tablist" aria-label="Analytics view">
          <button type="button" role="tab" aria-selected={view === "platform"} className={cx("taw-seg", view === "platform" && "is-on")} onClick={() => setView("platform")}>
            Platform
          </button>
          <button type="button" role="tab" aria-selected={view === "mine"} className={cx("taw-seg", view === "mine" && "is-on")} onClick={() => setView("mine")}>
            My performance
          </button>
        </div>
      </div>
      {view === "platform" ? (
        <PlatformAnalyticsPanel advisorId={advisorId} />
      ) : (
        <AnalyticsPanel advisorId={advisorId} advisorRole={currentAdvisor ? currentAdvisor.role : null} advisors={advisors} />
      )}
    </div>
  );
}
