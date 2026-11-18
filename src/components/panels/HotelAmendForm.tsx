"use client";
/* =============================================================================
 * TripAgent — src/components/panels/HotelAmendForm.tsx
 * Hotel change inside Servicing intake (reference: servicing.js SimulateModal,
 * HTL-069-072 / SVC-031). Shows what is booked now, takes the changed stay
 * (check-in, check-out, room type, board, guests, new price), previews the rate
 * difference live, then runs the servicing case: open -> simulate -> approve.
 * The backend re-validates and re-derives the rate difference; the amendment
 * with the hotel itself is made separately (case execute is not wired).
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { servicingIntake, servicingCase } from "../../services/api";
import { errText, toast, shortId } from "../../lib/advisorHelpers";
import { fmtINR } from "../../lib/orderTypes";
import {
  BOARD_OPTIONS, FIELD_LABELS, buildAmendDetail, changedFields, describeDelta, seedForm, validateAmend,
  type AmendForm, type HotelBefore,
} from "../../lib/hotelAmend";
import { Field, Icon, Spinner } from "../ui";

type Phase = "loading" | "ready" | "simulating" | "quoted" | "approving" | "done";

const TIER_LABEL: Record<string, string> = { auto: "Auto-approved", duty_mgr: "Duty manager", finance: "Finance sign-off" };

export function HotelAmendForm({ orderId, advisorId }: { orderId: string; advisorId: string | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [before, setBefore] = useState<HotelBefore | null>(null);
  const [form, setForm] = useState<AmendForm | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<any>(null);

  // Network only: state is set in the callbacks, so it is safe to start from an effect.
  const fetchBefore = useCallback(() => {
    servicingIntake({ action: "hotel_leg", order_id: orderId })
      .then((r: any) => {
        if (r && r.ok === false) {
          setMissing(r.error === "hotel_leg_not_found" ? "This order has no hotel leg to change." : "Couldn't read the hotel booking (" + (r.error || "unavailable") + ").");
          return;
        }
        setBefore(r.before); setForm(seedForm(r.before)); setPhase("ready");
      })
      .catch((e: any) => setMissing(errText(e)));
  }, [orderId]);

  useEffect(() => { fetchBefore(); }, [fetchBefore]);

  function restart() {
    setPhase("loading"); setErr(null); setMissing(null); setCaseId(null); setQuote(null); setTier(null); setOutcome(null);
    fetchBefore();
  }

  function edit(k: keyof AmendForm, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    // Any edit makes the frozen quote stale: it must be re-simulated before approval.
    if (phase === "quoted") { setPhase("ready"); setQuote(null); setTier(null); }
  }

  function simulate() {
    if (!before || !form) return;
    if (!advisorId) { toast("Select an advisor first.", "error"); return; }
    const problem = validateAmend(before, form);
    if (problem) { setErr(problem); return; }
    setErr(null); setPhase("simulating");
    servicingCase({
      action: "open", order_id: orderId, type: "amendment", advisor_id: advisorId,
      leg_id: before.leg_id, reason: reason.trim() || null, detail: buildAmendDetail(before, form),
    })
      .then((o: any) => {
        if (o && o.detail_unchanged) throw new Error("This change is already with an approver — it can't be edited now.");
        const id = o && (o.case_id || (o.case && o.case.id));
        if (!id) throw new Error("Case did not open (no case id returned).");
        setCaseId(id);
        return servicingCase({ action: "simulate", case_id: id, advisor_id: advisorId });
      })
      .then((s: any) => {
        setQuote(s.quote || {}); setTier(s.approval_tier || null); setPhase("quoted");
      })
      .catch((e: any) => { setErr(errText(e)); setPhase("ready"); });
  }

  function approve() {
    if (!caseId || !advisorId) return;
    setErr(null); setPhase("approving");
    servicingCase({ action: "approve", case_id: caseId, advisor_id: advisorId, reason: reason.trim() || undefined })
      .then((r: any) => { setOutcome(r || {}); setPhase("done"); })
      .catch((e: any) => { setErr(errText(e)); setPhase("quoted"); });
  }

  if (missing) {
    return (
      <div className="taw-banner taw-banner--info"><Icon name="bell" size={16} />{missing}</div>
    );
  }
  if (phase === "loading" || !before || !form) {
    return <div className="taw-muted" style={{ padding: 12 }}><Spinner /> Reading the hotel booking…</div>;
  }

  const delta = describeDelta(before, form);
  const changed = changedFields(before, form);
  const busy = phase === "simulating" || phase === "approving";
  const locked = phase === "done";

  return (
    <div>
      {err ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={16} />{err}</div> : null}

      <div className="taw-recon-notice" style={{ marginBottom: 12 }}>
        <b>{before.hotelName || "Hotel"}</b> — now {before.checkIn || "?"} → {before.checkOut || "?"}
        {before.roomType ? " · " + before.roomType : ""}{before.board ? " · " + before.board : ""}
        {before.pax != null ? " · " + before.pax + " guests" : ""} · booked value <b>{fmtINR(before.sell)}</b>
      </div>

      <div className="taw-row taw-row-2" style={{ marginBottom: 12 }}>
        <Field label="New check-in" htmlFor="ha-ci">
          <input id="ha-ci" className="taw-input" type="date" disabled={locked} value={form.checkIn} onChange={(e) => edit("checkIn", e.target.value)} />
        </Field>
        <Field label="New check-out" htmlFor="ha-co">
          <input id="ha-co" className="taw-input" type="date" disabled={locked} value={form.checkOut} onChange={(e) => edit("checkOut", e.target.value)} />
        </Field>
        <Field label="Room type" htmlFor="ha-room">
          <input id="ha-room" className="taw-input" disabled={locked} value={form.roomType} placeholder="Deluxe Room" onChange={(e) => edit("roomType", e.target.value)} />
        </Field>
        <Field label="Board" htmlFor="ha-board">
          <select id="ha-board" className="taw-select" disabled={locked} value={form.board} onChange={(e) => edit("board", e.target.value)}>
            <option value="">Keep as booked</option>
            {BOARD_OPTIONS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Guests" htmlFor="ha-pax">
          <input id="ha-pax" className="taw-input" type="number" min={1} inputMode="numeric" disabled={locked} value={form.pax} onChange={(e) => edit("pax", e.target.value)} />
        </Field>
        <Field label="New stay price (sell, ₹)" htmlFor="ha-sell">
          <input id="ha-sell" className="taw-input" type="number" min={0} inputMode="numeric" disabled={locked} value={form.newSell} placeholder="e.g. 92000" onChange={(e) => edit("newSell", e.target.value)} />
        </Field>
      </div>

      <div className={"taw-recon-notice"} style={{ marginBottom: 12 }} aria-live="polite">
        Rate difference:{" "}
        <b>
          {delta.kind === "collect" ? "Add-collect " + fmtINR(delta.amount)
            : delta.kind === "refund" ? "Refund " + fmtINR(delta.amount)
            : delta.kind === "none" ? "No rate change"
            : "enter the new price to see it"}
        </b>
        {changed.length ? <span className="taw-muted"> · changing {changed.map((c) => FIELD_LABELS[c] || c).join(", ")}</span> : null}
      </div>

      <Field label="Reason / note" htmlFor="ha-reason">
        <input id="ha-reason" className="taw-input" disabled={locked} value={reason} placeholder="Context for the audit trail…" onChange={(e) => setReason(e.target.value)} />
      </Field>

      {!locked ? (
        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busy} onClick={simulate} title="Quote this change (nothing is charged)">
          {phase === "simulating" ? <Spinner /> : <Icon name="check" size={13} />}
          {quote ? "Re-simulate" : "Simulate quote"}
        </button>
      ) : null}

      {quote && quote.kind === "hotel_amend" ? (
        <div className="taw-recon-sec" style={{ marginTop: 14 }}>
          <div className="taw-recon-sec-h">
            <span className="ttl"><Icon name="shield" size={16} />Frozen quote</span>
            {tier ? <span className="ct">{TIER_LABEL[tier] || tier}</span> : null}
          </div>
          <div className="taw-qlist">
            <QLine k="Booked value" v={fmtINR(quote.sell_paid_inr)} />
            {quote.new_sell_inr != null ? <QLine k="New value" v={fmtINR(quote.new_sell_inr)} /> : <QLine k="New value" v="not priced yet" />}
            <QLine k="Rate difference" v={(quote.fare_diff_inr > 0 ? "+" : "") + fmtINR(quote.fare_diff_inr)} />
            <QLine k={quote.within_free_window ? "Amend fee (inside free window)" : "Amend fee (cancellation band applies)"} v={fmtINR(quote.amend_fee_inr)} />
            <QLine strong k={quote.net_impact_inr > 0 ? "Member pays" : quote.net_impact_inr < 0 ? "Member is refunded" : "Net"} v={fmtINR(Math.abs(quote.net_impact_inr))} />
          </div>
          {quote.advisor_note ? <div className="taw-muted" style={{ marginTop: 8 }}>{quote.advisor_note}</div> : null}
          {quote.rate_pending ? <div className="taw-muted" style={{ marginTop: 8 }}>No new price entered — the rate difference is treated as 0 until you add one.</div> : null}
          {!locked ? (
            <button className="taw-btn taw-btn--accent taw-btn--sm" style={{ marginTop: 12 }} disabled={busy} onClick={approve}>
              {phase === "approving" ? <Spinner /> : <Icon name="check" size={13} />}
              {tier && tier !== "auto" ? "Send for approval" : "Approve change"}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "done" && outcome ? (
        <div className="taw-recon-notice" style={{ marginTop: 14 }}>
          {outcome.approved === false || outcome.case_state === "AWAITING_APPROVAL"
            ? "Routed to " + (TIER_LABEL[outcome.required_tier || tier || ""] || "an approver") + " — nothing is charged yet."
            : "Approved. The change with the hotel is made separately; no money moved here."}
          {caseId ? " Case " + shortId(caseId) + "." : ""}
          <button className="taw-btn taw-btn--sm" style={{ marginLeft: 10 }} onClick={restart}>Start another</button>
        </div>
      ) : null}
    </div>
  );
}

function QLine({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="taw-qrow"><div className="taw-qrow-main"><div className="taw-qrow-top" style={{ justifyContent: "space-between" }}>
      <span>{k}</span><span style={strong ? { fontWeight: 600 } : undefined}>{v}</span>
    </div></div></div>
  );
}
