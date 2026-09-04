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
 * Row markup reuses .taw-enq-item/-top/-name/-meta/-depart wholesale from
 * EnquiryInbox.tsx's own Queue, rather than inventing new row styling, so
 * this queue reads as the same pattern as Console's.
 * ===========================================================================*/
import { Card, Empty, Icon } from "../../../../components/ui";
import { ItinerarySummaryContent } from "../../../../components/panels/ItinerarySummaryContent";
import { useWorkbench } from "../../../../lib/workbenchContext";
import { cx } from "../../../../lib/cx";

function relativeTime(ts: number) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

export default function ProposalComposerPage() {
  const { proposalQueue, selectedProposalEnqId, selectProposal } = useWorkbench();
  const selected = proposalQueue.find((e) => e.enquiryId === selectedProposalEnqId) || proposalQueue[0] || null;

  return (
    <div className="taw-grid taw-cols-2">
      <Card title="Queue" sub={proposalQueue.length + " pending"}>
        {proposalQueue.length ? (
          <div className="taw-enq">
            {proposalQueue.map((entry) => (
              <button
                key={entry.enquiryId}
                className={cx("taw-enq-item", selected?.enquiryId === entry.enquiryId && "is-active")}
                onClick={() => selectProposal(entry.enquiryId)}
              >
                <div className="taw-enq-top">
                  <div className="taw-enq-name">{entry.member ? entry.member.name : "New lead"}</div>
                </div>
                <div className="taw-enq-meta">
                  {entry.data.destination} · {entry.data.dateRange}
                </div>
                <div className="taw-enq-depart">Sent {relativeTime(entry.sentAt)}</div>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={<Icon name="note" size={28} />}>
            Nothing waiting here yet.
            <br />
            <span className="taw-muted" style={{ fontSize: 11.5 }}>
              Use "Send to Proposal" from the Itinerary Builder once a trip is ready.
            </span>
          </Empty>
        )}
      </Card>

      <Card
        title="Proposal Composer"
        icon={<Icon name="note" size={20} />}
        sub={selected ? (selected.member ? "for " + selected.member.name : "no member") : undefined}
      >
        {selected ? (
          <>
            <ItinerarySummaryContent data={selected.data} />
            <div className="taw-itinsum-note">The real compose/preview/send UI isn't built yet — this is confirming the handoff itself worked.</div>
          </>
        ) : (
          <Empty
            icon="note"
            title="Not yet built"
            message="Assemble, preview exactly as the client sees it, send via WhatsApp — per the Product Flow doc §5.2. Pick an entry from the Queue once one exists."
          />
        )}
      </Card>
    </div>
  );
}
