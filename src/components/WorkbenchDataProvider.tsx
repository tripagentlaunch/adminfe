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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  advisors as fetchAdvisors,
  members as fetchMembers,
  siteMembers as fetchSiteMembers,
  siteInvitationCodes as fetchSiteInvitationCodes,
  enquiries as fetchEnquiries,
  createOrder as apiCreateOrder,
  enquiryTravellerProfile,
  enquiryGenerateItinerary,
  enquiryRefreshItinerary,
  enquiryItineraryStarted,
  enquiryProposalSend,
  enquiryProposalOutcome,
  enquiryPipelineStatus,
} from "../services/api";
import { errText, toast } from "../lib/advisorHelpers";
import { WorkbenchContext, type ProposalQueueEntry, type ProposalOutcome } from "../lib/workbenchContext";
import { blankItinerary, addCartItemToItinerary, boundFromDateRange } from "../lib/itineraryFromCart";

export function WorkbenchDataProvider({ advisorId: sessionAdvisorId, children }: { advisorId: string; children: React.ReactNode }) {
  const router = useRouter();

  const [advisors, setAdvisors] = useState<any[]>([]);
  const [advisorId, setAdvisorId] = useState<string | null>(sessionAdvisorId || null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersById, setMembersById] = useState<Record<string, any>>({});
  // travellers (2026-10-09) — Traveller Profile's list. Real customers are
  // in site_members (claimed an invite) and site_invitation_codes
  // (invited, not claimed yet), not the CRM `members` table, which only
  // gets a row once an enquiry/booking flow creates one. See
  // buildTravellers() below for the merge.
  const [travellers, setTravellers] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [selEnqId, setSelEnqId] = useState<string | null>(null);
  const [member, setMember] = useState<any>(null);
  // travellerProfile (Phase 2, real backend) — the Traveller Profile
  // panel's OWN data source now, fetched fresh per selected enquiry via
  // GET /enquiries/{id}/traveller-profile (backend-shaped, see
  // enquiry_service.get_traveller_profile). Deliberately separate from
  // `member`/`selEnqId`-derived `selectedEnquiry` above, which Itinerary
  // Builder and Search still use unchanged — only Traveller Profile reads
  // this. null = nothing selected yet OR the fetch hasn't resolved/failed;
  // QueueProfileAccordion's loading/placeholder state covers both.
  const [travellerProfile, setTravellerProfile] = useState<any>(null);
  const [travellerProfileLoading, setTravellerProfileLoading] = useState(false);
  // Tracks the most recently REQUESTED enquiry id (synchronously, unlike
  // state) so a slower fetch for a previously-selected enquiry resolving
  // after a newer selection never clobbers what's now showing.
  const travellerProfileReqId = useRef<string | null>(null);
  // proposalQueue (2026-09-03) — see workbenchContext.tsx's own comment
  // on the field; written by ItineraryView's "Send to Proposal" confirm
  // action, read by console/proposal-composer/page.tsx.
  const [proposalQueue, setProposalQueue] = useState<ProposalQueueEntry[]>([]);
  const [selectedProposalEnqId, setSelectedProposalEnqId] = useState<string | null>(null);
  // itinerariesByEnquiry (2026-09-03) — see workbenchContext.tsx's own
  // comment on the field.
  const [itinerariesByEnquiry, setItinerariesByEnquiry] = useState<Record<string, any>>({});
  // generatingItinerary (2026-09-06) — "Generate AI Itinerary" now makes a
  // real POST /enquiries/{id}/generate-itinerary call (real Claude
  // latency, no longer instant mock cloning — see initItinerary below),
  // so WorkbenchTab's chooser screen needs a per-enquiry flag to show a
  // real loading state while that's in flight.
  const [generatingItinerary, setGeneratingItinerary] = useState<Record<string, boolean>>({});
  // pipelineStatusByEnquiry (real backend, GET /enquiries/pipeline-status) —
  // the persisted counterpart to itinerariesByEnquiry/proposalQueue above,
  // surviving a reload / visible to any advisor. Pipeline (console/pipeline/
  // page.tsx) merges this with the two session-local sources, preferring
  // the local one whenever both exist (freshest — an action just taken in
  // THIS session, before a round-trip confirms it). Keyed by enquiry_id,
  // same shape the backend returns per entry: { itinerary_generated_at,
  // proposal: { sent_at, outcome, decided_at } | null }.
  const [pipelineStatusByEnquiry, setPipelineStatusByEnquiry] = useState<Record<string, any>>({});

  // reloadInbox (2026-10-09) — also called after "Invite someone", which
  // creates a member + open enquiry server-side, so the invitee shows up
  // in Queue and the Traveller Profile list without a page refresh.
  function reloadInbox() {
    setInboxLoading(true);
    return Promise.all([
      fetchAdvisors("select=*&order=name.asc").catch(() => []),
      fetchMembers("select=*&order=name.asc&limit=500").catch(() => []),
      fetchEnquiries("select=*&order=created_at.desc&limit=60").catch(() => []),
      enquiryPipelineStatus().catch(() => null),
      fetchSiteMembers("select=*&order=created_at.desc&limit=1000").catch(() => []),
      fetchSiteInvitationCodes("select=*&order=created_at.desc&limit=1000").catch(() => []),
    ]).then(([adv, mem, enq, pipeline, siteMem, invites]: any) => {
      setTravellers(buildTravellers(mem || [], siteMem || [], invites || []));
      setAdvisors(adv || []);
      if (!advisorId && adv && adv.length) setAdvisorId(adv[0].id);
      setMembers(mem || []);
      const byId: Record<string, any> = {};
      (mem || []).forEach((m: any) => {
        byId[m.id] = m;
      });
      setMembersById(byId);
      // Real enquiries only (2026-10-08, direct request — make dev real):
      // the demo MOCK_ENQUIRIES/MOCK_MEMBERS_BY_ID are no longer merged in.
      // Approving an access request now creates the member + an open
      // enquiry (Customerbe access_request_service.approve()), so real
      // applicants appear here.
      setEnquiries(enq || []);
      setInboxLoading(false);

      const statusByEnquiry: Record<string, any> = {};
      ((pipeline && pipeline.statuses) || []).forEach((s: any) => {
        statusByEnquiry[s.enquiry_id] = s;
      });
      setPipelineStatusByEnquiry(statusByEnquiry);
    });
  }

  useEffect(() => {
    reloadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickEnquiry(e: any, m?: any) {
    setSelEnqId(e.id);
    setMember(m || (e.member_id ? membersById[e.member_id] : null));
    toast("Loaded " + (m ? m.name : "lead") + " — Member 360 ready", "info");

    setTravellerProfile(null);
    setTravellerProfileLoading(true);
    travellerProfileReqId.current = e.id;
    enquiryTravellerProfile(e.id)
      .then((profile: any) => {
        if (travellerProfileReqId.current !== e.id) return;
        setTravellerProfile(profile);
        setTravellerProfileLoading(false);
        // Unread/new-lead indicator (2026-09-10, db/147) — the backend call
        // just above (GET /enquiries/{id}/traveller-profile) already
        // persisted opened_by_advisor_at server-side as its own side
        // effect (enquiry_service.py's get_traveller_profile), tied to
        // this SAME successful load; this is only the optimistic mirror so
        // the Queue row un-highlights immediately instead of waiting for
        // the next full enquiries refetch. Never overwrites an existing
        // timestamp (matches the backend's own idempotent behavior).
        setEnquiries((prev) =>
          prev.map((row) => (row.id === e.id && !row.opened_by_advisor_at ? { ...row, opened_by_advisor_at: new Date().toISOString() } : row))
        );
      })
      .catch(() => {
        if (travellerProfileReqId.current !== e.id) return;
        setTravellerProfile(null);
        setTravellerProfileLoading(false);
      });
  }
  function pickMember(m: any) {
    setSelEnqId(null);
    setMember(m);
    travellerProfileReqId.current = null;
    setTravellerProfile(null);
    setTravellerProfileLoading(false);
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
  //
  // Real persistence (2026-09-10) — POST /enquiries/{id}/proposal-sends
  // alongside the local write above, so Pipeline's "Sent to Proposal"
  // stage survives a reload / is visible to any advisor (see db/145's own
  // module note). Fire-and-forget: the local proposalQueue write is what
  // Proposal Composer actually reads from today, so a persistence hiccup
  // here must never block the advisor's send action itself — it only
  // means Pipeline won't see it as "sent" until reload picks it up next
  // time (same degrade-quietly posture as every other best-effort call
  // in this file).
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
    enquiryProposalSend(enquiryId).catch((e: any) => {
      console.warn("proposal-sends persist failed (Pipeline will reflect this once retried): " + errText(e));
    });
  }

  function selectProposal(enquiryId: string) {
    setSelectedProposalEnqId(enquiryId);
  }

  // Real persistence (2026-09-10) — PATCH /enquiries/{id}/proposal-sends/
  // outcome, the one advisor-set signal Pipeline's Accepted/Revision
  // Requested/Rejected stages have (see db/145's own module note: there's
  // no automated capture path). Local proposalQueue update stays first/
  // optimistic (instant UI feedback, same as before); a real failure here
  // DOES get surfaced via toast, unlike the fire-and-forget calls above —
  // this one has a visible caller (Proposal Composer's new outcome
  // control) that should know if the record didn't actually stick.
  function setProposalOutcome(enquiryId: string, outcome: ProposalOutcome) {
    setProposalQueue((q) => q.map((e) => (e.enquiryId === enquiryId ? { ...e, outcome } : e)));
    if (outcome === "awaiting") return; // never a real PATCH target — see enquiryProposalOutcome's own note
    enquiryProposalOutcome(enquiryId, outcome).catch((e: any) => {
      toast("Recorded here, but didn't save to the server: " + errText(e), "error");
    });
  }

  // No-op if this enquiry already has itinerary data (2026-09-03) — the
  // chooser calling this on click must never clobber items already
  // added via Search before the advisor picked AI/scratch.
  //
  // "ai" mode (2026-09-06, rewritten) — a real POST /enquiries/{id}/
  // generate-itinerary call now, replacing the old MOCK_ITINERARY clone
  // (confirmed live: every enquiry rendered the identical Switzerland/
  // Zurich-Lucerne-Zermatt draft regardless of its own destination). The
  // backend already returns the itinerary in this exact shape — including
  // its own real startIso/endIso — so there's no local seeding left to do
  // here beyond tracking the request itself; see itinerary_service.py.
  //
  // startIso/endIso (2026-09-04) — the itinerary's own committed date
  // bound, used to flag any day landing outside it (see ItineraryView's
  // dayInBound). "scratch" has no days yet, so its bound is parsed from
  // the enquiry's own ask.dateRange instead (best-effort; see
  // boundFromDateRange's own docblock on the "year" assumption).
  function initItinerary(enquiryId: string, mode: "ai" | "scratch", enquiry?: any) {
    if (itinerariesByEnquiry[enquiryId] || generatingItinerary[enquiryId]) return;

    if (mode === "scratch") {
      setItinerariesByEnquiry((m) => {
        if (m[enquiryId]) return m;
        const seed = blankItinerary();
        const bound = boundFromDateRange(enquiry?.ask?.dateRange, 2026);
        if (bound) {
          seed.startIso = bound.startIso;
          seed.endIso = bound.endIso;
          seed.dateRange = enquiry.ask.dateRange;
          seed.nights = (enquiry.ask.dates && enquiry.ask.dates.nights) || 0;
        }
        return { ...m, [enquiryId]: seed };
      });
      // Real "Building" signal (2026-09-10) — the "ai" path below gets this
      // set server-side as a byproduct of generate-itinerary succeeding;
      // "scratch" never calls the backend at all otherwise, so this is the
      // only place that tells it a real itinerary now exists. Fire-and-
      // forget/idempotent, same posture as sendItineraryToProposal's call.
      enquiryItineraryStarted(enquiryId).catch(() => {});
      return;
    }

    setGeneratingItinerary((g) => ({ ...g, [enquiryId]: true }));
    enquiryGenerateItinerary(enquiryId)
      .then((data: any) => {
        // Fast path returns almost instantly (Claude draft only, no real
        // TripSure search yet — see itinerary_service.py's run_real_search
        // flag). Show it to the advisor right away instead of waiting.
        setGeneratingItinerary((g) => ({ ...g, [enquiryId]: false }));
        setItinerariesByEnquiry((m) => (m[enquiryId] ? m : { ...m, [enquiryId]: data }));

        // Real flight/hotel search still needs to happen — fire it now,
        // in the background, and merge the results in once they land.
        // The advisor is already looking at (and can edit) the draft
        // while this runs; realSearchPending on the itinerary object lets
        // the UI show a small "searching real flights & hotels…" hint
        // per day if it wants to (data.realSearchPending === true here).
        enquiryRefreshItinerary(enquiryId)
          .then((refreshed: any) => {
            setItinerariesByEnquiry((m) => {
              // Only merge if the advisor hasn't since edited/replaced
              // this itinerary out from under us.
              if (!m[enquiryId]) return m;
              return { ...m, [enquiryId]: refreshed };
            });
          })
          .catch((e: any) => {
            // Real search failing doesn't invalidate the draft the advisor
            // is already looking at — just surface it, don't clear anything.
            toast("Real flight/hotel search didn't complete: " + errText(e), "error");
          });
      })
      .catch((e: any) => {
        setGeneratingItinerary((g) => ({ ...g, [enquiryId]: false }));
        toast("Couldn't generate an itinerary: " + errText(e), "error");
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
    // Read directly off state (not inside the updater below) purely to
    // decide whether THIS call is the one creating the itinerary — same
    // pattern initItinerary uses above. Real "Building" signal (2026-09-10):
    // Search's "Add" can be the very first thing that creates an enquiry's
    // itinerary (see this function's own docblock above), so it needs the
    // same call initItinerary's "scratch" path makes.
    const isFirstItem = !itinerariesByEnquiry[enquiryId];
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
    if (isFirstItem) enquiryItineraryStarted(enquiryId).catch(() => {});
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
        travellers,
        enquiries,
        inboxLoading,
        reloadInbox,
        creating,
        justCreated,
        focusOrderId,
        selEnqId,
        member,
        travellerProfile,
        travellerProfileLoading,
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
        generatingItinerary,
        initItinerary,
        updateItineraryData,
        addSearchItemToItinerary,
        pipelineStatusByEnquiry,
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  );
}

// One row per person (keyed by lower-cased email, else by id): claimed
// site_members first, then CRM members rows, then the newest unclaimed
// invitation for anyone not already listed. `member` is the matching CRM
// members row when there is one — that's what the enquiry/profile flow
// keys on.
function buildTravellers(members: any[], siteMembers: any[], invites: any[]) {
  const byKey = new Map<string, any>();
  const keyOf = (email: any, id: string) => (email ? String(email).trim().toLowerCase() : "id:" + id);
  const memberByEmail = new Map<string, any>();
  members.forEach((m) => {
    if (m.email) memberByEmail.set(String(m.email).trim().toLowerCase(), m);
  });

  siteMembers.forEach((sm) => {
    const key = keyOf(sm.email, sm.id);
    if (byKey.has(key)) return;
    byKey.set(key, {
      key,
      kind: "member",
      name: sm.name,
      email: sm.email,
      phone: sm.phone,
      city: sm.city,
      plan: sm.plan,
      status: sm.status,
      memberUntil: sm.member_until,
      code: sm.invitation_code,
      since: sm.created_at,
      member: sm.email ? memberByEmail.get(String(sm.email).trim().toLowerCase()) || null : null,
    });
  });

  members.forEach((m) => {
    const key = keyOf(m.email, m.id);
    if (byKey.has(key)) return;
    byKey.set(key, { key, kind: "member", name: m.name, email: m.email, phone: m.phone, since: m.created_at, member: m });
  });

  // invites arrive newest-first, so the first one seen per email wins.
  invites.forEach((inv) => {
    if (inv.status === "redeemed") return;
    const key = keyOf(inv.recipient_email, inv.code);
    if (byKey.has(key)) return;
    const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
    byKey.set(key, {
      key,
      kind: expired ? "expired" : "invited",
      name: inv.label,
      email: inv.recipient_email,
      phone: inv.friend_phone,
      code: inv.code,
      since: inv.created_at,
      expiresAt: inv.expires_at,
      member: null,
    });
  });

  return Array.from(byKey.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}
