"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/layout.tsx
 * "Enquiries" (route stays /console; page renamed 2026-08-31) — the
 * pre-proposal phase: Console (the real Queue/Itinerary Builder/Traveller
 * Profile/Summary view built in WorkbenchTab.tsx, see its own docblock)
 * and Proposal Composer.
 *
 * Originally "Console," a literal build of the EIR docx's 8-screen flat
 * model (Queue, Traveller Profile, Itinerary Builder, AI Draft, Price
 * Desk, Proposal Composer, Live Trips, Commission Tracker) — superseded
 * once the real Queue/Itinerary-Builder/Traveller-Profile/Summary flow got
 * built for real elsewhere (WorkbenchTab.tsx, under the OLD "Advisor
 * Workbench" nav item — deliberately left untouched here to avoid a much
 * larger refactor, since nearly every route there shares WorkbenchContext).
 * Per 2026-08-31 decision: Traveller Profile/Itinerary Builder/AI Draft/
 * Price Desk deleted outright (duplicates of the real thing); Price Desk
 * specifically folds into Proposal Composer as a future panel, not its own
 * screen; Live Trips/Commission Tracker deleted too — no home for them
 * without the bigger Workbench-side reorg, which didn't happen this pass.
 * Only Queue (relabeled "Console" — its own page content is still a
 * placeholder, NOT wired to the real WorkbenchTab content; see its own
 * file) and Proposal Composer survive.
 *
 * Header/tabs are modeled on a specific Jira space-page screenshot (icon +
 * title, then an underline-style tab strip) — see the shared .area-* rules
 * in advisor-workbench.css (Advisor Workbench's own layout adopted the same
 * treatment same day, replacing its old taw-tab pill style there too).
 * ===========================================================================*/
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../../../components/ui";
import { cx } from "../../../lib/cx";

const SCREENS = [
  { key: "queue", label: "Console", icon: "sliders" },
  { key: "proposal-composer", label: "Proposal Composer", icon: "note" },
  // Pipeline (2026-09-08, direct request) — a read-only tracker across
  // every enquiry's real stage (New / Building Itinerary / Sent to
  // Proposal / Accepted / Revision Requested / Rejected). See its own
  // page.tsx docblock for how "stage" is derived — there's no backend
  // concept of this at all yet, so it's computed from the SAME session-
  // local state Console and Proposal Composer already read/write.
  { key: "pipeline", label: "Pipeline", icon: "trend" },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/console";
  const activeKey = pathname.split("/")[2] || "queue";

  return (
    <div className="taw">
      <div className="area-header">
        <div className="area-title-row">
          <h1>Enquiries</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="area-tabs" role="tablist" aria-label="Enquiries section">
            {SCREENS.map((s) => (
              <Link
                key={s.key}
                href={"/console/" + s.key}
                role="tab"
                aria-selected={activeKey === s.key ? "true" : "false"}
                className={cx("area-tab", activeKey === s.key && "is-active")}
              >
                <Icon name={s.icon} size={15} />
                <span>{s.label}</span>
              </Link>
            ))}
          </div>
          {/* Portal target (2026-10-05) — lets a specific console page
              (currently only queue/page.tsx's "+ Invite someone" button)
              render into the SAME row as the tab strip, right-aligned,
              instead of its own row below. Empty on pages that don't
              portal anything into it. */}
          <div id="console-header-actions" />
        </div>
      </div>
      <div className="taw-main">{children}</div>
    </div>
  );
}
