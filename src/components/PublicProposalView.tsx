"use client";
/* =============================================================================
 * TripAgent — src/components/PublicProposalView.tsx
 * Public, unauthenticated viewer for Proposal Composer's "Web link" share
 * (/proposal/[token]). Counterpart to AcceptAdvisorInvite.tsx — same posture
 * (no session, calls the FastAPI backend directly with no Authorization
 * header via services/api.ts's proposalShareGet()), same tal-shell/tal-card
 * shell for its loading/error states, borrowed directly rather than
 * reinvented.
 *
 * The active state reuses the SAME ProposalDocument/ProposalPreview
 * components the advisor's own Proposal Composer renders from — real reuse,
 * not a rebuilt view — just fed from the sanitized `snapshot` the backend
 * returns instead of a live buildProposalTemplateData() call. No zoom/fit-
 * mode/fullscreen controls (advisor-only power-user affordances on that
 * page) — a single fixed, responsive width and a plain page nav is enough
 * for a link opened once.
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { proposalShareGet } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon, Spinner } from "./ui";
import { PAGE_COUNT, ProposalDocument } from "./proposal/ProposalDocument";
import "../styles/advisor-login.css";
import "../styles/advisor-workbench.css";

const ProposalPreview = dynamic(() => import("./proposal/ProposalPreview").then((m) => m.ProposalPreview), { ssr: false });

const PDF_ASPECT = 841.89 / 595.28; // A4 height/width

type ViewState = { status: "loading" } | { status: "error"; kind: "not_found" | "expired" | "revoked" | "error"; message: string } | { status: "active"; snapshot: any };

export function PublicProposalView({ token }: { token: string }) {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [pageInput, setPageInput] = useState("1");
  // pageCount (2026-09-13 fix, real "preview silently drops the last 2 of
  // 6 real pages" repro) — PAGE_COUNT is only the pre-parse placeholder
  // (a stay's card can span more than one physical page since the
  // hotel-card redesign, so a fixed nominal count goes stale); this state
  // is what the nav actually clamps/displays against, kept in sync with
  // the REAL parsed page count via ProposalPreview's onPageCountChange.
  const [pageCount, setPageCount] = useState(PAGE_COUNT);
  const currentPage = Math.min(pageCount, Math.max(1, parseInt(pageInput, 10) || 1));
  // Two refs, same split as proposal-composer/page.tsx: `previewRef` (outer,
  // freely-sized) is only ever MEASURED (ResizeObserver -> pane w/h);
  // `pageViewportRef` (inner, constrained to the computed box size) is the
  // actual scroll container ProposalPreview paints into and scrolls within.
  const previewRef = useRef<HTMLDivElement>(null);
  const pageViewportRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ w: 0, h: 0 });
  // proposalDocumentEl (2026-09-13 fix, real "blank page 3 / broken
  // Download PDF" repro) — MUST be an unconditional hook call (same rule
  // as every other hook here), so this sits above the early loading/error
  // returns below rather than after them — a `useMemo` called only on
  // SOME renders (e.g. only once `view.status === "active"`) throws
  // React's own "Rendered more hooks than during the previous render."
  // Memoized on the snapshot itself (null/undefined while loading or
  // errored, in which case this value is simply never read) so `document`
  // stays referentially stable across THIS component's own unrelated
  // re-renders (the ResizeObserver below fires several times as the
  // layout settles) — previously a brand-new element every render, which
  // made ProposalPreview's [document]-keyed effect think the document had
  // changed on every one of those, aborting its own still-in-flight PDF
  // render (see ProposalPreview.tsx's own new cleanup, same date) before
  // it could ever finish fetching its fonts: an unbroken abort-and-
  // restart livelock, never completing. proposal-composer/page.tsx's
  // equivalent element was already memoized on data; this brings the
  // public page's copy in line.
  const snapshot = view.status === "active" ? view.snapshot : null;
  const proposalDocumentEl = useMemo(() => (snapshot ? <ProposalDocument data={snapshot} /> : null), [snapshot]);

  useEffect(() => {
    proposalShareGet(token)
      .then((res: any) => {
        setView({ status: "active", snapshot: res.snapshot });
      })
      .catch((e: any) => {
        const detail = e && e.body && e.body.detail;
        const kind = detail && typeof detail === "object" && detail.status ? detail.status : e && e.status === 404 ? "not_found" : "error";
        setView({ status: "error", kind, message: errText(e) });
      });
  }, [token]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setPane({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view.status]);

  function goToPage(n: number) {
    setPageInput(String(Math.min(pageCount, Math.max(1, n))));
  }

  function downloadPdf(data: any) {
    Promise.all([import("./proposal/ProposalDocument"), import("../lib/renderProposalPdf")]).then(async ([{ ProposalDocument: Doc }, { renderProposalPdfBlob }]) => {
      const blob = await renderProposalPdfBlob(<Doc data={data} />);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(data.destination || "Itinerary").replace(/[^a-z0-9]+/gi, "-")}-Proposal.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (view.status === "loading") {
    return (
      <div className="tal-shell">
        <div className="tal-card tal-card--loading">
          <Spinner />
          <p className="tal-sub" style={{ margin: 0 }}>
            Loading your proposal…
          </p>
        </div>
      </div>
    );
  }

  if (view.status === "error") {
    const copy: Record<string, { title: string; sub: string }> = {
      not_found: { title: "Link not found", sub: "This proposal link doesn't exist. Double-check the link your advisor sent, or ask them to send a new one." },
      expired: { title: "This link has expired", sub: "Proposal links are valid for 14 days. Ask your advisor for an updated link." },
      revoked: { title: "This link is no longer available", sub: "Your advisor has taken this link down. Ask them for an updated one." },
      error: { title: "Couldn't load this proposal", sub: view.message || "Something went wrong. Please try again in a moment." },
    };
    const { title, sub } = copy[view.kind] || copy.error;
    return (
      <div className="tal-shell">
        <div className="tal-card">
          <div className="tal-brand">
            <Icon name="alert" size={20} />
            <span>TripAgent</span>
          </div>
          <h1 className="tal-title">{title}</h1>
          <p className="tal-sub">{sub}</p>
        </div>
      </div>
    );
  }

  const data = view.snapshot;
  const availW = Math.max(100, pane.w);
  const availH = Math.max(100, pane.h);
  // Fills the full measured width — matches proposal-composer/page.tsx's
  // own DEFAULT fitMode ("width"; boxW = availW there too), rather than
  // capping at a fixed size, so this looks like the composer's own
  // out-of-the-box view rather than a smaller, letterboxed one.
  const boxW = availW;
  const boxH = boxW * PDF_ASPECT;

  return (
    <div className="tal-shell" style={{ alignItems: "flex-start", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="tal-brand" style={{ margin: 0 }}>
          <Icon name="note" size={20} />
          <span>TripAgent — {data.destination || "Your proposal"}</span>
        </div>
        <div className="taw-pdf-actions" style={{ position: "static" }}>
          <div className="taw-pdf-pagenav">
            <button className="taw-pdf-pagenav-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
              <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
            </button>
            <span className="taw-pdf-pagenav-box taw-pdf-pagenav-box--static">{currentPage}</span>
            <span className="taw-pdf-pagenav-sep">/</span>
            <span className="taw-pdf-pagenav-box taw-pdf-pagenav-box--static">{pageCount}</span>
            <button className="taw-pdf-pagenav-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">
              <Icon name="chevron" size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
          <button className="taw-btn taw-btn--primary taw-btn--brown" onClick={() => downloadPdf(data)}>
            <Icon name="download" size={14} />
            Download PDF
          </button>
        </div>
        {/* .taw-pdf-preview's own CSS rule (advisor-workbench.css) is
            `flex:1; min-height:0` — written for composer's specific
            ancestor chain (.taw-pdf-shell -> .taw-card-b -> Card -> a grid
            with its own real height from the authenticated app shell),
            where flex:1 grows it to fill whatever's left. This page has no
            such ancestor — this div's direct parent is a plain, auto-
            height flex column — so that flex:1/flex-basis:0% collapsed
            this box toward zero height instead (confirmed root cause of
            the "thin sliver, cropped" bug: pane.h measured off THAT
            collapsed box, cascading into an undersized boxH/page-viewport
            everywhere downstream). `flex:"none"` overrides it so the
            explicit height below is what actually applies, independent of
            any ancestor's flex context. */}
        <div className="taw-pdf-preview" ref={previewRef} style={{ height: "75vh", flex: "none" }}>
          {boxW > 0 ? (
            <div ref={pageViewportRef} className="taw-pdf-page-viewport" style={{ width: boxW, height: Math.min(boxH, availH) }}>
              <ProposalPreview
                // Non-null: guaranteed by the `view.status === "active"`
                // early-return guards above (snapshot is only null while
                // loading/erroring, both of which have already returned).
                document={proposalDocumentEl!}
                page={currentPage}
                width={boxW}
                pageCount={pageCount}
                onPageCountChange={setPageCount}
                onPageChange={(n: number) => setPageInput(String(n))}
                scrollContainerRef={pageViewportRef}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
