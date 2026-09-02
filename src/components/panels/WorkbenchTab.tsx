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
import { cx } from "../../lib/cx";
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
  const draft = selectedEnquiry && selectedEnquiry.ai_draft;

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
        {draft ? (
          <div className="taw-draft">
            {draft.flight ? (
              <div className={cx("taw-draft-seg", draft.flight.mismatch && "is-mismatch")}>
                <div className="taw-draft-seg-h">
                  <Icon name="flight" size={16} />
                  <div style={{ minWidth: 0 }}>
                    <div className="taw-draft-seg-t">
                      {draft.flight.carrier} · {draft.flight.route}
                    </div>
                    <div className="taw-draft-seg-s">
                      {draft.flight.cabin} · {draft.flight.dates}
                    </div>
                  </div>
                  {draft.flight.mismatch ? (
                    <span className="taw-draft-flag">
                      <Icon name="alert" size={12} />
                      Check against enquiry
                    </span>
                  ) : null}
                </div>
                <div className="taw-draft-reason">{draft.flight.reasoning}</div>
                {draft.flight.mismatchNote ? <div className="taw-draft-mismatch-note">{draft.flight.mismatchNote}</div> : null}
              </div>
            ) : null}
            {draft.hotel ? (
              <div className={cx("taw-draft-seg", draft.hotel.mismatch && "is-mismatch")}>
                <div className="taw-draft-seg-h">
                  <Icon name="hotel" size={16} />
                  <div style={{ minWidth: 0 }}>
                    <div className="taw-draft-seg-t">{draft.hotel.name}</div>
                    <div className="taw-draft-seg-s">
                      {draft.hotel.type} · {draft.hotel.nights} nights
                    </div>
                  </div>
                  {draft.hotel.mismatch ? (
                    <span className="taw-draft-flag">
                      <Icon name="alert" size={12} />
                      Check against enquiry
                    </span>
                  ) : null}
                </div>
                <div className="taw-draft-reason">{draft.hotel.reasoning}</div>
                {draft.hotel.mismatchNote ? <div className="taw-draft-mismatch-note">{draft.hotel.mismatchNote}</div> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty
            icon="sparkle"
            title="Not yet built"
            message="Select an enquiry from the Queue to see what the AI suggested — flights, hotels, and its reasoning, laid out one thing at a time (a single flight, a single day) for you to check against Traveller Profile and correct before confirming."
          />
        )}
      </Card>

      <SearchDesksPanel member={member} advisorId={advisorId} onAdd={addToCart} />
    </div>
  );
}
