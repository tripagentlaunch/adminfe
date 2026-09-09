"use client";
/* =============================================================================
 * TripAgent — src/components/panels/QuoteBuilder.tsx
 * Ported from web/js/advisor.js: QuoteBuilder (line ~1698).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { shortId, productIcon, canSeeMargin, marginHealth, pct } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";

// `bare` (2026-09-04) — Proposal Composer mounts this inside its own
// .taw-acc accordion section (own header/chrome, same pattern
// QueueProfileAccordion.tsx uses for Member360 — which also has no Card
// of its own), so QuoteBuilder needs to render just its CONTENT there,
// not another nested "Quote Builder"-titled card inside that section.
// Every other/older call site (none currently reachable — see
// BACKEND-HANDOFF.md's dead-code note) keeps the original full-Card
// behavior by simply not passing this prop.
export function QuoteBuilder(props: any) {
  const cart = props.cart;
  const member = props.member;
  const bare = !!props.bare;

  // pricing/quoteId/loading/err (2026-09-08) — now CONTROLLED: Proposal
  // Composer owns the one real price() call (useQuotePricing) and passes
  // its result here, so this component's display and the PDF preview's
  // cost breakdown are always reading the exact same live quote rather
  // than two independent calls that could race or drift.
  const pricing = props.pricing;
  const quoteId = props.quoteId;
  const loading = !!props.loading;
  const err = props.err;
  const inclusive = !!props.inclusive;
  const onToggleInclusive = props.onToggleInclusive;
  const [sent, setSent] = useState(false);
  // localErr — UI-only validation message (missing member), distinct from
  // `err` (the real pricing-call failure passed down as a controlled prop).
  const [localErr, setLocalErr] = useState<any>(null);

  // A new quote (different cart/inclusive signature) should reopen the
  // "send" affordance rather than keep showing a stale "Sent" state.
  useEffect(() => {
    setSent(false);
    setLocalErr(null);
  }, [quoteId]);

  function createOrder() {
    if (!quoteId) return;
    props.onCreateOrder(quoteId, pricing);
  }

  // Hand the priced quote off to the member for approval. The quote is already
  // persisted with this member_id by price(), so it surfaces in their Quotes
  // tab to Approve & Pay — this makes the handoff explicit + confirmed.
  function sendToMember() {
    if (!quoteId) return;
    if (!member || !member.id) {
      setLocalErr("Select a member first — a quote must be addressed to someone to send it for approval.");
      return;
    }
    setSent(true);
  }

  if (!cart.length) {
    const empty = (
      <Empty icon={<Icon name="note" size={28} />}>
        Your live pricing breakdown — per-line sell price & GST, package + TCS, planning fee and grand total —
        appears here once the cart has items.
      </Empty>
    );
    if (bare) return empty;
    return (
      <Card title="Quote Builder" icon={<Icon name="note" size={18} />}>
        {empty}
      </Card>
    );
  }

  const content = (
    <>
      {/* Inclusive/discrete toggle — a real button with switch semantics for
          keyboard + screen-reader users; drives the controlled `inclusive` prop. */}
      <div style={{ padding: "10px 16px 0" }}>
        <button
          type="button"
          className={cx("taw-toggle", inclusive && "is-on")}
          role="switch"
          aria-checked={inclusive ? "true" : "false"}
          style={{ border: 0, background: "transparent" }}
          title="Bundle as an inclusive package (enables TCS on overseas packages)"
          onClick={() => onToggleInclusive && onToggleInclusive(!inclusive)}
        >
          <span className="taw-sw" />
          {inclusive ? "Priced as inclusive package" : "Priced as discrete components"}
        </button>
      </div>

      {err || localErr ? (
        <div style={{ padding: 16 }}>
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err || localErr}
          </div>
        </div>
      ) : null}

      {loading && !pricing ? (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="taw-skel" style={{ height: 64 }} />
          <div className="taw-skel" style={{ height: 64 }} />
          <div className="taw-skel" style={{ height: 120 }} />
        </div>
      ) : null}

      {pricing ? (
        <div className={cx(loading && "taw-muted")}>
          {/* flags */}
          <div className="taw-flags" style={{ margin: "12px 16px 0" }}>
            {pricing.package_flag ? (
              <span className="taw-flag taw-flag--pkg taw-icrow">
                <Icon name="luggage" size={12} />
                PACKAGE
              </span>
            ) : (
              <span className="taw-flag taw-flag--disc">DISCRETE</span>
            )}
            {pricing.tcs_applicable ? <span className="taw-flag taw-flag--tcs">TCS 2%</span> : null}
          </div>

          {/* per-line breakdown */}
          <div className="taw-quote-lines" style={{ marginTop: 12 }}>
            {(pricing.lines || []).map((ln: any, i: number) => (
              <div key={i} className="taw-ql">
                <div className="taw-ql-h">
                  <div className="taw-ql-label">
                    {productIcon(ln.type)} {ln.label || ln.type}
                  </div>
                  <div className="taw-ql-sell ta-num">{inr(ln.sell)}</div>
                </div>
                <div className="taw-ql-grid">
                  {canSeeMargin() ? (
                    <div className="taw-ql-cell">
                      <div className="k">Net cost</div>
                      <div className="v ta-num">{inr(ln.baseNet)}</div>
                    </div>
                  ) : null}
                  {canSeeMargin() ? (
                    <div className="taw-ql-cell">
                      <div className="k">Markup</div>
                      <div className="v ta-num" style={{ color: "var(--gold-ink)" }}>
                        +{inr(ln.markup)}
                      </div>
                    </div>
                  ) : null}
                  <div className="taw-ql-cell">
                    <div className="k">Sell price</div>
                    <div className="v ta-num">{inr(ln.sell)}</div>
                  </div>
                  <div className="taw-ql-cell">
                    <div className="k">GST</div>
                    <div className="v ta-num" style={{ color: "var(--warn)" }}>
                      {inr(ln.gst)}
                    </div>
                  </div>
                </div>
                {ln.note ? <div className="taw-ql-note">{ln.note}</div> : null}
              </div>
            ))}
          </div>

          {/* totals */}
          <div className="taw-totals">
            <div className="taw-tline">
              <span className="lab">Subtotal (sell)</span>
              <span className="val ta-num">{inr(pricing.subtotalSell)}</span>
            </div>
            <div className="taw-tline">
              <span className="lab taw-icrow">
                <Icon name="note" size={13} />
                Planning fee
              </span>
              <span className="val ta-num">{inr(pricing.planningFee)}</span>
            </div>
            <div className="taw-tline">
              <span className="lab">GST total</span>
              <span className="val ta-num">{inr(pricing.gstTotal)}</span>
            </div>
            {pricing.tcs > 0 ? (
              <div className="taw-tline is-tcs">
                <span className="lab">TCS @ 2% (overseas package)</span>
                <span className="val ta-num">{inr(pricing.tcs)}</span>
              </div>
            ) : null}
            <div className="taw-tline is-grand">
              <span className="lab">Grand total</span>
              <span className="val ta-num">{inr(pricing.grandTotal)}</span>
            </div>
          </div>

          {/* advisor net yield — HEAD-OF-BUSINESS ONLY (margin disclosure) */}
          {canSeeMargin() ? (
            <div className="taw-yield">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div className="lab">Net yield</div>
                  {(() => {
                    const mh = marginHealth(pricing.netYieldPct);
                    return (
                      <span
                        className={"taw-margin taw-margin--" + mh.cls}
                        title="Target margin band: 8%–28% of sell"
                      >
                        {mh.cls === "low" ? <Icon name="alert" size={11} /> : <Icon name="check" size={11} />}
                        {mh.txt}
                      </span>
                    );
                  })()}
                </div>
                <div className="pctv ta-num">
                  commission {inr(pricing.commission)} · {pct(pricing.netYieldPct)} of sell
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="net ta-num">{inr(pricing.netRevenue)}</div>
                <div className="pctv">net revenue</div>
              </div>
            </div>
          ) : null}

          {pricing.rationale ? (
            <div className="taw-rationale">
              <span className="taw-icrow" style={{ alignItems: "flex-start", gap: 8 }}>
                <Icon name="sliders" size={14} style={{ marginTop: 2 }} />
                <span>{pricing.rationale}</span>
              </span>
            </div>
          ) : null}

          {/* actions — send to the member for approval (primary) or complete now */}
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {sent ? (
              <div
                className="taw-icrow"
                style={{
                  gap: 9,
                  padding: "11px 14px",
                  borderRadius: 12,
                  background: "var(--success-bg)",
                  color: "var(--success-ink)",
                  fontSize: 13.5,
                }}
              >
                <Icon name="check" size={16} />
                <span>
                  Sent to <b>{member && member.name ? member.name.split(" ")[0] : "the member"}</b> — they can
                  Approve &amp; Pay in their concierge app.
                </span>
              </div>
            ) : (
              <button className="taw-btn taw-btn--primary taw-btn--block" disabled={!quoteId} onClick={sendToMember}>
                <Icon name="send" size={15} />
                Send to member for approval
              </button>
            )}
            <button
              className="taw-btn taw-btn--block"
              disabled={!quoteId || props.creating}
              onClick={createOrder}
            >
              {props.creating ? <Spinner /> : <Icon name="note" size={15} />}
              {props.creating ? "Creating order…" : "Create order now"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  if (bare) return content;
  return (
    <Card title="Quote Builder" icon={<Icon name="note" size={18} />} flush sub={quoteId ? "quote " + shortId(quoteId) : "live pricing"}>
      {content}
    </Card>
  );
}
