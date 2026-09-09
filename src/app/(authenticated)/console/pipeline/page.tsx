"use client";
/* =============================================================================
 * TripAgent — src/app/(authenticated)/console/pipeline/page.tsx
 * "Pipeline" tab under Enquiries — a read-only tracker across every
 * enquiry's real stage. Every stage transition already happens elsewhere
 * via a real action (Generate Itinerary in Console, Send to Proposal, a
 * client responding) — this tab doesn't drive any of them itself except
 * the one genuinely manual piece (see "outcome" below), so it's a table,
 * not a kanban board you'd drag cards around in.
 *
 * "Stage" has NO backend concept at all (confirmed via BACKEND-HANDOFF.md
 * research): it's derived from three separate, otherwise-uncorrelated
 * pieces of session-local state this app already has —
 *   1. itinerariesByEnquiry[id] — does an itinerary exist yet?
 *   2. proposalQueue — has it been sent to Proposal Composer?
 *   3. proposalQueue entry's own `outcome` — has the client responded?
 * (3) started as a standalone outcome Dropdown on this table, then
 * (2026-09-09, direct correction) got replaced entirely by the
 * per-stage action button below — the button IS the row's one control
 * now, not a second thing alongside a status-setter.
 *
 * 2026-09-08, follow-up direct request — rebuilt from a grouped-by-stage
 * list into a real sortable/filterable table: a colored tag per row (not
 * just a section header) so every stage is readable at a glance even
 * once sorted/filtered away from its group; real column headers with
 * click-to-sort; stage filter pills (same .taw-qfilters pattern LeadsPanel
 * etc. already use); height-constrained to the viewport with its own
 * internal scroll (same min-height:0 flex-chain + SleekScroll pattern as
 * Console's own Itinerary Builder day list), not the page itself
 * scrolling; and narrower overall rather than full-bleed.
 * ===========================================================================*/
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty, Icon, SleekScroll } from "../../../../components/ui";
import { useWorkbench } from "../../../../lib/workbenchContext";
import { cx } from "../../../../lib/cx";

// STAGES — order matches the real lifecycle; `tone` maps to a
// .taw-pipeline-tag--* color so every stage reads at a glance (own
// direct request) regardless of how the table is currently sorted.
//
// `action` (2026-09-09, direct follow-up: "what action can the advisor
// take for each entry") — every stage gets ONE real next step, using
// only navigation that already exists elsewhere (Console's own
// chooser-vs-builder auto-resume off itinerariesByEnquiry, and Proposal
// Composer's already-wired QuoteBuilder "Create Order" action): New and
// Building both land back in Console (Console decides chooser vs.
// builder on its own — no extra plumbing needed here); Accepted is the
// one stage where the advisor genuinely hasn't acted yet, so its label
// calls that out ("Review & book") rather than reusing "Open proposal";
// Revision Requested goes to CONSOLE, not Proposal Composer, to actually
// revise the itinerary — direct correction of a bug found while wiring
// this up, where every proposalEntry-bearing row (including this one)
// silently routed to Proposal Composer via row-click.
const STAGES = [
  { key: "new", label: "New", icon: "inbox", tone: "neutral", action: "console", actionLabel: "Start itinerary" },
  { key: "building", label: "Building Itinerary", icon: "compass", tone: "info", action: "console", actionLabel: "Continue itinerary" },
  { key: "sent", label: "Sent to Proposal", icon: "send", tone: "gold", action: "composer", actionLabel: "Open proposal" },
  { key: "accepted", label: "Accepted", icon: "check", tone: "success", action: "composer", actionLabel: "Review & book" },
  { key: "revision_requested", label: "Revision Requested", icon: "refresh", tone: "warn", action: "console", actionLabel: "Revise itinerary" },
  { key: "rejected", label: "Rejected", icon: "x", tone: "danger", action: "composer", actionLabel: "Open proposal" },
] as const;
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

type SortKey = "name" | "destination" | "stage" | "updated";

function relativeTime(ts: number) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

