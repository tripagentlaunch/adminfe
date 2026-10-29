"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/proposal-composer/page.tsx
 * Was a static ConsolePlaceholder, then a single-itinerary preview, then a
 * Queue + content split that swapped to the OLD placeholder whole-screen
 * when the queue was empty; corrected 2026-09-03 (direct request) — the
 * Queue + content layout is now ALWAYS present, whether or not there are
 * active entries, same as Console's own Queue (EnquiryInbox.tsx never
 * disappears either, it just shows its own empty state inline).
 *
 * The queue is `proposalQueue` from WorkbenchContext — populated ONLY by
 * ItineraryView's "Send to Proposal" confirm action, so it's naturally
 * already scoped to exactly what was asked: enquiries with an itinerary
 * sent here and not yet composed. No separate "composed" status to filter
 * on yet since the real compose UI isn't built — every entry currently
 * qualifies.
 *
 * Row markup matches EnquiryInbox.tsx's own Queue row-for-row (2026-09-04,
 * direct request: "EXACTLY like the queue in Console" — only the entries
 * differ), including the red 24h+ "breach" state and flush (zero-padding)
 * edges — see DESIGN-CHANGES.md for the full trail of fixes that got here.
 *
 * 2026-09-04, later same day — the left column is now a real TWO-SECTION
 * accordion (Queue / Quote Builder), structurally identical to
 * QueueProfileAccordion.tsx's Queue/Traveller Profile pair: same
 * .taw-acc-stack/.taw-acc/.taw-acc-h/.taw-acc-toggle/.taw-acc-body
 * classes, same mutual-exclusion toggle, same auto-collapse-into-the-
 * OTHER-section on selection (there: picking an enquiry opens Traveller
 * Profile; here: picking a queue entry opens Quote Builder). Direct
 * request: "Quote Builder can be below Queue, EXACTLY LIKE how traveller
 * profile was below Queue in Console."
 *
 * QuoteBuilder.tsx itself is real, working, and already wired to the real
 * pricing engine (price() -> quote-price edge fn) and real order creation
 * (createOrder() -> order-create) — it was just unreachable from any
 * route (see BACKEND-HANDOFF.md's dead-code note on it and CartPanel.tsx).
 * It expects a `cart` array shaped like the old Search->Cart flow's items
 * ({type, baseNet, international, ...}), not this app's current
 * day-bucketed itinerary shape, so `cartFromItinerary()`
 * (itineraryFromCart.ts) adapts one into the other — the mirror of
 * addCartItemToItinerary(). Rendered with QuoteBuilder's new `bare` prop
 * so it contributes just its content to this accordion's own section,
 * not a second nested "Quote Builder"-titled card (mirroring how
 * Member360 has no Card of its own inside QueueProfileAccordion either).
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Card, Dropdown, Empty, Icon, SleekScroll, Spinner } from "../../../../components/ui";
import { QuoteBuilder } from "../../../../components/panels/QuoteBuilder";
import { bookingHandoffUrl } from "../../../../lib/bookingHandoff";
import { useWorkbench } from "../../../../lib/workbenchContext";
import type { ProposalOutcome, ProposalQueueEntry } from "../../../../lib/workbenchContext";
import { cartFromItinerary } from "../../../../lib/itineraryFromCart";
import { useQuotePricing } from "../../../../lib/useQuotePricing";
import { useHotelWebsites } from "../../../../lib/useHotelWebsites";
import { toast, errText } from "../../../../lib/advisorHelpers";
import { enquiryProposalShareCreate, enquiryProposalShareGet, getDestinationPhoto } from "../../../../services/api";
import { buildProposalTemplateData } from "../../../../lib/proposalTemplateData";
import { ProposalDocument, PAGE_COUNT } from "../../../../components/proposal/ProposalDocument";
import { ProposalPreviewPage } from "../../../../components/proposal/ProposalPreviewPage";
import { cx } from "../../../../lib/cx";

