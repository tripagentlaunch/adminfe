"use client";
/* =============================================================================
 * TripAgent — src/components/ShellChrome.tsx
 * The top-level app shell. As of 2026-08-28 this is a Jira-style GLOBAL
 * SIDEBAR (brand top, section links, AccountMenu pinned to the bottom) —
 * previously a horizontal top bar (brand + a row of tabs). This was a pure
 * navigation-placement move: every link, route, and the account menu are
 * unchanged, just laid out vertically instead of horizontally. Nothing else
 * about Advisor Workbench, Call Copilot, Supplier Broadcast, etc. was
 * restructured — see design_reference_jira memory: the Jira-style treatment
 * is scoped to this nav shell only, not the areas it links to.
 *
 * "Advisor Workbench", "Supplier Broadcast", "Journeys", "Trending & Deals",
 * "Call Copilot" and "Analytics" are real, routed links — Next.js's
 * file-based routing under src/app/ switches between them; this component
 * only renders the nav chrome + `children` (whatever the current route's
 * page/layout is). Only /workbench is wired to a real page in this pass —
 * the other five link to their real future paths (/broadcast, /journeys,
 * /pulse, /copilot, /analytics) which 404 for now; that's expected (see
 * later passes). "Member View" is a plain external link.
 *
 * Brand mark reuses AdvisorLoginGate's own sign-in-card treatment
 * (`<Icon name="shield" /><span>TripAgent</span>`) — no new logo invented.
 *
 * MEMBER_APP_URL: advisor-panel and the legacy web/ (still hosting
 * member.html) deploy as two SEPARATE Vercel projects with no recorded
 * relationship in this repo. NEXT_PUBLIC_MEMBER_APP_URL lets each
 * environment point at the real URL (mirrors services/api.ts's
 * NEXT_PUBLIC_FASTAPI_BASE pattern) — "/member.html" below is an
 * unconfirmed placeholder, not a known-good path.
 * ===========================================================================*/
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { AccountMenu } from "./AccountMenu";
import { AdvisorSessionContext } from "../lib/advisorSessionContext";
import { cx } from "../lib/cx";
import "../styles/app-shell.css";

const MEMBER_APP_URL = process.env.NEXT_PUBLIC_MEMBER_APP_URL || "/member.html";

// "Enquiries" (route stays /console — renamed the page, not the URL, to
// avoid touching every link into it) — the pre-proposal phase: Console +
// Proposal Composer, see src/app/(authenticated)/console/layout.tsx's
// docblock for the full history (originally "Console," a literal build of
// the EIR docx's 8-screen flat model, trimmed down 2026-08-31). Advisor
// Workbench deliberately left untouched/unrenamed in this pass — nearly
// every route under it shares WorkbenchContext, so splitting it further
// would be a much larger refactor than this rename.

export function ShellChrome({
  advisorId,
  role,
  onSignOut,
  children,
}: {
  advisorId: string;
  role: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const activeTop = pathname.startsWith("/console")
    ? "console"
    : pathname.startsWith("/broadcast")
    ? "broadcast"
    : pathname.startsWith("/journeys")
      ? "journeys"
      : pathname.startsWith("/pulse")
        ? "pulse"
        : pathname.startsWith("/copilot")
          ? "copilot"
          : pathname.startsWith("/analytics")
            ? "analytics"
            : "workbench";

  // Collapse/expand — session-only UI state, deliberately NOT persisted
  // (localStorage, etc.): resets to expanded on every reload, per designer.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AdvisorSessionContext.Provider value={{ advisorId, role, onSignOut }}>
      <div className="ta-shell">
        <div className={cx("ta-shell-nav", collapsed && "is-collapsed")} role="navigation" aria-label="TripAgent sections">
          <div className="ta-shell-brand">
            <div className="ta-shell-brand-row">
              {collapsed ? null : <Icon name="shield" size={18} />}
              <span className="ta-shell-word">TripAgent</span>
              <button
                className="ta-shell-collapse"
                onClick={() => setCollapsed((v) => !v)}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Icon name="sidebar" size={20} />
              </button>
            </div>
          </div>
          <div className="ta-shell-tabs" role="tablist" aria-label="TripAgent sections">
            <Link
              href="/console"
              className={"ta-shell-tab" + (pathname.startsWith("/console") ? " is-active" : "")}
              role="tab"
              aria-selected={pathname.startsWith("/console")}
              title="Enquiries"
            >
              <Icon name="inbox" size={18} />
              <span>Enquiries</span>
            </Link>
            <Link
              href="/orders"
              className={"ta-shell-tab" + (activeTop === "workbench" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "workbench"}
              title="Advisor Workbench"
            >
              <Icon name="sliders" size={18} />
              <span>Advisor Workbench</span>
            </Link>
            <Link
              href="/broadcast"
              className={"ta-shell-tab" + (activeTop === "broadcast" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "broadcast"}
              title="Supplier Broadcast"
            >
              <Icon name="send" size={18} />
              <span>Supplier Broadcast</span>
            </Link>
            <Link
              href="/journeys"
              className={"ta-shell-tab" + (activeTop === "journeys" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "journeys"}
              title="Journeys"
            >
              <Icon name="compass" size={18} />
              <span>Journeys</span>
            </Link>
            <Link
              href="/pulse"
              className={"ta-shell-tab" + (activeTop === "pulse" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "pulse"}
              title="Trending & Deals"
            >
              <Icon name="trend" size={18} />
              <span>Trending & Deals</span>
            </Link>
            <Link
              href="/copilot"
              className={"ta-shell-tab" + (activeTop === "copilot" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "copilot"}
              title="Call Copilot"
            >
              <Icon name="chat" size={18} />
              <span>Call Copilot</span>
            </Link>
            <Link
              href="/analytics"
              className={"ta-shell-tab" + (activeTop === "analytics" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "analytics"}
              title="Analytics"
            >
              <Icon name="radar" size={18} />
              <span>Analytics</span>
            </Link>
            <a className="ta-shell-tab" href={MEMBER_APP_URL} target="_blank" rel="noreferrer" title="Member View">
              <Icon name="arrowUR" size={18} />
              <span>Member View ↗</span>
            </a>
          </div>
          <div className="ta-shell-footer">
            <AccountMenu advisorId={advisorId} role={role} onSignOut={onSignOut} />
          </div>
        </div>
        <div className="ta-shell-body">
          {/* Route-switch transition: keying on activeTop forces a fresh DOM
              node on every top-level tab change, replaying .taw-fade-in. */}
          <div key={activeTop} className="taw-fade-in">
            {children}
          </div>
        </div>
      </div>
    </AdvisorSessionContext.Provider>
  );
}
