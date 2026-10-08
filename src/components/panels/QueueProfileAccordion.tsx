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
 * 2026-10-09: Traveller Profile now lists every traveller (members) when
 * nothing is selected, with a search box. Picking one with an open
 * enquiry selects that enquiry (full backend profile); one without just
 * shows their member record. "All travellers" goes back to the list.
 * ===========================================================================*/
import { useMemo, useState } from "react";
import { cx } from "../../lib/cx";
import { Empty, Icon } from "../ui";
import { EnquiryInbox } from "./EnquiryInbox";
import { Member360 } from "./Member360";

export function QueueProfileAccordion(props: any) {
  const {
    enquiries, members, membersById, inboxLoading, selEnqId, member,
    onSelectEnquiry, onPickMember, travellerProfile, travellerProfileLoading,
  } = props;

  const [open, setOpen] = useState<"queue" | "profile">("queue");
  // showList — true after "All travellers", until the next pick. With
  // nothing selected the list shows regardless.
  const [showList, setShowList] = useState(false);

  // Only two mutually-exclusive sections, so a real toggle (open <-> the
  // other one) is the same function regardless of WHICH toggle was
  // clicked — flip away from whatever's currently open. Previously each
  // toggle unconditionally called setOpen("queue")/setOpen("profile"),
  // which was a no-op when clicking a section's own toggle while it was
  // already open — that's the bug: couldn't collapse Queue from Queue's
  // own toggle (or Profile from Profile's).
  function toggle() {
    setOpen((prev) => (prev === "queue" ? "profile" : "queue"));
  }

  function selectEnquiry(e: any, m: any) {
    onSelectEnquiry(e, m);
    setShowList(false);
    setOpen("profile"); // auto-collapse Queue / open Profile — the "B" half of Mode H
  }

  function selectTraveller(m: any) {
    const latestOpen = enquiries
      .filter((e: any) => e.member_id === m.id && (e.status || "open") !== "closed")
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
    if (latestOpen) selectEnquiry(latestOpen, m);
    else {
      onPickMember(m);
      setShowList(false);
    }
  }

  const openEnquiries = enquiries.filter((e: any) => (e.status || "open") !== "closed");
  const qOpen = open === "queue";
  const profileOpen = !qOpen;
  // Placeholder whenever there's nothing real to show in that space —
  // either because the section is collapsed, or because nothing's
  // selected yet. NOT keyed off `member` anymore (Phase 2): a
  // concierge_chat lead has member_id null, so `member` is always null
  // for exactly the enquiries this real profile endpoint exists for —
  // gating on `selEnqId` instead is what actually reflects "is there an
  // enquiry selected for this endpoint to load."
  const showProfilePlaceholder = !profileOpen;
  const showTravellerList = showList || (!selEnqId && !member);

  return (
    <div className="taw-acc-stack">
      <div className={cx("taw-acc", qOpen && "is-open")}>
        <div className={"taw-acc-h" + (qOpen ? " is-open" : "")}>
          <Icon name="inbox" size={20} />
          <h3>Queue</h3>
          {openEnquiries.length ? <span className="sub">{openEnquiries.length} open</span> : null}
          <button
            className="taw-acc-toggle"
            onClick={toggle}
            aria-label={qOpen ? "Collapse Queue" : "Expand Queue"}
            title={qOpen ? "Collapse Queue" : "Expand Queue"}
          >
            <Icon name="chevron" size={15} />
          </button>
        </div>
        {qOpen ? (
          <div className="taw-acc-body flush">
            <EnquiryInbox
              enquiries={openEnquiries}
              members={members}
              membersById={membersById}
              loading={inboxLoading}
              selectedId={selEnqId}
              onSelect={selectEnquiry}
              onPickMember={onPickMember}
            />
          </div>
        ) : null}
      </div>

      <div className={cx("taw-acc", "taw-acc--profile", profileOpen && "is-open")}>
        <div className={"taw-acc-h" + (profileOpen ? " is-open" : "")}>
          <Icon name="compass" size={20} />
          <h3>Traveller Profile</h3>
          {members.length ? <span className="sub">{members.length} travellers</span> : null}
          <button
            className="taw-acc-toggle"
            onClick={toggle}
            aria-label={profileOpen ? "Collapse Traveller Profile" : "Expand Traveller Profile"}
            title={profileOpen ? "Collapse Traveller Profile" : "Expand Traveller Profile"}
          >
            <Icon name="chevron" size={15} />
          </button>
        </div>
        <div className={cx("taw-acc-body", profileOpen && showTravellerList && "flush")}>
          {showProfilePlaceholder ? (
            <Empty icon={<Icon name="user" size={26} />}>
              Select an enquiry, or expand this section to browse all travellers.
            </Empty>
          ) : showTravellerList ? (
            <TravellerList members={members} loading={inboxLoading} selectedId={member && member.id} onSelect={selectTraveller} />
          ) : (
            <>
              <button type="button" className="taw-trav-back" onClick={() => setShowList(true)}>
                ← All travellers
              </button>
              {!selEnqId ? (
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

function TravellerList({ members, loading, selectedId, onSelect }: { members: any[]; loading: boolean; selectedId?: string; onSelect: (m: any) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m: any) =>
      [m.name, m.email, m.phone].some((v) => v && String(v).toLowerCase().includes(needle))
    );
  }, [members, q]);

  return (
    <div className="taw-trav">
      <div className="taw-trav-search">
        <input
          className="taw-input"
          type="search"
          placeholder="Search by name, email or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading && !members.length ? (
        <Empty icon={<Icon name="user" size={26} />}>Loading travellers…</Empty>
      ) : !filtered.length ? (
        <Empty icon={<Icon name="user" size={26} />}>{q ? "No travellers match that search." : "No travellers yet."}</Empty>
      ) : (
        <div className="taw-enq">
          {filtered.map((m: any) => (
            <button
              key={m.id}
              type="button"
              className={cx("taw-enq-item", selectedId === m.id && "is-active")}
              onClick={() => onSelect(m)}
            >
              <div className="taw-enq-top">
                <div className="taw-enq-name">{m.name || "Unnamed traveller"}</div>
              </div>
              <div className="taw-enq-meta">{[m.email, m.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
