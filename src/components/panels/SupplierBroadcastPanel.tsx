"use client";
/* =============================================================================
 * TripAgent — src/components/panels/SupplierBroadcastPanel.tsx
 * Ported from web/js/rfq.js's View: compose -> approve/dispatch (HITL Gate 1)
 * -> collect -> parse+rank bids -> award (HITL Gate 2) -> awarded. Built from
 * existing shared primitives (Card/Empty/Icon/Spinner, taw-* classes) rather
 * than porting rfq.js's own bespoke CSS block — same convention AnalyticsPanel/
 * ApprovalsPanel/OrdersBoard already established.
 *
 * Deliberately NOT ported: the legacy "Add to workbench cart" action on the
 * awarded screen (used a global CustomEvent bus tied to the old vanilla
 * shell that doesn't exist in this app) — deferred per the scoping
 * discussion, not dropped silently.
 *
 * advisorId comes from a prop (this panel is a sibling top-level route under
 * AppShell, not nested inside WorkbenchShell) rather than an in-panel
 * advisor picker like the legacy View had.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { fetchAdvisors, rfqAward, rfqCompose, rfqDispatch, rfqGet, rfqParse, rfqRank, rfqSimulate, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, fmtTime, shortId, toast } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

const STAGES = ["compose", "approve", "collect", "bids", "awarded"];
const STAGE_LABEL: any = {
  compose: "Compose",
  approve: "Approve & broadcast",
  collect: "Collect bids",
  bids: "Rank & award",
  awarded: "Awarded",
};

const SPEC_PRESETS: any = {
  flight: { origin: "DEL", destination: "DXB", depart_date: "", pax: 2, cabin: "economy" },
  hotel: { destination: "Dubai", check_in: "", check_out: "", rooms: 1, guests: 2 },
  visa: { destination: "UAE", nationality: "IN", pax: 1 },
};

const BAD_FLAGS = ["UNPRICED", "LOW_CONFIDENCE", "LOW_RELIABILITY", "mismatch", "too-good-to-be-true"];
const WARN_FLAGS = ["NON_REFUNDABLE", "NON_INR_CURRENCY", "EXPIRED", "expired", "fx-assumed"];

function flagTone(flag: any) {
  if (BAD_FLAGS.includes(flag)) return "bad";
  if (WARN_FLAGS.includes(flag)) return "warn";
  return "";
}
function prettyFlag(flag: any) {
  return String(flag).replace(/_/g, " ").toLowerCase();
}

function channelIcon(ch: any) {
  switch (String(ch || "").toLowerCase()) {
    case "whatsapp":
    case "sms":
      return "chat";
    case "email":
      return "mail";
    case "portal":
      return "home";
    case "api":
      return "sliders";
    default:
      return "inbox";
  }
}

const DRAFT_META_KEYS = new Set(["source", "spec_used"]);

function DraftPreview({ draft }: any) {
  const d = draft || {};
  const keys = Object.keys(d).filter((k) => !DRAFT_META_KEYS.has(k));
  const [tab, setTab] = useState(keys[0] || null);
  const activeKey = keys.includes(tab as any) ? tab : keys[0];
  const active: any = activeKey ? d[activeKey] : {};

  if (!keys.length) {
    return <Empty icon={<Icon name="inbox" size={26} />}>No draft channels were produced.</Empty>;
  }

  return (
    <div className="rfq-draft">
      <div className="rfq-draft-tabs" role="tablist">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            className={cx("rfq-draft-tab", k === activeKey && "is-active")}
            onClick={() => setTab(k)}
          >
            <Icon name={channelIcon(k)} size={13} />
            {k}
          </button>
        ))}
      </div>
      <div className="rfq-draft-body">
        {active.subject ? (
          <div className="rfq-draft-subject">
            <span>Subject:</span> {active.subject}
          </div>
        ) : null}
        {active.html ? (
          <div className="rfq-draft-pre" dangerouslySetInnerHTML={{ __html: active.html }} />
        ) : (
          <pre className="rfq-draft-pre">{active.body || "(empty)"}</pre>
        )}
      </div>
    </div>
  );
}

function SupplierPanelList({ panel }: any) {
  const list = panel || [];
  if (!list.length) {
    return <Empty icon={<Icon name="compass" size={26} />}>No suppliers were matched for this product.</Empty>;
  }
  return (
    <div className="rfq-panel-list">
      {list.map((sup: any, i: number) => (
        <div className="rfq-sup" key={sup.supplier_id || i}>
          <div className="rfq-sup-rank">{i + 1}</div>
          <div className="rfq-sup-grow">
            <div className="rfq-sup-name">{sup.name || sup.code || shortId(sup.supplier_id)}</div>
            <div className="rfq-sup-meta">
              <span className="taw-qbadge">
                <Icon name={channelIcon(sup.channel)} size={12} /> {sup.channel || "—"}
              </span>
              {(sup.reasons || []).slice(0, 2).map((r: any, ri: number) => (
                <span className="taw-qbadge" key={ri}>
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div className="rfq-sup-score">
            <div className="v">{sup.score != null ? Number(sup.score).toFixed(3) : "—"}</div>
            <div className="l">Fit score</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stepper({ stage }: any) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="rfq-stepper" role="list" aria-label="RFQ progress">
      {STAGES.map((s, i) => (
        <span key={s} className={cx("rfq-step", i === idx && "is-active", i < idx && "is-done")} role="listitem">
          <span className="rfq-step-num">
            {i < idx ? <Icon name="check" size={11} /> : i + 1}
          </span>
          {STAGE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

function BidCard({ bid, raw, isRecommended, awardedId, awarding, onAward, style }: any) {
  const isAwarded = awardedId === bid.quote_id;
  const isLosing = !!awardedId && !isAwarded;
  return (
    <div className={cx("rfq-bid", isRecommended && "is-recommended", isAwarded && "is-awarded", isLosing && "is-losing")} style={style}>
      <div className="rfq-bid-h">
        <div>
          <div className="rfq-bid-name">{bid.supplier_name || "Supplier " + shortId(bid.supplier_id)}</div>
          {isRecommended ? <span className="taw-qbadge">AI pick</span> : null}
        </div>
        <div className="rfq-bid-price">{bid.net_inr != null ? inr(bid.net_inr) : "—"}</div>
      </div>
      <div className="taw-muted" style={{ fontSize: "12px", margin: "6px 0" }}>
        Value score {Math.round((bid.value_score || 0) * 100)} · Rank #{bid.rank}
      </div>
      {(bid.flags || []).length ? (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          {bid.flags.map((f: any) => (
            <span key={f} className={cx("taw-qbadge", flagTone(f) && "tone-" + flagTone(f))}>
              {prettyFlag(f)}
            </span>
          ))}
        </div>
      ) : null}
      {raw && raw.raw_text ? (
        <p className="taw-muted" style={{ fontSize: "12.5px" }}>
          {raw.raw_text.slice(0, 220)}
        </p>
      ) : null}
      {isAwarded ? (
        <div className="taw-banner taw-banner--info">Awarded</div>
      ) : (
        <button className="taw-btn taw-btn--primary" disabled={!!awardedId || awarding} onClick={() => onAward(bid)}>
          {awarding ? <Spinner /> : <Icon name="handshake" size={14} />}
          {awarding ? "Awarding…" : "Award this bid"}
        </button>
      )}
    </div>
  );
}

export function SupplierBroadcastPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;

  const [product, setProduct] = useState("flight");
  const [specText, setSpecText] = useState(JSON.stringify(SPEC_PRESETS.flight, null, 2));
  const [stage, setStage] = useState("compose");
  const [rfq, setRfq] = useState<any>(null);
  const [quotes, setQuotes] = useState<any>([]);
  const [rank, setRank] = useState<any>(null);
  const [award, setAward] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [awarding, setAwarding] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [dispatchFailures, setDispatchFailures] = useState<any>([]);
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<any>(advisorId);

  // Advisor picker (2026-09-30, direct spec — match legacy "Approving
  // advisor (HITL signer)" dropdown). GET /admin/advisors is admin-role-
  // gated server-side; a non-admin advisor gets an empty list here and
  // the picker silently shows none — the compose flow still works using
  // the prop advisorId as the signer either way.
  useEffect(() => {
    fetchAdvisors()
      .then((rows: any) => setAdvisors(Array.isArray(rows) ? rows : []))
      .catch(() => setAdvisors([]));
  }, []);

  const rfqId = rfq ? rfq.rfq_id || rfq.id : null;

  function fail(prefix: any, e: any) {
    toast((prefix ? prefix + ": " : "") + errText(e), "error");
    setBusy(false);
    setBusyMsg("");
    setAwarding(null);
  }

  function onProductChange(next: any) {
    setProduct(next);
    setSpecText(JSON.stringify(SPEC_PRESETS[next] || {}, null, 2));
  }

  const onCompose = useCallback(() => {
    setErr(null);
    let spec;
    try {
      spec = specText && specText.trim() ? JSON.parse(specText) : {};
    } catch (e) {
      setErr("Spec is not valid JSON: " + errText(e));
      return;
    }
    setBusy(true);
    setBusyMsg("Composing");
    setQuotes([]);
    setRank(null);
    setAward(null);
    rfqCompose(product, spec, selectedAdvisorId ? { advisor_id: selectedAdvisorId } : undefined)
      .then((res: any) => {
        setRfq(res);
        setStage("approve");
        setBusy(false);
        setBusyMsg("");
      })
      .catch((e: any) => fail("Compose failed", e));
  }, [product, specText, selectedAdvisorId]);

  const onApprove = useCallback(() => {
    setErr(null);
    if (!rfqId) return;
    setBusy(true);
    setBusyMsg("Broadcasting");
    rfqDispatch(rfqId, advisorId)
      .then((res: any) => {
        setDispatchFailures((res && res.failures) || []);
        setStage("collect");
        setBusy(false);
        setBusyMsg("");
      })
      .catch((e: any) => fail("Dispatch failed", e));
  }, [rfqId, advisorId]);

  const readQuotes = useCallback(() => {
    if (!rfqId) return Promise.resolve([]);
    return rfqGet(rfqId).then((res: any) => {
      const arr = (res && res.quotes) || [];
      setQuotes(arr);
      return arr;
    });
  }, [rfqId]);

  const onCollect = useCallback(() => {
    setErr(null);
    if (!rfqId) return;
    setBusy(true);
    setBusyMsg("Collecting supplier replies");
    readQuotes()
      .then(() => {
        setBusy(false);
        setBusyMsg("");
      })
      .catch((e: any) => fail("Collect failed", e));
  }, [rfqId, readQuotes]);

  // Dev-only: fabricates supplier replies via the real FastAPI endpoint
  // (POST /rfq/{rfq_id}/simulate, gated server-side by RFQ_SIMULATE_ENABLED,
  // deterministic-only — no AI-authored replies). Test scaffolding, not a
  // production path. Real replies arrive via n8n -> POST /rfq/inbound once
  // that relay is built; this button exists so the flow is testable before
  // then.
  const onSimulate = useCallback(() => {
    setErr(null);
    if (!rfqId) return;
    setBusy(true);
    setBusyMsg("Simulating supplier replies");
    rfqSimulate(rfqId)
      .then(() => readQuotes())
      .then(() => {
        setBusy(false);
        setBusyMsg("");
      })
      .catch((e: any) => fail("Simulate failed", e));
  }, [rfqId, readQuotes]);

  const onRank = useCallback(() => {
    setErr(null);
    if (!rfqId) return;
    setBusy(true);
    setBusyMsg("Parsing & ranking bids");
    rfqParse(rfqId)
      .catch(() => null) // parse is best-effort, same as the legacy flow
      .then(() => rfqRank(rfqId))
      .then((res: any) => {
        setRank(res);
        return readQuotes(); // refresh raw rows now that they're parsed
      })
      .then(() => {
        setStage("bids");
        setBusy(false);
        setBusyMsg("");
      })
      .catch((e: any) => fail("Ranking failed", e));
  }, [rfqId, readQuotes]);

  const onAward = useCallback(
    (bid: any) => {
      setErr(null);
      if (!rfqId || !bid || !bid.quote_id) return;
      setAwarding(bid.quote_id);
      rfqAward(rfqId, bid.quote_id, advisorId)
        .then((res: any) => {
          setAward(res);
          setStage("awarded");
          setAwarding(null);
          toast("Bid awarded", "success");
        })
        .catch((e: any) => fail("Award failed", e));
    },
    [rfqId, advisorId]
  );

  function onReset() {
    setRfq(null);
    setQuotes([]);
    setRank(null);
    setAward(null);
    setStage("compose");
    setErr(null);
    setBusy(false);
    setBusyMsg("");
  }

  const rawById: any = {};
  quotes.forEach((q: any) => {
    rawById[q.id] = q;
  });
  const rankedList = rank && Array.isArray(rank.ranked) ? rank.ranked : [];
  const recommendation = rank && rank.recommendation ? rank.recommendation : null;
  const recQuoteId = recommendation ? recommendation.quote_id : null;
  const awardedQuoteId = award ? award.quote_id : null;

  return (
    <div className="rfq-panel">
      <div className="rfq-panel-head">
        <div>
          <h2>Supplier Broadcast &amp; Bidding</h2>
          <p className="taw-muted">
            Compose an RFQ, broadcast it to the supplier panel, collect bids, and award the winner — with a
            human sign-off at both governance gates.
          </p>
        </div>
        {rfqId ? (
          <div style={{ textAlign: "right" }}>
            <span className="taw-qbadge">RFQ {shortId(rfqId)}</span>
            {stage !== "compose" ? (
              <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={onReset} style={{ display: "block", marginTop: "8px" }}>
                <Icon name="refresh" size={13} /> New RFQ
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Stepper stage={stage} />

      {err ? (
        <div className="taw-banner taw-banner--err" role="alert">
          <Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>{err}</span>
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setErr(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {dispatchFailures.length ? (
        <div className="taw-banner taw-banner--err" role="alert">
          <Icon name="alert" size={15} />
          <div style={{ flex: 1 }}>
            <div>{dispatchFailures.length} supplier(s) could not be notified:</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
              {dispatchFailures.map((f: any) => (
                <li key={f.supplier_id}>
                  {f.supplier_name || f.supplier_id}: {f.error}
                </li>
              ))}
            </ul>
          </div>
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setDispatchFailures([])}>
            Dismiss
          </button>
        </div>
      ) : null}

      {stage === "compose" ? (
        <Card title="Compose the RFQ" icon={<Icon name="note" size={17} />} sub="Pick a product and describe the requirement.">
          <div className="taw-field">
            <label>Product</label>
            <div className="rfq-product-picker">
              {(["flight", "hotel", "visa"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cx("rfq-product-opt", product === p && "is-active")}
                  onClick={() => onProductChange(p)}
                >
                  <Icon name={p} size={22} />
                  <span>{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rfq-compose-grid">
            <div className="taw-field">
              <label htmlFor="rfq-spec">Requirement spec (JSON)</label>
              <textarea
                id="rfq-spec"
                className="taw-input"
                rows={9}
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "12.5px" }}
              />
            </div>
            <div className="rfq-compose-side">
              <div className="taw-field">
                <label htmlFor="rfq-advisor">Approving advisor (HITL signer)</label>
                <select
                  id="rfq-advisor"
                  className="taw-select"
                  value={selectedAdvisorId || ""}
                  onChange={(e) => setSelectedAdvisorId(e.target.value || null)}
                >
                  <option value="">— select advisor —</option>
                  {advisors.map((a: any) => (
                    <option value={a.id} key={a.id}>
                      {a.name || a.email || shortId(a.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="taw-muted" style={{ fontSize: "12.5px", lineHeight: 1.6, marginTop: "16px" }}>
                The spec is the only thing suppliers see — customer identity and budget are stripped
                server-side before any draft is written.
              </div>
            </div>
          </div>
          <button className="taw-btn taw-btn--primary" style={{ marginTop: "14px" }} disabled={busy} onClick={onCompose}>
            {busy ? <Spinner /> : <Icon name="sparkle" size={14} />}
            {busy ? busyMsg || "Composing…" : "Compose RFQ with AI"}
          </button>
        </Card>
      ) : null}

      {rfq && stage === "approve" ? (
        <>
          <div className="rfq-gate">
            <span className="rfq-gate-pulse" />
            <span className="taw-qbadge">
              <Icon name="shield" size={12} /> Human Approval Required · Gate 1
            </span>
            <h4>Approve this AI draft before it reaches suppliers</h4>
            <p>
              Nothing has been sent yet. Review the drafted message and the supplier panel below. On approval the
              RFQ is broadcast to {(rfq.panel || []).length} supplier(s). This action is logged against the
              approving advisor.
            </p>
            <div className="rfq-gate-actions">
              <button className="taw-btn taw-btn--primary" disabled={busy} onClick={onApprove}>
                {busy ? <Spinner /> : <Icon name="check" size={14} />}
                {busy ? busyMsg || "Broadcasting…" : "Approve & broadcast"}
              </button>
              <button className="taw-btn taw-btn--ghost" disabled={busy} onClick={onReset}>
                Discard
              </button>
              {selectedAdvisorId ? (
                <span className="taw-muted" style={{ fontSize: "11.5px" }}>
                  Signing as{" "}
                  {(advisors.find((a: any) => a.id === selectedAdvisorId) || {}).name || shortId(selectedAdvisorId)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rfq-grid2">
            <Card title="AI-drafted RFQ message" icon={<Icon name="sparkle" size={16} />} sub="One variant per dispatch channel.">
              <DraftPreview draft={rfq.draft_message} />
            </Card>
            <Card
              title="Supplier panel"
              icon={<Icon name="compass" size={16} />}
              sub={(rfq.panel || []).length + " suppliers"}
            >
              <SupplierPanelList panel={rfq.panel} />
            </Card>
          </div>
        </>
      ) : null}

      {rfq && stage === "collect" ? (
        <Card title="Collecting bids" sub={quotes.length + " in"}>
          {quotes.length ? (
            <div className="rfq-inbox">
              {quotes.map((q: any) => (
                <div className="rfq-inrow" key={q.id}>
                  <div>
                    {(q.parsed && q.parsed.supplier_name) || "Supplier " + shortId(q.supplier_id)}
                    {q.net_inr != null ? (
                      <span className="taw-qbadge" style={{ marginLeft: "8px" }}>
                        {inr(q.net_inr)}
                      </span>
                    ) : null}
                    {q.created_at ? (
                      <span className="taw-muted" style={{ marginLeft: "8px", fontSize: "12px" }}>
                        {fmtTime(q.created_at)}
                      </span>
                    ) : null}
                  </div>
                  <p className="taw-muted" style={{ fontSize: "12.5px" }}>
                    {(q.raw_text || "(awaiting parse)").slice(0, 240)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Icon name="inbox" size={26} />}>No bids collected yet — pull them in below.</Empty>
          )}
          <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            <button className="taw-btn taw-btn--ghost" disabled={busy} onClick={onCollect}>
              {busy ? <Spinner /> : <Icon name="refresh" size={14} />}
              {busy ? busyMsg || "Collecting…" : "Pull replies"}
            </button>
            <button className="taw-btn taw-btn--ghost" disabled={busy} onClick={onSimulate} title="Dev/demo only — fabricates test replies">
              Simulate replies (dev)
            </button>
            {quotes.length ? (
              <button className="taw-btn taw-btn--accent" disabled={busy} onClick={onRank}>
                Parse &amp; rank {quotes.length} bids <Icon name="arrowUR" size={14} />
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {rfq && (stage === "bids" || stage === "awarded") ? (
        <Card
          title="Live bids board"
          sub={stage === "awarded" ? "Closed · awarded" : "bidding open"}
          actions={
            stage !== "awarded" ? (
              <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy} onClick={onRank}>
                <Icon name="refresh" size={13} /> Re-rank
              </button>
            ) : null
          }
        >
          {recommendation ? (
            <div className="taw-banner taw-banner--info">
              <Icon name="sparkle" size={15} />
              <span>
                {recommendation.best_supplier ? <b>{recommendation.best_supplier}</b> : null} {recommendation.rationale}
              </span>
            </div>
          ) : null}
          {stage === "bids" ? (
            <div className="taw-banner taw-banner--info">
              Human Award Required · Gate 2 — pick the winning bid below. Nothing moves without you.
            </div>
          ) : null}
          {rankedList.length ? (
            <div className="rfq-board taw-stagger">
              {rankedList.map((bid: any, i: number) => (
                <BidCard
                  key={bid.quote_id}
                  bid={bid}
                  raw={rawById[bid.quote_id]}
                  isRecommended={recQuoteId === bid.quote_id}
                  awardedId={awardedQuoteId}
                  awarding={awarding === bid.quote_id}
                  onAward={onAward}
                  style={{ "--i": i }}
                />
              ))}
            </div>
          ) : (
            <Empty icon={<Icon name="trend" size={26} />}>No ranked bids to show. Try re-ranking.</Empty>
          )}
        </Card>
      ) : null}

      {stage === "awarded" && award ? (
        <Card title="Bid awarded">
          <p>
            {(award.supplier && (award.supplier.name || award.supplier.code)) || "Winning supplier"} — the winning
            quote is now a downstream offer, ready to flow into pricing &amp; order creation. Losing bids were
            rejected and supplier scorecards updated.
          </p>
          <button className="taw-btn taw-btn--ghost" onClick={onReset}>
            <Icon name="refresh" size={14} /> Start a new RFQ
          </button>
        </Card>
      ) : null}
    </div>
  );
}
