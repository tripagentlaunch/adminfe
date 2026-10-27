"use client";
/* =============================================================================
 * TripAgent — src/app/(workbench)/layout.tsx
 * Advisor Workbench's sub-nav, grouped (2026-10-27): Orders · Servicing ·
 * Approvals · My Work · Visa · Finance (margin roles) · Admin (admins), with
 * each group's pages as a second row — see GROUPS below — plus the Invite
 * Customer action.
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
import { InviteSomeoneButton } from "../../../components/InviteSomeoneButton";
import { useWorkbench } from "../../../lib/workbenchContext";
import { cx } from "../../../lib/cx";

// 2026-10-27: the 17 flat tabs are grouped into a few sections so a first-time
// advisor sees what each area is for. Clicking a group opens its first page
// (same number of clicks as before); a group with several pages shows them as
// a second row. Every route is unchanged. Analytics left this bar: it lives in
// the sidebar's Analytics page (with a "My performance" view).
type Page = { key: string; label: string; hint: string };
type Group = { key: string; label: string; icon: string; hint: string; pages: Page[]; gated?: boolean; adminOnly?: boolean };

const GROUPS: Group[] = [
  { key: "orders", label: "Orders", icon: "luggage", hint: "Bookings: new booking, travellers, payment, tickets",
    pages: [{ key: "orders", label: "Orders", hint: "" }] },
  { key: "servicing", label: "Servicing", icon: "shield", hint: "After booking: changes, cancellations, disruptions, documents",
    pages: [
      { key: "queue", label: "Servicing Queue", hint: "Open cases waiting on you" },
      { key: "servicing", label: "Cases", hint: "Raise and track servicing requests" },
      { key: "disruptions", label: "Disruptions", hint: "Flight delays, cancellations, schedule changes" },
      { key: "desk", label: "Changes & Disputes", hint: "Hotel changes, disputes, group air" },
      { key: "delivery", label: "Delivery", hint: "Tickets and vouchers sent to customers" },
    ] },
  { key: "approvals", label: "Approvals", icon: "check", hint: "Items waiting for an approval",
    pages: [{ key: "approvals", label: "Approvals", hint: "" }] },
  { key: "mywork", label: "My Work", icon: "sliders", hint: "Your day, leads, proposals and messages",
    pages: [
      { key: "myday", label: "My Day", hint: "Today's tasks and follow-ups" },
      { key: "leads", label: "Leads", hint: "New leads to pick up" },
      { key: "proposals", label: "Proposals", hint: "Proposals you've sent" },
      { key: "comms", label: "Communications", hint: "WhatsApp and email threads" },
    ] },
  { key: "visa", label: "Visa", icon: "visa", hint: "Visa applications and appointments",
    pages: [
      { key: "visa", label: "Visa Desk", hint: "Applications in progress" },
      { key: "appointments", label: "Appointments", hint: "Biometrics and embassy slots" },
    ] },
  { key: "finance", label: "Finance", icon: "tag", hint: "Earnings and reconciliation", gated: true,
    pages: [
      { key: "earnings", label: "Earnings", hint: "" },
      { key: "recon", label: "Reconciliation", hint: "" },
    ] },
  { key: "admin", label: "Admin", icon: "people", hint: "Access requests, advisors, super keys", adminOnly: true,
    pages: [{ key: "admin", label: "Admin", hint: "" }] },
];

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/orders";
  const activePage = pathname.split("/")[1] || "orders";
  const groups = GROUPS.filter((g) => (!g.gated || canSeeMargin()) && (!g.adminOnly || isAdmin()));
  const activeGroup = groups.find((g) => g.pages.some((p) => p.key === activePage)) || groups[0];

  const [inviteOpen, setInviteOpen] = useState(false);
  const { reloadInbox } = useWorkbench();
  // Inviting customers is an admin task, not a daily advisor action: both
  // invite flows live on the Admin page only.
  const onAdmin = activeGroup.key === "admin";

  return (
    <div className="taw">
      <div className="area-header">
        <div className="area-title-row">
          <h1>Advisor Workbench</h1>
          {onAdmin ? (
            <div className="area-actions">
              <InviteSomeoneButton onInvited={reloadInbox} />
              <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setInviteOpen(true)}>
                <Icon name="send" size={13} />
                Invite Customer
              </button>
            </div>
          ) : null}
        </div>
        <div className="area-tabs" role="tablist" aria-label="Workbench sections">
          {groups.map((g) => (
            <Link
              key={g.key}
              href={"/" + g.pages[0].key}
              role="tab"
              id={"taw-tab-" + g.key}
              title={g.hint}
              aria-selected={activeGroup.key === g.key ? "true" : "false"}
              className={cx("area-tab", activeGroup.key === g.key && "is-active")}
            >
              <Icon name={g.icon} size={15} />
              <span>{g.label}</span>
            </Link>
          ))}
        </div>
        {activeGroup.pages.length > 1 ? (
          <div className="taw-subtabs" role="tablist" aria-label={activeGroup.label + " pages"}>
            {activeGroup.pages.map((p) => (
              <Link
                key={p.key}
                href={"/" + p.key}
                role="tab"
                title={p.hint}
                aria-selected={activePage === p.key ? "true" : "false"}
                className={cx("taw-subtab", activePage === p.key && "is-active")}
              >
                {p.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {inviteOpen ? <InviteCustomerForm onClose={() => setInviteOpen(false)} /> : null}

      <div className="taw-main">{children}</div>
    </div>
  );
}
