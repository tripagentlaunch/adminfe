"use client";
/* =============================================================================
 * TripAgent — src/app/(workbench)/layout.tsx
 * Advisor Workbench's remaining sub-nav (Orders Board, Servicing Queue,
 * Disruptions, Approvals, My Day, Proposals, Leads, Communications,
 * Analytics, Visa Desk, Appointments, Servicing, Desk, Delivery, Admin,
 * Earnings, Reconciliation) + the Invite Customer action + the tab-row
 * overflow toggle.
 *
 * 2026-08-31: this layout no longer owns the advisors/members/enquiries
 * state or WorkbenchContext.Provider — that's hoisted to
 * WorkbenchDataProvider.tsx, mounted once at the app root, so it's shared
 * with Enquiries too (see that file's docblock). This layout is now just
 * tab chrome; every route inside it still reads the same shared state via
 * useWorkbench() as before, unchanged.
 *
 * The "Workbench" tab (Queue/Itinerary Builder/Traveller Profile/Summary)
 * moved OUT of this group entirely, to console/queue/page.tsx — it's
 * Enquiries' "Console" tab now, not listed here. Its "Analytics" sub-tab
 * (a DIFFERENT thing — the per-advisor AnalyticsPanel, nested at
 * /workbench/analytics only to dodge the top-level /analytics route) moved
 * to its own top-level route, /advisor-analytics, since /workbench no
 * longer exists to nest it under.
 *
 * This is a Next.js ROUTE GROUP — the parens in "(workbench)" mean this
 * folder adds NO segment to the URL.
 * ===========================================================================*/
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canSeeMargin, isAdmin } from "../../../lib/advisorHelpers";
import { Icon } from "../../../components/ui";
import { InviteCustomerForm } from "../../../components/InviteCustomerForm";
import { cx } from "../../../lib/cx";

const TABS = [
  { key: "orders", label: "Orders Board", icon: "luggage" },
  { key: "queue", label: "Servicing Queue", icon: "shield" },
  { key: "disruptions", label: "Disruptions", icon: "alert" },
  { key: "approvals", label: "Approvals", icon: "shield" },
  { key: "myday", label: "My Day", icon: "sliders" },
  { key: "proposals", label: "Proposals", icon: "note" },
  { key: "leads", label: "Leads", icon: "inbox" },
  { key: "comms", label: "Communications", icon: "bell" },
  { key: "analytics", label: "Analytics", icon: "compass", path: "/advisor-analytics" },
  { key: "visa", label: "Visa Desk", icon: "visa" },
  { key: "appointments", label: "Appointments", icon: "visa" },
  { key: "servicing", label: "Servicing", icon: "shield" },
  { key: "desk", label: "Desk", icon: "sliders" },
  { key: "delivery", label: "Delivery", icon: "bell" },
  // Earnings / Reconciliation are ADVISOR-INTERNAL economics — ported exactly:
  // gated behind canSeeMargin(), same as the tab buttons in View.
  { key: "earnings", label: "Earnings", icon: "sliders", gated: true },
  { key: "recon", label: "Reconciliation", icon: "shield", gated: true },
  // Admin oversight — ADMIN ONLY. Hidden entirely (not just disabled) for
  // every other role, mirroring the earnings/recon `gated` treatment but on
  // isAdmin() instead of canSeeMargin().
  { key: "admin", label: "Admin", icon: "shield", adminOnly: true },
];

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/orders";
  const activeTab = pathname.startsWith("/advisor-analytics") ? "analytics" : pathname.split("/")[1] || "orders";
  const visibleTabs = TABS.filter((t) => (!t.gated || canSeeMargin()) && (!t.adminOnly || isAdmin()));

  const [inviteOpen, setInviteOpen] = useState(false);
  // 15 tabs still wrap to two lines at typical widths. Defaults to showing
  // all of them (matches prior behavior) — the toggle button next to
  // Invite Customer collapses to a single row (overflow clipped).
  const [tabsExpanded, setTabsExpanded] = useState(true);

  return (
    <div className="taw">
      <div className="area-header">
        <div className="area-title-row">
          <h1>Advisor Workbench</h1>
          <div className="area-actions">
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setInviteOpen(true)}>
              <Icon name="send" size={13} />
              Invite Customer
            </button>
            <button
              className="area-tabs-toggle"
              onClick={() => setTabsExpanded((v) => !v)}
              aria-expanded={tabsExpanded}
              aria-label={tabsExpanded ? "Collapse tabs to one row" : "Show all tabs"}
              title={tabsExpanded ? "Collapse tabs to one row" : "Show all tabs"}
            >
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </div>
        <div className={cx("area-tabs", !tabsExpanded && "is-collapsed")} role="tablist" aria-label="Workbench section">
          {visibleTabs.map((t) => (
            <Link
              key={t.key}
              href={(t as any).path || "/" + t.key}
              role="tab"
              id={"taw-tab-" + t.key}
              aria-selected={activeTab === t.key ? "true" : "false"}
              className={cx("area-tab", activeTab === t.key && "is-active")}
            >
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {inviteOpen ? <InviteCustomerForm onClose={() => setInviteOpen(false)} /> : null}

      <div className="taw-main">{children}</div>
    </div>
  );
}
