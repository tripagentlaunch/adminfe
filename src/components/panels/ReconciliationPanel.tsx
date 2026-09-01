"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ReconciliationPanel.tsx
 * Ported from web/js/advisor.js: ReconciliationPanel (line ~2991), plus its
 * two sibling helpers colocated here since they're only ever used by this
 * panel: HotelCommissionRecon (line ~2935) and reconStateClass/readExceptions
 * (line ~2903/2915).
 *
 * GATING: this is HEAD-OF-BUSINESS / advisor economics — commission, net cost
 * and margin are HOB-only. This panel is mounted ONLY when canSeeMargin() at
 * the ROUTE level (App.jsx), exactly mirroring the original's
 * `(tab === "recon" && canSeeMargin())` double-gate — see App.jsx for the
 * gate itself; this file does not re-implement or loosen it.
 * ===========================================================================*/
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, hotelCommissionRead, call as apiCall, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, r } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

function reconStateClass(s: any) {
  const v = String(s || "").toLowerCase();
  if (v === "resolved" || v === "settled") return "resolved";
  if (v === "written_off") return "written_off";
  if (v === "pending") return "pending";
  if (v === "exception") return "exception";
  return "open";
}

// Read the exception queue via the authoritative function (action=exceptions
// is live). Falls back to the data-read gateway only if the function transport
// is unavailable; either way returns a normalised array and never throws.
function readExceptions(status: any) {
  const body: any = { action: "exceptions" };
  if (status && status !== "all") body.status = status;
  if (typeof apiCall === "function") {
    return apiCall("reconcile-settlement", body).then((r2: any) => (r2 && Array.isArray(r2.exceptions) ? r2.exceptions : []));
  }
  // Last-resort: try the read-model directly (likely 403 until allowlisted).
  let q = "reconciliation_exceptions?select=*&order=raised_at.desc&limit=200";
  if (status && status !== "all") q += "&status=eq." + encodeURIComponent(status);
  return db(q);
}

