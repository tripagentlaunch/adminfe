"use client";
/* =============================================================================
 * TripAgent — src/components/panels/QueueProfileAccordion.tsx
 * Console's left column (2026-09-01 restructure) — Queue and Traveller
 * Profile now share ONE column instead of Queue getting its own column and
 * Profile living in the third column with Summary. Implements "Mode H"
 * from the interaction-lab comparison (see src/app/lab/queue-profile/ —
 * gitignored, local-only): a manual accordion (either section opens on
 * click, at any time) PLUS auto-collapse-on-select (picking an enquiry
 * also collapses Queue and opens Profile, no extra click for the common
 * "pick → review" path). Ported 1:1 from the lab's ModeAccordion + its
 * selectEnquiry() auto-collapse behavior, now against the real
 * EnquiryInbox/Member360 components and real data instead of mock rows.
 *
 * 2026-09-01, same day: the header ROW is no longer the click target and
 * shows no hover state — .taw-acc-h is now a plain display row (icon,
 * title, sub-label). Only the chevron is interactive now, as its own
 * dedicated .taw-acc-toggle button styled to match the sidebar's own
 * collapse toggle (ShellChrome.tsx's .ta-shell-collapse) exactly: bare at
 * rest, --champagne background on hover. Clicking a section's toggle
 * opens that section and collapses the other, in either direction.
 *
 * 2026-09-02: Queue and Traveller Profile split into two visually
 * separate boxes (each its own bordered/shadowed/rounded card, like
 * Itinerary Builder or Search) instead of one shared card with an
 * internal divider between sections — per direct request. The
 * mutual-exclusion toggle behavior above (only one open at a time,
 * clicking either's chevron flips to the other) is UNCHANGED — this was
 * a container/visual change only, not an interaction change. .taw-acc
 * (the bordered-card styling) now wraps each section individually;
 * .taw-acc-stack (new, just a flex column + gap) wraps the pair so they
 * still occupy the one shared column.
 *
 * 2026-09-02, later same day: the pair now fits the column's full height
 * exactly, never exceeding the screen — before this, Queue could grow
 * with however many enquiries exist and push the total taller than the
 * viewport. Traveller Profile now ALWAYS renders a body (previously only
 * when open) — a real profile when it's the open section with a member
 * selected, otherwise a placeholder (icon + short description) — and
 * reserves a min-height for that placeholder so it never shrinks to just
 * its header row. Whichever section IS open gets the rest of the
 * column's height via flex (`.taw-acc.is-open`) and scrolls internally
 * if its own content is taller than that — see .taw-acc-stack/.taw-acc/
 * .taw-acc--profile in advisor-workbench.css for the actual height
 * mechanics. Per direct confirmation: the collapsed state and the
 * "nothing selected" empty state share the exact same placeholder for
 * now ("we'll work on making it better but for now it's this").
 *
 * 2026-10-09: Traveller Profile now lists every traveller when nothing is
 * selected, with a search box — claimed customers (site_members), people
 * invited but not yet claimed (site_invitation_codes) and CRM members,
 * merged by email (WorkbenchDataProvider's buildTravellers). Picking one
 * with a CRM members row runs the existing enquiry/member flow; anyone
 * else gets a TravellerCard with what's known about them. "All
 * travellers" goes back to the list.
 *
 * 2026-10-11: Queue is no longer a section here — it is a "Queue (N open)"
 * dropdown (QueueMenu below) portalled into the Enquiries tab row, and
 * Traveller Profile is the column's only section, always open. The
 * accordion/mutual-exclusion notes above describe the older two-section
 * layout.
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/cx";
import { useWorkbench } from "../../lib/workbenchContext";
import { fmtDate } from "../../lib/advisorHelpers";
import { Empty, Icon } from "../ui";
import { EnquiryInbox } from "./EnquiryInbox";
import { Member360 } from "./Member360";

export function QueueProfileAccordion(props: any) {
  const {
    enquiries, members, membersById, inboxLoading, selEnqId, member,
    onSelectEnquiry, onPickMember, travellerProfile, travellerProfileLoading,
    onConvoTarget,
  } = props;
  const setConvo = (t: any) => { if (onConvoTarget) onConvoTarget(t); };
  const { travellers } = useWorkbench();

  // showList — true after "All travellers", until the next pick. With
  // nothing selected the list shows regardless.
  const [showList, setShowList] = useState(false);
  // picked — a traveller with no CRM members row (claimed or invited only),
  // shown as a TravellerCard instead of Member360.
  const [picked, setPicked] = useState<any>(null);

  function selectEnquiry(e: any, m: any, keepConvo?: any) {
    onSelectEnquiry(e, m);
    setShowList(false);
    setPicked(null);
    // enquiry flow owns the centre column, but if the caller had a
    // traveller object with a real invitation code (keepConvo), keep it
    // as the Conversation panel's target instead of nulling it out —
    // otherwise the panel falls back to a codeless CRM member object and
    // shows "no access code on file" / "New lead" even when we already
    // had the right code in hand.
    setConvo(keepConvo || null);
  }

  function selectTraveller(t: any) {
    // Either way, this traveller becomes the Conversation panel's target — it
    // carries their invitation code + phone, which is all the panel needs.
    setConvo(t);
    if (!t.member) {
      setPicked(t);
      setShowList(false);
      return;
    }
    setPicked(null);
    const m = t.member;
    const latestOpen = enquiries
      .filter((e: any) => e.member_id === m.id && (e.status || "open") !== "closed")
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
    if (latestOpen) selectEnquiry(latestOpen, m, t);
    else {
      onPickMember(m);
      setShowList(false);
    }
  }

  const openEnquiries = enquiries.filter((e: any) => (e.status || "open") !== "closed");

  const showTravellerList = showList || (!selEnqId && !member && !picked);

  return (
    <div className="taw-acc-stack">
      {/* Queue now lives in the Enquiries tab row (portalled into
          #console-header-queue, see console/layout.tsx) as a dropdown, not
          as a section here — picking an enquiry runs the same selectEnquiry. */}
      <QueueMenu
        enquiries={openEnquiries}
        members={members}
        membersById={membersById}
        loading={inboxLoading}
        selectedId={selEnqId}
        onSelect={selectEnquiry}
        onPickMember={onPickMember}
      />

      <div className="taw-acc taw-acc--profile is-open">
        <div className="taw-acc-h is-open">
          <Icon name="compass" size={20} />
          <h3>Traveller Profile</h3>
          {/* Back to the list — in the header row (not its own line) while a
              single traveller is showing. */}
          {!showTravellerList ? (
            <button
              type="button"
              className="taw-trav-back"
              style={{ padding: 0 }}
              onClick={() => { setShowList(true); setPicked(null); setConvo(null); }}
            >
              ← All travellers
            </button>
          ) : null}
          {travellers.length ? <span className="sub">{travellers.length} travellers</span> : null}
        </div>
        <div className={cx("taw-acc-body", showTravellerList && "flush")}>
          {showTravellerList ? (
            <TravellerList
              travellers={travellers}
              loading={inboxLoading}
              enquiries={enquiries}
              selectedKey={picked ? picked.key : null}
              selectedMemberId={member && member.id}
              onSelect={selectTraveller}
            />
          ) : (
            <>
              {picked ? (
                <TravellerCard t={picked} />
              ) : !selEnqId ? (
                <Member360 member={member} />
              ) : travellerProfileLoading ? (
                <Empty icon={<Icon name="user" size={26} />}>Loading traveller profile…</Empty>
              ) : travellerProfile ? (
                <Member360 member={travellerProfile.member} enquiry={travellerProfile.enquiry} />
              ) : (
                <Empty icon={<Icon name="user" size={26} />}>
                  Couldn&apos;t load this traveller&apos;s profile — try selecting the enquiry again.
                </Empty>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// QueueMenu — "Queue (N open)" pill + popover, rendered into the Enquiries tab
// row via a portal. Renders nothing until that row's target element exists
// (i.e. on any page without it).
function QueueMenu(props: any) {
  const { enquiries, selectedId } = props;
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("console-header-queue"));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!target) return null;
  return createPortal(
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="taw-btn taw-btn--sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999 }}
      >
        <Icon name="inbox" size={14} />
        Queue{enquiries.length ? " (" + enquiries.length + " open)" : ""}
        <Icon name="chevron" size={13} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", width: 360, maxWidth: "90vw", zIndex: 60,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
            boxShadow: "0 12px 32px rgba(40,28,22,0.18)", maxHeight: "min(65vh, 520px)", overflowY: "auto",
          }}
        >
          <EnquiryInbox
            enquiries={enquiries}
            members={props.members}
            membersById={props.membersById}
            loading={props.loading}
            selectedId={selectedId}
            onSelect={(e: any, m: any) => { setOpen(false); props.onSelect(e, m); }}
            onPickMember={(m: any) => { setOpen(false); props.onPickMember(m); }}
          />
        </div>
      ) : null}
    </div>,
    target
  );
}

