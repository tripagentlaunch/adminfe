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
 *      from this screen entirely, not just relocated.
 *   - Itinerary Builder shows what the AI suggested — it is NOT the
 *     search UI (2026-08-31 correction). FlightDesk/HotelDesk/VisaDesk
 *     render in the right column now (SearchDesksPanel), not here.
 *   - Quote Builder REMOVED from this screen for now — "will be in the
 *     next part" per the designer, not deleted from the codebase, just not
 *     rendered here.
 *
 * 2026-09-03 — Search → Itinerary, direct, no cart (explicit scope call:
 * "Cart is not necessary at all for this flow"). The `cart` state +
 * `ta:add-to-cart` listener this file used to hold (a staging area
 * nothing ever read) is GONE — SearchDesksPanel's `onAdd` now calls
 * WorkbenchContext's `addSearchItemToItinerary` directly, writing into
 * the selected enquiry's itinerary (see itineraryFromCart.ts). The
 * `buildMode` local-state chooser is gone too, replaced by a simpler
 * rule: show the AI/scratch chooser only while this enquiry has NO
 * itinerary data yet; the moment it has any — via the chooser OR via a
 * Search "Add" arriving first — render the real ItineraryView. That's
 * also why "Start from scratch" no longer shows its own placeholder:
 * a blank itinerary is now a real state (empty day list), not a stand-in.
 *
 * `member`/`selEnqId` — and the pickEnquiry/pickMember setters — are NOT
 * local here: View held them at the top level because CommsPanel (the
 * /comms route) reads the SAME `member` (web/js/advisor.js line ~6818), so
 * they're lifted into WorkbenchShell (App.jsx) alongside advisors/members/
 * enquiries/membersById, and passed down as props instead.
 * ===========================================================================*/
import { Card, Empty, Icon, Spinner } from "../ui";
import { QueueProfileAccordion } from "./QueueProfileAccordion";
import { SearchDesksPanel } from "./SearchDesksPanel";
import { ItineraryView } from "./ItineraryView";
import { useWorkbench } from "../../lib/workbenchContext";

export function WorkbenchTab(props: any) {
  // creating/onCreateOrder: unused now that Quote Builder isn't rendered on
  // this screen — kept in the destructure since the parent still passes
  // them and they'll be needed again once it returns.
  const { enquiries, members, membersById, inboxLoading, advisorId, creating, onCreateOrder, member, selEnqId, onSelectEnquiry, onPickMember } = props;
  const { itinerariesByEnquiry, generatingItinerary, initItinerary, addSearchItemToItinerary, travellerProfile, travellerProfileLoading } = useWorkbench();

  const selectedEnquiry = enquiries.find((e: any) => e.id === selEnqId);
  const itineraryData = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
  // generating (2026-09-06) — "Generate AI Itinerary" now waits on a real
  // backend call (POST /enquiries/{id}/generate-itinerary — real Claude
  // latency, not instant mock cloning), so the chooser below needs its
  // own in-flight state to show instead of nothing.
  const generating = selEnqId ? !!generatingItinerary[selEnqId] : false;

  return (
    <div className="taw-grid taw-cols-3">
      <QueueProfileAccordion
        enquiries={enquiries}
        members={members}
        membersById={membersById}
        inboxLoading={inboxLoading}
        travellerProfile={travellerProfile}
        travellerProfileLoading={travellerProfileLoading}
        selEnqId={selEnqId}
        onSelectEnquiry={onSelectEnquiry}
        onPickMember={onPickMember}
      />

      <Card
        className="taw-itin-card"
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
        ) : itineraryData ? (
          // Real content (2026-09-03) — exists once EITHER the chooser
          // below was used OR something was added from Search first;
          // either path lands here, on the same real (editable, not a
          // static mock) itinerary. No "Back" control — once an
          // itinerary exists, it IS the working view; switching
          // enquiries in the Queue is what shows a different one.
          <ItineraryView enquiryId={selEnqId} member={member} />
        ) : generating ? (
          // Real loading state (2026-09-06) — "Generate AI Itinerary" now
          // waits on a real Claude call (POST /enquiries/{id}/generate-
          // itinerary), not instant mock cloning, so there's real time to
          // cover here instead of nothing.
          <div className="taw-itin-choose">
            <Spinner />
            <div className="title">Drafting your itinerary…</div>
            <div className="message">Aanya&apos;s AI is putting together a day-by-day draft from what the enquiry asked for — this takes a few seconds.</div>
          </div>
        ) : (
          // The chooser (2026-09-02) — both paths seed the SAME real,
          // editable itinerary via WorkbenchContext's initItinerary; this
          // only decides whether it starts pre-filled (mock AI draft) or
          // blank. Only shows while this enquiry has no itinerary data
          // yet — see the itineraryData branch above.
          <div className="taw-itin-choose">
            <Icon name="sparkle" size={28} />
            <div className="title">Start this itinerary</div>
            <div className="message">Generate a draft from what the enquiry asked for, or build it from scratch — either way, everything stays fully editable.</div>
            <button className="taw-btn taw-btn--primary taw-btn--block" onClick={() => initItinerary(selEnqId, "ai", selectedEnquiry)}>
              <Icon name="sparkle" size={16} />
              Generate AI Itinerary
            </button>
            <button className="taw-btn taw-btn--block" onClick={() => initItinerary(selEnqId, "scratch", selectedEnquiry)}>
              <Icon name="plus" size={16} />
              Start from scratch
            </button>
          </div>
        )}
      </Card>

      {/* key={selEnqId} (2026-09-03, flow-testing hurdle) — without it,
          SearchDesksPanel/FlightDesk/HotelDesk/VisaDesk never remount on
          enquiry switch, so their useState(() => ...member.preferences...)
          initializers only ever run ONCE, capturing whichever member was
          selected first — every enquiry picked after that silently gets
          the WRONG (or no) pax/cabin defaults, no matter how correct the
          initializer logic is. Surfaced live: Kabir Shah's Cabin dropdown
          showed "Economy" instead of his actual "Business" preference.
          Keying on the enquiry also clears any leftover search results
          from a previous traveller when switching — correct behavior,
          not just a side effect of the fix. */}
      <SearchDesksPanel
        key={selEnqId}
        member={member}
        enquiry={selectedEnquiry}
        advisorId={advisorId}
        onAdd={(item: any) => selEnqId && addSearchItemToItinerary(selEnqId, item, selectedEnquiry)}
      />
    </div>
  );
}