// ProposalPreview renders onto a <canvas> via pdfjs-dist — browser-only
// (canvas, window.devicePixelRatio), must never run during SSR/build.
// The dynamic import also keeps react-pdf's + pdfjs-dist's sizeable
// renderers out of every OTHER route's bundle.
const ProposalPreview = dynamic(() => import("../../../../components/proposal/ProposalPreview").then((m) => m.ProposalPreview), { ssr: false });

const FIT_OPTIONS = [
  { key: "page", label: "Fit one page", icon: "pageFit" },
  { key: "width", label: "Fit to width", icon: "swap" },
  { key: "fullscreen", label: "Full screen", icon: "fullscreen" },
] as const;

// Outcome control (2026-09-10) — the one deliberate new-UI exception in this
// pass: there is currently NO way anywhere in the app to record what a
// client said back about a sent proposal (the Pipeline tab's own dropdown
// for this was removed 2026-09-09 and never replaced — see Pipeline's own
// docblock). Placed here rather than on Pipeline itself, since Pipeline was
// the one screen this pass was told to leave rendering-unchanged; this
// screen's real send/compose UI was still openly unbuilt ("isn't built yet"
// per its own history), so a small real action here is filling a
// documented gap, not altering a finished one. Persists via
// setProposalOutcome -> PATCH /enquiries/{id}/proposal-sends/outcome (see
// WorkbenchDataProvider.tsx).
const OUTCOME_OPTIONS = [
  { key: "awaiting", label: "Awaiting client" },
  { key: "accepted", label: "Accepted" },
  { key: "revision_requested", label: "Revision requested" },
  { key: "rejected", label: "Rejected" },
] as const;

function ProposalOutcomeControl({ entry, onChange }: { entry: { enquiryId: string; outcome: ProposalOutcome }; onChange: (enquiryId: string, outcome: ProposalOutcome) => void }) {
  return (
    <Dropdown
      className="taw-pdf-outcome"
      value={entry.outcome}
      options={OUTCOME_OPTIONS}
      onChange={(key: ProposalOutcome) => onChange(entry.enquiryId, key)}
      ariaLabel="Record client outcome"
      triggerClassName="taw-pdf-outcome-trigger"
    />
  );
}

function relativeTime(ts: number) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

