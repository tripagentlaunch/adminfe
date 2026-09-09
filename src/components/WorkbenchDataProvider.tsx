"use client";
/* =============================================================================
 * TripAgent — src/components/WorkbenchDataProvider.tsx
 * The shared advisors/members/enquiries state + selection/cart/order
 * handlers, hoisted OUT of (workbench)/layout.tsx to here (2026-08-31) so
 * BOTH Enquiries (console/queue) and Advisor Workbench's remaining routes
 * (orders, queue/servicing, disruptions, comms, etc.) can read the SAME
 * WorkbenchContext instance — a real shift of the Queue/Itinerary
 * Builder/Traveller Profile/Summary screen to Enquiries, not a duplicated
 * second copy of this state.
 *
 * Mounted once in AppRoot.tsx, wrapping every authenticated route — so
 * useWorkbench() works anywhere in the app now, not just under one
 * specific layout. (workbench)/layout.tsx no longer owns any of this; it
 * only renders its own tab chrome.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { advisors as fetchAdvisors, members as fetchMembers, enquiries as fetchEnquiries, createOrder as apiCreateOrder } from "../services/api";
import { errText, toast } from "../lib/advisorHelpers";
import { WorkbenchContext, type ProposalQueueEntry, type ProposalOutcome } from "../lib/workbenchContext";
import { MOCK_ENQUIRIES, MOCK_MEMBERS_BY_ID } from "../lib/mockEnquiries";
import { MOCK_ITINERARY } from "../lib/mockItinerary";
import { blankItinerary, addCartItemToItinerary, boundFromDateRange } from "../lib/itineraryFromCart";

export function WorkbenchDataProvider({ advisorId: sessionAdvisorId, children }: { advisorId: string; children: React.ReactNode }) {
  const router = useRouter();

  const [advisors, setAdvisors] = useState<any[]>([]);
  const [advisorId, setAdvisorId] = useState<string | null>(sessionAdvisorId || null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersById, setMembersById] = useState<Record<string, any>>({});
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [selEnqId, setSelEnqId] = useState<string | null>(null);
  const [member, setMember] = useState<any>(null);
  // proposalQueue (2026-09-03) — see workbenchContext.tsx's own comment
  // on the field; written by ItineraryView's "Send to Proposal" confirm
  // action, read by console/proposal-composer/page.tsx.
  const [proposalQueue, setProposalQueue] = useState<ProposalQueueEntry[]>([]);
  const [selectedProposalEnqId, setSelectedProposalEnqId] = useState<string | null>(null);
  // itinerariesByEnquiry (2026-09-03) — see workbenchContext.tsx's own
  // comment on the field.
  const [itinerariesByEnquiry, setItinerariesByEnquiry] = useState<Record<string, any>>({});

  useEffect(() => {
    setInboxLoading(true);
    Promise.all([
      fetchAdvisors("select=*&order=name.asc").catch(() => []),
      fetchMembers("select=*&order=name.asc&limit=100").catch(() => []),
      fetchEnquiries("select=*&order=created_at.desc&limit=60").catch(() => []),
    ]).then(([adv, mem, enq]: any) => {
      setAdvisors(adv || []);
      if (!advisorId && adv && adv.length) setAdvisorId(adv[0].id);
      setMembers(mem || []);
      const byId: Record<string, any> = { ...MOCK_MEMBERS_BY_ID };
      (mem || []).forEach((m: any) => {
        byId[m.id] = m;
      });
      setMembersById(byId);
      // Mock enquiries (see lib/mockEnquiries.ts) are merged in ahead of
      // real ones so they're immediately visible for the demo — real
      // Supabase data still loads and appears alongside them.
      setEnquiries(MOCK_ENQUIRIES.concat(enq || []));
      setInboxLoading(false);

      // Pipeline demo seed (2026-09-08, direct request) — "populate
      // pipeline with mock data" so its stages are visible without
      // driving the app by hand. Real seeded state (same
      // itinerariesByEnquiry/proposalQueue every other flow reads/
      // writes), not a display-only overlay — click into any of these
      // rows and Console/Proposal Composer show the same data. Resets
      // on reload, same as every other piece of local state here.
      // A sent proposal always has a real itinerary behind it (2026-09-09
      // fix) — mock-enq-3..6 only had proposalQueue entries, so
      // Pipeline's "Revise itinerary" action landed on the AI/scratch
      // chooser instead of resuming their actual itinerary, since
      // Console decides which to show off itinerariesByEnquiry[id]
      // existing. Every seeded proposalQueue entry now has one too.
      setItinerariesByEnquiry((prev) => ({
        ...prev,
        "mock-enq-2": MOCK_ITINERARY, // Building Itinerary
        "mock-enq-3": MOCK_ITINERARY,
        "mock-enq-4": MOCK_ITINERARY,
        "mock-enq-5": MOCK_ITINERARY,
        "mock-enq-6": MOCK_ITINERARY,
      }));
      setProposalQueue((prev) =>
        prev.concat([
          { enquiryId: "mock-enq-3", member: MOCK_MEMBERS_BY_ID["mock-mem-3"], data: MOCK_ITINERARY, sentAt: Date.now() - 2 * 3600000, outcome: "awaiting" },
          { enquiryId: "mock-enq-4", member: MOCK_MEMBERS_BY_ID["mock-mem-4"], data: MOCK_ITINERARY, sentAt: Date.now() - 26 * 3600000, outcome: "accepted" },
          { enquiryId: "mock-enq-5", member: MOCK_MEMBERS_BY_ID["mock-mem-5"], data: MOCK_ITINERARY, sentAt: Date.now() - 5 * 3600000, outcome: "revision_requested" },
          { enquiryId: "mock-enq-6", member: MOCK_MEMBERS_BY_ID["mock-mem-6"], data: MOCK_ITINERARY, sentAt: Date.now() - 50 * 3600000, outcome: "rejected" },
        ])
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickEnquiry(e: any, m?: any) {
    setSelEnqId(e.id);
    setMember(m || (e.member_id ? membersById[e.member_id] : null));
    toast("Loaded " + (m ? m.name : "lead") + " — Member 360 ready", "info");
  }
  function pickMember(m: any) {
    setSelEnqId(null);
    setMember(m);
    toast("Working with " + m.name, "info");
  }

  function openOrderFromQueue(orderId: string) {
    if (!orderId) return;
    setFocusOrderId(orderId);
    router.push("/orders");
  }

  function createOrder(quoteId: string) {
    setCreating(true);
    apiCreateOrder(quoteId)
      .then((r: any) => {
        setCreating(false);
        const oid = r.order_id || (r.order && r.order.id);
        toast("Order #" + String(oid || "").slice(0, 8) + " created", "success");
        setJustCreated(oid);
        router.push("/orders");
      })
      .catch((e: any) => {
        setCreating(false);
        toast("Order creation failed: " + errText(e), "error");
      });
  }

  function consumeCreated() {
    setJustCreated(null);
    setFocusOrderId(null);
  }

  // Upsert by enquiryId (2026-09-03) — re-sending the same enquiry (an
  // advisor tweaks the itinerary, sends again) replaces its existing
  // queue entry in place rather than piling up duplicates for one trip.
  function sendItineraryToProposal(enquiryId: string, m: any, data: any) {
    // outcome always resets to "awaiting" on send/re-send (2026-09-08) —
    // a re-sent proposal has changed content, so any prior client
    // response no longer applies to what's actually being sent now.
    const entry: ProposalQueueEntry = { enquiryId, member: m, data, sentAt: Date.now(), outcome: "awaiting" };
    setProposalQueue((q) => {
      const idx = q.findIndex((e) => e.enquiryId === enquiryId);
      if (idx === -1) return q.concat([entry]);
      const next = q.slice();
      next[idx] = entry;
      return next;
    });
    setSelectedProposalEnqId(enquiryId);
  }

  function selectProposal(enquiryId: string) {
    setSelectedProposalEnqId(enquiryId);
  }

  function setProposalOutcome(enquiryId: string, outcome: ProposalOutcome) {
    setProposalQueue((q) => q.map((e) => (e.enquiryId === enquiryId ? { ...e, outcome } : e)));
  }

  // No-op if this enquiry already has itinerary data (2026-09-03) — the
  // chooser calling this on click must never clobber items already
  // added via Search before the advisor picked AI/scratch.
  //
  // startIso/endIso (2026-09-04) — the itinerary's own committed date
  // bound, used to flag any day landing outside it (see ItineraryView's
  // dayInBound). "ai" mode's mock data is a fixed dataset unrelated to
  // any specific enquiry's ask, so its bound comes from its own days'
  // real span, not the enquiry — "scratch" has no days yet, so its bound
  // is parsed from the enquiry's own ask.dateRange instead (best-effort;
  // see boundFromDateRange's own docblock on the "year" assumption).
  function initItinerary(enquiryId: string, mode: "ai" | "scratch", enquiry?: any) {
    setItinerariesByEnquiry((m) => {
      if (m[enquiryId]) return m;
      let seed: any;
      if (mode === "ai") {
        seed = JSON.parse(JSON.stringify(MOCK_ITINERARY));
        seed.startIso = seed.days[0]?._iso || null;
        seed.endIso = seed.days[seed.days.length - 1]?._iso || null;
      } else {
        seed = blankItinerary();
        const bound = boundFromDateRange(enquiry?.ask?.dateRange, 2026);
        if (bound) {
          seed.startIso = bound.startIso;
          seed.endIso = bound.endIso;
          seed.dateRange = enquiry.ask.dateRange;
          seed.nights = (enquiry.ask.dates && enquiry.ask.dates.nights) || 0;
        }
      }
      return { ...m, [enquiryId]: seed };
    });
  }

  function updateItineraryData(enquiryId: string, updater: (d: any) => any) {
    setItinerariesByEnquiry((m) => ({ ...m, [enquiryId]: updater(m[enquiryId]) }));
  }

  // Search → Itinerary, direct (2026-09-03) — auto-seeds a blank
  // itinerary for this enquiry if it doesn't have one yet, so "Add"
  // works immediately even before the advisor has gone through the
  // AI/scratch chooser at all (see itineraryFromCart.ts's own docblock).
  // `enquiry` (2026-09-04) — needed here too now, for the same bound
  // seeding as initItinerary's "scratch" path, since Search's "Add" can
  // be the very first thing that creates this enquiry's itinerary.
  function addSearchItemToItinerary(enquiryId: string, cartItem: any, enquiry?: any) {
    setItinerariesByEnquiry((m) => {
      let base = m[enquiryId];
      if (!base) {
        base = blankItinerary();
        const bound = boundFromDateRange(enquiry?.ask?.dateRange, 2026);
        if (bound) {
          base.startIso = bound.startIso;
          base.endIso = bound.endIso;
          base.dateRange = enquiry.ask.dateRange;
          base.nights = (enquiry.ask.dates && enquiry.ask.dates.nights) || 0;
        }
      }
      return { ...m, [enquiryId]: addCartItemToItinerary(base, cartItem) };
    });
    toast((cartItem._title || cartItem.type) + " added to itinerary", "success");
  }

  const currentAdvisor = advisors.filter((a) => a.id === advisorId)[0];

  return (
    <WorkbenchContext.Provider
      value={{
        advisors,
        advisorId,
        setAdvisorId,
        members,
        membersById,
        enquiries,
        inboxLoading,
        creating,
        justCreated,
        focusOrderId,
        selEnqId,
        member,
        pickEnquiry,
        pickMember,
        openOrderFromQueue,
        createOrder,
        consumeCreated,
        currentAdvisor,
        proposalQueue,
        selectedProposalEnqId,
        sendItineraryToProposal,
        selectProposal,
        setProposalOutcome,
        itinerariesByEnquiry,
        initItinerary,
        updateItineraryData,
        addSearchItemToItinerary,
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  );
}
