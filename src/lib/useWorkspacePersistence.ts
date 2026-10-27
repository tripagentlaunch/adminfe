/* Keeps the Console's per-enquiry work (Itinerary Builder document + Proposal
   Composer entry) on the server, so a page reload, a second tab or another
   advisor sees the same thing. Before this it was React state only.

   - On mount: GET /enquiries/workspaces and seed both maps.
   - On change: per enquiry, debounce, then PUT with the version last read.
   - 409 (someone saved in between): adopt the server's copy and say so,
     rather than overwriting their work.
   - db/150 not applied (503): keep the work in THIS browser's localStorage
     instead, so a reload doesn't lose it, and say once that it isn't shared. */
import { useEffect, useRef, useState } from "react";
import { enquiryWorkspaceList, enquiryWorkspaceSave } from "../services/api";
import { errText, toast } from "./advisorHelpers";
import type { ProposalQueueEntry } from "./workbenchContext";

const SAVE_DELAY_MS = 1200;
const LOCAL_KEY = "taw.console.workspaces.v1";

// Browser-only fallback store: { [enquiryId]: { itinerary, proposal, at } }.
function readLocal(): Record<string, any> {
  try { return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "{}") || {}; } catch { return {}; }
}
function writeLocal(id: string, doc: { itinerary: any; proposal: any }) {
  try {
    const all = readLocal();
    if (doc.itinerary == null && doc.proposal == null) delete all[id];
    else all[id] = { ...doc, at: Date.now() };
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: nothing more we can do here */
  }
}

type Snap = { itinerary: string; proposal: string };

function proposalDoc(e: ProposalQueueEntry | undefined) {
  return e ? { member: e.member, data: e.data, sentAt: e.sentAt, outcome: e.outcome } : null;
}

export function useWorkspacePersistence({
  itinerariesByEnquiry, setItinerariesByEnquiry, proposalQueue, setProposalQueue,
}: {
  itinerariesByEnquiry: Record<string, any>;
  setItinerariesByEnquiry: (u: (m: Record<string, any>) => Record<string, any>) => void;
  proposalQueue: ProposalQueueEntry[];
  setProposalQueue: (u: (q: ProposalQueueEntry[]) => ProposalQueueEntry[]) => void;
}) {
  const [ready, setReady] = useState(false);
  const disabled = useRef(false);
  const versions = useRef<Record<string, number>>({});
  const saved = useRef<Record<string, Snap>>({}); // what the server holds, serialized
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef<Record<string, boolean>>({});
  const latest = useRef({ itinerariesByEnquiry, proposalQueue });
  latest.current = { itinerariesByEnquiry, proposalQueue };

  function adopt(row: any) {
    const id = row.enquiry_id;
    versions.current[id] = Number(row.version) || 0;
    saved.current[id] = { itinerary: JSON.stringify(row.itinerary ?? null), proposal: JSON.stringify(row.proposal ?? null) };
    setItinerariesByEnquiry((m) => {
      if (row.itinerary == null) { const { [id]: _drop, ...rest } = m; return rest; }
      return { ...m, [id]: row.itinerary };
    });
    setProposalQueue((q) => {
      const rest = q.filter((e) => e.enquiryId !== id);
      return row.proposal ? rest.concat([{ enquiryId: id, ...row.proposal }]) : rest;
    });
  }

  // Restore once.
  useEffect(() => {
    let live = true;
    enquiryWorkspaceList()
      .then((r: any) => {
        if (!live) return;
        const rows: any[] = (r && r.workspaces) || [];
        // Oldest first so the queue keeps send order.
        rows.slice().reverse().forEach(adopt);
      })
      .catch((e: any) => {
        if (e && e.status === 503) {
          disabled.current = true;
          // Server store not set up here: restore what this browser kept.
          const local = readLocal();
          Object.keys(local).forEach((id) => adopt({ enquiry_id: id, version: 0, itinerary: local[id].itinerary, proposal: local[id].proposal }));
          toast("Console work is kept in this browser only until database migration db/150 is applied (other advisors won't see it).", "warn");
        } else {
          console.warn("Couldn't restore saved Console work: " + errText(e));
        }
      })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(id: string) {
    if (disabled.current) {
      const { itinerariesByEnquiry: its, proposalQueue: q } = latest.current;
      const local = { itinerary: its[id] ?? null, proposal: proposalDoc(q.find((e) => e.enquiryId === id)) };
      writeLocal(id, local);
      saved.current[id] = { itinerary: JSON.stringify(local.itinerary), proposal: JSON.stringify(local.proposal) };
      return;
    }
    if (inFlight.current[id]) { schedule(id); return; } // one write per enquiry at a time
    const { itinerariesByEnquiry: its, proposalQueue: q } = latest.current;
    const doc = { itinerary: its[id] ?? null, proposal: proposalDoc(q.find((e) => e.enquiryId === id)) };
    const snap: Snap = { itinerary: JSON.stringify(doc.itinerary), proposal: JSON.stringify(doc.proposal) };
    const prev = saved.current[id];
    if (prev && prev.itinerary === snap.itinerary && prev.proposal === snap.proposal) return;
    inFlight.current[id] = true;
    enquiryWorkspaceSave(id, { ...doc, base_version: versions.current[id] || 0 })
      .then((row: any) => {
        versions.current[id] = Number(row.version) || 0;
        saved.current[id] = snap;
      })
      .catch((e: any) => {
        const current = e && e.body && e.body.detail && e.body.detail.current;
        if (e && e.status === 409 && current) {
          adopt(current);
          toast("This enquiry was just saved by someone else — showing their latest version.", "warn");
        } else if (e && e.status === 503) {
          disabled.current = true;
          save(id); // falls through to the browser store
        } else {
          toast("Couldn't save the itinerary — retrying: " + errText(e), "error");
          schedule(id, 5000);
        }
      })
      .finally(() => { inFlight.current[id] = false; });
  }

  function schedule(id: string, delay = SAVE_DELAY_MS) {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => save(id), delay);
  }

  // Save whatever changed, per enquiry.
  useEffect(() => {
    if (!ready) return;
    const ids = new Set([...Object.keys(itinerariesByEnquiry), ...proposalQueue.map((e) => e.enquiryId), ...Object.keys(saved.current)]);
    ids.forEach((id) => {
      const it = JSON.stringify(itinerariesByEnquiry[id] ?? null);
      const pr = JSON.stringify(proposalDoc(proposalQueue.find((e) => e.enquiryId === id)));
      const prev = saved.current[id] || { itinerary: "null", proposal: "null" };
      if (it !== prev.itinerary || pr !== prev.proposal) schedule(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, itinerariesByEnquiry, proposalQueue]);

  // Flush pending saves when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => Object.keys(timers.current).forEach((id) => { clearTimeout(timers.current[id]); save(id); });
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { restored: ready };
}
