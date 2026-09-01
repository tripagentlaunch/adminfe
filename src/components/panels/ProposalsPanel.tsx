"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ProposalsPanel.tsx
 * Ported from web/js/advisor.js: ProposalsPanel (line ~4607). Assemble
 * multiple NAMED quote options for one member, compare side-by-side
 * (SELL-only), set a recommended option, send, version, and generate a
 * branded proposal PDF. Pure grouping over existing quote_ids; NEVER touches
 * money/ledger.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { advisorProposals, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, fmtDate } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

export function ProposalsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId;
  const members = props.members || [];

  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<any>(null); // {proposal, options}
  const [selLoading, setSelLoading] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<any>(null);
  const [pickMemberId, setPickMemberId] = useState("");

  const reqRef = useRef(0);

  function callProposals(payload: any) {
    return advisorProposals(payload);
  }

  function loadList() {
    if (!advisorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const myReq = ++reqRef.current;
    callProposals({ action: "list", advisor_id: advisorId })
      .then((r: any) => {
        if (myReq !== reqRef.current) return;
        if (r && r.error) {
          setErr(r.error);
          setList([]);
        } else setList((r && r.proposals) || []);
        setLoading(false);
      })
      .catch((e: any) => {
        if (myReq !== reqRef.current) return;
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(loadList, [advisorId]); // eslint-disable-line

  function openProposal(id: string) {
    setSelLoading(true);
    setDownload(null);
    callProposals({ action: "get", advisor_id: advisorId, proposal_id: id })
      .then((r: any) => {
        if (r && r.error) {
          toast("Could not open proposal: " + r.error, "error");
          setSelLoading(false);
          return;
        }
        setSel({ proposal: r.proposal, options: r.options || [] });
        setSelLoading(false);
      })
      .catch((e: any) => {
        toast(errText(e), "error");
        setSelLoading(false);
      });
  }

  function refreshSel() {
    if (sel && sel.proposal) openProposal(sel.proposal.id);
  }

  function createProposal() {
    if (!advisorId) {
      toast("Select an advisor first.", "error");
      return;
    }
    if (!pickMemberId) {
      toast("Pick a member to prepare a proposal for.", "error");
      return;
    }
    const mem = members.filter((m: any) => m.id === pickMemberId)[0];
    const title = typeof window !== "undefined" && window.prompt ? window.prompt("Proposal title:", mem ? mem.name.split(" ")[0] + "'s Journey" : "Travel Proposal") : "Travel Proposal";
    if (title == null) return;
    setBusy(true);
    callProposals({ action: "create", advisor_id: advisorId, member_id: pickMemberId, title: title || undefined })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast("Create failed: " + r.error, "error");
          return;
        }
        toast("Proposal created — add options from priced quotes.", "success");
        loadList();
        setSel({ proposal: r.proposal, options: [] });
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function addOption() {
    if (!sel || !sel.proposal) return;
    let quoteId = typeof window !== "undefined" && window.prompt ? window.prompt("Quote ID for this option (price a cart in the Workbench to mint one):", "") : "";
    if (!quoteId) return;
    quoteId = String(quoteId).trim();
    const label = typeof window !== "undefined" && window.prompt ? window.prompt("Option name (e.g. Signature / Essential):", "Option " + ((sel.options || []).length + 1)) : "Option";
    if (label == null) return;
    setBusy(true);
    callProposals({ action: "add_option", advisor_id: advisorId, proposal_id: sel.proposal.id, quote_id: quoteId, label: label || undefined })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast("Add option failed: " + r.error, "error");
          return;
        }
        toast("Option added.", "success");
        refreshSel();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function recommend(optionId: string) {
    if (!sel || !sel.proposal) return;
    setBusy(true);
    callProposals({ action: "set_recommended", advisor_id: advisorId, proposal_id: sel.proposal.id, option_id: optionId })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast(r.error, "error");
          return;
        }
        refreshSel();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function sendProposal() {
    if (!sel || !sel.proposal) return;
    setBusy(true);
    callProposals({ action: "send", advisor_id: advisorId, proposal_id: sel.proposal.id })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast("Send failed: " + r.error, "error");
          return;
        }
        toast("Proposal sent to member.", "success");
        setSel({ proposal: r.proposal, options: r.options || sel.options });
        loadList();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function versionProposal() {
    if (!sel || !sel.proposal) return;
    setBusy(true);
    callProposals({ action: "version", advisor_id: advisorId, proposal_id: sel.proposal.id })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast("New version failed: " + r.error, "error");
          return;
        }
        toast("New version created (prior kept).", "success");
        setSel({ proposal: r.proposal, options: r.options || [] });
        loadList();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function generatePdf() {
    if (!sel || !sel.proposal) return;
    setBusy(true);
    setDownload(null);
    callProposals({ action: "render_pdf", advisor_id: advisorId, proposal_id: sel.proposal.id })
      .then((r: any) => {
        setBusy(false);
        if (r && r.error) {
          toast("Generate failed: " + r.error, "error");
          return;
        }
        if (r.download_url) {
          setDownload(r.download_url);
          toast("Branded proposal generated.", "success");
        } else toast("Proposal stored; link unavailable — retry.", "info");
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }

  function optionColumn(opt: any) {
    const p = opt.pricing || null;
    return (
      <div key={opt.id} className={cx("taw-prop-opt", opt.is_recommended && "is-rec")}>
        {opt.is_recommended ? <div className="taw-prop-rec">Recommended</div> : null}
        <div className="taw-prop-lab">{opt.label || "Option"}</div>
        {opt.blurb ? <div className="taw-prop-blurb">{opt.blurb}</div> : null}
        {p ? (
          <div className="taw-prop-lines">
            {(p.lines || []).map((ln: any, i: number) => (
              <div key={i} className="taw-prop-line">
                <span>{ln.label || ln.type}</span>
                <span className="ta-num">{inr(ln.sell)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="taw-prop-blurb">Pricing pending.</div>
        )}
        {p ? (
          <div className="taw-prop-grand">
            <span className="lab">Total</span>
            <span className="val ta-num">{inr(p.grandTotal)}</span>
          </div>
        ) : null}
        <div className="taw-prop-opt-actions">
          {!opt.is_recommended ? (
            <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy} onClick={() => recommend(opt.id)}>
              <Icon name="check" size={12} />
              Recommend
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const detail = sel ? (
    <Card
      title={sel.proposal ? sel.proposal.title || "Proposal" : "Proposal"}
      icon={<Icon name="note" size={18} />}
      sub={sel.proposal ? String(sel.proposal.status || "draft") + (Number(sel.proposal.version) > 1 ? " · v" + sel.proposal.version : "") : ""}
      actions={
        <button
          className="taw-btn taw-btn--ghost taw-btn--sm"
          onClick={() => {
            setSel(null);
            setDownload(null);
          }}
        >
          Back to list
        </button>
      }
    >
      <div style={{ padding: 16 }}>
        {selLoading ? (
          <div className="taw-skel" style={{ height: 120 }} />
        ) : (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button className="taw-btn taw-btn--sm" disabled={busy} onClick={addOption}>
                <Icon name="plus" size={13} />
                Add option
              </button>
              {sel.options && sel.options.length ? (
                <button className="taw-btn taw-btn--primary taw-btn--sm" disabled={busy} onClick={sendProposal}>
                  <Icon name="send" size={13} />
                  Send proposal
                </button>
              ) : null}
              {sel.options && sel.options.length ? (
                <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy} onClick={generatePdf}>
                  <Icon name="note" size={13} />
                  Generate PDF
                </button>
              ) : null}
              {sel.proposal && sel.proposal.status === "sent" ? (
                <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy} onClick={versionProposal}>
                  <Icon name="refresh" size={13} />
                  New version
                </button>
              ) : null}
            </div>
            {download ? (
              <div className="taw-icrow" style={{ gap: 9, padding: "11px 14px", borderRadius: 12, background: "var(--success-bg)", color: "var(--success-ink)", fontSize: 13, marginBottom: 10, flexWrap: "wrap" }}>
                <Icon name="check" size={16} />
                <span>Proposal ready — </span>
                <a href={download} target="_blank" rel="noopener" style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
                  open / download
                </a>
                <span className="taw-muted" style={{ fontSize: 10.5 }}>
                  (link valid ~5 min)
                </span>
              </div>
            ) : null}

            {sel.options && sel.options.length ? (
              <div className="taw-prop-cols">{sel.options.map(optionColumn)}</div>
            ) : (
              <div className="taw-prop-empty">No options yet. Price one or more carts in the Workbench, then add each quote here as a named option (A/B/C) to compare side-by-side.</div>
            )}
          </div>
        )}
      </div>
    </Card>
  ) : null;

  return (
    <div className="taw-fade-in">
      {detail ? (
        detail
      ) : (
        <Card
          title="Proposals"
          icon={<Icon name="note" size={18} />}
          sub={list ? list.length + " total" : ""}
          actions={
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={loadList} disabled={loading} aria-label="Refresh proposals">
              {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
            </button>
          }
        >
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              <select className="taw-sel taw-sel--sm" value={pickMemberId} onChange={(e) => setPickMemberId(e.target.value)} aria-label="Member for new proposal">
                <option value="">Choose member…</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name + (m.tier ? " · " + m.tier : "")}
                  </option>
                ))}
              </select>
              <button className="taw-btn taw-btn--primary taw-btn--sm" disabled={busy || !pickMemberId} onClick={createProposal}>
                <Icon name="plus" size={13} />
                New proposal
              </button>
            </div>
            {err ? (
              <div className="taw-banner taw-banner--err">
                <Icon name="alert" size={16} />
                {err}
              </div>
            ) : null}
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="taw-skel" style={{ height: 56 }} />
                ))}
              </div>
            ) : list && list.length ? (
              <div className="taw-prop-list">
                {list.map((p: any) => {
                  const mem = props.membersById ? props.membersById[p.member_id] : null;
                  return (
                    <div key={p.id} className="taw-prop-row" onClick={() => openProposal(p.id)}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{p.title || "Proposal"}</div>
                        <div className="taw-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                          {(mem ? mem.name + " · " : "") + (p.status || "draft")}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {Number(p.version) > 1 ? <span className="taw-prop-vbadge">v{p.version}</span> : null}
                        <span className="taw-muted" style={{ fontSize: 10.5 }}>
                          {fmtDate(p.created_at)}
                        </span>
                        <Icon name="compass" size={14} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty icon={<Icon name="note" size={28} />}>No proposals yet. Pick a member above and create one, then add named quote options to compare and send.</Empty>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