const KIND_LABEL: Record<string, string> = { member: "Member", invited: "Invited", expired: "Invite expired" };

// ---- Hover preview (2026-10) ------------------------------------------------
// A read-only summary shown near the cursor while hovering/focusing a traveller
// card. Uses only data already in memory — the traveller row, the enquiries
// list, the session itineraries and the pipeline-status map — so hovering never
// triggers a request. Rows with nothing known are left out.
function travellerPreviewRows(t: any, enquiries: any[], itins: Record<string, any>, pipeline: Record<string, any>): [string, string][] {
  const rows: [string, string | null][] = [];
  const mine = t.member ? enquiries.filter((e: any) => e.member_id === t.member.id) : [];
  if (t.member) {
    const open = mine.filter((e: any) => (e.status || "open") !== "closed");
    rows.push(["Enquiries", mine.length ? `${open.length} open · ${mine.length} total` : "None yet"]);
    const latest = mine.slice().sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
    if (latest) {
      const intent = latest.intent || {};
      let dests = intent.destinations || intent.destination || [];
      if (typeof dests === "string") dests = [dests];
      rows.push(["Trip status", String(latest.status || "open").replace(/_/g, " ")]);
      rows.push(["Destination", (dests as string[]).slice(0, 2).join(", ") || null]);
      const itin = itins[latest.id];
      rows.push([
        "Travel dates",
        (itin && itin.dateRange) || (latest.ask && latest.ask.dates && latest.ask.dates.month) || "Not set yet",
      ]);
      rows.push(["Latest enquiry", latest.created_at ? fmtDate(latest.created_at) : null]);
    }
    const withItin = mine.filter((e: any) => itins[e.id] || (pipeline[e.id] && pipeline[e.id].itinerary_generated_at)).length;
    rows.push(["Itineraries", mine.length ? `${withItin} ${withItin === 1 ? "itinerary" : "itineraries"}` : null]);
    const proposals = mine.map((e: any) => pipeline[e.id] && pipeline[e.id].proposal).filter(Boolean);
    if (proposals.length) {
      const p = proposals[0];
      rows.push(["Proposal", p.outcome ? String(p.outcome).replace(/_/g, " ") : p.sent_at ? "Sent " + fmtDate(p.sent_at) : null]);
    }
  }
  rows.push(["City", t.city || null]);
  rows.push(["Plan", t.plan ? String(t.plan).replace(/_/g, " ") : null]);
  rows.push(["Member until", t.memberUntil ? fmtDate(t.memberUntil) : null]);
  rows.push([t.kind === "member" ? "Joined" : "Invited", t.since ? fmtDate(t.since) : null]);
  if (t.kind !== "member" && t.expiresAt) rows.push(["Invite expires", fmtDate(t.expiresAt)]);
  if (!t.member && t.kind === "member") rows.push(["Note", "No enquiry yet"]);
  return rows.filter((r): r is [string, string] => !!r[1]);
}

