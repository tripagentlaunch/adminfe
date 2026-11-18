"use client";

/* The guest voucher for a confirmed hotel room. Tripsure has no voucher endpoint, so the backend builds it from
   our booking record and sends printable HTML. It is drawn in a script-free sandboxed frame; Print / Save as PDF
   uses the browser's print dialog, Download HTML keeps a copy to attach to an email. It carries no prices. */

import { useRef } from "react";

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export function HotelVoucherView({ voucher, html, onClose }: { voucher: any; html: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const no = String(voucher?.voucher_no || "voucher");
  const name = voucher?.hotel?.name || "Hotel";

  function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  }

  return (
    <div className="taw-modal-overlay" role="dialog" aria-modal="true" aria-label="Hotel voucher"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="taw-modal-panel ow-modal ow-modal--wide">
        <div className="ow-modal-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Hotel voucher — {name}</div>
            <div className="ow-sub" style={{ whiteSpace: "normal" }}>{no}</div>
          </div>
          <button type="button" className="taw-btn taw-btn--sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <iframe ref={frame} title="Hotel voucher" sandbox="allow-same-origin allow-modals" srcDoc={html}
          style={{ width: "100%", height: "52vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />

        <div className="ow-modal-foot">
          <span className="ow-sub" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="taw-btn taw-btn--sm"
              onClick={() => save(new Blob([html], { type: "text/html" }), `hotel-voucher-${no}.html`)}>
              Download HTML
            </button>
          </span>
          <button type="button" className="taw-btn taw-btn--primary" onClick={print}>Print / Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