function SortHeader({ label, sortKey, active, dir, onClick }: { label: string; sortKey: SortKey; active: boolean; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  return (
    <th>
      <button type="button" className="taw-pipeline-sortbtn" onClick={() => onClick(sortKey)}>
        {label}
        <Icon name="chevron" size={11} style={{ opacity: active ? 1 : 0.25, transform: active && dir === "asc" ? "rotate(180deg)" : undefined }} />
      </button>
    </th>
  );
}

export default function PipelinePage() {
  const router = useRouter();
  const { enquiries, membersById, itinerariesByEnquiry, proposalQueue, pickEnquiry, selectProposal } = useWorkbench();

  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const allRows = useMemo(() => {
    return enquiries.map((e: any) => {
      const proposalEntry = proposalQueue.find((p) => p.enquiryId === e.id);
      const hasItinerary = !!itinerariesByEnquiry[e.id];
      const stage = proposalEntry ? (proposalEntry.outcome === "awaiting" ? "sent" : proposalEntry.outcome) : hasItinerary ? "building" : "new";
      const member = e.member_id ? membersById[e.member_id] : null;
      const intent = e.ask || {};
      let dests = intent.destinations || intent.destination || [];
      if (typeof dests === "string") dests = [dests];
      const destText = (dests || []).slice(0, 2).join(", ");
      const pax = intent.persons ? intent.persons.length : null;
      const updatedAt = proposalEntry?.sentAt || (e.created_at ? new Date(e.created_at).getTime() : 0);
      return { enquiry: e, member, proposalEntry, stage, name: member ? member.name : "New lead", destText, pax, updatedAt };
    });
  }, [enquiries, membersById, itinerariesByEnquiry, proposalQueue]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allRows.length };
    for (const s of STAGES) c[s.key] = allRows.filter((r) => r.stage === s.key).length;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = stageFilter === "all" ? allRows : allRows.filter((r) => r.stage === stageFilter);
    const sorted = filtered.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "destination") cmp = (a.destText || "").localeCompare(b.destText || "");
      else if (sortKey === "stage") cmp = STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage);
      else cmp = a.updatedAt - b.updatedAt;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, stageFilter, sortKey, sortDir]);

  // Routes off the STAGE's own declared `action`, not proposalEntry
  // presence (2026-09-09 fix) — Revision Requested rows DO have a
  // proposalEntry (they're still in proposalQueue) but need to go back
  // to Console to actually revise the itinerary, not Proposal Composer.
  function openRow(row: (typeof allRows)[number]) {
    const stageDef = STAGE_BY_KEY[row.stage];
    if (stageDef.action === "composer") {
      selectProposal(row.enquiry.id);
      router.push("/console/proposal-composer");
    } else {
      pickEnquiry(row.enquiry, row.member);
      router.push("/console/queue");
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 1120, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Card className="taw-pipeline-card" title="Pipeline" icon={<Icon name="trend" size={20} />} sub={`${allRows.length} enquiries`} flush>
          <div className="taw-pipeline-shell">
            <div className="taw-qfilters" role="tablist" aria-label="Pipeline stage filter">
              <button type="button" className={cx("taw-qfilter", stageFilter === "all" && "is-active")} onClick={() => setStageFilter("all")}>
                All
                <span className="n ta-num">{counts.all}</span>
              </button>
              {STAGES.map((s) => (
                <button key={s.key} type="button" className={cx("taw-qfilter", stageFilter === s.key && "is-active")} onClick={() => setStageFilter(s.key)}>
                  {s.label}
                  <span className="n ta-num">{counts[s.key] || 0}</span>
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <Empty icon={<Icon name="trend" size={28} />}>No enquiries in this stage.</Empty>
            ) : (
              <div className="taw-recon-tablewrap taw-pipeline-tablewrap">
                <div className="taw-pipeline-headrow">
                  <table className="taw-recon-table taw-pipeline-table taw-pipeline-headtable">
                    <thead>
                      <tr>
                        <SortHeader label="Stage" sortKey="stage" active={sortKey === "stage"} dir={sortDir} onClick={toggleSort} />
                        <SortHeader label="Name" sortKey="name" active={sortKey === "name"} dir={sortDir} onClick={toggleSort} />
                        <SortHeader label="Destination" sortKey="destination" active={sortKey === "destination"} dir={sortDir} onClick={toggleSort} />
                        <th>Pax</th>
                        <SortHeader label="Updated" sortKey="updated" active={sortKey === "updated"} dir={sortDir} onClick={toggleSort} />
                        <th />
                      </tr>
                    </thead>
                  </table>
                  <div className="taw-pipeline-headspacer" />
                </div>
                <SleekScroll className="taw-pipeline-scroll">
                  <table className="taw-recon-table taw-pipeline-table">
                    <tbody>
                      {rows.map((row) => {
                        const stageDef = STAGE_BY_KEY[row.stage];
                        return (
                          <tr key={row.enquiry.id} className="taw-pipeline-tr" onClick={() => openRow(row)}>
                            <td>
                              <span className={cx("taw-pipeline-tag", `taw-pipeline-tag--${stageDef.tone}`)}>
                                <Icon name={stageDef.icon} size={10} />
                                {stageDef.label}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{row.name}</td>
                            <td>{row.destText || "—"}</td>
                            <td className="num">{row.pax || "—"}</td>
                            <td>{row.updatedAt ? relativeTime(row.updatedAt) : "—"}</td>
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <button type="button" className="taw-pipeline-action-btn" onClick={() => openRow(row)}>
                                {stageDef.actionLabel}
                                <Icon name="chevron" size={12} style={{ transform: "rotate(-90deg)" }} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </SleekScroll>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