// HotelCommissionRecon — Wave-1 HOTEL commission / reconciliation read model.
// Calls the DEDICATED hotel-commission-read function, which is HARD-GATED to
// advisors server-side (a verified member session is rejected 403; there is no
// sell-only variant). This is the ONE hotel read that legitimately exposes
// net/commission, so it is mounted ONLY inside the canSeeMargin()-gated
// Reconciliation tab — never on a member surface. READ-ONLY: commission POSTING
// is a money path and stays out of scope.
function HotelCommissionRecon(props: any) {
  const advisorId = props.advisorId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);

  const load = useCallback(() => {
    if (!advisorId) {
      setLoading(false);
      setErr("Select an advisor to read hotel commission.");
      return;
    }
    setLoading(true);
    setErr(null);
    hotelCommissionRead({ advisor_id: advisorId, limit: 100 })
      .then((r2: any) => {
        setData(r2 || {});
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = (data && data.rows) || [];
  const totals = (data && data.totals) || {};
  return (
    <div className="taw-recon-sec">
      <div className="taw-recon-sec-h">
        <span className="ttl">
          <Icon name="hotel" size={16} />
          Hotel commission reconciliation
        </span>
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh hotel commission">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      </div>
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {loading && !data ? (
        <div className="taw-skel" style={{ height: 120 }} />
      ) : rows.length ? (
        <div>
          <div className="taw-recon-grid" style={{ marginBottom: 12 }}>
            <div className="taw-recon-stat">
              <div className="k">Commission (priced)</div>
              <div className="v ta-num">{inr(totals.commission || 0)}</div>
              <div className="sub">{(totals.orders || rows.length) + " orders"}</div>
            </div>
            <div className="taw-recon-stat">
              <div className="k">Expected (settle)</div>
              <div className="v ta-num">{inr(totals.expectedCommission || 0)}</div>
            </div>
            <div className="taw-recon-stat">
              <div className="k">Received</div>
              <div className={cx("v ta-num", totals.receivedCommission ? "is-good" : "")}>{totals.receivedCommission ? inr(totals.receivedCommission) : "—"}</div>
            </div>
            <div className="taw-recon-stat">
              <div className="k">Variance</div>
              <div className={cx("v ta-num", (totals.commissionVariance || 0) < 0 ? "is-bad" : "is-good")}>{inr(totals.commissionVariance || 0)}</div>
            </div>
          </div>
          <div className="taw-recon-tablewrap">
            <table className="taw-recon-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th className="num">Commission</th>
                  <th className="num">Expected</th>
                  <th className="num">Received</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((rw: any, i: number) => {
                  const comm = Number(rw.commission) || 0;
                  const exp = Number(rw.expected_commission) || 0;
                  const rec = Number(rw.received_commission) || 0;
                  const varc = rw.commission_variance != null ? Number(rw.commission_variance) : rec - exp;
                  return (
                    <tr key={i}>
                      <td>{rw.order_id ? "#" + shortId(rw.order_id) : "—"}</td>
                      <td>
                        <span className="taw-muted">{String(rw.order_status || "").replace(/_/g, " ")}</span>
                      </td>
                      <td className="num ta-num">{inr(comm)}</td>
                      <td className="num ta-num">{inr(exp)}</td>
                      <td className="num ta-num">{rec ? inr(rec) : <span className="taw-muted">—</span>}</td>
                      <td className="num">
                        <span className={cx("taw-recon-delta", varc > 0 ? "is-pos" : varc < 0 ? "is-neg" : "is-zero")}>{(varc > 0 ? "+" : "") + inr(varc)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && data.note ? (
            <div className="taw-recon-notice" style={{ marginTop: 10 }}>
              {data.note}
            </div>
          ) : null}
        </div>
      ) : (
        <Empty icon={<Icon name="hotel" size={24} />}>No hotel commission rows for this advisor yet.</Empty>
      )}
    </div>
  );
}

export function ReconciliationPanel(props: any) {
  const advisorId = props.advisorId;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  // exceptions
  const [exceptions, setExceptions] = useState<any>(null); // null=loading
  const [excErr, setExcErr] = useState<any>(null);
  const [excFilter, setExcFilter] = useState("open");
  const [busy, setBusy] = useState<any>({});

  // supplier settlements (best-effort read-model)
  const [settlements, setSettlements] = useState<any>(null);
  const [setlNote, setSetlNote] = useState<any>(null);

  // commission provisional (allowlisted tax_calculations + orders)
  const [taxRows, setTaxRows] = useState<any>(null);
  const [ordersById, setOrdersById] = useState<any>({});
  const [taxNote, setTaxNote] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  function setRowBusy(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  const load = useCallback(() => {
    setLoading(true);
    // 1) Exceptions — authoritative function read. Never throws upstream.
    setExcErr(null);
    readExceptions(excFilter)
      .then((rows: any) => setExceptions(Array.isArray(rows) ? rows : []))
      .catch((e: any) => {
        setExceptions([]);
        setExcErr(errText(e));
      });

    // 2) Supplier settlements — best-effort read-model (may be un-allowlisted).
    setSetlNote(null);
    db("supplier_settlements?select=*&order=updated_at.desc&limit=200")
      .then((rows: any) => setSettlements(Array.isArray(rows) ? rows : []))
      .catch(() => {
        setSettlements([]);
        setSetlNote("The supplier_settlements read-model is not exposed to the workbench yet. Provisional commission below is read from the priced tax breakdown; realised settlement will appear here once the read-model is live.");
      });

    // 3) Commission provisional — allowlisted tax_calculations + parent orders.
    setTaxNote(null);
    Promise.all([db("tax_calculations?select=*&order=created_at.desc&limit=120").catch(() => null), db("orders?select=*&order=created_at.desc&limit=120").catch(() => [])])
      .then((parts: any) => {
        const tx = parts[0],
          ords = parts[1] || [];
        if (tx == null) {
          setTaxRows([]);
          setTaxNote("Commission read-model (tax_calculations) is unavailable right now.");
        } else setTaxRows(Array.isArray(tx) ? tx : []);
        const byId: any = {};
        ords.forEach((o: any) => {
          if (o && o.id) byId[o.id] = o;
        });
        setOrdersById(byId);
        setLoading(false);
      })
      .catch(() => {
        setTaxRows([]);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Manual exception resolution (finance action, SVC-071). Drives the SAME
  // authoritative reconcile-settlement action=resolve — never a client-side
  // status flip on the table. Gated to environments where the function call
  // transport exists; otherwise the control is simply not offered.
  function resolveException(ex: any, status: any) {
    if (typeof apiCall !== "function") {
      toast("Resolve transport unavailable.", "error");
      return;
    }
    if (!ex || !ex.id) return;
    setRowBusy(ex.id, true);
    apiCall("reconcile-settlement", { action: "resolve", exception_id: ex.id, status: status })
      .then((r2: any) => {
        setRowBusy(ex.id, false);
        if (r2 && r2.error) {
          toast("Resolve failed: " + r2.error, "error");
          return;
        }
        toast("Exception " + shortId(ex.id) + " → " + status, "success");
        load();
      })
      .catch((e: any) => {
        setRowBusy(ex.id, false);
        toast("Resolve failed: " + errText(e), "error");
      });
  }

  // --- commission roll-up: provisional (from tax_calculations) vs realised ---
  // Realised is keyed off supplier_settlements per order when that read is live;
  // we sum commission_realised_inr across an order's settlement rows.
  const realisedByOrder = useMemo(() => {
    const m: any = {};
    (settlements || []).forEach((s: any) => {
      if (!s || !s.order_id) return;
      m[s.order_id] = (m[s.order_id] || 0) + r(s.commission_realised_inr);
    });
    return m;
  }, [settlements]);

  // Build the commission ledger rows (one per priced order). Provisional comes
  // from tax_calculations.commission; realised from settlements (0 until the
  // supplier statement settles). delta = realised − provisional.
  const commissionRows = useMemo(() => {
    return (taxRows || []).map((t: any) => {
      const ord = ordersById[t.order_id] || null;
      const provisional = r(t.commission);
      const hasRealised = Object.prototype.hasOwnProperty.call(realisedByOrder, t.order_id);
      const realised = hasRealised ? r(realisedByOrder[t.order_id]) : null;
      const mem = ord && ord.member_id ? membersById[ord.member_id] : null;
      return {
        order_id: t.order_id,
        member: mem ? mem.name : null,
        subtotal: r(t.subtotal_sell),
        provisional: provisional,
        realised: realised,
        delta: realised == null ? null : realised - provisional,
        status: ord ? ord.status : null,
      };
    });
  }, [taxRows, ordersById, realisedByOrder, membersById]);

  // --- headline totals -------------------------------------------------------
  const totals = useMemo(() => {
    const openExc = (exceptions || []).filter((e: any) => String(e.status || "open") === "open");
    const openExcInr = openExc.reduce((a: number, e: any) => a + r(e.amount_inr), 0);
    const prov = commissionRows.reduce((a: number, c: any) => a + c.provisional, 0);
    const real = commissionRows.reduce((a: number, c: any) => a + (c.realised || 0), 0);
    const anyRealised = commissionRows.some((c: any) => c.realised != null);
    const pendingSettle = (settlements || []).filter((s: any) => String(s.state || "pending") === "pending").length;
    return {
      openExcCount: openExc.length,
      openExcInr: openExcInr,
      provisional: prov,
      realised: real,
      anyRealised: anyRealised,
      unrealised: Math.max(0, prov - real),
      pendingSettle: pendingSettle,
    };
  }, [exceptions, commissionRows, settlements]);

  function excFilterBtn(key: string, label: string) {
    return (
      <button key={key} className={cx("taw-qfilter", excFilter === key && "is-active")} onClick={() => setExcFilter(key)}>
        {label}
      </button>
    );
  }

  function deltaCell(delta: any) {
    if (delta == null)
      return (
        <td className="num">
          <span className="taw-muted">—</span>
        </td>
      );
    const cls = delta > 0 ? "is-pos" : delta < 0 ? "is-neg" : "is-zero";
    const sign = delta > 0 ? "+" : "";
    return (
      <td className="num">
        <span className={cx("taw-recon-delta", cls)}>{sign + inr(delta)}</span>
      </td>
    );
  }

  const hasCallTransport = typeof apiCall === "function";

  return (
    <div className="taw-fade-in">
      <Card
        title="Reconciliation & Settlements"
        icon={<Icon name="shield" size={18} />}
        sub={totals.openExcCount ? totals.openExcCount + " open" : "Money-safety"}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh reconciliation">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        {/* headline tiles */}
        <div className="taw-recon-grid">
          <div className="taw-recon-stat">
            <div className="k">Open exceptions</div>
            <div className={cx("v", totals.openExcCount ? "is-bad" : "is-good")}>{totals.openExcCount}</div>
            <div className="sub ta-num">{totals.openExcInr ? inr(totals.openExcInr) + " unmatched" : "All matched"}</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Commission provisional</div>
            <div className="v ta-num">{inr(totals.provisional)}</div>
            <div className="sub">accrued at book</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Commission realised</div>
            <div className={cx("v ta-num", totals.anyRealised ? "is-good" : "")}>{totals.anyRealised ? inr(totals.realised) : "—"}</div>
            <div className="sub">{totals.anyRealised ? "confirmed at settle" : "awaiting settlement read-model"}</div>
          </div>
          <div className="taw-recon-stat">
            <div className="k">Unrealised</div>
            <div className={cx("v ta-num", totals.unrealised ? "is-warn" : "")}>{totals.anyRealised ? inr(totals.unrealised) : "—"}</div>
            <div className="sub">{totals.pendingSettle ? totals.pendingSettle + " statements pending" : "provisional − realised"}</div>
          </div>
        </div>

        {/* --- A. Reconciliation exceptions ------------------------------------- */}
        <div className="taw-recon-sec">
          <div className="taw-recon-sec-h">
            <span className="ttl">
              <Icon name="alert" size={16} />
              Reconciliation exceptions
            </span>
            <div className="taw-qfilters" role="tablist" aria-label="Exception status filter">
              {excFilterBtn("open", "Open")}
              {excFilterBtn("resolved", "Resolved")}
              {excFilterBtn("written_off", "Written off")}
              {excFilterBtn("all", "All")}
            </div>
          </div>
          {excErr ? (
            <div className="taw-banner taw-banner--err">
              <Icon name="alert" size={16} />
              {excErr}
            </div>
          ) : null}
          {exceptions == null ? (
            <div className="taw-skel" style={{ height: 120 }} />
          ) : exceptions.length ? (
            <div className="taw-recon-tablewrap">
              <table className="taw-recon-table">
                <thead>
                  <tr>
                    <th>Statement ref</th>
                    <th>Order</th>
                    <th>Reason</th>
                    <th className="num">Amount</th>
                    <th>Raised</th>
                    <th>Status</th>
                    {hasCallTransport ? <th className="num"></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((ex: any) => {
                    const st = String(ex.status || "open");
                    const rowBusy = !!busy[ex.id];
                    return (
                      <tr key={ex.id}>
                        <td>
                          <span className="taw-recon-ref">{ex.statement_ref || shortId(ex.id)}</span>
                        </td>
                        <td>
                          {ex.order_id ? (
                            <button className="taw-qlink" onClick={() => onOpenOrder(ex.order_id)} title="Open order">
                              <Icon name="luggage" size={12} />#{shortId(ex.order_id)}
                            </button>
                          ) : (
                            <span className="taw-muted">—</span>
                          )}
                        </td>
                        <td>{String(ex.reason || "—").replace(/_/g, " ")}</td>
                        <td className="num ta-num">{inr(ex.amount_inr)}</td>
                        <td>
                          <span className="taw-muted">{fmtDate(ex.raised_at)}</span>
                        </td>
                        <td>
                          <span className={cx("taw-recon-state", "taw-recon-state--" + reconStateClass(st))}>{st.replace(/_/g, " ")}</span>
                        </td>
                        {hasCallTransport ? (
                          <td className="num">
                            {st === "open" ? (
                              <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                                <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={rowBusy} onClick={() => resolveException(ex, "resolved")}>
                                  {rowBusy ? <Spinner /> : <Icon name="check" size={12} />}
                                  Resolve
                                </button>
                                <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => resolveException(ex, "written_off")} title="Write off">
                                  Write off
                                </button>
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<Icon name="shield" size={26} />}>{excFilter === "open" ? "No open reconciliation exceptions — the supplier statements are clean." : "No exceptions in this view."}</Empty>
          )}
        </div>

        {/* --- A2. Hotel commission reconciliation (Wave-1, advisor-gated) ------ */}
        <HotelCommissionRecon advisorId={advisorId} />

        {/* --- B. Commission: provisional vs realised --------------------------- */}
        <div className="taw-recon-sec">
          <div className="taw-recon-sec-h">
            <span className="ttl">
              <Icon name="sliders" size={16} />
              Commission · provisional vs realised
            </span>
            <span className="ct">{commissionRows.length ? commissionRows.length + " orders" : ""}</span>
          </div>
          {setlNote ? (
            <div className="taw-recon-notice" style={{ marginBottom: 11 }}>
              {setlNote}
            </div>
          ) : null}
          {taxNote ? (
            <div className="taw-recon-notice" style={{ marginBottom: 11 }}>
              {taxNote}
            </div>
          ) : null}
          {taxRows == null ? (
            <div className="taw-skel" style={{ height: 120 }} />
          ) : commissionRows.length ? (
            <div className="taw-recon-tablewrap">
              <table className="taw-recon-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Member</th>
                    <th className="num">Sell</th>
                    <th className="num">Provisional</th>
                    <th className="num">Realised</th>
                    <th className="num">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionRows.map((c: any, i: number) => (
                    <tr key={c.order_id || i}>
                      <td>
                        {c.order_id ? (
                          <button className="taw-qlink" onClick={() => onOpenOrder(c.order_id)} title="Open order">
                            <Icon name="luggage" size={12} />#{shortId(c.order_id)}
                          </button>
                        ) : (
                          <span className="taw-muted">—</span>
                        )}
                      </td>
                      <td>{c.member || <span className="taw-muted">—</span>}</td>
                      <td className="num ta-num">{inr(c.subtotal)}</td>
                      <td className="num ta-num">{inr(c.provisional)}</td>
                      <td className="num ta-num">{c.realised == null ? <span className="taw-muted">—</span> : inr(c.realised)}</td>
                      {deltaCell(c.delta)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<Icon name="sliders" size={26} />}>No priced orders to reconcile yet.</Empty>
          )}
        </div>

        {/* --- C. Supplier settlements (when the read-model is live) ------------- */}
        {settlements && settlements.length ? (
          <div className="taw-recon-sec">
            <div className="taw-recon-sec-h">
              <span className="ttl">
                <Icon name="compass" size={16} />
                Supplier settlements
              </span>
              <span className="ct">{settlements.length} statement lines</span>
            </div>
            <div className="taw-recon-tablewrap">
              <table className="taw-recon-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Order</th>
                    <th className="num">Payable</th>
                    <th className="num">Provisional</th>
                    <th className="num">Realised</th>
                    <th>State</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s: any) => {
                    const stt = String(s.state || "pending");
                    return (
                      <tr key={s.id}>
                        <td>{s.supplier || "—"}</td>
                        <td>
                          {s.order_id ? (
                            <button className="taw-qlink" onClick={() => onOpenOrder(s.order_id)} title="Open order">
                              <Icon name="luggage" size={12} />#{shortId(s.order_id)}
                            </button>
                          ) : (
                            <span className="taw-muted">—</span>
                          )}
                        </td>
                        <td className="num ta-num">{inr(s.payable_inr)}</td>
                        <td className="num ta-num">{inr(s.commission_provisional_inr)}</td>
                        <td className="num ta-num">{inr(s.commission_realised_inr)}</td>
                        <td>
                          <span className={cx("taw-recon-state", "taw-recon-state--" + reconStateClass(stt))}>{stt}</span>
                        </td>
                        <td>
                          <span className="taw-muted">{s.due_at ? fmtDate(s.due_at) : "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
