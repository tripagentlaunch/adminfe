"use client";
/* =============================================================================
 * TripAgent — src/components/panels/QuoteBuilder.tsx
 * Ported from web/js/advisor.js: QuoteBuilder (line ~1698).
 * ===========================================================================*/
import { useEffect, useMemo, useRef, useState } from "react";
import { price, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, shortId, productIcon, canSeeMargin, marginHealth, pct } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";

export function QuoteBuilder(props: any) {
  const cart = props.cart;
  const member = props.member;
  const advisorId = props.advisorId;

  const [pricing, setPricing] = useState<any>(null);
  const [quoteId, setQuoteId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [inclusive, setInclusive] = useState(true);
  const [sent, setSent] = useState(false);

  const reqRef = useRef(0);

  // Build a stable signature of the cart so we re-price when it changes.
  const sig = useMemo(
    () => cart.map((i: any) => i.type + ":" + i.baseNet + ":" + (i.international ? 1 : 0)).join("|") + "|incl:" + (inclusive ? 1 : 0),
    [cart, inclusive]
  );

  useEffect(() => {
    if (!cart.length) {
      setPricing(null);
      setQuoteId(null);
      setErr(null);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    setErr(null);
    setSent(false);
    const items = cart.map((it: any) => {
      const copy: any = {};
      for (const k in it) {
        if (k.charAt(0) !== "_") copy[k] = it[k];
      }
      return copy;
    });
    const payload: any = { cart: { items: items, inclusive: inclusive } };
    if (member && member.id) payload.member_id = member.id;
    if (advisorId) payload.advisor_id = advisorId;
    price(payload)
      .then((r: any) => {
        if (myReq !== reqRef.current) return; // stale
        setPricing(r.pricing || null);
        setQuoteId(r.quote_id || null);
        setLoading(false);
      })
      .catch((e: any) => {
        if (myReq !== reqRef.current) return;
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

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
      setErr("Select a member first — a quote must be addressed to someone to send it for approval.");
      return;
    }
    setSent(true);
  }

  if (!cart.length) {
    return (
      <Card title="Quote Builder" icon={<Icon name="note" size={18} />}>
        <Empty icon={<Icon name="note" size={28} />}>
          Your live pricing breakdown — per-line sell price & GST, package + TCS, planning fee and grand total —
          appears here once the cart has items.
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      title="Quote Builder"
      icon={<Icon name="note" size={18} />}
      flush
      sub={quoteId ? "quote " + shortId(quoteId) : "live pricing"}
    >
      {/* Inclusive/discrete toggle — a real button with switch semantics for
          keyboard + screen-reader users; drives the same setInclusive state. */}
      <div style={{ padding: "10px 16px 0" }}>
        <button
          type="button"
          className={cx("taw-toggle", inclusive && "is-on")}
          role="switch"
          aria-checked={inclusive ? "true" : "false"}
          style={{ border: 0, background: "transparent" }}
          title="Bundle as an inclusive package (enables TCS on overseas packages)"
          onClick={() => setInclusive(!inclusive)}
        >
          <span className="taw-sw" />
          {inclusive ? "Priced as inclusive package" : "Priced as discrete components"}
        </button>
      </div>

      {err ? (
        <div style={{ padding: 16 }}>
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
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
    </Card>
  );
}
