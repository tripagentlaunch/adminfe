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
 *     "considerable but not too much," ~5/9 of the row): Queue | Itinerary
 *     Builder | (Traveller Profile stacked above Summary).
 *   - "Summary" (CartPanel, `readOnly`) sits under Traveller Profile, NOT
 *     inside Itinerary Builder — a read-only, in-order recap of the whole
 *     draft, deliberately separate from Itinerary Builder's detail-editing
 *     job. Positioned there so profile and summary sit next to each other
 *     for the "does the draft actually fit this member" check. Name is
 *     provisional ("Summary/Review" in discussion) — easy to rename later.
 *   - Itinerary Builder shows what the AI suggested — it is NOT the
 *     search UI (2026-08-31 correction). FlightDesk/HotelDesk/VisaDesk are
 *     no longer rendered here. Falls back to a "not yet built" placeholder
 *     when the selected enquiry has no `ai_draft` (real Supabase enquiries
 *     don't yet); renders real flight/hotel segment cards when it does
 *     (currently only the 3 seeded mock enquiries — lib/mockEnquiries.ts).
 *     A segment with `mismatch: true` gets a flagged/highlighted treatment
 *     — that's the "AI draft vs. what was actually asked" check this
 *     screen exists for. Search still needs a home (a side-panel/overlay
 *     was discussed, not where its trigger button lives) — parked.
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
 * Summary card and the cross-surface "ta:add-to-cart" listener below, even
 * though nothing on THIS screen currently populates it).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { toast } from "../../lib/advisorHelpers";
import { cx } from "../../lib/cx";
import { Card, Empty, Icon } from "../ui";
import { EnquiryInbox } from "./EnquiryInbox";
import { Member360 } from "./Member360";
import { CartPanel } from "./CartPanel";

export function WorkbenchTab(props: any) {
  // advisorId/creating/onCreateOrder: unused now that Search/Quote Builder
  // aren't rendered on this screen — kept in the destructure since the
  // parent still passes them and they'll be needed again once those return.
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, onCreateOrder, member, selEnqId, onSelectEnquiry, onPickMember } = props;

  const [cart, setCart] = useState<any[]>([]);

  function addToCart(item: any) {
    setCart((c) => c.concat([item]));
    toast((item._title || item.type) + " added to itinerary", "success");
  }
  function removeFromCart(cid: any) {
    setCart((c) => c.filter((x) => x._cid !== cid));
  }
  function clearCart() {
    setCart([]);
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

  const openEnquiries = enquiries.filter((e: any) => (e.status || "open") !== "closed");
  const selectedEnquiry = enquiries.find((e: any) => e.id === selEnqId);
  const draft = selectedEnquiry && selectedEnquiry.ai_draft;

  return (
    <div className="taw-grid taw-cols-3">
      <Card
        title="Queue"
        icon={<Icon name="inbox" size={18} />}
        sub={openEnquiries.length ? openEnquiries.length + " open" : ""}
      >
        <EnquiryInbox
          enquiries={openEnquiries}
          members={members}
          membersById={membersById}
          loading={inboxLoading}
          selectedId={selEnqId}
          onSelect={onSelectEnquiry}
          onPickMember={onPickMember}
        />
      </Card>

      <Card
        title="Itinerary Builder"
        icon={<Icon name="sliders" size={18} />}
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

      <div className="taw-col-stack">
        <Card
          className="taw-grow"
          title="Traveller Profile"
          icon={<Icon name="compass" size={18} />}
          sub={member ? member.tier : ""}
        >
          <Member360 member={member} />
        </Card>
        <CartPanel title="Summary" readOnly cart={cart} onRemove={removeFromCart} onClear={clearCart} />
      </div>
    </div>
  );
}
