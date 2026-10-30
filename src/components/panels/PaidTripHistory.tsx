"use client";
/* A paid trip's kept copies, under the "Paid & locked" banner (ItineraryView): the itinerary as
   paid, every unlock, and the previous copy before each change made after payment — who and when
   (adminbe itinerary_history_service, append-only). While the trip is unlocked, any copy can be
   restored; restoring is itself a change, so the copy it replaces is kept too. */
import { useState } from "react";
import { Icon, Spinner } from "../ui";
import { enquiryWorkspaceHistory, enquiryWorkspaceVersion } from "../../services/api";
import { errText, toast } from "../../lib/advisorHelpers";

const REASON: Record<string, string> = {
  paid: "As paid",
  unlocked: "Before the unlock",
  edited_after_payment: "Before a change",
  restored: "Before a restore",
};

export function PaidTripHistory({ enquiryId, advisors, canRestore, onRestore }: {
  enquiryId: string; advisors: any[]; canRestore: boolean; onRestore: (itinerary: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    setErr(null);
    enquiryWorkspaceHistory(enquiryId)
      .then((r: any) => setRows(r.versions || []))
      .catch((e: any) => setErr(errText(e)));
  }
  function toggle() {
    if (!open && rows == null) load();
    setOpen(!open);
  }
  function restore(v: any) {
    if (!window.confirm(`Put the itinerary back to "${REASON[v.reason] || v.reason}" (${when(v.created_at)})? The current one is kept in this history.`)) return;
    setBusy(v.id);
    enquiryWorkspaceVersion(enquiryId, v.id)
      .then((full: any) => { onRestore(full.itinerary); toast("Restored. The version it replaced is kept in the history.", "success"); setRows(null); setOpen(false); })
      .catch((e: any) => toast("Couldn't restore: " + errText(e), "error"))
      .finally(() => setBusy(null));
  }
  const who = (id: string | null) => (id ? (advisors.find((a: any) => String(a.id) === String(id))?.name || "An advisor") : "At payment");
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="taw-hist">
      <button type="button" className="taw-hist-btn" onClick={toggle} aria-expanded={open}>
        <Icon name="clock" size={13} /> History{rows ? ` (${rows.length})` : ""}
        <Icon name="chevron" size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: ".15s" }} />
      </button>
      {open ? (
        <div className="taw-hist-list">
          {err ? <div className="taw-hist-empty">Couldn&apos;t load the history: {err}</div>
            : rows == null ? <div className="taw-hist-empty"><Spinner /> Loading…</div>
            : !rows.length ? <div className="taw-hist-empty">No copies yet — they start when the trip is paid (needs db/156 on this server).</div>
            : rows.map((v) => (
              <div key={v.id} className="taw-hist-row">
                <span className={"taw-hist-tag " + v.reason}>{REASON[v.reason] || v.reason}</span>
                <span className="taw-hist-meta">{when(v.created_at)} · {who(v.actor_id)}{v.total != null ? ` · total ₹${Math.round(Number(v.total)).toLocaleString("en-IN")}` : ""}</span>
                {canRestore ? (
                  <button type="button" className="taw-btn taw-btn--sm" disabled={busy != null} onClick={() => restore(v)}>
                    {busy === v.id ? "Restoring…" : "Restore"}
                  </button>
                ) : null}
              </div>
            ))}
          {!canRestore && rows && rows.length ? <div className="taw-hist-empty">Unlock the trip to restore a version.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
