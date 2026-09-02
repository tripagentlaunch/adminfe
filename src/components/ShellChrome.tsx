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
import { useEffect, useRef, useState } from "react";
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

  // Sidebar is a collapsed icon-only rail by default, and opens as an
  // OVERLAY (position:fixed, doesn't reflow page content — see
  // .ta-shell-nav-spacer in app-shell.css) two ways: hovering it, or
  // clicking the toggle to pin it open regardless of hover. Pin turns off
  // by clicking the toggle again, clicking any nav link, or clicking
  // outside the sidebar. Session-only — no persistence, always resets to
  // collapsed on reload.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pinned) return;
    function onDocPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setPinned(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [pinned]);

  return (
    <AdvisorSessionContext.Provider value={{ advisorId, role, onSignOut }}>
      <div className="ta-shell">
        <div className="ta-shell-nav-spacer" />
        <div
          ref={navRef}
          className={cx("ta-shell-nav", expanded && "is-expanded")}
          role="navigation"
          aria-label="TripAgent sections"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div className="ta-shell-brand">
            <div className="ta-shell-brand-row">
              {expanded ? <Icon name="shield" size={18} /> : null}
              <span className="ta-shell-word">TripAgent</span>
              <button
                className="ta-shell-collapse"
                onClick={() => setPinned((v) => !v)}
                aria-expanded={expanded}
                aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
                title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              >
                <Icon name="sidebar" size={20} />
              </button>
            </div>
          </div>
          <div className="ta-shell-tabs" role="tablist" aria-label="TripAgent sections" onClick={() => setPinned(false)}>
            <Link
              href="/console"
              className={"ta-shell-tab" + (pathname.startsWith("/console") ? " is-active" : "")}
              role="tab"
              aria-selected={pathname.startsWith("/console")}
              title="Enquiries"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="inbox" size={20} />
                <span className="ta-shell-tab-label">Enquiries</span>
              </span>
            </Link>
            <Link
              href="/orders"
              className={"ta-shell-tab" + (activeTop === "workbench" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "workbench"}
              title="Advisor Workbench"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="sliders" size={20} />
                <span className="ta-shell-tab-label">Advisor Workbench</span>
              </span>
            </Link>
            <Link
              href="/broadcast"
              className={"ta-shell-tab" + (activeTop === "broadcast" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "broadcast"}
              title="Supplier Broadcast"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="send" size={20} />
                <span className="ta-shell-tab-label">Supplier Broadcast</span>
              </span>
            </Link>
            <Link
              href="/journeys"
              className={"ta-shell-tab" + (activeTop === "journeys" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "journeys"}
              title="Journeys"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="compass" size={20} />
                <span className="ta-shell-tab-label">Journeys</span>
              </span>
            </Link>
            <Link
              href="/pulse"
              className={"ta-shell-tab" + (activeTop === "pulse" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "pulse"}
              title="Trending & Deals"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="trend" size={20} />
                <span className="ta-shell-tab-label">Trending & Deals</span>
              </span>
            </Link>
            <Link
              href="/copilot"
              className={"ta-shell-tab" + (activeTop === "copilot" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "copilot"}
              title="Call Copilot"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="chat" size={20} />
                <span className="ta-shell-tab-label">Call Copilot</span>
              </span>
            </Link>
            <Link
              href="/analytics"
              className={"ta-shell-tab" + (activeTop === "analytics" ? " is-active" : "")}
              role="tab"
              aria-selected={activeTop === "analytics"}
              title="Analytics"
            >
              <span className="ta-shell-tab-inner">
                <Icon name="radar" size={20} />
                <span className="ta-shell-tab-label">Analytics</span>
              </span>
            </Link>
            <a className="ta-shell-tab" href={MEMBER_APP_URL} target="_blank" rel="noreferrer" title="Member View">
              <span className="ta-shell-tab-inner">
                <Icon name="arrowUR" size={20} />
                <span className="ta-shell-tab-label">Member View ↗</span>
              </span>
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
