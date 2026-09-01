"use client";
/* =============================================================================
 * TripAgent — src/components/panels/AdminPanel.tsx
 * New (not a port): the admin oversight layer behind the "Admin" tab, visible
 * only to advisors.role === 'admin' (see App.jsx's isAdmin() gate on the tab
 * itself, and the mount-level gate on the /admin route). Every write here
 * goes through backend/app/routers/admin_router.py's get_current_admin
 * dependency, which re-checks the caller's role server-side — this panel's
 * own visibility gate is a convenience, never the authority.
 *
 * Three sections behind a DeskHub-style sub-tab bar: Agents (list + activate/
 * deactivate), Orders (unfiltered — every order, every advisor/member), and
 * Enquiry assignment (unassigned enquiries -> pick an advisor -> Assign).
 * ===========================================================================*/
import { useEffect, useState } from "react";
import { adminListAdvisors, adminUpdateAdvisor, adminListOrders, adminAssignEnquiry, enquiries as fetchEnquiries, inr } from "../../services/api";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";

function AgentsSection() {
  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [busyId, setBusyId] = useState<any>(null);

  function load() {
    setLoading(true);
    setErr(null);
    adminListAdvisors()
      .then((list: any) => {
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(load, []);

  function toggleStatus(advisor: any) {
    const nextStatus = advisor.status === "active" ? "inactive" : "active";
    setBusyId(advisor.id);
    adminUpdateAdvisor(advisor.id, { status: nextStatus })
      .then(() => {
        setBusyId(null);
        toast(advisor.name + " marked " + nextStatus, "success");
        load();
      })
      .catch((e: any) => {
        setBusyId(null);
        toast(errText(e), "error");
      });
  }

  return (
    <Card
      title="Agents"
      icon={<Icon name="user" size={18} />}
      sub={rows ? rows.length + " advisors" : ""}
      actions={
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh advisors">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      }
    >
      <div style={{ padding: 16 }}>
        {err ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        {loading && rows == null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="taw-skel" style={{ height: 56 }} />
            ))}
          </div>
        ) : rows && rows.length ? (
          <div className="taw-qlist">
            {rows.map((a: any) => (
              <div key={a.id} className="taw-qrow">
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="user" size={13} />
                      {a.name}
                    </span>
                    <span className="taw-qbadge">{a.role}</span>
                  </div>
                  <div className="taw-qrow-meta">
                    <span>{a.email}</span>
                    <span className={cx("taw-status", "taw-status--" + (a.status === "active" ? "BOOKED" : "CANCELLED"))}>{a.status}</span>
                  </div>
                </div>
                <div className="taw-qrow-actions">
                  <button
                    className={cx("taw-btn", "taw-btn--sm", a.status === "active" ? "taw-btn--danger" : "taw-btn--accent")}
                    disabled={busyId === a.id}
                    onClick={() => toggleStatus(a)}
                  >
                    {busyId === a.id ? <Spinner /> : <Icon name={a.status === "active" ? "alert" : "check"} size={13} />}
                    {a.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={<Icon name="user" size={28} />}>No advisors on the platform yet.</Empty>
        )}
      </div>
    </Card>
  );
}

function AdminOrdersSection(props: any) {
  const membersById = props.membersById || {};
  const advisorsById = props.advisorsById || {};

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);

  function load() {
    setLoading(true);
    setErr(null);
    adminListOrders()
      .then((list: any) => {
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(load, []);

  return (
    <Card
      title="Orders"
      icon={<Icon name="luggage" size={18} />}
      sub={rows ? rows.length + " total, unfiltered" : ""}
      actions={
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh orders">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      }
    >
      <div style={{ padding: 16 }}>
        {err ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        {loading && rows == null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="taw-skel" style={{ height: 60 }} />
            ))}
          </div>
        ) : rows && rows.length ? (
          <div className="taw-orders">
            {rows.map((o: any) => {
              const mem = o.member_id ? membersById[o.member_id] : null;
              const adv = o.advisor_id ? advisorsById[o.advisor_id] : null;
              return (
                <div key={o.id} className="taw-order-item">
                  <div className="taw-order-top">
                    <span className="taw-order-id ta-num">#{shortId(o.id)}</span>
                    <span className={cx("taw-status", "taw-status--" + o.status)}>{o.status}</span>
                  </div>
                  <div className="taw-order-tot ta-num">{inr(o.grand_total)}</div>
                  <div className="taw-muted ta-num" style={{ fontSize: 10.5, marginTop: 5 }}>
                    {(mem ? mem.name : o.member_id ? "member " + shortId(o.member_id) : "guest") +
                      " · " +
                      (adv ? adv.name : o.advisor_id ? "advisor " + shortId(o.advisor_id) : "unassigned") +
                      " · " +
                      fmtDate(o.created_at) +
                      " " +
                      fmtTime(o.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Icon name="luggage" size={28} />}>No orders on the platform yet.</Empty>
        )}
      </div>
    </Card>
  );
}

function EnquiryAssignSection(props: any) {
  const advisors = props.advisors || [];

  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [picked, setPicked] = useState<any>({});
  const [busyId, setBusyId] = useState<any>(null);

  function load() {
    setLoading(true);
    setErr(null);
    fetchEnquiries("select=*&order=created_at.desc&limit=200")
      .then((list: any) => {
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
  }
  useEffect(load, []);

  const unassigned = (rows || []).filter((e: any) => !e.assigned_advisor_id);

  function assign(enquiry: any) {
    const advisorId = picked[enquiry.id];
    if (!advisorId) {
      toast("Pick an advisor first.", "error");
      return;
    }
    setBusyId(enquiry.id);
    adminAssignEnquiry(enquiry.id, advisorId)
      .then(() => {
        setBusyId(null);
        const who = advisors.filter((a: any) => a.id === advisorId)[0];
        toast("Assigned to " + (who ? who.name : "advisor"), "success");
        load();
      })
      .catch((e: any) => {
        setBusyId(null);
        toast(errText(e), "error");
      });
  }

  return (
    <Card
      title="Enquiry assignment"
      icon={<Icon name="inbox" size={18} />}
      sub={unassigned.length ? unassigned.length + " unassigned" : ""}
      actions={
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh enquiries">
          {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
        </button>
      }
    >
      <div style={{ padding: 16 }}>
        {err ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        {loading && rows == null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="taw-skel" style={{ height: 72 }} />
            ))}
          </div>
        ) : unassigned.length ? (
          <div className="taw-qlist">
            {unassigned.map((e: any) => (
              <div key={e.id} className="taw-qrow">
                <div className="taw-qrow-main">
                  <div className="taw-qrow-top">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="inbox" size={13} />
                      {"Enquiry " + shortId(e.id)}
                    </span>
                    <span className="taw-qstate info">{e.channel || "web"}</span>
                  </div>
                  {e.message ? <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>{e.message}</div> : null}
                </div>
                <div className="taw-qrow-actions">
                  <select
                    className="taw-sel taw-sel--sm"
                    aria-label="Pick an advisor"
                    value={picked[e.id] || ""}
                    disabled={busyId === e.id}
                    onChange={(ev) => setPicked((p: any) => ({ ...p, [e.id]: ev.target.value }))}
                  >
                    <option value="">Pick advisor…</option>
                    {advisors.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busyId === e.id || !picked[e.id]} onClick={() => assign(e)}>
                    {busyId === e.id ? <Spinner /> : <Icon name="check" size={13} />}
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={<Icon name="inbox" size={28} />}>No unassigned enquiries — everything has an advisor.</Empty>
        )}
      </div>
    </Card>
  );
}

export function AdminPanel(props: any) {
  props = props || {};
  const advisors = props.advisors || [];
  const membersById = props.membersById || {};
  const advisorsById: any = {};
  advisors.forEach((a: any) => {
    advisorsById[a.id] = a;
  });

  const [sub, setSub] = useState("agents"); // agents | orders | enquiries
  function SubBtn(key: string, icon: string, label: string) {
    return (
      <button key={key} className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => setSub(key)}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card title="Admin" icon={<Icon name="shield" size={18} />} sub="Agents · orders · enquiry assignment — admin only">
        <div className="taw-desk-tabs" role="tablist" aria-label="Admin view" style={{ marginBottom: 16 }}>
          {SubBtn("agents", "user", "Agents")}
          {SubBtn("orders", "luggage", "Orders")}
          {SubBtn("enquiries", "inbox", "Enquiry assignment")}
        </div>
        {sub === "agents" ? (
          <AgentsSection />
        ) : sub === "orders" ? (
          <AdminOrdersSection membersById={membersById} advisorsById={advisorsById} />
        ) : (
          <EnquiryAssignSection advisors={advisors} />
        )}
      </Card>
    </div>
  );
}
