"use client";
/* =============================================================================
 * TripAgent — src/components/panels/VisaAppointmentDesk.tsx
 * Ported from web/js/advisor.js: VisaAppointmentDesk (line ~6354). Appointment-
 * slot lifecycle (offer / book / status / scan reminders). NON-money
 * scheduling surface.
 * ===========================================================================*/
import { useCallback, useEffect, useState } from "react";
import { visaAppointment, call as apiCall } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime, softNotice } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

export function VisaAppointmentDesk(props: any) {
  props = props || {};
  const advisorId = props.advisorId || null;
  const membersById = props.membersById || {};
  const onOpenOrder = props.onOpenOrder || (() => {});

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});
  const [scanBusy, setScanBusy] = useState(false);
  function setRB(id: any, on: any) {
    setBusy((b: any) => {
      const n: any = {};
      for (const k in b) n[k] = b[k];
      if (on) n[id] = true;
      else delete n[id];
      return n;
    });
  }

  function callApt(payload: any) {
    if (typeof visaAppointment === "function") return visaAppointment(payload);
    if (typeof apiCall === "function") return apiCall("visa-appointment", payload);
    return Promise.reject(new Error("visa-appointment transport unavailable"));
  }

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setNotice(null);
    callApt({ action: "status", advisor_id: advisorId || undefined })
      .then((r: any) => {
        setLoading(false);
        if (r && r.ok === false) {
          setNotice("The visa appointment desk isn't live yet (" + (r.error || "unavailable") + ").");
          setRows(null);
          return;
        }
        setRows((r && (r.items || r.rows || r.appointments)) || []);
      })
      .catch((e: any) => {
        setLoading(false);
        const m = errText(e);
        if (softNotice(m)) {
          setNotice("The visa appointment desk isn't live yet.");
          setRows(null);
        } else setErr(m);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advisorId]);
  useEffect(() => {
    load();
  }, [load]);

  function offerSlots(row: any) {
    const id = row.id || row.application_id || row.member_id;
    setRB(id, true);
    callApt({ action: "offer_slots", advisor_id: advisorId || undefined, application_id: row.application_id, member_id: row.member_id })
      .then((r: any) => {
        setRB(id, false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The visa appointment desk isn't live yet.");
          else toast("Offer failed: " + (r.error || "unknown"), "error");
          return;
        }
        const slots = (r && (r.slots || r.items)) || [];
        toast(slots.length ? slots.length + " slots offered" : "No slots available", "info");
        load();
      })
      .catch((e: any) => {
        setRB(id, false);
        const m = errText(e);
        if (softNotice(m)) setNotice("The visa appointment desk isn't live yet.");
        else toast("Offer failed: " + m, "error");
      });
  }

  function scanReminders() {
    setScanBusy(true);
    callApt({ action: "scan_reminders", advisor_id: advisorId || undefined })
      .then((r: any) => {
        setScanBusy(false);
        if (r && r.ok === false) {
          if (softNotice(JSON.stringify(r))) setNotice("The visa appointment desk isn't live yet.");
          else toast("Scan failed: " + (r.error || "unknown"), "error");
          return;
        }
        toast("Reminder scan complete" + (r && r.reminders != null ? " — " + r.reminders + " due" : ""), "success");
        load();
      })
      .catch((e: any) => {
        setScanBusy(false);
        const m = errText(e);
        if (softNotice(m)) setNotice("The visa appointment desk isn't live yet.");
        else toast("Scan failed: " + m, "error");
      });
  }

  return (
    <div className="taw-fade-in">
      <Card
        title="Visa Appointments"
        icon={<Icon name="visa" size={18} />}
        sub="Slot lifecycle · reminders"
        actions={
          <div style={{ display: "inline-flex", gap: 8 }}>
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={scanReminders} disabled={scanBusy} title="Sweep for upcoming-appointment reminders">
              {scanBusy ? <Spinner /> : <Icon name="bell" size={14} />}
              Scan reminders
            </button>
            <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh appointments">
              {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
            </button>
          </div>
        }
      >
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

        {loading && !rows ? (
          <div className="taw-skel" style={{ height: 160 }} />
        ) : rows && rows.length ? (
          <div className="taw-qlist">
            {rows.map((row: any, i: number) => {
              const id = row.id || row.application_id || row.member_id;
              const rb = !!busy[id];
              const mem = row.member_id ? membersById[row.member_id] : null;
              const st = String(row.status || row.state || "pending");
              const booked = /book|confirm|complete/i.test(st);
              return (
                <div key={id || i} className="taw-qrow">
                  <div className="taw-qrow-main">
                    <div className="taw-qrow-top">
                      {row.order_id ? (
                        <button className="taw-qlink" onClick={() => onOpenOrder(row.order_id)} title="Open order">
                          <Icon name="luggage" size={13} />#{shortId(row.order_id)}
                        </button>
                      ) : null}
                      <span className="taw-qtype taw-icrow">
                        <Icon name="visa" size={13} />
                        {row.destination || row.country || "Visa"}
                      </span>
                      <span className={cx("taw-qstate", booked ? "ok" : "warn")}>{st}</span>
                    </div>
                    <div className="taw-qrow-meta">
                      {mem ? <span>{mem.name}</span> : null}
                      {row.slot_at ? (
                        <span>
                          {fmtDate(row.slot_at)} {fmtTime(row.slot_at)}
                        </span>
                      ) : null}
                      {row.center ? <span className="taw-muted">{row.center}</span> : null}
                      <span className="taw-muted">Ref {shortId(id)}</span>
                    </div>
                  </div>
                  <div className="taw-qrow-actions" style={{ display: "flex", gap: 8 }}>
                    <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rb} onClick={() => offerSlots(row)} title="Offer available slots">
                      {rb ? <Spinner /> : <Icon name="clock" size={13} />}
                      Offer slots
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : rows ? (
          <Empty icon={<Icon name="visa" size={28} />}>No appointments to manage.</Empty>
        ) : null}

        <div style={{ marginTop: 14, fontSize: "10.5px", color: "var(--muted)", lineHeight: 1.4 }}>
          Scheduling surface only — no money, no net/commission by construction.
        </div>
      </Card>
    </div>
  );
}
