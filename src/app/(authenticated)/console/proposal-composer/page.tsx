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
import { Card, Dropdown, Empty, Icon, SleekScroll, Spinner } from "../../../../components/ui";
import { QuoteBuilder } from "../../../../components/panels/QuoteBuilder";
import { useWorkbench } from "../../../../lib/workbenchContext";
import type { ProposalOutcome } from "../../../../lib/workbenchContext";
import { cartFromItinerary } from "../../../../lib/itineraryFromCart";
import { useQuotePricing } from "../../../../lib/useQuotePricing";
import { useHotelWebsites } from "../../../../lib/useHotelWebsites";
import { toast, errText } from "../../../../lib/advisorHelpers";
import { enquiryProposalShareCreate } from "../../../../services/api";
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
  const { proposalQueue, selectedProposalEnqId, selectProposal, advisorId, currentAdvisor, creating, createOrder, setProposalOutcome } = useWorkbench();
  const selected = proposalQueue.find((e) => e.enquiryId === selectedProposalEnqId) || proposalQueue[0] || null;

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

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setPane({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  function downloadPdf() {
    Promise.all([
      import("../../../../components/proposal/ProposalDocument"),
      import("../../../../lib/renderProposalPdf"),
    ]).then(async ([{ ProposalDocument }, { renderProposalPdfBlob }]) => {
      const blob = await renderProposalPdfBlob(<ProposalDocument data={proposalData} />);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(proposalData.destination || "Itinerary").replace(/[^a-z0-9]+/gi, "-")}-Proposal.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Web link (2026-09-10) — mints a real, tokenised public share of the
  // CURRENT proposalData (snapshot-at-share-time, confirmed with the user:
  // the link shows what was actually sent, never silently updates if the
  // advisor keeps editing the itinerary afterward — see backend/app/
  // services/proposal_share_service.py's own module note). Replaces the
  // old "isn't built yet" placeholder toast.
  const [creatingLink, setCreatingLink] = useState(false);
  function createWebLink() {
    if (!selected || creatingLink) return;
    setCreatingLink(true);
    enquiryProposalShareCreate(selected.enquiryId, proposalData)
      .then((res: any) => {
        setCreatingLink(false);
        const url = `${window.location.origin}/proposal/${res.token}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).catch(() => {});
        }
        toast("Link copied — valid for 14 days: " + url, "success");
      })
      .catch((e: any) => {
        setCreatingLink(false);
        toast("Couldn't create the link: " + errText(e), "error");
      });
  }

  return (
    <div className="taw-grid taw-cols-2">
      <div className="taw-acc-stack">
        <div className={cx("taw-acc", qOpen && "is-open")}>
          <div className={"taw-acc-h" + (qOpen ? " is-open" : "")}>
            <Icon name="inbox" size={20} />
            <h3>Queue</h3>
            {proposalQueue.length ? <span className="sub">{proposalQueue.length} pending</span> : null}
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
              {proposalQueue.length ? (
                <SleekScroll className="taw-enq-scroll">
                  <div className="taw-enq">
                    {proposalQueue.map((entry) => {
                      const hours = Math.floor(Math.max(0, Date.now() - entry.sentAt) / 3600000);
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
                            <span className={cx("taw-enq-hours", hours >= 24 && "is-breach")}>{hours}h</span>
                          </div>
                          <div className="taw-enq-meta">
                            {entry.data.destination}
                            {entry.data.destination && entry.data.dateRange ? " · " : ""}
                            {entry.data.dateRange}
                          </div>
                          <div className="taw-enq-depart">Sent {relativeTime(entry.sentAt)}</div>
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
                creating={creating}
                onCreateOrder={createOrder}
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
        actions={selected ? <ProposalOutcomeControl entry={selected} onChange={setProposalOutcome} /> : undefined}
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
                {creatingLink ? "Creating link…" : "Web link"}
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
                <ProposalPreviewPage data={proposalData && proposalData.destination ? proposalData : {
                  destination: "Switzerland",
                  memberName: "Kabir Shah",
                  dateRange: "12 – 20 Oct 2026",
                  nights: 8,
                  pax: 1,
                  cities: ["Zurich", "Lucerne", "Zermatt"],
                  stays: [
                    { name: "Widder Hotel", location: "Zurich · Old Town", nights: 3, image: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80", price: "₹87,600", cabin: null },
                    { name: "Hotel Schweizerhof", location: "Lucerne · Lakeside", nights: 2, image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", price: "₹54,200", cabin: null },
                    { name: "Mont Cervin Palace", location: "Zermatt · Village centre", nights: 3, image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", price: "₹1,12,400", cabin: null },
                  ],
                  flights: [
                    { from: "Mumbai", to: "Zurich", depTime: "04:35", arrTime: "12:25", flightNo: "EK 501 · EK 87", duration: "13h 20m", cabin: "Business", price: "₹2,24,800" },
                    { from: "Zurich", to: "Mumbai", depTime: "13:40", arrTime: "01:55+1", flightNo: "EK 88 · EK 502", duration: "10h 15m", cabin: "Business", price: "₹2,24,800" },
                  ],
                  visa: null,
                  advisorName: "TripAgent",
                }} />
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
          <Empty
            icon="note"
            title="Not yet built"
            message="Pick an entry from the Queue once one exists — the proposal PDF preview renders here."
          />
        )}
      </Card>
    </div>
  );
}
