"use client";
/* =============================================================================
 * TripAgent — src/components/panels/OrdersBoard.tsx
 * Ported from web/js/advisor.js: OrdersBoard (line ~2002) + its dedicated
 * change-preview sub-component, OrderChangePreview (line ~1866, colocated
 * here — it's only ever rendered by OrdersBoard in the original module too).
 *
 * STUBBED DEPENDENCY (checked again at Phase 4g, still accurate): the
 * original lazy-loads js/servicing.js (window.TA_SERVICING) via
 * useServicingModule()/loadServicing() and mounts its ServicingPanel for
 * post-sale case work. ServicingPanel/SimulateModal/ApprovalBadge all live in
 * that file (web/js/advisor.js line ~150-151) — NOT in advisor.js itself, so
 * none of the Phase 4a-4g panel conversions (all sourced from advisor.js)
 * ever touched it. Porting js/servicing.js is a separate, unscoped body of
 * work; useServicingModule() below stays a stub that always reports the
 * module as unavailable — OrdersBoard still renders in full; only the
 * "Post-sale servicing" section shows the labeled placeholder banner.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { orders as fetchOrders, dbOne, db, runSaga as apiRunSaga, flightIrrops, hotelServicingRead, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime, productIcon, canSeeMargin, pct } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, SkeletonRows, Icon } from "../ui";

// STUBBED — see file header. Mirrors the { mod, err } shape of the original
// useServicingModule() hook so the render branch below needs no changes.
function useServicingModule() {
  return { mod: null, err: "ServicingPanel — requires porting web/js/servicing.js (not yet scoped)" };
}

// OrderChangePreview — Wave-1 post-ticket / post-booking CHANGE PREVIEW on a
// selected order. READ/QUOTE-ONLY: it calls the DEDICATED preview functions
// (flight-irrops for flights, hotel-servicing-read for hotels) and renders the
// SELL-side impact (change fee + fare diff, void window, refund quote, hotel
// cancel/amend penalty + refund lifecycle). It NEVER posts a ledger, charges,
// refunds or reissues — the authoritative money execution stays in the
// ServicingPanel (servicing-case) / booking-saga above. So this panel is the
// "what would it cost?" lens the advisor reads BEFORE raising a real case.
function OrderChangePreview(props: any) {
  const order = props.order || {};
  const legs = props.legs || [];
  const advisorId = props.advisorId || null;
  const hasFlight = legs.some((l: any) => l.product === "flight");
  const hasHotel = legs.some((l: any) => l.product === "hotel");
  const [act, setAct] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<any>(null);

  function runFlight(action: any) {
    setAct("flight:" + action);
    setLoading(true);
    setErr(null);
    setData(null);
    const body: any = { action: action, order_id: order.id };
    if (advisorId) body.advisor_id = advisorId;
    flightIrrops(body)
      .then((r: any) => {
        setData({ kind: action, r: r || {} });
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }
  function runHotel(action: any) {
    setAct("hotel:" + action);
    setLoading(true);
    setErr(null);
    setData(null);
    const body: any = { action: action, order_id: order.id };
    const leg = legs.filter((l: any) => l.product === "hotel")[0];
    if (leg) body.order_leg_id = leg.id;
    if (advisorId) body.advisor_id = advisorId;
    hotelServicingRead(body)
      .then((r: any) => {
        setData({ kind: "hotel_" + action, r: r || {} });
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }

  function money(v: any) {
    return inr(Number(v) || 0);
  }
  function kvRule(k: any, v: any) {
    return (
      <div className="taw-dx-rule">
        <div className="k">{k}</div>
        <div className="v ta-num">{v}</div>
      </div>
    );
  }

  function result() {
    if (loading) {
      return (
        <div className="taw-dx-body">
          <SkeletonRows count={3} height={14} />
        </div>
      );
    }
    if (err) {
      return (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={14} />
          {err}
        </div>
      );
    }
    if (!data) return null;
    const r = data.r || {};
    const kind = data.kind || "";
    const rows: any[] = [];
    let opts: any[] = [];
    let note: any = null;

    // ----- flight-irrops shapes (each nested under its action key) -----------
    if (kind === "classify") {
      const c = r.classification || {};
      rows.push(kvRule("Severity", String(c.severity || "—")));
      rows.push(kvRule("Kind", String(c.kind || "—")));
      rows.push(kvRule("Recommended track", String(c.recommended_track || "—").replace(/_/g, " ")));
      rows.push(kvRule("Customer action", c.requires_customer_action ? "Required" : "Not required"));
      note = c.rationale || r.flag;
    } else if (kind === "exchange_quote") {
      const ex = r.exchange_quote || {};
      rows.push(kvRule("Change fee", money(ex.change_fee_inr)));
      rows.push(kvRule("Fare difference", money(ex.fare_difference_inr)));
      rows.push(kvRule("Add-collect", money(ex.add_collect_inr)));
      if (ex.residual_to_emd_inr) rows.push(kvRule("Residual → EMD", money(ex.residual_to_emd_inr)));
      rows.push(kvRule("Single net delta", money(ex.single_net_delta_inr)));
      note = ex.note;
    } else if (kind === "void_quote") {
      const vq = r.void_quote || {};
      rows.push(kvRule("Void eligible", vq.void_eligible || vq.eligible ? "Yes" : "No"));
      if (vq.window_remaining_min != null || vq.remaining_window_min != null)
        rows.push(
          kvRule(
            "Window remaining",
            String(vq.window_remaining_min != null ? vq.window_remaining_min : vq.remaining_window_min) + " min"
          )
        );
      if (vq.routing || vq.decision) rows.push(kvRule("Routing", String(vq.routing || vq.decision)));
      note = vq.note;
    } else if (kind === "refund_quote") {
      const rq = r.refund_quote || {};
      const bd = rq.breakdown || {};
      rows.push(kvRule("Refundable", rq.refundable ? "Yes" : "No"));
      if (bd.penalty_inr != null)
        rows.push(kvRule("Penalty (" + (bd.penalty_pct != null ? bd.penalty_pct + "%" : "—") + ")", money(bd.penalty_inr)));
      if (bd.recoverable_tax_inr != null) rows.push(kvRule("Recoverable tax", money(bd.recoverable_tax_inr)));
      if (bd.forfeited_tax_inr != null) rows.push(kvRule("Forfeited tax", money(bd.forfeited_tax_inr)));
      rows.push(kvRule("Net refund", money(rq.net_refund_inr)));
      if (rq.reversal_split)
        rows.push(
          kvRule(
            "Cash / points",
            money(rq.reversal_split.cash_refund_inr) + " / " + money(rq.reversal_split.points_reversed_inr)
          )
        );
      note = rq.note;
    } else if (kind === "reprotect") {
      opts = r.reprotect || r.options || r.alternatives || [];
      note = r.note;
      // ----- hotel-servicing-read (top-level fields) ---------------------------
    } else if (kind === "hotel_cancel") {
      rows.push(kvRule("Days to check-in", String(r.daysToCheckIn != null ? r.daysToCheckIn : "—")));
      rows.push(kvRule("Within free window", r.withinFreeWindow ? "Yes" : "No"));
      if (r.freeCancelUntil) rows.push(kvRule("Free cancel until", fmtDate(r.freeCancelUntil)));
      if (r.hoursToFreeDeadline != null) rows.push(kvRule("Hours to free-cancel", String(r.hoursToFreeDeadline)));
      rows.push(kvRule("Penalty (" + (r.penaltyPct != null ? r.penaltyPct + "%" : "—") + ")", money(r.penaltyInr)));
      rows.push(kvRule("Refund payable", money(r.refundPayableInr)));
      if (r.requiresAck) rows.push(kvRule("Non-refundable ack", "Required"));
      if (r.refundLifecycleState) rows.push(kvRule("Refund lifecycle", String(r.refundLifecycleState).replace(/_/g, " ")));
      if (r.slaDueAt) rows.push(kvRule("Refund SLA due", fmtDate(r.slaDueAt)));
      note = r.advisorNote || r.tzAmbiguityNote;
    } else if (kind === "hotel_amend") {
      if (r.changeLabel || r.amendType) rows.push(kvRule("Change", String(r.changeLabel || r.amendType)));
      if (r.amendFeeInr != null) rows.push(kvRule("Amend fee", money(r.amendFeeInr)));
      if (r.netImpactInr != null) rows.push(kvRule("Net impact", money(r.netImpactInr)));
      if (r.recommendedRoute || r.route) rows.push(kvRule("Recommended route", String(r.recommendedRoute || r.route).replace(/_/g, " ")));
      if (r.penaltyInr != null) rows.push(kvRule("Penalty", money(r.penaltyInr)));
      if (r.refundPayableInr != null) rows.push(kvRule("Refund payable", money(r.refundPayableInr)));
      note = r.advisorNote || r.tzAmbiguityNote;
    }

    if (!rows.length && !opts.length) {
      note = note || "No preview fields returned for this action.";
    }
    return (
      <div>
        {rows.length ? rows : null}
        {Array.isArray(opts) && opts.length ? (
          <div>
            <div className="taw-dx-prov" style={{ margin: "6px 0" }}>
              Re-protection options
            </div>
            {opts.map((op: any, i: number) => (
              <div key={i} className="taw-dx-anc">
                <span className="lab">{op.label || op.summary || op.description || "Option " + (i + 1)}</span>
                {op.sell != null || op.add_collect_inr != null || op.addCollect != null ? (
                  <span className="px ta-num">
                    {money(op.sell != null ? op.sell : op.add_collect_inr != null ? op.add_collect_inr : op.addCollect)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {note ? <div className="taw-dx-prov">{note}</div> : null}
        <div className="taw-banner taw-banner--info" style={{ marginTop: 10 }}>
          <Icon name="shield" size={14} />
          Preview only — no money moved. To execute, raise a case in Post-sale servicing below.
        </div>
      </div>
    );
  }

  if (!hasFlight && !hasHotel) return null;
  return (
    <div>
      <div className="taw-sec-label" style={{ marginTop: 18 }}>
        Disruption &amp; change preview{" "}
        <span className="taw-muted" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
          · quote-only, no money moves
        </span>
      </div>
      <div className="taw-dx" style={{ borderTop: "none", paddingTop: 4 }}>
        <div className="taw-dx-tabs">
          {hasFlight ? (
            <button className={cx("taw-dx-tab", act === "flight:classify" && "is-on")} onClick={() => runFlight("classify")}>
              Classify disruption
            </button>
          ) : null}
          {hasFlight ? (
            <button className={cx("taw-dx-tab", act === "flight:reprotect" && "is-on")} onClick={() => runFlight("reprotect")}>
              Re-protect
            </button>
          ) : null}
          {hasFlight ? (
            <button
              className={cx("taw-dx-tab", act === "flight:exchange_quote" && "is-on")}
              onClick={() => runFlight("exchange_quote")}
            >
              Exchange quote
            </button>
          ) : null}
          {hasFlight ? (
            <button className={cx("taw-dx-tab", act === "flight:void_quote" && "is-on")} onClick={() => runFlight("void_quote")}>
              Void eligibility
            </button>
          ) : null}
          {hasFlight ? (
            <button
              className={cx("taw-dx-tab", act === "flight:refund_quote" && "is-on")}
              onClick={() => runFlight("refund_quote")}
            >
              Refund quote
            </button>
          ) : null}
          {hasHotel ? (
            <button className={cx("taw-dx-tab", act === "hotel:cancel" && "is-on")} onClick={() => runHotel("cancel")}>
              Hotel cancel preview
            </button>
          ) : null}
          {hasHotel ? (
            <button className={cx("taw-dx-tab", act === "hotel:amend" && "is-on")} onClick={() => runHotel("amend")}>
              Hotel amend preview
            </button>
          ) : null}
        </div>
        {result()}
      </div>
    </div>
  );
}

export function OrdersBoard(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const svc = useServicingModule(); // { mod, err } — TA_SERVICING (stubbed; see file header)
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null); // {order, legs, timeline}
  const [detailLoading, setDetailLoading] = useState(false);
  const [sagaRunning, setSagaRunning] = useState(false);
  const [simFail, setSimFail] = useState(false);
  const [failLeg, setFailLeg] = useState(0);
  const [err, setErr] = useState<any>(null);

  const loadOrders = useCallback(
    (selectFirst: any) => {
      setLoading(true);
      setErr(null);
      fetchOrders("select=*&order=created_at.desc&limit=40")
        .then((rows: any) => {
          rows = rows || [];
          setOrders(rows);
          setLoading(false);
          if (selectFirst && rows.length && !selectedId) {
            selectOrder(rows[0].id);
          }
        })
        .catch((e: any) => {
          setErr(errText(e));
          setLoading(false);
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [selectedId]
  );

  function selectOrder(id: any) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    Promise.all([
      dbOne("orders?id=eq." + id + "&select=*"),
      db("order_legs?order_id=eq." + id + "&select=*&order=created_at.asc"),
      db("order_timeline?order_id=eq." + id + "&select=*&order=id.asc"),
    ])
      .then((parts: any) => {
        setDetail({ order: parts[0], legs: parts[1] || [], timeline: parts[2] || [] });
        setDetailLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setDetailLoading(false);
      });
  }

  function refreshDetail(id: any) {
    return Promise.all([
      dbOne("orders?id=eq." + id + "&select=*"),
      db("order_legs?order_id=eq." + id + "&select=*&order=created_at.asc"),
      db("order_timeline?order_id=eq." + id + "&select=*&order=id.asc"),
    ]).then((parts: any) => {
      setDetail({ order: parts[0], legs: parts[1] || [], timeline: parts[2] || [] });
    });
  }

  useEffect(() => {
    loadOrders(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to externally created orders (from the quote builder).
  useEffect(() => {
    if (props.justCreatedOrderId) {
      loadOrders(false);
      selectOrder(props.justCreatedOrderId);
      if (props.onConsumeCreated) props.onConsumeCreated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.justCreatedOrderId]);

  function runSaga() {
    if (!selectedId) return;
    setSagaRunning(true);
    setErr(null);
    const legCount = detail && detail.legs ? detail.legs.length : 0;
    const opts = simFail && legCount > 0 ? { failLeg: Math.min(failLeg, legCount - 1) } : undefined;
    const toastMsg = opts ? "Running saga with injected failure on leg " + (opts.failLeg + 1) : "Running booking saga…";
    toast(toastMsg, "info");
    apiRunSaga(selectedId, opts)
      .then((r: any) => {
        setSagaRunning(false);
        const outcome = r && r.outcome;
        if (r && r.ok) toast("Saga complete → " + outcome, "success");
        else toast("Saga compensated → " + outcome, "error");
        // Prefer the embedded order (has legs/timeline); also re-read for canonical state.
        return refreshDetail(selectedId).then(() => loadOrders(false));
      })
      .catch((e: any) => {
        setSagaRunning(false);
        setErr(errText(e));
        toast("Saga failed: " + errText(e), "error");
      });
  }

  const selectedOrder = detail && detail.order;
  const legCount = detail && detail.legs ? detail.legs.length : 0;
  const canRunSaga = selectedOrder && (selectedOrder.status === "CONFIRMING" || selectedOrder.status === "PARTIALLY_BOOKED");

  return (
    <div className="taw-board taw-fade-in">
      {/* left: orders list */}
      <Card
        title="Orders"
        icon={<Icon name="luggage" size={18} />}
        flush
        sub={orders.length ? orders.length + " on board" : ""}
        actions={
          <button
            className="taw-btn taw-btn--ghost taw-btn--sm"
            aria-label="Refresh orders"
            onClick={() => loadOrders(false)}
            disabled={loading}
          >
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 14 }}>
          {err ? (
            <div className="taw-banner taw-banner--err">
              <Icon name="alert" size={16} />
              {err}
            </div>
          ) : null}
          {loading ? (
            <div className="taw-orders">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="taw-skel" style={{ height: 78 }} />
              ))}
            </div>
          ) : orders.length ? (
            <div className="taw-orders">
              {orders.map((o: any) => (
                <button
                  key={o.id}
                  className={cx("taw-order-item", selectedId === o.id && "is-active")}
                  onClick={() => selectOrder(o.id)}
                >
                  <div className="taw-order-top">
                    <span className="taw-order-id ta-num">#{shortId(o.id)}</span>
                    <span className={cx("taw-status", "taw-status--" + o.status)}>{o.status}</span>
                  </div>
                  <div className="taw-order-tot ta-num">{inr(o.grand_total)}</div>
                  <div className="taw-muted ta-num" style={{ fontSize: 10.5, marginTop: 5 }}>
                    {fmtDate(o.created_at) + " · " + fmtTime(o.created_at)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={<Icon name="inbox" size={28} />}>No orders yet. Build a quote and create one.</Empty>
          )}
        </div>
      </Card>

      {/* right: detail + saga */}
      <Card
        title={selectedOrder ? "Order #" + shortId(selectedOrder.id) : "Order detail"}
        icon={<Icon name="compass" size={18} />}
        sub={selectedOrder ? selectedOrder.status : ""}
        flush
        actions={
          selectedOrder ? (
            <span className={cx("taw-status", "taw-status--" + selectedOrder.status)}>{selectedOrder.status}</span>
          ) : null
        }
      >
        {!selectedOrder && !detailLoading ? (
          <Empty icon={<Icon name="compass" size={28} />}>Select an order to drive its booking saga.</Empty>
        ) : null}
        {detailLoading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            <div className="taw-skel" style={{ height: 56 }} />
            <div className="taw-skel" style={{ height: 120 }} />
            <div className="taw-skel" style={{ height: 160 }} />
          </div>
        ) : null}

        {selectedOrder && !detailLoading ? (
          <div style={{ padding: 16 }}>
            {/* money strip */}
            <div className="taw-stat-grid" style={{ marginBottom: 14 }}>
              <div className="taw-stat">
                <div className="k">Grand total</div>
                <div className="v ta-num">{inr(selectedOrder.grand_total)}</div>
              </div>
              {canSeeMargin() ? (
                <div className="taw-stat">
                  <div className="k">Net yield</div>
                  <div className="v ta-num" style={{ color: "var(--gold-ink)" }}>
                    {selectedOrder.pricing && selectedOrder.pricing.netRevenue != null
                      ? inr(selectedOrder.pricing.netRevenue) + " · " + pct(selectedOrder.pricing.netYieldPct)
                      : "—"}
                  </div>
                </div>
              ) : null}
            </div>

            {/* saga control bar */}
            <div className="taw-failbar">
              <button
                type="button"
                className={cx("taw-toggle", simFail && "is-on")}
                role="switch"
                aria-checked={simFail ? "true" : "false"}
                style={{ border: 0, background: "transparent" }}
                onClick={() => setSimFail(!simFail)}
              >
                <span className="taw-sw" /> Simulate supplier failure
              </button>
              {simFail && legCount > 0 ? (
                <div className="leg-pick">
                  <label htmlFor="taw-failleg">on leg </label>
                  <select
                    id="taw-failleg"
                    className="taw-sel"
                    value={failLeg}
                    onChange={(e) => setFailLeg(Number(e.target.value))}
                  >
                    {(detail.legs || []).map((lg: any, i: number) => (
                      <option key={i} value={i}>
                        {i + 1} · {lg.product}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div style={{ marginLeft: "auto" }}>
                <button
                  className={cx("taw-btn", simFail ? "taw-btn--danger" : "taw-btn--accent")}
                  disabled={sagaRunning || !canRunSaga}
                  onClick={runSaga}
                  title={canRunSaga ? "" : "Order already processed"}
                >
                  {sagaRunning ? <Spinner /> : simFail ? <Icon name="alert" size={15} /> : <Icon name="send" size={15} />}
                  {sagaRunning ? "Running saga…" : simFail ? "Run Saga (inject fail)" : "Run Booking Saga"}
                </button>
              </div>
            </div>
            {!canRunSaga && !sagaRunning ? (
              <div className="taw-banner taw-banner--info">
                <Icon name="alert" size={16} />
                This order is in a terminal state ({selectedOrder.status}). Saga already executed; legs and timeline
                below reflect the outcome.
              </div>
            ) : null}

            {/* legs */}
            <div className="taw-sec-label" style={{ marginTop: 4 }}>
              Booking legs
            </div>
            {detail.legs && detail.legs.length ? (
              <div className="taw-legs" style={{ marginBottom: 16 }}>
                {detail.legs.map((lg: any) => {
                  const it = lg.item || {};
                  const label =
                    it.label ||
                    it._title ||
                    it.hotelName ||
                    it.airlineName ||
                    it.airline + " " + (it.flightNo || "") ||
                    it.destination ||
                    lg.product;
                  return (
                    <div key={lg.id} className="taw-leg">
                      <div className="taw-leg-ic">{productIcon(lg.product)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="taw-leg-t">{label}</div>
                        <div className="taw-leg-ref">{lg.supplier_ref ? "ref " + lg.supplier_ref : "awaiting supplier ref"}</div>
                      </div>
                      <span className={cx("taw-legstat", "taw-legstat--" + lg.status)}>{lg.status}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="taw-muted" style={{ fontSize: 12, marginBottom: 16 }}>
                No legs recorded.
              </div>
            )}

            {/* timeline */}
            <div className="taw-sec-label">Saga timeline</div>
            {detail.timeline && detail.timeline.length ? (
              <div className="taw-timeline">
                {detail.timeline.map((ev: any) => {
                  const t = ev.type || "";
                  const isFail = /FAIL|COMPENSAT|REVERSAL/.test(t);
                  const isGood = /BOOKED|TICKETED|LEDGER_POSTED/.test(t) && !isFail;
                  return (
                    <div key={ev.id} className={cx("taw-tl", isFail && "is-fail", isGood && "is-good")}>
                      <div className="taw-tl-type">{t.replace(/_/g, " ")}</div>
                      {ev.message ? <div className="taw-tl-msg">{ev.message}</div> : null}
                      <div className="taw-tl-at">{fmtTime(ev.at)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="taw-muted" style={{ fontSize: 12 }}>
                No timeline events yet — run the saga.
              </div>
            )}

            {/* ---- Wave-1 change preview (READ/QUOTE-ONLY) ------------------------ */}
            <OrderChangePreview order={selectedOrder} legs={detail.legs || []} advisorId={advisorId} />

            {/* ---- Servicing panel (SVC wiring) ----------------------------------- */}
            <div className="taw-sec-label" style={{ marginTop: 18 }}>
              Post-sale servicing
            </div>
            {svc.mod && (svc.mod as any).ServicingPanel ? (
              (() => {
                const ServicingPanel = (svc.mod as any).ServicingPanel;
                return (
                  <ServicingPanel
                    order={selectedOrder}
                    advisorId={advisorId}
                    onChange={() => {
                      // a case execute may have transitioned the order — re-read
                      // canonical order/legs/timeline + refresh the board list.
                      refreshDetail(selectedId).then(() => loadOrders(false));
                    }}
                  />
                );
              })()
            ) : svc.err ? (
              <div className="taw-banner taw-banner--err">
                <Icon name="alert" size={16} />
                Servicing module unavailable: {svc.err}
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                <SkeletonRows count={2} height={18} />
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
