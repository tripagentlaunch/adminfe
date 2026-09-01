"use client";
/* =============================================================================
 * TripAgent — src/components/panels/TrendingDealsPanel.tsx
 * Ported from web/js/pulse.js's AdvisorView: signals grid -> compose a deal
 * from a signal -> HITL review queue -> approve/reject. Built from existing
 * shared primitives (Card/Empty/Icon/Spinner, taw-* classes) rather than
 * porting pulse.js's own bespoke CSS block — same convention
 * SupplierBroadcastPanel.jsx already established.
 *
 * Two bugs fixed relative to the legacy UI, not reproduced:
 *   - the compose form captured inclusions/advisor-note but never sent them
 *     to pulse-compose; both are now wired into the payload.
 *   - the "needs review" queue used to be a raw PostgREST table read
 *     (no FastAPI equivalent existed); pulseNeedsReview() now calls the new
 *     GET /pulse/needs-review endpoint instead.
 *
 * Safety flags: deal_terms.safety_flags (computed server-side, advisory-only
 * heuristics — see pulse_service.py's module docstring) render as visible
 * chips on each draft card, between the price/inclusions line and the
 * Approve/Send-back buttons — the same tone-coded chip treatment
 * SupplierBroadcastPanel.jsx's BidCard already uses for RFQ quote flags.
 *
 * advisorId comes from a prop (this panel is a sibling top-level route under
 * AppShell, not nested inside WorkbenchShell), same as SupplierBroadcastPanel.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { pulseApprove, pulseCompose, pulseNeedsReview, pulseTrending, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, shortId, toast } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner, SkeletonCards, SkeletonRows } from "../ui";

const BAD_FLAGS = ["ungrounded_price", "tax_legal_claim"];
const WARN_FLAGS = ["tone_guard"];

function flagTone(code: any) {
  if (BAD_FLAGS.includes(code)) return "bad";
  if (WARN_FLAGS.includes(code)) return "warn";
  return "";
}
function prettyFlag(code: any) {
  return String(code).replace(/_/g, " ").toLowerCase();
}

function SignalCard({ signal, isSelected, onCompose, style }: any) {
  return (
    <div className={cx("taw-card")} style={{ padding: "16px", ...style }}>
      {signal.category ? <div className="taw-muted" style={{ fontSize: "11px", textTransform: "uppercase" }}>{signal.category}</div> : null}
      <h4 style={{ margin: "4px 0" }}>{signal.title}</h4>
      {signal.destination_city || signal.destination_country ? (
        <p className="taw-muted" style={{ fontSize: "12.5px" }}>
          <Icon name="compass" size={13} /> {[signal.destination_city, signal.destination_country].filter(Boolean).join(", ")}
        </p>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0" }}>
        <span className="taw-qbadge">Hotness {Math.round(signal.hotness || 0)}</span>
      </div>
      <button className={cx("taw-btn", isSelected ? "taw-btn--primary" : "taw-btn--ghost", "taw-btn--sm")} onClick={() => onCompose(signal)}>
        {isSelected ? "Selected" : "Compose deal"}
      </button>
    </div>
  );
}

function DraftCard({ draft, acting, onDecide, style }: any) {
  const terms = draft.deal_terms || {};
  const flags = terms.safety_flags || [];
  const inclusions = terms.inclusions || [];
  return (
    <div className="rfq-bid" style={style}>
      <div className="rfq-bid-h">
        <div>
          <div className="rfq-bid-name">{draft.entity_name}</div>
          <div className="taw-muted" style={{ fontSize: "12px" }}>
            {[draft.entity_city, draft.entity_country].filter(Boolean).join(", ")}
          </div>
        </div>
        {draft.price_from != null ? <div className="rfq-bid-price">{inr(draft.price_from)}</div> : null}
      </div>
      <p style={{ fontSize: "13px", margin: "8px 0" }}>{draft.headline}</p>
      <p className="taw-muted" style={{ fontSize: "12.5px" }}>{draft.body}</p>
      {inclusions.length ? (
        <p className="taw-muted" style={{ fontSize: "12px" }}>Incl: {inclusions.join(", ")}</p>
      ) : null}

      {/* Safety flags — visible between price/inclusions and the decision
          buttons, so the approving advisor sees them before deciding. */}
      {flags.length ? (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "10px 0" }}>
          {flags.map((f: any) => (
            <span key={f.code} className={cx("taw-qbadge", flagTone(f.code) && "tone-" + flagTone(f.code))} title={f.detail || ""}>
              {prettyFlag(f.code)}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <button className="taw-btn taw-btn--primary taw-btn--sm" disabled={acting} onClick={() => onDecide(draft, "approve")}>
          {acting ? <Spinner /> : <Icon name="check" size={13} />} Approve
        </button>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={acting} onClick={() => onDecide(draft, "reject")}>
          Send back
        </button>
      </div>
    </div>
  );
}

// advisorId isn't read here — unlike rfqCompose/rfqAward, pulseCompose/
// pulseApprove take no advisor_id at all; the backend derives the acting
// advisor purely from the JWT. AppShell still passes advisorId for
// consistency with the other panels; it's simply unused here.
export function TrendingDealsPanel(props: any) {
  void props;
  const [signals, setSignals] = useState<any>([]);
  const [drafts, setDrafts] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);

  const [selected, setSelected] = useState<any>(null);
  const [entityName, setEntityName] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [wasPrice, setWasPrice] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [advisorNote, setAdvisorNote] = useState("");

  const [composing, setComposing] = useState(false);
  const [acting, setActing] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    Promise.all([pulseTrending({ limit: 12 }), pulseNeedsReview(50)])
      .then(([trendingRes, draftRows]: any) => {
        const flat = (trendingRes && trendingRes.trending) || [];
        setSignals(flat.map((t: any) => t.signal));
        setDrafts(Array.isArray(draftRows) ? draftRows : []);
      })
      .catch((e: any) => setErr("Could not load the pulse: " + errText(e)))
      .then(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function selectSignal(signal: any) {
    setSelected(signal);
    setEntityName(signal.destination_city || signal.title || "");
    setPriceFrom("");
    setWasPrice("");
    setInclusions("");
    setAdvisorNote("");
  }

  function submitCompose() {
    if (!selected) {
      toast("Pick a trending signal to compose from.", "error");
      return;
    }
    setComposing(true);
    const payload = {
      signal_id: selected.id,
      service: selected.service || "hotel",
      entity_name: (entityName || selected.title || "").trim(),
      entity_city: selected.destination_city || undefined,
      entity_country: selected.destination_country || undefined,
      price_from: priceFrom ? Number(priceFrom) : undefined,
      was_price: wasPrice ? Number(wasPrice) : undefined,
      inclusions: inclusions ? inclusions.split(",").map((s) => s.trim()).filter(Boolean) : [],
      advisor_note: advisorNote || undefined,
    };
    pulseCompose(payload)
      .then((res: any) => {
        toast("Deal drafted for review" + (res && res.id ? " (" + shortId(res.id) + ")" : "") + ".", "success");
        setSelected(null);
        load();
      })
      .catch((e: any) => toast("Compose failed: " + errText(e), "error"))
      .then(() => setComposing(false));
  }

  function onDecide(draft: any, decision: any) {
    setActing(draft.id);
    pulseApprove(draft.id, decision)
      .then(() => {
        toast(decision === "approve" ? "Deal approved" : "Draft sent back", "success");
        setDrafts((cur: any) => cur.filter((d: any) => d.id !== draft.id));
        load();
      })
      .catch((e: any) => toast("Decision failed: " + errText(e), "error"))
      .then(() => setActing(null));
  }

  return (
    <div className="rfq-panel">
      <div className="rfq-panel-head">
        <div>
          <h2>Trending Now &amp; Great Deals</h2>
          <p className="taw-muted">
            Read live member interest, compose a Great Deal from any surging signal, and approve drafts
            before they reach members. Every deal passes a human gate.
          </p>
        </div>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading}>
          <Icon name="refresh" size={13} /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <div className="taw-banner taw-banner--err" role="alert">
          <Icon name="alert" size={15} />
          <span style={{ flex: 1 }}>{err}</span>
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setErr(null)}>Dismiss</button>
        </div>
      ) : null}

      <Card title="Live signals" sub="What members are leaning into">
        {loading && !signals.length ? (
          <SkeletonCards count={3} />
        ) : signals.length ? (
          <div className="rfq-board taw-stagger">
            {signals.map((s: any, i: number) => (
              <SignalCard key={s.id} signal={s} isSelected={selected && selected.id === s.id} onCompose={selectSignal} style={{ "--i": i }} />
            ))}
          </div>
        ) : (
          <Empty icon={<Icon name="radar" size={26} />}>No live signals — the pulse is quiet right now.</Empty>
        )}
      </Card>

      <div className="taw-grid taw-cols-2">
        <Card title="Compose a deal">
          {selected ? (
            <>
              <p className="taw-muted" style={{ fontSize: "12.5px" }}>
                From signal: {selected.title}
                {selected.destination_city ? " · " + selected.destination_city : ""}
              </p>
              <div className="taw-field">
                <label>Property / airline name</label>
                <input className="taw-input" value={entityName} onChange={(e) => setEntityName(e.target.value)} placeholder="e.g. Atlantis The Palm" />
              </div>
              <div className="taw-row taw-row-2" style={{ marginTop: "10px" }}>
                <div className="taw-field">
                  <label>Now price (₹)</label>
                  <input className="taw-input" type="number" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} placeholder="184000" />
                </div>
                <div className="taw-field">
                  <label>Was price (₹)</label>
                  <input className="taw-input" type="number" value={wasPrice} onChange={(e) => setWasPrice(e.target.value)} placeholder="232000" />
                </div>
              </div>
              <div className="taw-field" style={{ marginTop: "10px" }}>
                <label>Inclusions (comma separated)</label>
                <input className="taw-input" value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder="Daily breakfast, Private transfers" />
              </div>
              <div className="taw-field" style={{ marginTop: "10px" }}>
                <label>Advisor note (optional)</label>
                <textarea className="taw-input" rows={3} value={advisorNote} onChange={(e) => setAdvisorNote(e.target.value)} placeholder="Positioning, supplier, anything the AI should weave in…" />
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button className="taw-btn taw-btn--primary" disabled={composing} onClick={submitCompose}>
                  {composing ? <Spinner /> : <Icon name="sparkle" size={14} />} {composing ? "Drafting…" : "Draft deal for review"}
                </button>
                <button className="taw-btn taw-btn--ghost" onClick={() => setSelected(null)}>Clear</button>
              </div>
            </>
          ) : (
            <Empty icon={<Icon name="note" size={26} />}>Choose a trending signal above to begin.</Empty>
          )}
        </Card>

        <Card title="Deals needing review" sub={drafts.length ? drafts.length + " pending" : null}>
          {loading && !drafts.length ? (
            <SkeletonRows count={3} height={64} />
          ) : drafts.length ? (
            <div className="taw-stagger" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {drafts.map((d: any, i: number) => (
                <DraftCard key={d.id} draft={d} acting={acting === d.id} onDecide={onDecide} style={{ "--i": i }} />
              ))}
            </div>
          ) : (
            <Empty icon={<Icon name="inbox-check" size={26} />}>All clear — no drafts awaiting your review.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
