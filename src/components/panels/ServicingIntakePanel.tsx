"use client";
/* =============================================================================
 * TripAgent — src/components/panels/ServicingIntakePanel.tsx
 * Ported from web/js/advisor.js: ServicingIntakePanel (line ~5399). Captures
 * NON-money servicing inputs: SSR / special request / name-check / idempotency
 * probe. The single chargeable branch (a name change) is HELD and routed to
 * the servicing case to charge — this panel never posts to the ledger.
 * ===========================================================================*/
import { useState } from "react";
import { servicingIntake, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, softNotice } from "../../lib/advisorHelpers";
import { Empty, Field, Icon, Spinner, OrderScopeBar, SellNote } from "../ui";

export function ServicingIntakePanel(props: any) {
  const advisorId = props.advisorId || null;
  const orderId = props.orderId || "";
  const setOrderId = props.setOrderId;

  const [kind, setKind] = useState("ssr"); // ssr|special_request|name_check|idempotency_probe
  const [ssr, setSsr] = useState(""); // "WCHR,VGML"
  const [srText, setSrText] = useState(""); // free text special request
  const [srCat, setSrCat] = useState("housekeeping");
  const [oldName, setOldName] = useState("");
  const [newName, setNewName] = useState("");

  const [list, setList] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);

  function callIntake(payload: any) {
    if (typeof servicingIntake === "function") return servicingIntake(payload);
    if (typeof apiCall === "function") return apiCall("servicing-intake", payload);
    return Promise.reject(new Error("servicing-intake transport unavailable"));
  }

  function loadList() {
    if (!orderId) {
      setNotice("Enter an order id to list servicing intake.");
      return;
    }
    setBusy(true);
    setErr(null);
    setNotice(null);
    callIntake({ action: "list", order_id: orderId })
      .then((r: any) => {
        setBusy(false);
        if (r && r.ok === false) {
          setNotice("Servicing intake isn't live yet (" + (r.error || "unavailable") + ").");
          setList(null);
          return;
        }
        setList((r && (r.items || r.rows || r.intakes)) || []);
      })
      .catch((e: any) => {
        setBusy(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("Servicing intake isn't live yet for this order.");
          setList(null);
        } else setErr(m);
      });
  }

  function submit() {
    if (!advisorId) {
      toast("Select an advisor to submit servicing intake.", "error");
      return;
    }
    if (!orderId) {
      toast("Enter an order id.", "error");
      return;
    }
    const payload: any = { order_id: orderId, advisor_id: advisorId };
    if (kind === "ssr") {
      const codes = ssr
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (!codes.length) {
        toast("Enter at least one SSR code (e.g. WCHR, VGML).", "error");
        return;
      }
      payload.action = "ssr";
      payload.ssrs = codes.map((c) => ({ code: c }));
    } else if (kind === "special_request") {
      if (!srText.trim()) {
        toast("Describe the special request.", "error");
        return;
      }
      payload.action = "special_request";
      payload.requests = [{ category: srCat, text: srText.trim() }];
    } else if (kind === "name_check") {
      if (!oldName.trim() || !newName.trim()) {
        toast("Enter both the current and corrected name.", "error");
        return;
      }
      payload.action = "name_check";
      payload.old_name = oldName.trim();
      payload.new_name = newName.trim();
    } else {
      payload.action = "idempotency_probe";
    }
    setBusy(true);
    setErr(null);
    setNotice(null);
    setRes(null);
    callIntake(payload)
      .then((r: any) => {
        setBusy(false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("Servicing intake isn't live yet (" + (r.error || "unavailable") + ").");
          else toast("Intake failed: " + (r.error || "unknown"), "error");
          return;
        }
        setRes(r || { ok: true });
        toast(kind === "name_check" && r && r.held ? "Name change captured & HELD for money review" : "Servicing intake captured", "success");
        loadList();
      })
      .catch((e: any) => {
        setBusy(false);
        const m = errText(e);
        if (softNotice(m)) setNotice("Servicing intake isn't live yet for this order.");
        else toast("Intake failed: " + m, "error");
      });
  }

  function KindBtn(key: any, label: any) {
    return (
      <button
        className={cx("taw-qfilter", kind === key && "is-active")}
        onClick={() => {
          setKind(key);
          setRes(null);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      <OrderScopeBar value={orderId} onChange={setOrderId} onLoad={loadList} busy={busy} placeholder="Order id to service…" />
      {err ? (
        <div className="taw-banner taw-banner--err">
          <Icon name="alert" size={16} />
          {err}
        </div>
      ) : null}
      {notice ? (
        <div className="taw-banner taw-banner--info">
          <Icon name="bell" size={16} />
          {notice}
        </div>
      ) : null}

      <div className="taw-qfilters" style={{ marginBottom: 14 }}>
        {KindBtn("ssr", "SSR")}
        {KindBtn("special_request", "Special request")}
        {KindBtn("name_check", "Name check")}
        {KindBtn("idempotency_probe", "Idempotency probe")}
      </div>

      {kind === "ssr" ? (
        <Field label="SSR codes (comma-separated)" htmlFor="svc-ssr">
          <input id="svc-ssr" className="taw-input" value={ssr} placeholder="WCHR, VGML, BSCT" onChange={(e) => setSsr(e.target.value)} />
        </Field>
      ) : null}
      {kind === "special_request" ? (
        <div className="taw-row taw-row-2" style={{ marginBottom: 12 }}>
          <Field label="Category" htmlFor="svc-cat">
            <select id="svc-cat" className="taw-select" value={srCat} onChange={(e) => setSrCat(e.target.value)}>
              {["housekeeping", "dietary", "accessibility", "transfer", "celebration", "other"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Request" htmlFor="svc-sr">
            <input id="svc-sr" className="taw-input" value={srText} placeholder="Late check-out, high floor…" onChange={(e) => setSrText(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {kind === "name_check" ? (
        <div className="taw-row taw-row-2" style={{ marginBottom: 12 }}>
          <Field label="Current name" htmlFor="svc-on">
            <input id="svc-on" className="taw-input" value={oldName} onChange={(e) => setOldName(e.target.value)} />
          </Field>
          <Field label="Corrected name" htmlFor="svc-nn">
            <input id="svc-nn" className="taw-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {kind === "idempotency_probe" ? (
        <div className="taw-recon-notice" style={{ marginBottom: 12 }}>
          Probes whether a servicing action on this order has already been applied — safe to run anytime; moves no money.
        </div>
      ) : null}

      <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busy} onClick={submit} title="Capture this servicing input (no money moves)">
        {busy ? <Spinner /> : <Icon name="check" size={13} />}
        {kind === "name_check" ? "Capture & hold" : "Capture"}
      </button>

      {res ? (
        <div className="taw-recon-notice" style={{ marginTop: 14 }}>
          {(res.held ? "HELD for money review — handed to the servicing case to charge. " : "Captured. ") + (res.intake_id ? "Ref " + shortId(res.intake_id) : "")}
        </div>
      ) : null}

      {list && list.length ? (
        <div className="taw-recon-sec">
          <div className="taw-recon-sec-h">
            <span className="ttl">
              <Icon name="shield" size={16} />
              Captured intake
            </span>
            <span className="ct">{list.length} items</span>
          </div>
          <div className="taw-qlist">
            {list.map((it: any, i: number) => (
              <div key={it.id || it.intake_id || i} className="taw-qrow">
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="shield" size={13} />
                      {String(it.kind || it.action || "intake").replace(/_/g, " ")}
                    </span>
                    {it.status ? <span className={cx("taw-qstate", /held|pending/i.test(it.status) ? "warn" : "info")}>{it.status}</span> : null}
                  </div>
                  <div className="taw-qrow-meta">
                    {it.summary ? <span>{it.summary}</span> : null}
                    <span className="taw-muted">Ref {shortId(it.id || it.intake_id)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : list ? (
        <Empty icon={<Icon name="shield" size={24} />}>No servicing intake captured on this order yet.</Empty>
      ) : null}

      <SellNote extra="Intake captures non-money inputs (SSRs, requests, name checks); the single chargeable branch (a name change) is held and routed to the servicing case to charge — nothing is posted to the ledger here." />
    </div>
  );
}
