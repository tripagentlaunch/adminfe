"use client";
/* =============================================================================
 * TripAgent — src/components/panels/LeadsPanel.tsx
 * Ported from web/js/advisor.js: LeadsPanel (line ~4828). Lead routing: shows
 * THIS advisor's assigned open enquiries, auto-assign unrouted leads via
 * weighted round-robin, manual reassign-with-reason, and a warm AI handoff
 * summary on each enquiry. Operates on enquiries.assigned_advisor_id;
 * NON-MONEY.
 * ===========================================================================*/
import { useEffect, useRef, useState } from "react";
import { enquiries as fetchEnquiries, advisorProposals } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, enqSla } from "../../lib/advisorHelpers";
import { Card, Empty, Icon, Spinner } from "../ui";

export function LeadsPanel(props: any) {
  props = props || {};
  const advisorId = props.advisorId;
  const advisors = props.advisors || [];
  const membersById = props.membersById || {};

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [busy, setBusy] = useState<any>({});
  const [view, setView] = useState("mine"); // mine | unassigned

  const reqRef = useRef(0);
  function setRowBusy(id: string, on: boolean) {
    setBusy((b: any) => {
      const c: any = {};
      for (const k in b) c[k] = b[k];
      c[id] = on;
      return c;
    });
  }

  function load() {
    setLoading(true);
    setErr(null);
    const myReq = ++reqRef.current;
    fetchEnquiries("select=*&order=created_at.desc&limit=120")
      .then((list: any) => {
        if (myReq !== reqRef.current) return;
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        if (myReq !== reqRef.current) return;
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(load, [advisorId]); // eslint-disable-line

  function autoRoute(e: any) {
    if (!e.member_id) {
      toast("Lead has no member to route.", "error");
      return;
    }
    setRowBusy(e.id, true);
    advisorProposals({ action: "route", member_id: e.member_id, enquiry_id: e.id })
      .then((r: any) => {
        setRowBusy(e.id, false);
        if (r && r.error) {
          toast("Route failed: " + r.error, "error");
          return;
        }
        const who = advisors.filter((a: any) => a.id === r.assigned_advisor_id)[0];
        toast("Routed to " + (who ? who.name : "advisor") + " (" + (r.method || "round-robin") + ")", "success");
        load();
      })
      .catch((er: any) => {
        setRowBusy(e.id, false);
        toast(errText(er), "error");
      });
  }

  function reassign(e: any, toAdvisorId: string) {
    if (!toAdvisorId) return;
    if (!advisorId) {
      toast("Select an advisor to action leads.", "error");
      return;
    }
    const who = advisors.filter((a: any) => a.id === toAdvisorId)[0];
    let reason = typeof window !== "undefined" && window.prompt ? window.prompt("Reassign reason (kept on the lead trail):", "") : "";
    if (reason == null) return;
    reason = String(reason).trim();
    setRowBusy(e.id, true);
    advisorProposals({ action: "reassign_enquiry", advisor_id: advisorId, enquiry_id: e.id, to_advisor_id: toAdvisorId, reason: reason || undefined })
      .then((r: any) => {
        setRowBusy(e.id, false);
        if (r && r.error) {
          toast("Reassign failed: " + r.error, "error");
          return;
        }
        toast("Lead reassigned to " + (who ? who.name : "advisor"), "success");
        load();
      })
      .catch((er: any) => {
        setRowBusy(e.id, false);
        toast(errText(er), "error");
      });
  }

  function handoff(e: any) {
    if (!advisorId) {
      toast("Select an advisor first.", "error");
      return;
    }
    setRowBusy(e.id, true);
    advisorProposals({ action: "handoff_summary", advisor_id: advisorId, enquiry_id: e.id })
      .then((r: any) => {
        setRowBusy(e.id, false);
        if (r && r.error) {
          toast("Summary failed: " + r.error, "error");
          return;
        }
        toast("Warm handoff summary ready.", "success");
        load();
      })
      .catch((er: any) => {
        setRowBusy(e.id, false);
        toast(errText(er), "error");
      });
  }

  const open = (rows || []).filter((e: any) => (e.status || "open") === "open");
  const visible = open.filter((e: any) => {
    if (view === "unassigned") return !e.assigned_advisor_id;
    return e.assigned_advisor_id === advisorId; // "mine"
  });
  const counts: any = {
    mine: open.filter((e: any) => e.assigned_advisor_id === advisorId).length,
    unassigned: open.filter((e: any) => !e.assigned_advisor_id).length,
  };

  function ViewBtn(key: string, label: string) {
    return (
      <button key={key} className={cx("taw-qfilter", view === key && "is-active")} onClick={() => setView(key)}>
        {label}
        <span className="n ta-num">{counts[key] || 0}</span>
      </button>
    );
  }

  return (
    <div className="taw-queue taw-fade-in">
      <Card
        title="Leads"
        icon={<Icon name="inbox" size={18} />}
        sub={counts.mine ? counts.mine + " assigned to you" : ""}
        actions={
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh leads">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        }
      >
        <div style={{ padding: 16 }}>
          <div className="taw-qfilters" role="tablist" aria-label="Leads filter">
            {ViewBtn("mine", "My leads")}
            {ViewBtn("unassigned", "Unassigned")}
          </div>
          {err ? (
            <div className="taw-banner taw-banner--err" style={{ marginTop: 12 }}>
              <Icon name="alert" size={16} />
              {err}
            </div>
          ) : null}

          {loading && rows == null ? (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="taw-skel" style={{ height: 84 }} />
              ))}
            </div>
          ) : visible.length ? (
            <div className="taw-qlist">
              {visible.map((e: any) => {
                const mem = e.member_id ? membersById[e.member_id] : null;
                const rowBusy = !!busy[e.id];
                const sla = enqSla(e);
                const intent = e.intent || {};
                let dests = intent.destinations || intent.destination || [];
                if (typeof dests === "string") dests = [dests];
                let services = intent.services || [];
                if (typeof services === "string") services = [services];
                const ho = e.detail && e.detail.handoff_summary;
                return (
                  <div key={e.id} className="taw-qrow">
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        <span className="taw-qtype taw-icrow">
                          <Icon name="user" size={13} />
                          {mem ? mem.name : "New lead"}
                        </span>
                        {mem && mem.tier ? <span className="taw-qbadge">{mem.tier}</span> : null}
                        {sla ? <span className={cx("taw-qstate", sla.cls === "breach" ? "err" : "ok")}>{sla.txt}</span> : null}
                        <span className="taw-qstate info">{e.channel || "web"}</span>
                      </div>
                      {e.message ? (
                        <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>{e.message}</div>
                      ) : null}
                      <div className="taw-qrow-meta">
                        {(dests || []).slice(0, 3).map((d: string, i: number) => (
                          <span key={"d" + i} className="taw-icrow">
                            <Icon name="compass" size={11} />
                            {d}
                          </span>
                        ))}
                        {(services || []).slice(0, 3).map((s: string, i: number) => (
                          <span key={"s" + i}>{s}</span>
                        ))}
                        <span className="taw-muted">Lead {shortId(e.id)}</span>
                      </div>
                      {ho && ho.text ? (
                        <div className="taw-handoff">
                          <div className="k">
                            <Icon name="sliders" size={11} />
                            Warm handoff brief
                          </div>
                          {ho.text}
                        </div>
                      ) : null}
                    </div>
                    <div className="taw-qrow-actions">
                      {!e.assigned_advisor_id ? (
                        <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={rowBusy} onClick={() => autoRoute(e)} title="Weighted round-robin auto-assign">
                          {rowBusy ? <Spinner /> : <Icon name="compass" size={13} />}
                          Auto-route
                        </button>
                      ) : null}
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={rowBusy} onClick={() => handoff(e)} title="Generate a warm AI handoff summary">
                        <Icon name="sliders" size={13} />
                        Handoff brief
                      </button>
                      {advisors.length ? (
                        <select
                          className="taw-sel taw-sel--sm"
                          aria-label="Reassign lead"
                          value=""
                          disabled={rowBusy}
                          onChange={(ev) => {
                            if (ev.target.value) reassign(e, ev.target.value);
                          }}
                        >
                          <option value="">Reassign…</option>
                          {advisors
                            .filter((a: any) => a.id !== e.assigned_advisor_id)
                            .map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Icon name="inbox" size={28} />}>{view === "unassigned" ? "No unassigned leads — every open enquiry has an advisor." : "No open leads assigned to you right now."}</Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
