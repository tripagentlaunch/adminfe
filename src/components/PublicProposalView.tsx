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
 * The active state is the SAME ProposalPreviewPage the advisor's own
 * Proposal Composer shows (the london-itinerary-preview.html design, since
 * 2026-10-19; it used to be the PDF pages drawn on a canvas) — real reuse,
 * just fed from the sanitized `snapshot` the backend returns instead of a
 * live buildProposalTemplateData() call. Its Download PDF button renders
 * ProposalDocument, the same design laid out for paper. No Swap here: a
 * customer can't change the advisor's pick.
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { proposalShareGet } from "../services/api";
import { errText } from "../lib/advisorHelpers";
import { Icon, Spinner } from "./ui";
import { ProposalPreviewPage } from "./proposal/ProposalPreviewPage";
import "../styles/advisor-login.css";

type ViewState = { status: "loading" } | { status: "error"; kind: "not_found" | "expired" | "revoked" | "error"; message: string } | { status: "active"; snapshot: any };

export function PublicProposalView({ token }: { token: string }) {
  const [view, setView] = useState<ViewState>({ status: "loading" });

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
  return <ProposalPreviewPage data={data} onDownload={() => downloadPdf(data)} />;
}
