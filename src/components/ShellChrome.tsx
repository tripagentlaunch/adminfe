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
 * later passes).
 *
 * Brand mark reuses AdvisorLoginGate's own sign-in-card treatment
 * (`<Icon name="shield" /><span>TripAgent</span>`) — no new logo invented.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { AccountMenu } from "./AccountMenu";
import { AdvisorSessionContext } from "../lib/advisorSessionContext";
import { cx } from "../lib/cx";
import "../styles/app-shell.css";

// "Enquiries" (route stays /console — renamed the page, not the URL, to
// avoid touching every link into it) — the pre-proposal phase: Console +
// Proposal Composer, see src/app/(authenticated)/console/layout.tsx's
// docblock for the full history (originally "Console," a literal build of
// the EIR docx's 8-screen flat model, trimmed down 2026-08-31). Advisor
// Workbench deliberately left untouched/unrenamed in this pass — nearly
// every route under it shares WorkbenchContext, so splitting it further
// would be a much larger refactor than this rename.

// Sidebar, grouped by what an advisor is doing (2026-10-27). Work = the daily
// flow (enquiry -> itinerary -> proposal -> booking); Tools = occasional
// helpers; Admin = access requests etc., one click from anywhere (admins only).
const NAV_SECTIONS: { label: string; adminOnly?: boolean; items: { key: string; href: string; label: string; icon: string; hint: string }[] }[] = [
  { label: "Work", items: [
    { key: "console", href: "/console", label: "Enquiries", icon: "inbox", hint: "Customer requests, itineraries and proposals" },
    { key: "workbench", href: "/orders", label: "Advisor Workbench", icon: "sliders", hint: "Bookings, servicing, approvals and visas" },
  ] },
  { label: "Tools", items: [
    { key: "copilot", href: "/copilot", label: "Call Copilot", icon: "chat", hint: "Live help while on a call" },
    { key: "broadcast", href: "/broadcast", label: "Supplier Broadcast", icon: "send", hint: "Ask suppliers for quotes" },
    { key: "pulse", href: "/pulse", label: "Trending & Deals", icon: "trend", hint: "Offers to share with customers" },
    { key: "journeys", href: "/journeys", label: "Journeys", icon: "compass", hint: "Automated customer touchpoints" },
  ] },
  { label: "Insights", items: [
    { key: "analytics", href: "/analytics", label: "Analytics", icon: "radar", hint: "Platform and your own performance" },
  ] },
  { label: "Admin", adminOnly: true, items: [
    { key: "admin", href: "/admin", label: "Admin", icon: "people", hint: "Approve access requests, manage advisors" },
  ] },
];

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
  const first = pathname.split("/")[1] || "";
  const activeTop =
    first === "console" ? "console"
    : first === "admin" ? "admin"
    : first === "analytics" || first === "advisor-analytics" ? "analytics"
    : ["broadcast", "journeys", "pulse", "copilot"].includes(first) ? first
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
            {NAV_SECTIONS.filter((sec) => !sec.adminOnly || String(role).toLowerCase() === "admin").map((sec, si) => (
              <div key={sec.label} className="ta-shell-section">
                {/* Section name when the sidebar is open; a thin divider on the icon rail. */}
                {expanded ? <div className="ta-shell-section-label">{sec.label}</div> : si > 0 ? <div className="ta-shell-section-rule" /> : null}
                {sec.items.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={"ta-shell-tab" + (activeTop === item.key ? " is-active" : "")}
                    role="tab"
                    aria-selected={activeTop === item.key}
                    title={item.label + " — " + item.hint}
                  >
                    <span className="ta-shell-tab-inner">
                      <Icon name={item.icon} size={20} />
                      <span className="ta-shell-tab-label">{item.label}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
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