export default function ProposalComposerPage() {
  const {
    proposalQueue, selectedProposalEnqId, selectProposal, advisorId, currentAdvisor, enquiries, setProposalOutcome, swapProposalHotel, swapProposalFlight,
    itinerariesByEnquiry, selEnqId, member, membersById, sendItineraryToProposal,
  } = useWorkbench();
  const router = useRouter();
  // What the composer works on: every sent proposal, plus the enquiry open in
  // the Console as a draft — so clicking "Proposal Composer" right after
  // building an itinerary shows it, with no "Send to Proposal" step. Each entry
  // shows the LIVE itinerary (builder edits and swaps appear straight away).
  const entries = useMemo(() => {
    const list: (ProposalQueueEntry & { draft?: boolean })[] = proposalQueue.map((e) => ({ ...e, data: itinerariesByEnquiry[e.enquiryId] || e.data }));
    const live = selEnqId ? itinerariesByEnquiry[selEnqId] : null;
    if (selEnqId && live && (live.days || []).length && !list.some((e) => e.enquiryId === selEnqId)) {
      const enq = enquiries.find((e: any) => e.id === selEnqId);
      const who = member || (enq && enq.member_id ? membersById[enq.member_id] : null);
      list.unshift({ enquiryId: selEnqId, member: who, data: live, sentAt: 0, outcome: "awaiting", draft: true });
    }
    return list;
  }, [proposalQueue, itinerariesByEnquiry, selEnqId, enquiries, member, membersById]);
  const selected =
    entries.find((e) => e.enquiryId === selectedProposalEnqId) || entries.find((e) => e.enquiryId === selEnqId) || entries[0] || null;

  // open: "queue" | "quote" (2026-09-04) — same shape as
  // QueueProfileAccordion's own `open` state; only one section is open
  // at a time, either toggle flips to the other.
  // newPreview (2026-09-25, POC) — toggles the new on-screen tabbed
  // preview design (ProposalPreviewPage) in place of the canvas-of-PDF
  // preview below, for side-by-side comparison against the target design
  // before this replaces the old preview outright. Defaults on so the new
  // design is what's seen first.
  const [newPreview, setNewPreview] = useState(true);
  const [open, setOpen] = useState<"queue" | "quote">("queue");
  function toggle() {
    setOpen((prev) => (prev === "queue" ? "quote" : "queue"));
  }
  function selectAndOpenQuote(enquiryId: string) {
    selectProposal(enquiryId);
    setOpen("quote"); // auto-collapse Queue / open Quote Builder — mirrors selectEnquiry() there
  }
  const qOpen = open === "queue";
  const quoteOpen = !qOpen;

  // Page navigator (2026-09-08, direct request) — chevron / editable
  // current-page box / total-pages box / chevron, in the Card header.
  const [pageInput, setPageInput] = useState("1");
  // pageCount (2026-09-13 fix, real "preview silently drops the last 2 of
  // 6 real pages" repro) — PAGE_COUNT is only the pre-parse placeholder
  // now (a stay's card can span more than one physical page since the
  // hotel-card redesign, so a fixed nominal count goes stale); this state
  // is what the nav actually clamps/displays against, kept in sync with
  // the REAL parsed page count via ProposalPreview's onPageCountChange.
  const [pageCount, setPageCount] = useState(PAGE_COUNT);
  const currentPage = Math.min(pageCount, Math.max(1, parseInt(pageInput, 10) || 1));
  useEffect(() => {
    setPageInput("1"); // a different itinerary means a fresh preview — back to page 1
    setPageCount(PAGE_COUNT); // back to the placeholder until the new PDF's real count is known
  }, [selectedProposalEnqId]);
  function goToPage(n: number) {
    setPageInput(String(Math.min(pageCount, Math.max(1, n))));
  }
  const pageViewportRef = useRef<HTMLDivElement>(null);

  // PDF preview zoom + fit (2026-09-08) — resizes the preview iframe's own
  // pixel box rather than a CSS transform, so the browser's native PDF
  // viewer re-rasterizes at the new size (stays crisp) instead of
  // blurring a fixed-resolution render. fitMode 'custom' uses the zoom%,
  // 'width'/'page' auto-size against the preview pane's OWN measured box
  // (via ResizeObserver — the iframe needs a real pixel height, so this
  // can't be done in pure CSS).
  const PDF_BASE_WIDTH = 560;
  const PDF_ASPECT = 841.89 / 595.28; // A4 height/width
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<"custom" | "width" | "page">("width");
  // isFullscreen (2026-09-08) — an in-page CSS maximize (position:fixed
  // covering the viewport), NOT the browser's native Fullscreen API.
  // requestFullscreen() was tried first, but the native API isolates the
  // fullscreened element into its own top-layer subtree — anything
  // portaled to document.body (the fit-menu's own popup, via
  // Dropdown.tsx's createPortal) stops rendering entirely while it's
  // active, since document.body sits outside that subtree. A plain fixed
  // overlay avoids the problem altogether and needs no special-casing of
  // what's allowed to render "inside" it.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ w: 0, h: 0 });

  // Re-attached whenever the PDF view is shown: it isn't mounted on first render
  // (the new preview is the default), and measuring nothing left the PDF at a
  // 100px "zoomed out" width.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setPane({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [newPreview, selected?.enquiryId]);

  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const zoomOut = () => {
    setFitMode("custom");
    setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  };
  const zoomIn = () => {
    setFitMode("custom");
    setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)));
  };

  function pickFit(key: string) {
    if (key === "fullscreen") {
      setIsFullscreen((f) => !f);
      setFitMode("page");
      return;
    }
    setIsFullscreen(false);
    setFitMode(key as "width" | "page");
  }

  // availW/availH (2026-09-08) — the canvas's own full bounds, NOT padded:
  // "fit to width"/zoomed scrolling should reach edge-to-edge, matching
  // "the canvas should go end-to-end... no grey coming behind" (direct
  // feedback — an earlier version subtracted a 32px breathing margin
  // here, which is exactly what showed as an unwanted grey border in fit-
  // to-width). Only "fit one page" still wants its OWN small inset below
  // — it's the one mode meant to show the page floating inside the
  // canvas with room around it, not filling it.
  const availW = Math.max(100, pane.w);
  const availH = Math.max(100, pane.h);
  const PAGE_FIT_PAD = 32;
  let boxW: number;
  if (fitMode === "width") {
    boxW = availW;
  } else if (fitMode === "page") {
    const pw = Math.max(100, pane.w - PAGE_FIT_PAD);
    const ph = Math.max(100, pane.h - PAGE_FIT_PAD);
    boxW = Math.min(pw, ph / PDF_ASPECT);
  } else {
    boxW = PDF_BASE_WIDTH * zoom;
  }
  const boxH = boxW * PDF_ASPECT;

  const cart = useMemo(() => (selected ? cartFromItinerary(selected.data) : []), [selected]);

  // inclusive/pricing lifted here (2026-09-08) — the ONE real price() call
  // for this itinerary, shared by QuoteBuilder's display and the PDF
  // preview's cost breakdown, so both always show the exact same quote.
  const [inclusive, setInclusive] = useState(true);
  const { pricing, quoteId, loading: pricingLoading, err: pricingErr } = useQuotePricing(cart, selected?.member, advisorId, inclusive);

  // hotelEnrichment (2026-09-11, generalized 2026-09-11) — backend-verified
  // website/status + cached image per real hotel in this itinerary;
  // buildProposalTemplateData's hotelUrl()/officialWebsiteUrl() gate the
  // "official website" claim on this, never on an LLM guess.
  const hotelEnrichment = useHotelWebsites(selected?.data);

  const proposalData = useMemo(
    () => buildProposalTemplateData(selected?.data, pricing, selected?.member, currentAdvisor, hotelEnrichment),
    [selected, pricing, currentAdvisor, hotelEnrichment]
  );

  // proposalDocumentEl (2026-09-08, fix) — a real bug, not a hash-param
  // quirk: `<ProposalDocument data={proposalData} />` is a NEW element
  // reference every render (JSX isn't memoized by value), and
  // ProposalPreview's usePDF effect keys off that reference — every
  // unrelated re-render (pricing polling, ResizeObserver, zoom) was
  // restarting PDF generation from scratch, revoking the previous blob
  // URL mid-flight. That's what looked like flaky/intermittent
  // rendering. Memoizing on proposalData itself (only changes when the
  // itinerary/pricing actually change) stops the churn.
  const proposalDocumentEl = useMemo(() => <ProposalDocument data={proposalData} />, [proposalData]);

  // Cover photo for the exported PDF — fetched fresh here, right before
  // rendering, not reused from the on-screen preview: Google's photoUri is
  // short-lived. Never blocks or fails the export: any error, no photo, or a
  // slow lookup (6s cap) just means the plain cover.
  async function fetchCoverPhoto(): Promise<{ url: string; credit: string | null; creditUrl: string | null } | null> {
    const query = proposalData && proposalData.destination ? String(proposalData.destination).replace(/\s*\(.*\)\s*$/, "").trim() : "";
    if (!query) return null;
    try {
      const r: any = await Promise.race([
        getDestinationPhoto(query),
        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      return r && r.url ? { url: r.url, credit: r.photographer || null, creditUrl: r.photographerUrl || null } : null;
    } catch {
      return null;
    }
  }

  // Image pre-checks for the PDF — cover photo, each stay's hero photo, and each hotel
  // alternative's thumbnail. renderProposalPdf no longer has a fetch timeout (a hung image host
  // can stall a render indefinitely), and react-pdf can't report a failed image, so every image
  // is proven loadable HERE first: 6s cap, must be an image/* response readable cross-origin (the
  // same CORS rules react-pdf's own fetch is under). Anything that fails is dropped and the PDF
  // falls back exactly as if that photo had never existed (plain dark cover / no stay hero /
  // text-only alternative row).
  async function imageLoads(url: string): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return false;
      await res.blob(); // fully downloaded inside the time cap; also warms the HTTP cache
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  // One verifier per export: every distinct URL is checked once (stays often repeat a hotel), all
  // checks start immediately and run concurrently.
  function makeImageVerifier() {
    const seen = new Map<string, Promise<boolean>>();
    return (url: string): Promise<boolean> => {
      let p = seen.get(url);
      if (!p) {
        p = imageLoads(url);
        seen.set(url, p);
      }
      return p;
    };
  }
  async function withVerifiedStayImages(data: any, verify: (u: string) => Promise<boolean>): Promise<any> {
    if (!data || !Array.isArray(data.stays)) return data;
    const stays = await Promise.all(
      data.stays.map(async (st: any) => {
        const [heroOk, alternatives] = await Promise.all([
          st.image ? verify(st.image) : Promise.resolve(true),
          Promise.all((st.alternatives || []).map(async (a: any) => (a.image && !(await verify(a.image)) ? { ...a, image: null } : a))),
        ]);
        // A dropped hero also drops its "REPRESENTATIVE IMAGE" stock-photo label.
        return { ...st, ...(heroOk ? {} : { image: null, imageSource: null }), alternatives };
      })
    );
    return { ...data, stays };
  }

  function downloadPdf() {
    const verify = makeImageVerifier();
    Promise.all([
      import("../../../../components/proposal/ProposalDocument"),
      import("../../../../lib/renderProposalPdf"),
      // cover: look the photo up, then verify it — this chain runs alongside the stay/alternative checks
      fetchCoverPhoto().then(async (cp) => (cp && (await verify(cp.url)) ? cp : null)),
      withVerifiedStayImages(proposalData, verify),
    ]).then(async ([{ ProposalDocument }, { renderProposalPdfBlob }, coverPhoto, verifiedData]) => {
      const docData = coverPhoto ? { ...verifiedData, coverPhoto } : verifiedData;
      const blob = await renderProposalPdfBlob(<ProposalDocument data={docData} />);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(proposalData.destination || "Itinerary").replace(/[^a-z0-9]+/gi, "-")}-Proposal.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Web link — ONE live customer link per proposal (enquiry). The first press creates it; after
  // that the same URL is kept, and the proposal's content is re-published into it whenever the
  // advisor's edits change it (debounced, only once pricing has settled), so the customer always
  // sees the current proposal at the URL they were sent. The downloaded PDF is the frozen copy.
  const [creatingLink, setCreatingLink] = useState(false);
  const [link, setLink] = useState<{ enquiryId: string; token: string | null } | null>(null);
  const published = useRef<string>("");
  const enquiryIdSel = selected?.enquiryId || null;
  useEffect(() => {
    if (!enquiryIdSel) return;
    let live = true;
    published.current = "";
    enquiryProposalShareGet(enquiryIdSel)
      .then((r: any) => { if (live) setLink({ enquiryId: enquiryIdSel, token: (r && r.token) || null }); })
      .catch(() => { if (live) setLink({ enquiryId: enquiryIdSel, token: null }); });
    return () => { live = false; };
  }, [enquiryIdSel]);
  const linkToken = link && link.enquiryId === enquiryIdSel ? link.token : null;
  const linkUrl = linkToken && typeof window !== "undefined" ? `${window.location.origin}/proposal/${linkToken}` : null;

  function createWebLink() {
    if (!selected || creatingLink) return;
    setCreatingLink(true);
    const body = JSON.stringify(proposalData);
    enquiryProposalShareCreate(selected.enquiryId, proposalData)
      .then((res: any) => {
        setCreatingLink(false);
        published.current = body;
        setLink({ enquiryId: selected.enquiryId, token: res.token });
        const url = `${window.location.origin}/proposal/${res.token}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(() => {});
        }
        toast((res.reused ? "Same link, updated with this proposal — copied: " : "Link copied — valid for 14 days: ") + url, "success");
      })
      .catch((e: any) => {
        setCreatingLink(false);
        toast("Couldn't create the link: " + errText(e), "error");
      });
  }

  // Keep the live link in step with the proposal on screen.
  useEffect(() => {
    if (!linkToken || !enquiryIdSel || pricingLoading || !cart.length) return;
    const body = JSON.stringify(proposalData);
    // Also once on opening: edits made in the Console since the last publish reach the link too.
    if (body === published.current) return;
    const t = setTimeout(() => {
      enquiryProposalShareCreate(enquiryIdSel, proposalData)
        .then(() => { published.current = body; })
        .catch(() => { /* the next change, or Web link, publishes again */ });
    }, 2500);
    return () => clearTimeout(t);
  }, [linkToken, enquiryIdSel, proposalData, pricingLoading, cart.length]);

  return (
    <div className="taw-grid taw-cols-2">
      <div className="taw-acc-stack">
        <div className={cx("taw-acc", qOpen && "is-open")}>
          <div className={"taw-acc-h" + (qOpen ? " is-open" : "")}>
            <Icon name="inbox" size={20} />
            <h3>Queue</h3>
            {entries.length ? <span className="sub">{entries.length} {entries.length === 1 ? "proposal" : "proposals"}</span> : null}
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
              {entries.length ? (
                <SleekScroll className="taw-enq-scroll">
                  <div className="taw-enq">
                    {entries.map((entry) => {
                      const hours = entry.draft ? 0 : Math.floor(Math.max(0, Date.now() - entry.sentAt) / 3600000);
                      return (
                        <button
                          key={entry.enquiryId}
                          className={cx("taw-enq-item", selected?.enquiryId === entry.enquiryId && "is-active")}
                          onClick={() => selectAndOpenQuote(entry.enquiryId)}
                        >
                          <div className="taw-enq-top">
                            <div className="taw-enq-name">
                              {entry.member ? entry.member.name : "New lead"}
                              {entry.data.pax ? <span className="taw-enq-pax">· {entry.data.pax} pax</span> : null}
                            </div>
                            {entry.draft ? null : <span className={cx("taw-enq-hours", hours >= 24 && "is-breach")}>{hours}h</span>}
                          </div>
                          <div className="taw-enq-meta">
                            {entry.data.destination}
                            {entry.data.destination && entry.data.dateRange ? " · " : ""}
                            {entry.data.dateRange}
                          </div>
                          <div className="taw-enq-depart">{entry.draft ? "Draft — open in the Console, not sent yet" : "Sent " + relativeTime(entry.sentAt)}</div>
                        </button>
                      );
                    })}
                  </div>
                </SleekScroll>
              ) : (
                <Empty icon={<Icon name="note" size={28} />}>
                  Nothing waiting here yet.
                  <br />
                  <span className="taw-muted" style={{ fontSize: 11.5 }}>
                    Use "Send to Proposal" from the Itinerary Builder once a trip is ready.
                  </span>
                </Empty>
              )}
            </div>
          ) : null}
        </div>

        <div className={cx("taw-acc", "taw-acc--profile", quoteOpen && "is-open")}>
          <div className={"taw-acc-h" + (quoteOpen ? " is-open" : "")}>
            <Icon name="note" size={20} />
            <h3>Quote Builder</h3>
            <button
              className="taw-acc-toggle"
              onClick={toggle}
              aria-label={quoteOpen ? "Collapse Quote Builder" : "Expand Quote Builder"}
              title={quoteOpen ? "Collapse Quote Builder" : "Expand Quote Builder"}
            >
              <Icon name="chevron" size={15} />
            </button>
          </div>
          <div className="taw-acc-body flush">
            {/* !quoteOpen (2026-09-04, fix) — mirrors QueueProfileAccordion's
                showProfilePlaceholder exactly: a body always renders here
                (so the section never collapses to a bare header), but the
                REAL content (QuoteBuilder, which fires a real pricing
                call) only shows once this section is actually the open
                one — otherwise both sections rendered their full content
                at once regardless of which was "open". */}
            {!quoteOpen || !selected ? (
              <Empty icon={<Icon name="user" size={26} />}>
                {selected ? "Expand this section to price the selected itinerary." : "Select an entry from the Queue to price its itinerary here."}
              </Empty>
            ) : (
              <QuoteBuilder
                bare
                cart={cart}
                member={selected.member}
                pricing={pricing}
                quoteId={quoteId}
                loading={pricingLoading}
                err={pricingErr}
                inclusive={inclusive}
                onToggleInclusive={setInclusive}
                creating={false}
                // Booking runs on /orders (live fares, travellers, payment, ticketing) and is tied to this
                // enquiry; the legacy /fn/order-create path wrote to an `orders` table dev doesn't have.
                onCreateOrder={() => router.push(bookingHandoffUrl({
                  enquiry: enquiries.find((e: any) => e.id === selected.enquiryId) || { id: selected.enquiryId },
                  member: selected.member,
                  itinerary: selected.data,
                }))}
              />
            )}
          </div>
        </div>
      </div>

      <Card
        className="taw-pdf-card"
        title="Proposal Composer"
        icon={<Icon name="note" size={20} />}
        sub={selected ? (selected.member ? "for " + selected.member.name : "no member") : undefined}
        actions={
          selected ? (
            (selected as any).draft ? (
              // Not sent yet: one click records it as sent (Pipeline, Proposal Composer queue).
              <button type="button" className="taw-btn taw-btn--sm" onClick={() => sendItineraryToProposal(selected.enquiryId, selected.member, selected.data)}>
                <Icon name="send" size={13} /> Mark as sent
              </button>
            ) : (
              <ProposalOutcomeControl entry={selected} onChange={setProposalOutcome} />
            )
          ) : undefined
        }
        flush
      >
        {selected ? (
          <div className="taw-pdf-shell">
            <div className="taw-pdf-actions">
              {/* newPreview toggle (2026-09-25, POC-only — remove once the
                  new design is approved and replaces the old preview
                  outright) */}
              <button className="taw-btn" onClick={() => setNewPreview((v) => !v)}>
                {newPreview ? "Show old PDF preview" : "Show new preview (POC)"}
              </button>
              {!newPreview ? (
                <div className="taw-pdf-pagenav">
                  <button className="taw-pdf-pagenav-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                    <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
                  </button>
                  <input
                    className="taw-pdf-pagenav-box"
                    type="text"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={() => goToPage(currentPage)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    aria-label="Current page"
                  />
                  <span className="taw-pdf-pagenav-sep">/</span>
                  <span className="taw-pdf-pagenav-box taw-pdf-pagenav-box--static">{pageCount}</span>
                  <button className="taw-pdf-pagenav-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">
                    <Icon name="chevron" size={14} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                </div>
              ) : null}
              {pricingLoading ? (
                <span className="taw-pdf-status">
                  <Spinner /> pricing…
                </span>
              ) : null}
              <button className="taw-btn taw-btn--primary" onClick={createWebLink} disabled={creatingLink || !cart.length}>
                <Icon name="send" size={14} />
                {creatingLink ? (linkToken ? "Updating link…" : "Creating link…") : linkToken ? "Copy web link" : "Web link"}
              </button>
              <button className="taw-btn taw-btn--primary taw-btn--brown" onClick={downloadPdf} disabled={!cart.length}>
                <Icon name="download" size={14} />
                Export PDF
              </button>
            </div>
            {newPreview ? (
              // align-items:center / justify-content:center from
              // .taw-pdf-preview (advisor-workbench.css) are meant for the
              // OLD centered PDF-canvas viewer below — for THIS taller,
              // scrollable content they silently crop the top (browsers
              // can't scroll to reach overflow above a centered flex
              // item), which is why the hero/tabs never appeared no
              // matter how far up you scrolled. Overridden here, only for
              // the new preview, rather than changed globally.
              <div
                className="taw-pdf-preview"
                style={{ overflow: "auto", alignItems: "flex-start", justifyContent: "flex-start" }}
              >
                <ProposalPreviewPage payPreviewUrl={linkUrl} onDownload={cart.length ? downloadPdf : undefined} onSwapHotel={selected ? (stayId, hotelKey) => swapProposalHotel(selected.enquiryId, stayId, hotelKey) : undefined} onSwapFlight={selected ? (flightId, altIndex) => swapProposalFlight(selected.enquiryId, flightId, altIndex) : undefined} data={{ ...(proposalData || {}), destination: (proposalData && proposalData.destination) || "Your trip" }} />
              </div>
            ) : (
            <div className={cx("taw-pdf-preview", isFullscreen && "is-maximized")} ref={previewRef}>
              {isFullscreen ? (
                <button className="taw-pdf-maximize-close" aria-label="Exit full screen" onClick={() => setIsFullscreen(false)}>
                  <Icon name="x" size={16} />
                </button>
              ) : null}
              {boxW > 0 ? (
                <div ref={pageViewportRef} className="taw-pdf-page-viewport" style={{ width: Math.min(boxW, availW), height: Math.min(boxH, availH) }}>
                  <ProposalPreview
                    document={proposalDocumentEl}
                    page={currentPage}
                    width={boxW}
                    pageCount={pageCount}
                    onPageCountChange={setPageCount}
                    onPageChange={(n) => setPageInput(String(n))}
                    scrollContainerRef={pageViewportRef}
                  />
                </div>
              ) : null}
              <div className="taw-pdf-controls">
                <div className="taw-pdf-zoom">
                  <button className="taw-pdf-zoom-btn" onClick={zoomOut} disabled={zoom <= 0.5} aria-label="Zoom out">
                    <Icon name="zoomOut" size={14} />
                  </button>
                  <span className="taw-pdf-zoom-div" />
                  <button className="taw-pdf-zoom-btn" onClick={zoomIn} disabled={zoom >= 2} aria-label="Zoom in">
                    <Icon name="zoomIn" size={14} />
                  </button>
                </div>
                <Dropdown
                  className="taw-pdf-fit"
                  value={isFullscreen ? "fullscreen" : fitMode}
                  options={FIT_OPTIONS}
                  onChange={pickFit}
                  ariaLabel="Page fit"
                  triggerClassName="taw-pdf-fit-trigger"
                  openUp
                />
              </div>
            </div>
            )}
          </div>
        ) : (
          selectedProposalEnqId ? (
            // Opened from Pipeline for a proposal this browser no longer has (sent before a
            // reload while saving wasn't available). Point back to where it can be rebuilt.
            <Empty
              icon="note"
              title="This proposal isn't available here"
              message="It was sent in an earlier session and wasn't saved. Open the enquiry in the Console and use Send to Proposal again — new work is now kept."
            />
          ) : (
            <Empty
              icon="note"
              title="Not yet built"
              message="Pick an entry from the Queue once one exists — the proposal PDF preview renders here."
            />
          )
        )}
      </Card>
    </div>
  );
}
