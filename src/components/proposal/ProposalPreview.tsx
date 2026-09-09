"use client";
/* =============================================================================
 * TripAgent — src/components/proposal/ProposalPreview.tsx
 * Rebuilt on pdfjs-dist (2026-09-08, direct request) — the previous
 * version used @react-pdf/renderer's own approach: an <iframe> pointed
 * at the PDF blob, which hands rendering to the BROWSER's built-in PDF
 * plugin. That plugin has its own internal layout heuristics we don't
 * control — confirmed live: at a short/wide box (Proposal Composer's
 * "Fit one page" mode), it silently switched to a multi-page thumbnail
 * grid instead of a normal single-page view, and forcing a `zoom=` hash
 * hint didn't reliably stop it. This component instead loads the SAME
 * generated PDF bytes into pdfjs-dist and paints EVERY page onto its own
 * <canvas> WE own, stacked vertically inside the caller's scrollable
 * container — no native toolbar, no viewer-internal layout modes, and
 * (2026-09-08, follow-up) real continuous scroll restored, which the
 * first single-page version of this component dropped — direct
 * feedback: "is it easier to revert" — no, extending this was the
 * better call, since reverting brings back the background-mismatch and
 * Fit-one-page bugs the canvas rewrite exists to fix.
 *
 * Scroll and the page-nav control stay in sync BOTH ways: scrolling
 * updates which page number is shown, and typing/chevron-ing a page
 * scrolls the container there — `lastScrollReportedPageRef` distinguishes
 * a page change caused by the user's own scroll (don't scroll-snap while
 * they're mid-gesture) from one caused by the nav control (do scroll).
 * ===========================================================================*/
import { pdf } from "@react-pdf/renderer";
import { useEffect, useRef } from "react";

let pdfjsLibPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsLibPromise;
}

export function ProposalPreview({
  document,
  page,
  width,
  pageCount,
  onPageChange,
  scrollContainerRef,
}: {
  document: React.ReactElement;
  page: number;
  width: number;
  pageCount: number;
  onPageChange: (n: number) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  // pdfDocRef caches the parsed pdfjs document — only re-parsed when
  // `document` (the react-pdf element) itself changes, not on every
  // zoom step or page flip. Written by the FIRST effect and read by the
  // second; both run in registration order within the same commit, so a
  // `document` change is always visible to the second effect on the
  // very render that produced it.
  const pdfDocRef = useRef<{ forDocument: React.ReactElement; promise: Promise<any> } | null>(null);
  const renderTasksRef = useRef<any[]>([]);
  const lastScrollReportedPageRef = useRef<number | null>(null);

  useEffect(() => {
    if (pdfDocRef.current?.forDocument === document) return;
    const promise = Promise.all([loadPdfjs(), pdf(document).toBlob()]).then(async ([pdfjsLib, blob]) => {
      const buf = await blob.arrayBuffer();
      return pdfjsLib.getDocument({ data: buf }).promise;
    });
    pdfDocRef.current = { forDocument: document, promise };
  }, [document]);

  // Render every page at the caller's target width — matching whatever
  // fit mode/zoom level it computed, same principle the single-page
  // version used, just applied per-canvas here.
  useEffect(() => {
    const entry = pdfDocRef.current;
    if (!entry || width <= 0) return;
    let cancelled = false;

    entry.promise.then(async (pdfDoc: any) => {
      const total = Math.min(pageCount, pdfDoc.numPages);
      for (let i = 1; i <= total; i++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        const pageProxy = await pdfDoc.getPage(i);
        if (cancelled) return;

        const unscaledViewport = pageProxy.getViewport({ scale: 1 });
        const scale = width / unscaledViewport.width;
        const viewport = pageProxy.getViewport({ scale });

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Cancel any in-flight render before starting a new one — pdf.js
        // throws if a second render starts on the same canvas mid-render
        // (happens routinely here: width/zoom can change faster than a
        // render completes).
        renderTasksRef.current[i - 1]?.cancel();
        const task = pageProxy.render({ canvasContext: ctx, viewport });
        renderTasksRef.current[i - 1] = task;
        try {
          await task.promise;
        } catch (e: any) {
          if (e?.name !== "RenderingCancelledException") throw e;
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [document, width, pageCount]);

  // External page change (chevron/typed number) → scroll there. Skipped
  // when this exact page number was the one WE just reported from the
  // user's own scroll (see the scroll listener below) — otherwise every
  // scroll tick would fight the user's own scroll gesture with a snap.
  useEffect(() => {
    if (lastScrollReportedPageRef.current === page) return;
    const el = scrollContainerRef.current;
    const target = el?.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    if (!el || !target) return;
    el.scrollTo({ top: target.offsetTop, behavior: "auto" });
  }, [page, scrollContainerRef]);

  // Scroll → report the page most visible near the container's vertical
  // center, same convention normal PDF viewers use for their own page
  // badge.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    function onScroll() {
      const container = scrollContainerRef.current;
      if (!container) return;
      const children = Array.from(container.querySelectorAll<HTMLElement>("[data-page]"));
      const mid = container.scrollTop + container.clientHeight / 2;
      let current = 1;
      for (const child of children) {
        if (child.offsetTop <= mid) current = Number(child.dataset.page);
      }
      lastScrollReportedPageRef.current = current;
      onPageChange(current);
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef, onPageChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "16px 0" }}>
      {Array.from({ length: pageCount }, (_, i) => (
        <canvas key={i} ref={(el) => { canvasRefs.current[i] = el; }} data-page={i + 1} style={{ display: "block" }} />
      ))}
    </div>
  );
}
