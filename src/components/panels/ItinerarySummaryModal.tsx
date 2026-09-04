"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ItinerarySummaryModal.tsx
 * The "Summary window" the designer asked to bring back (2026-09-03) —
 * originally part of this screen, removed when Search moved inline (see
 * WorkbenchTab.tsx's own docblock), planned since then as a "Finalize-
 * triggered overlay" but left unbuilt until now. Opens from ItineraryView's
 * new "Send to Proposal" button; its own primary action is what actually
 * performs the handoff (writes the itinerary into WorkbenchContext, then
 * navigates to Proposal Composer) — this modal is the deliberate pause
 * point before that happens, not the handoff itself.
 *
 * Reuses the existing .taw-modal-overlay/-panel/-title/-actions markup
 * from InviteCustomerForm.tsx rather than inventing new modal chrome, with
 * a --wide panel variant since an itinerary recap needs more room than a
 * short confirm dialog.
 * ===========================================================================*/
import { Icon } from "../ui";
import { ItinerarySummaryContent } from "./ItinerarySummaryContent";

export function ItinerarySummaryModal({ data, onClose, onContinue }: { data: any; onClose: () => void; onContinue: () => void }) {
  return (
    <div className="taw-modal-overlay" onClick={onClose}>
      <div className="taw-modal-panel taw-modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="taw-modal-title">Send to Proposal</div>
        <ItinerarySummaryContent data={data} />
        <div className="taw-modal-actions">
          <button className="taw-btn" onClick={onClose}>
            Back to itinerary
          </button>
          <button className="taw-btn taw-btn--primary" onClick={onContinue}>
            <Icon name="send" size={14} />
            Continue to Proposal Composer
          </button>
        </div>
      </div>
    </div>
  );
}