function TravellerHoverPreview({ t, x, y, rows }: { t: any; x: number; y: number; rows: [string, string][] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Offset from the cursor, flipped/clamped so it never leaves the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, gap = 16, pad = 8;
    let left = x + gap;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, x - gap - w);
    let top = y + gap;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - h);
    setPos({ left, top });
  }, [x, y, rows]);
  return createPortal(
    <div
      ref={ref}
      className="taw-trav-pop"
      role="tooltip"
      style={{ left: pos ? pos.left : x + 16, top: pos ? pos.top : y + 16, visibility: pos ? "visible" : "hidden" }}
    >
      <div className="taw-trav-pop-h">
        <span className="taw-trav-pop-name">{t.name || "Unnamed traveller"}</span>
        <span className={"taw-trav-badge is-" + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="taw-trav-pop-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>,
    document.body
  );
}

function TravellerList({ travellers, loading, enquiries, selectedKey, selectedMemberId, onSelect }: {
  travellers: any[];
  enquiries: any[];
  loading: boolean;
  selectedKey: string | null;
  selectedMemberId?: string;
  onSelect: (t: any) => void;
}) {
  const [q, setQ] = useState("");
  const { itinerariesByEnquiry, pipelineStatusByEnquiry } = useWorkbench();
  // Hover preview: shown after a short delay so sweeping the cursor down the
  // list doesn't flash a popup per card; cleared on leave, click, or scroll.
  const [hover, setHover] = useState<{ t: any; x: number; y: number } | null>(null);
  const hoverTimer = useRef<any>(null);
  const hoverRows = useMemo(
    () => (hover ? travellerPreviewRows(hover.t, enquiries || [], itinerariesByEnquiry || {}, pipelineStatusByEnquiry || {}) : []),
    [hover && hover.t, enquiries, itinerariesByEnquiry, pipelineStatusByEnquiry]
  );
  function showHover(t: any, x: number, y: number) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover({ t, x, y }), 250);
  }
  function moveHover(t: any, x: number, y: number) {
    setHover((h) => (h && h.t === t ? { t, x, y } : h));
  }
  function hideHover() {
    clearTimeout(hoverTimer.current);
    setHover(null);
  }
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return travellers;
    return travellers.filter((t: any) =>
      [t.name, t.email, t.phone, t.code].some((v) => v && String(v).toLowerCase().includes(needle))
    );
  }, [travellers, q]);

  return (
    <div className="taw-trav">
      <div className="taw-trav-search">
        <input
          className="taw-input"
          type="search"
          placeholder="Search by name, email, phone or code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && !travellers.length ? (
        <Empty icon={<Icon name="user" size={26} />}>Loading travellers…</Empty>
      ) : !filtered.length ? (
        <Empty icon={<Icon name="user" size={26} />}>{q ? "No travellers match that search." : "No travellers yet."}</Empty>
      ) : (
        <div className="taw-trav-list" onScroll={hideHover}>
          {filtered.map((t: any) => {
            const active = selectedKey === t.key || (t.member && selectedMemberId === t.member.id);
            return (
              <button
                key={t.key}
                type="button"
                className={cx("taw-trav-item", active && "is-active")}
                aria-current={active ? "true" : undefined}
                onClick={() => { hideHover(); onSelect(t); }}
                onMouseEnter={(e) => showHover(t, e.clientX, e.clientY)}
                onMouseMove={(e) => moveHover(t, e.clientX, e.clientY)}
                onMouseLeave={hideHover}
                onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); showHover(t, r.right - 24, r.top + r.height / 2); }}
                onBlur={hideHover}
              >
                <div className="taw-trav-main">
                  <div className="taw-trav-top">
                    <span className="taw-trav-name">{t.name || "Unnamed traveller"}</span>
                    <span className={"taw-trav-badge is-" + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>
                  </div>
                  {t.email || t.phone ? (
                    <>
                      {t.email ? <div className="taw-trav-line">{t.email}</div> : null}
                      {t.phone ? <div className="taw-trav-line">{t.phone}</div> : null}
                    </>
                  ) : (
                    <div className="taw-trav-line">No contact details</div>
                  )}
                </div>
                <Icon name="chevron" size={14} className="taw-trav-chev" style={{ transform: "rotate(-90deg)" }} />
              </button>
            );
          })}
        </div>
      )}
      {hover && hoverRows.length ? <TravellerHoverPreview t={hover.t} x={hover.x} y={hover.y} rows={hoverRows} /> : null}
    </div>
  );
}

function TravellerCard({ t }: { t: any }) {
  const rows: [string, any][] = [
    ["Email", t.email],
    ["Phone", t.phone],
    ["City", t.city],
    ["Plan", t.plan ? String(t.plan).replace(/_/g, " ") : null],
    ["Member until", t.memberUntil ? fmtDate(t.memberUntil) : null],
    ["Invitation code", t.code],
    [t.kind === "member" ? "Joined" : "Invited", t.since ? fmtDate(t.since) : null],
    ["Invite expires", t.kind !== "member" && t.expiresAt ? fmtDate(t.expiresAt) : null],
  ];
  return (
    <div className="taw-trav-card">
      <div className="taw-enq-top">
        <div className="taw-trav-card-name">{t.name || "Unnamed traveller"}</div>
        <span className={"taw-trav-badge is-" + t.kind}>{KIND_LABEL[t.kind] || t.kind}</span>
      </div>
      <dl>
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="taw-trav-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <p className="taw-trav-note">
        {t.kind === "member"
          ? "No enquiry yet — their full traveller profile appears here once they send one."
          : "Hasn't claimed their invitation yet."}
      </p>
    </div>
  );
}
