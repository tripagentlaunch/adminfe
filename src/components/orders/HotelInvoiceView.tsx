"use client";

/* Shows a hotel tax invoice inside the app when Tripsure answers with data instead of a file.
   Print / Save as PDF uses the browser's print dialog; Download JSON keeps Tripsure's answer as-is. */

import { useMemo, useRef } from "react";
import { findHtml, findLink, findPdfBase64, pdfBlob, printableHtml, toSections } from "../../lib/hotelInvoice";

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export function HotelInvoiceView({ data, title, reference, onClose, onRegenerate, busy }: {
  data: unknown; title: string; reference: string; onClose: () => void; onRegenerate?: () => void; busy?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => findHtml(data), [data]);
  const pdf = useMemo(() => findPdfBase64(data), [data]);
  const link = useMemo(() => findLink(data), [data]);
  const sections = useMemo(() => toSections(data), [data]);
  const heading = "Tax invoice — " + title;
  const sub = reference ? `Tripsure booking ${reference}` : "Tripsure hotel booking";
  const page = useMemo(() => html || printableHtml(heading, sub, sections), [html, heading, sub, sections]);

  function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  }

  return (
    <div className="taw-modal-overlay" role="dialog" aria-modal="true" aria-label="Tax invoice"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="taw-modal-panel ow-modal ow-modal--wide">
        <div className="ow-modal-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{heading}</div>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>{sub}</div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {/* The invoice itself is drawn in a script-free frame, so what Tripsure sent can't run code in the app. */}
        <iframe ref={frame} title="Tax invoice" sandbox="allow-same-origin allow-modals" srcDoc={page}
          style={{ width: "100%", height: "52vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />

        {!sections.length && !html ? <div className="ow-sub">Tripsure sent an empty invoice. Try Regenerate invoice.</div> : null}

        <div className="ow-modal-foot">
          <span className="ow-sub" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            {onRegenerate ? <button type="button" className="taw-btn taw-btn--sm" disabled={busy} onClick={onRegenerate}>{busy ? "Working…" : "Regenerate invoice"}</button> : null}
            <button type="button" className="taw-btn taw-btn--sm"
              onClick={() => save(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `hotel-invoice-${reference || "tripsure"}.json`)}>
              Download JSON
            </button>
            {pdf ? <button type="button" className="taw-btn taw-btn--sm" onClick={() => save(pdfBlob(pdf), `hotel-tax-invoice-${reference || "tripsure"}.pdf`)}>Download PDF</button> : null}
            {link ? <a className="taw-btn taw-btn--sm" href={link} target="_blank" rel="noopener noreferrer">Open Tripsure&apos;s link</a> : null}
          </span>
          <button type="button" className="taw-btn taw-btn--primary" onClick={print}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
