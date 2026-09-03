"use client";
/* =============================================================================
 * TripAgent — src/components/panels/WorkbenchTab.tsx
 * The /workbench route's composite — ported from the tab === "workbench"
 * render block inside `View` (web/js/advisor.js line ~6726-6767). Originally
 * Enquiry Inbox + Member 360 (row 1), Search Desks + Cart (row 2), Quote
 * Builder (row 3).
 *
 * Renamed/restructured 2026-08-31 per the Queue/Itinerary Builder/Traveller
 * Profile flow discussion — v2, correcting the first pass (see
 * DESIGN-CHANGES.md for both):
 *   - "Enquiry Inbox" → "Queue", "Member 360" → "Traveller Profile".
 *   - No separate "AI Draft" card — "Itinerary Builder" (center column)
 *     IS that job: the detailed, editable view where the advisor checks
 *     the AI-collected draft closely, one thing at a time (just flights,
 *     just Day 1, etc.), not an overview.
 *   - THREE columns, proportional widths (2fr/5fr/2fr — Itinerary Builder
 *     "considerable but not too much," ~5/9 of the row): (Queue/Traveller
 *     Profile accordion) | Itinerary Builder | Search Desks.
 *
 * 2026-09-01 restructure, done in two passes:
 *   1. Queue and Traveller Profile no longer get their own columns — they
 *      now SHARE the left column via QueueProfileAccordion ("Mode H" from
 *      the interaction-lab comparison, src/app/lab/queue-profile/ —
 *      gitignored/local-only): a manual accordion (either section opens on
 *      click, any time) plus auto-collapse-on-select (picking an enquiry
 *      also collapses Queue into Profile, no extra click for the common
 *      path).
 *   2. The right column is now Search Desks (SearchDesksPanel) instead of
 *      Summary — Search moved inline onto this screen ("accessible at all
 *      times with fewer clicks"), which is also why the standalone
 *      Enquiries → Search tab/route was deleted. Summary itself is GONE
 *      from this screen entirely, not just relocated — the plan is a
 *      Finalize-triggered overlay once the itinerary looks done, but that
 *      button + overlay are still undecided/deferred. `cart` (below)
 *      keeps accumulating everything added via Search in the meantime, so
 *      nothing's lost once that overlay actually gets built.
 *   - Itinerary Builder shows what the AI suggested — it is NOT the
 *     search UI (2026-08-31 correction). FlightDesk/HotelDesk/VisaDesk
 *     render in the right column now (SearchDesksPanel), not here. Falls
 *     back to a "not yet built" placeholder when the selected enquiry has
 *     no `ai_draft` (real Supabase enquiries don't yet); renders real
 *     flight/hotel segment cards when it does (currently only the 3 seeded
 *     mock enquiries — lib/mockEnquiries.ts). A segment with
 *     `mismatch: true` gets a flagged/highlighted treatment — that's the
 *     "AI draft vs. what was actually asked" check this screen exists for.
 *   - Quote Builder REMOVED from this screen for now — "will be in the
 *     next part" per the designer, not deleted from the codebase, just not
 *     rendered here.
 *
 * `member`/`selEnqId` — and the pickEnquiry/pickMember setters — are NOT
 * local here: View held them at the top level because CommsPanel (the
 * /comms route) reads the SAME `member` (web/js/advisor.js line ~6818), so
 * they're lifted into WorkbenchShell (App.jsx) alongside advisors/members/
 * enquiries/membersById, and passed down as props instead. Cart stays
 * local — nothing outside this tab reads it (still wired up for the
 * cross-surface "ta:add-to-cart" listener below).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { toast } from "../../lib/advisorHelpers";
import { Card, Empty, Icon } from "../ui";
import { QueueProfileAccordion } from "./QueueProfileAccordion";
import { SearchDesksPanel } from "./SearchDesksPanel";

export function WorkbenchTab(props: any) {
  // creating/onCreateOrder: unused now that Quote Builder isn't rendered on
  // this screen — kept in the destructure since the parent still passes
  // them and they'll be needed again once it returns.
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, onCreateOrder, member, selEnqId, onSelectEnquiry, onPickMember } = props;

  // Still accumulates everything added via Search — Summary itself is gone
  // from this screen (see docblock), but the cart needs to keep collecting
  // in the meantime so nothing's lost once the Finalize overlay exists.
  const [cart, setCart] = useState<any[]>([]);

  function addToCart(item: any) {
    setCart((c) => c.concat([item]));
    toast((item._title || item.type) + " added to itinerary", "success");
  }

  // Receive items injected from other surfaces (e.g. an awarded RFQ bid
  // flowing into the itinerary cart from the Supplier Broadcast console —
  // rfq.js, not yet ported). Kept for fidelity with View; inert until that
  // module dispatches "ta:add-to-cart" or populates window.__ta_cart_inbox.
  useEffect(() => {
    function onAdd(e: any) {
      if (e && e.detail) addToCart(e.detail);
    }
    window.addEventListener("ta:add-to-cart", onAdd);
    if ((window as any).__ta_cart_inbox && (window as any).__ta_cart_inbox.length) {
      const q = (window as any).__ta_cart_inbox.splice(0, (window as any).__ta_cart_inbox.length);
      q.forEach((it: any) => addToCart(it));
    }
    return () => window.removeEventListener("ta:add-to-cart", onAdd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedEnquiry = enquiries.find((e: any) => e.id === selEnqId);

  // buildMode (2026-09-02) — Itinerary Builder's new entry point: once an
  // enquiry is selected, instead of immediately showing the (old,
  // read-only) AI draft or a generic "not built yet" message, the
  // advisor picks HOW to start — "ai" (generate one, pre-filled) or
  // "scratch" (blank) — before landing in the real editable builder.
  // That editable builder itself is a LATER, separate build (per direct
  // scope call) — what's below is deliberately just the two buttons +
  // placeholder content standing in for it, no API call and no actual
  // editing yet. Resets to the chooser whenever the selected enquiry
  // changes, so switching enquiries in the Queue doesn't leave a stale
  // choice showing for the new one.
  const [buildMode, setBuildMode] = useState<"ai" | "scratch" | null>(null);
  useEffect(() => {
    setBuildMode(null);
  }, [selEnqId]);

  return (
    <div className="taw-grid taw-cols-3">
      <QueueProfileAccordion
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        member={member}
        enquiry={selectedEnquiry}
        selEnqId={selEnqId}
        onSelectEnquiry={onSelectEnquiry}
        onPickMember={onPickMember}
      />

      <Card
        title="Itinerary Builder"
        icon={<Icon name="sliders" size={20} />}
        sub={member ? "for " + member.name : "no member selected"}
      >
        {!selectedEnquiry ? (
          <Empty
            icon="sparkle"
            title="Not yet built"
            message="Select an enquiry from the Queue to start an itinerary — generated by AI from what was asked, or from scratch — for you to build out and check before confirming."
          />
        ) : !buildMode ? (
          // The chooser (2026-09-02) — both paths lead to the SAME editable
          // builder (not built yet, see below); this only decides whether
          // it starts pre-filled or blank.
          <div className="taw-itin-choose">
            <Icon name="sparkle" size={28} />
            <div className="title">Start this itinerary</div>
            <div className="message">Generate a draft from what the enquiry asked for, or build it from scratch — either way, everything stays fully editable.</div>
            <button className="taw-btn taw-btn--primary taw-btn--block" onClick={() => setBuildMode("ai")}>
              <Icon name="sparkle" size={16} />
              Generate AI Itinerary
            </button>
            <button className="taw-btn taw-btn--block" onClick={() => setBuildMode("scratch")}>
              <Icon name="plus" size={16} />
              Start from scratch
            </button>
          </div>
        ) : (
          // Placeholder (2026-09-02) — the real editable itinerary builder
          // is a separate, later build (per direct scope call); this is
          // deliberately just a stand-in showing which path was picked, no
          // API call and nothing editable yet.
          <Empty icon={buildMode === "ai" ? "sparkle" : "plus"}>
            <div className="title">{buildMode === "ai" ? "AI itinerary (placeholder)" : "Blank itinerary (placeholder)"}</div>
            <div className="message">
              {buildMode === "ai"
                ? "Placeholder — the real AI-generated, editable itinerary builder isn't built yet."
                : "Placeholder — the real from-scratch, editable itinerary builder isn't built yet."}
            </div>
            <button className="taw-linkbtn" style={{ marginTop: 10 }} onClick={() => setBuildMode(null)}>
              <Icon name="chevron" size={12} style={{ transform: "rotate(90deg)" }} />
              Back
            </button>
          </Empty>
        )}
      </Card>

      <SearchDesksPanel member={member} advisorId={advisorId} onAdd={addToCart} />
    </div>
  );
}
