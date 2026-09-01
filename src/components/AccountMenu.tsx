"use client";
/* =============================================================================
 * TripAgent — src/components/AccountMenu.tsx
 * Replaces the old .taw-advisor cluster (label + advisor-switcher <select> +
 * avatar + role text + Sign out button, all inline in the sub-nav bar) with
 * a single account control in the global header (ShellChrome), matching the
 * Plain-style pattern: circle avatar, name + role stacked, caret opens a
 * popover menu. The advisor-switcher was dropped per design decision — this
 * account control shows only the signed-in advisor's own identity.
 *
 * Menu contents below "Sign out" are placeholder/dummy for now (no backend
 * support yet) — wire them up when a real preferences/status surface exists.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { advisors as fetchAdvisors } from "../services/api";
import { roleLabel } from "./AdvisorLoginGate";
import { Icon } from "./ui";

export function AccountMenu({
  advisorId,
  role,
  onSignOut,
}: {
  advisorId: string;
  role: string;
  onSignOut: () => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!advisorId) return;
    fetchAdvisors("select=id,name&order=name.asc")
      .then((list: any) => {
        const mine = (list || []).find((a: any) => a.id === advisorId);
        if (mine) setName(mine.name);
      })
      .catch(() => {});
  }, [advisorId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const displayName = name || "Advisor";
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="acct-menu" ref={rootRef}>
      <button className="acct-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <div className="acct-ava">{initials}</div>
        <div className="acct-id">
          <span className="acct-name">{displayName}</span>
          <span className="acct-role">{roleLabel(role)}</span>
        </div>
        <Icon name="chevron" size={14} className="acct-caret" />
      </button>
      {open ? (
        <div className="acct-pop" role="menu">
          <button className="acct-item" role="menuitem" onClick={() => setOpen(false)}>
            Set yourself as away
          </button>
          <button className="acct-item" role="menuitem" onClick={() => setOpen(false)}>
            Preferences
          </button>
          <div className="acct-sep" />
          <button
            className="acct-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
