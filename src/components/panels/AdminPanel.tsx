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
import { useEffect, useRef, useState } from "react";
import {
  adminListAdvisors,
  adminUpdateAdvisor,
  adminMe,
  adminAdvisorWork,
  adminAdvisorWorkDetail,
  adminCreateAdvisor,
  adminListAdvisorInvites,
  adminCancelAdvisorInvite,
  adminResendAdvisorInvite,
  adminListOrders,
  adminAssignEnquiry,
  enquiries as fetchEnquiries,
  siteAccessRequestsPending,
  siteAccessRequestsMissingCode,
  siteApproveAccessRequest,
  siteDenyAccessRequest,
  siteAccessRequestsApproved,
  siteSuperKeys,
  siteSetSuperKeyActive,
  inr,
} from "../../services/api";
import { ApprovedRequestsList, NewSuperKeyForm, ShareBar, SignOutMenu, copyText } from "./ApprovedInvites";
import { SEAT_CHOICES, prettyCode, seatChoiceLabel } from "../../lib/inviteShare";
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";
import { ApiCostsSection } from "./ApiCostsSection";

// "Add advisor" (super admins only): name, email and role, then either a password typed now (the login works at once) or no
// password (an invite email lets them set their own).
function AddAdvisorForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("advisor");
  const [how, setHow] = useState<"password" | "invite">("password");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = name.trim() && okEmail && (how === "invite" || password.length >= 8);

  function suggest() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(12);
    window.crypto.getRandomValues(buf);
    setPassword(Array.from(buf).map((n) => chars[n % chars.length]).join(""));
    setShow(true);
  }
  function save() {
    setBusy(true);
    adminCreateAdvisor({ name: name.trim(), email: email.trim(), role, password: how === "password" ? password : undefined })
      .then((r: any) => {
        setBusy(false);
        toast(r && r.mode === "created" ? name.trim() + " can log in now with " + email.trim() : "Invitation emailed to " + email.trim(), "success");
        onDone();
      })
      .catch((e: any) => {
        setBusy(false);
        toast(errText(e), "error");
      });
  }
  return (
    <div style={{ padding: 14, border: "1px solid var(--line, rgba(0,0,0,.1))", borderRadius: 10, marginBottom: 14 }}>
      <b>Add an advisor or admin</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
        <label className="taw-field"><span>Name</span><input className="taw-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
        <label className="taw-field"><span>Email (their login)</span><input className="taw-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
        <label className="taw-field"><span>Role</span>
          <select className="taw-input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="advisor">Advisor — works enquiries and orders</option>
            <option value="admin">Admin — sees the Admin tab too</option>
          </select>
        </label>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0 6px", fontSize: 13 }}>
        <label><input type="radio" checked={how === "password"} onChange={() => setHow("password")} /> I set the password now</label>
        <label><input type="radio" checked={how === "invite"} onChange={() => setHow("invite")} /> Email them an invitation to set their own</label>
      </div>
      {how === "password" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="taw-input" style={{ maxWidth: 260 }} type={show ? "text" : "password"} placeholder="Password (8 or more characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <button type="button" className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
          <button type="button" className="taw-btn taw-btn--ghost taw-btn--sm" onClick={suggest}>Suggest a password</button>
          {password && password.length < 8 ? <span style={{ fontSize: 12, color: "var(--danger, #a33)" }}>At least 8 characters</span> : null}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--taupe)" }}>They get an email with a link (valid 7 days) to choose their password.</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="taw-btn taw-btn--accent taw-btn--sm" disabled={!ready || busy} onClick={save}>
          {busy ? <Spinner /> : <Icon name="check" size={13} />} {how === "password" ? "Create login" : "Send invitation"}
        </button>
        <button type="button" className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {how === "password" ? <div style={{ fontSize: 12, color: "var(--taupe)", marginTop: 8 }}>Share the password with them yourself; it is not shown again.</div> : null}
    </div>
  );
}

function AgentsSection() {
  const [rows, setRows] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [busyId, setBusyId] = useState<any>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [adding, setAdding] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);

  useEffect(() => {
    adminMe().then((m: any) => setIsSuper(!!(m && m.super_admin))).catch(() => setIsSuper(false));
  }, []);
  function loadInvites() {
    adminListAdvisorInvites().then((l: any) => setInvites(Array.isArray(l) ? l : [])).catch(() => setInvites([]));
  }
  useEffect(() => { if (isSuper) loadInvites(); }, [isSuper]);

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

  function changeRole(advisor: any, role: string) {
    if (!window.confirm("Make " + advisor.name + " " + (role === "admin" ? "an admin" : "an advisor") + "?")) return;
    setBusyId(advisor.id);
    adminUpdateAdvisor(advisor.id, { role })
      .then(() => { setBusyId(null); toast(advisor.name + " is now " + role, "success"); load(); })
      .catch((e: any) => { setBusyId(null); toast(errText(e), "error"); });
  }
  function inviteAction(inv: any, what: "resend" | "cancel") {
    if (what === "cancel" && !window.confirm("Cancel the invitation to " + inv.email + "?")) return;
    setBusyId(inv.id);
    (what === "resend" ? adminResendAdvisorInvite(inv.id) : adminCancelAdvisorInvite(inv.id))
      .then(() => { setBusyId(null); toast(what === "resend" ? "Invitation sent again to " + inv.email : "Invitation cancelled", "success"); loadInvites(); })
      .catch((e: any) => { setBusyId(null); toast(errText(e), "error"); });
  }

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
        <>
          {isSuper ? (
            <button className="taw-btn taw-btn--accent taw-btn--sm" onClick={() => setAdding((v) => !v)}>
              <Icon name="user" size={13} /> Add advisor
            </button>
          ) : null}
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => { load(); if (isSuper) loadInvites(); }} disabled={loading} aria-label="Refresh advisors">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        </>
      }
    >
      <div style={{ padding: 16 }}>
        {isSuper && adding ? <AddAdvisorForm onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); loadInvites(); }} /> : null}
        {isSuper && invites.length ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--taupe)", marginBottom: 6 }}>Waiting to join</div>
            <div className="taw-qlist">
              {invites.map((inv: any) => (
                <div key={inv.id} className="taw-qrow">
                  <div className="taw-qrow-main">
                    <div className="taw-qrow-top">
                      <span className="taw-qtype taw-icrow"><Icon name="user" size={13} />{inv.name}</span>
                      <span className="taw-qbadge">{inv.role}</span>
                    </div>
                    <div className="taw-qrow-meta">
                      <span>{inv.email}</span>
                      <span className="taw-status taw-status--PENDING">{inv.status === "email_failed" ? "email failed" : "invited"}</span>
                    </div>
                  </div>
                  <div className="taw-qrow-actions" style={{ display: "flex", gap: 8 }}>
                    <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busyId === inv.id} onClick={() => inviteAction(inv, "resend")}>Resend</button>
                    <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busyId === inv.id} onClick={() => inviteAction(inv, "cancel")}>Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
                    {a.super_admin ? <span className="taw-qbadge" style={{ background: "var(--ink, #171310)", color: "#fff" }}>Super admin</span> : null}
                  </div>
                  <div className="taw-qrow-meta">
                    <span>{a.email}</span>
                    <span className={cx("taw-status", "taw-status--" + (a.status === "active" ? "BOOKED" : "CANCELLED"))}>{a.status}</span>
                  </div>
                </div>
                {isSuper && !a.super_admin ? (
                  <div className="taw-qrow-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select className="taw-input" style={{ width: 120 }} value={a.role === "admin" ? "admin" : a.role === "advisor" ? "advisor" : ""} disabled={busyId === a.id}
                      onChange={(e) => e.target.value && e.target.value !== a.role && changeRole(a, e.target.value)} aria-label={"Role of " + a.name}>
                      {a.role !== "admin" && a.role !== "advisor" ? <option value="">{a.role}</option> : null}
                      <option value="advisor">Advisor</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      className={cx("taw-btn", "taw-btn--sm", a.status === "active" ? "taw-btn--danger" : "taw-btn--accent")}
                      disabled={busyId === a.id}
                      onClick={() => toggleStatus(a)}
                    >
                      {busyId === a.id ? <Spinner /> : <Icon name={a.status === "active" ? "alert" : "check"} size={13} />}
                      {a.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                ) : null}
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

// "Advisor work": what every advisor is working on. A row per advisor (enquiries, orders, people approved, itineraries, last active);
// open one to see their enquiries with the customer, their orders and the people they approved. Read-only.
function AdvisorWorkSection() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<any>(null);
  const [pick, setPick] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const when = (t: any) => (t ? fmtDate(t) + " " + fmtTime(t) : "—");

  function load() {
    setErr(null);
    adminAdvisorWork().then((l: any) => setRows(Array.isArray(l) ? l : [])).catch((e: any) => { setErr(errText(e)); setRows([]); });
  }
  useEffect(load, []);
  function open(a: any) {
    if (pick && pick.id === a.id) { setPick(null); setDetail(null); return; }
    setPick(a); setDetail(null); setBusy(true);
    adminAdvisorWorkDetail(a.id).then((d: any) => { setDetail(d); setBusy(false); }).catch((e: any) => { setBusy(false); toast(errText(e), "error"); });
  }
  return (
    <Card
      title="Advisor work"
      icon={<Icon name="trend" size={18} />}
      sub="What each advisor is handling"
      actions={<button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} aria-label="Refresh advisor work"><Icon name="refresh" size={14} /></button>}
    >
      <div style={{ padding: 16 }}>
        {err ? <div className="taw-banner taw-banner--err"><Icon name="alert" size={16} />{err}</div> : null}
        {rows == null ? <div className="taw-skel" style={{ height: 120 }} /> : !rows.length ? <Empty icon={<Icon name="user" size={28} />}>No advisors yet.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table className="taw-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--taupe)" }}>
                  <th style={{ padding: "6px 8px" }}>Advisor</th><th>Enquiries</th><th>Open</th><th>Orders</th><th>Order value</th><th>Approved people</th><th>Itineraries</th><th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id} onClick={() => open(a)} style={{ cursor: "pointer", borderTop: "1px solid var(--line, rgba(0,0,0,.08))", background: pick && pick.id === a.id ? "var(--card, rgba(0,0,0,.03))" : undefined }}>
                    <td style={{ padding: "10px 8px" }}>
                      <b>{a.name}</b> <span className="taw-qbadge">{a.role}</span>
                      {a.status !== "active" ? <span className="taw-status taw-status--CANCELLED" style={{ marginLeft: 6 }}>{a.status}</span> : null}
                      <div style={{ fontSize: 12, color: "var(--taupe)" }}>{a.email}</div>
                    </td>
                    <td>{a.enquiries}</td><td>{a.open_enquiries}</td><td>{a.orders}</td><td>{a.orders_value ? inr(a.orders_value) : "—"}</td><td>{a.approved_people}</td><td>{a.itineraries}</td>
                    <td style={{ fontSize: 12.5 }}>{when(a.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pick ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{pick.name}&apos;s work</div>
            {busy || !detail ? <div className="taw-skel" style={{ height: 90 }} /> : (
              <>
                <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--taupe)", margin: "6px 0" }}>Enquiries ({detail.enquiries.length})</div>
                {detail.enquiries.length ? (
                  <div className="taw-qlist">
                    {detail.enquiries.map((e: any) => (
                      <div key={e.id} className="taw-qrow">
                        <div className="taw-qrow-main">
                          <div className="taw-qrow-top">
                            <span className="taw-qtype taw-icrow"><Icon name="user" size={13} />{e.customer}</span>
                            <span className="taw-qbadge">{e.status}</span>
                            {e.has_itinerary ? <span className="taw-qbadge">itinerary</span> : null}
                          </div>
                          <div className="taw-qrow-meta"><span>{e.message || "No message"}</span><span>{when(e.created_at)}</span></div>
                          {e.last_saved_at ? <div style={{ fontSize: 12, color: "var(--taupe)" }}>Itinerary last saved {when(e.last_saved_at)}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="taw-muted">No enquiries assigned.</div>}
                <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--taupe)", margin: "14px 0 6px" }}>Orders ({detail.orders.length})</div>
                {detail.orders.length ? (
                  <div className="taw-qlist">
                    {detail.orders.map((o: any) => (
                      <div key={o.id} className="taw-qrow">
                        <div className="taw-qrow-main">
                          <div className="taw-qrow-top"><span className="taw-qtype">{o.order_number || shortId(o.id)} · {o.customer_name || "Customer"}</span><span className="taw-qbadge">{o.status}</span></div>
                          <div className="taw-qrow-meta"><span>{o.total_amount ? inr(o.total_amount) : "—"}</span><span>{when(o.created_at)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="taw-muted">No orders.</div>}
                <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--taupe)", margin: "14px 0 6px" }}>People they approved to join ({detail.approvals.length})</div>
                {detail.approvals.length ? (
                  <div className="taw-qlist">
                    {detail.approvals.map((p: any) => (
                      <div key={p.id} className="taw-qrow"><div className="taw-qrow-main"><div className="taw-qrow-top"><span className="taw-qtype">{p.full_name}</span></div><div className="taw-qrow-meta"><span>{p.destination || ""}</span><span>{when(p.reviewed_at)}</span></div></div></div>
                    ))}
                  </div>
                ) : <div className="taw-muted">None.</div>}
              </>
            )}
          </div>
        ) : <div style={{ fontSize: 12.5, color: "var(--taupe)", marginTop: 12 }}>Click an advisor to see their enquiries, orders and approvals.</div>}
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

// SuperKeysList: fixed codes anyone can enter with no approval. Each shows how many
// times it was used and the latest entries; an entry shows where the visitor came in from
// when they pressed "Allow location" on the claim page. The switch turns a key off.
const keyEnded = (k: any) => !!k.expires_at && new Date(k.expires_at).getTime() <= Date.now();

function SuperKeysList({ keys, loading, onToggle, busyCode }: { keys: any[]; loading: boolean; onToggle: (k: any) => void; busyCode: string | null }) {
  if (loading && !keys.length) return <div className="taw-skel" style={{ height: 96 }} />;
  if (!keys.length) return <Empty icon={<Icon name="shield" size={28} />}>No super keys yet.</Empty>;
  const where = (e: any) => {
    if (e.location_allowed === true) return e.place || "Location allowed (place not found)";
    if (e.location_allowed === false) return "Location not shared";
    return "Location not answered";
  };
  return (
    <>
      {keys.map((k: any) => (
        <div key={k.code} style={{ marginBottom: 18 }}>
          <div className="taw-qrow-top">
            <span className="taw-qtype taw-icrow">
              <Icon name="shield" size={13} />
              <b style={{ fontFamily: "monospace" }}>{k.code}</b>
              {k.label ? " · " + k.label : ""}
            </span>
            <span className={cx("taw-status", "taw-status--" + (k.active && !keyEnded(k) ? "success" : "danger"))}>{keyEnded(k) ? "Ended" : k.active ? "On" : "Off"}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
            Entered <b>{k.total_entries}</b> {k.total_entries === 1 ? "time" : "times"}
            {k.last_entered_at ? " · last " + fmtDate(k.last_entered_at) + " " + fmtTime(k.last_entered_at) : ""}
            {k.total_entries ? " · " + k.located_entries + " shared a location" : ""}
            {k.expires_at ? (keyEnded(k) ? " · ended " : " · ends ") + fmtDate(k.expires_at) : ""}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {k.link ? (
              <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={() => copyText(k.link, "Link copied")}>
                <Icon name="note" size={13} /> Copy link
              </button>
            ) : null}
            <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busyCode === k.code} onClick={() => onToggle(k)}>
              {busyCode === k.code ? <Spinner /> : null}
              {k.active ? "Turn key off" : "Turn key on"}
            </button>
          </div>
          {k.entries.length ? (
            <div className="taw-qlist" style={{ marginTop: 10 }}>
              {k.entries.map((e: any) => (
                <div key={e.id} className="taw-qrow" style={{ display: "block" }}>
                  <div className="taw-qrow-top">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="compass" size={13} />
                      {where(e)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--taupe)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {fmtDate(e.entered_at)} {fmtTime(e.entered_at)}
                      <SignOutMenu entryId={e.id} name="This guest" />
                    </span>
                  </div>
                </div>
              ))}
              {k.total_entries > k.entries.length ? (
                <div style={{ fontSize: 12, color: "var(--taupe)", marginTop: 6 }}>Showing the latest {k.entries.length} of {k.total_entries}.</div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--taupe)", marginTop: 10 }}>Nobody has used this key yet.</div>
          )}
        </div>
      ))}
    </>
  );
}

// AccessRequestsSection (Phase C, 2026-09-16) — reviews site_access_requests
// (strangers applying via the site's Request Access form). Reads and decides
// through adminbe's admin-only /admin/access-requests endpoints (services/
// api.ts's siteAccessRequests* calls, 2026-10-09), which re-check the
// advisor's admin role server-side on every call — this panel's own
// isAdmin() gate is only a UI convenience.
// `limited` is the advisor's version (Approvals > Access requests): pending and approved only. Super keys, code sharing, sign-out and taking
// access back stay with the admins.
export function AccessRequestsSection({ limited = false }: { limited?: boolean }) {
  const [rows, setRows] = useState<any>(null);
  // noCode — approved before approval minted a code, so they can't sign in
  // (and their WhatsApp itinerary links can't open). approve() issues one.
  const [noCode, setNoCode] = useState<any[]>([]);
  // Pending | Approved tabs; `approved` is every approved request with its claim state.
  const [tab, setTab] = useState<"pending" | "approved" | "superkey">("pending");
  const [approved, setApproved] = useState<any[]>([]);
  const [superKeys, setSuperKeys] = useState<any[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<any>(null);
  const [busyId, setBusyId] = useState<any>(null);
  // justApproved — a freshly-generated code/link/email-status has nowhere
  // else to surface except this panel: keyed by request id.
  //
  // FIXED (2026-09-17, direct request — investigated, not assumed): this
  // used to be looked up as justApproved[r.id] INSIDE pending.map(...), so
  // the banner could only ever render for a row still present in the
  // pending list. But approve()'s own load() call re-fetches "pending
  // only" immediately afterward, which removes the just-approved row from
  // that list — so despite this state surviving, the banner that was
  // supposed to show it never actually had anywhere left to render. Now
  // rendered as its own persistent section below (see approvedEntries),
  // independent of whether the row is still pending, with a dismiss
  // button so it doesn't have to disappear entirely on refresh.
  const [justApproved, setJustApproved] = useState<any>({});

  function dismissApproved(id: string) {
    setJustApproved((prev: any) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function load() {
    setLoading(true);
    setErr(null);
    siteAccessRequestsPending()
      .then((list: any) => {
        setRows(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((e: any) => {
        setErr(errText(e));
        setLoading(false);
      });
    siteAccessRequestsMissingCode()
      .then((list: any) => setNoCode(Array.isArray(list) ? list : []))
      .catch(() => setNoCode([]));
    siteAccessRequestsApproved()
      .then((list: any) => setApproved(Array.isArray(list) ? list : []))
      .catch(() => setApproved([]));
    if (!limited) {
      siteSuperKeys()
        .then((list: any) => setSuperKeys(Array.isArray(list) ? list : []))
        .catch(() => setSuperKeys([]));
    }
  }
  useEffect(load, []);

  function toggleSuperKey(k: any) {
    setBusyKey(k.code);
    siteSetSuperKeyActive(k.code, !k.active)
      .then(() => {
        setBusyKey(null);
        toast("Super key " + k.code + (k.active ? " turned off. Nobody can enter with it." : " turned on."), "success");
        load();
      })
      .catch((e: any) => {
        setBusyKey(null);
        toast(errText(e), "error");
      });
  }

  // How many people each pending request's invitation will admit (default: just them), picked before approving.
  const [seatPick, setSeatPick] = useState<any>({});

  function approve(row: any, opts?: { newCode?: boolean }) {
    setBusyId(row.id);
    siteApproveAccessRequest(row.id, { seats: seatPick[row.id] || 1, ...(opts?.newCode ? { new_code: true } : {}) })
      .then((result: any) => {
        setBusyId(null);
        setJustApproved((prev: any) => ({ ...prev, [row.id]: { ...result, full_name: row.full_name, email: row.email } }));
        // FIXED (2026-09-17, direct request): this toast used to be a
        // static string claiming the email was "not yet emailed — send
        // manually", regardless of what actually happened. Phase 5 sends
        // for real now, and the backend already returns result.email_sent
        // — read it instead of hardcoding a stale claim.
        // One person, one code (2026-10-22): someone who already has a code
        // (same phone or email) keeps it; no second code is issued.
        if (result && result.already_member) {
          toast(row.full_name + " is already a member — existing code " + result.code + " (same " + (result.matched_on || "details") + "). No new code issued.", "success");
          load();
          return;
        }
        if (opts?.newCode) {
          toast(result && result.email_sent
            ? "New code " + result.code + " sent to " + row.email
            : "New code " + (result && result.code) + " made for " + row.email + ", but the email did NOT send (see below)", result && result.email_sent ? "success" : "error");
          load();
          return;
        }
        toast(
          result && result.email_sent
            ? "Approved " + row.full_name + " — invitation email sent to " + row.email
            : "Approved " + row.full_name + " — code generated, but the email did NOT send (see below)",
          result && result.email_sent ? "success" : "error"
        );
        load();
      })
      .catch((e: any) => {
        setBusyId(null);
        toast(errText(e), "error");
      });
  }

  function deny(row: any) {
    const declineReason = window.prompt("Reason for declining " + row.full_name + "'s request (optional). They cannot send another request for 24 hours:", "") || undefined;
    setBusyId(row.id);
    siteDenyAccessRequest(row.id, declineReason)
      .then(() => {
        setBusyId(null);
        toast("Declined " + row.full_name + "'s request. They can apply again after 24 hours.", "success");
        load();
      })
      .catch((e: any) => {
        setBusyId(null);
        toast(errText(e), "error");
      });
  }

  // One search box for all three tabs. "Starts with" matching on the person's own details only: any word of the
  // name (so "b" finds Bhanumathi and "gu" finds Supreet Gupta), the start of the email, the start of the phone
  // number and the start of the code or super-key label. Fields like "approved by" are deliberately not searched.
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const words = (v: any) => String(v == null ? "" : v).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const startsWord = (v: any) => {
    const txt = String(v == null ? "" : v).toLowerCase().trim();
    return !!txt && (txt.startsWith(needle) || words(txt).some((w) => w.startsWith(needle)));
  };
  const matches = (r: any) => {
    if (!needle) return true;
    if (!r) return false;
    if ([r.name, r.full_name, r.first_name, r.last_name, r.label].some(startsWord)) return true;
    if (String(r.email || "").toLowerCase().startsWith(needle)) return true;
    const digits = needle.replace(/\D/g, "");
    if (digits) {
      const ph = String(r.phone || "").replace(/\D/g, "");
      if (ph && (ph.startsWith(digits) || ph.slice(-10).startsWith(digits))) return true;
    }
    const compact = needle.replace(/[\s-]/g, "");
    return [r.code, r.pretty_code].some((c) => !!c && String(c).toLowerCase().replace(/-/g, "").startsWith(compact));
  };
  const pending = (rows || []).filter(matches);
  const noCodeShown = noCode.filter(matches);
  const approvedShown = approved.filter(matches);
  const superKeysShown = superKeys.filter(matches);

  const searchBar = (
        <div className={cx("taw-search", needle && "has-value")}>
          <span className="taw-search-ico">
            <Icon name="search" size={15} />
          </span>
          <input
            className="taw-search-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search name, email, phone, code"
            aria-label="Search access requests"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
            }}
          />
          {needle ? (
            <span className="taw-search-count" aria-live="polite">
              {tab === "pending" ? pending.length + noCodeShown.length : tab === "approved" ? approvedShown.length : superKeysShown.length}{" "}
              found
            </span>
          ) : null}
          {q ? (
            <button className="taw-search-clear" onClick={() => setQ("")} aria-label="Clear search" type="button">
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </div>
  );

  return (
    <Card
      title="Access requests"
      icon={<Icon name="inbox" size={18} />}
      sub={pending.length ? pending.length + " pending" : ""}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {searchBar}
          <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh access requests">
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />}
          </button>
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        {err ? (
          <div className="taw-banner taw-banner--err">
            <Icon name="alert" size={16} />
            {err}
          </div>
        ) : null}
        <div className="taw-tabs" role="tablist" style={{ marginBottom: 12, padding: 0 }}>
          <button className={cx("taw-tab", tab === "pending" && "is-active")} role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")}>
            Pending <span className="pill">{pending.length}</span>
          </button>
          <button className={cx("taw-tab", tab === "approved" && "is-active")} role="tab" aria-selected={tab === "approved"} onClick={() => setTab("approved")}>
            Approved requests <span className="pill">{approvedShown.length}</span>
          </button>
{limited ? null : (
          <button className={cx("taw-tab", tab === "superkey" && "is-active")} role="tab" aria-selected={tab === "superkey"} onClick={() => setTab("superkey")}>
            Super key <span className="pill">{needle ? superKeysShown.length : superKeys.reduce((n: number, k: any) => n + (k.total_entries || 0), 0)}</span>
          </button>
)}
        </div>
        {/* FIXED (2026-09-17, direct request): rendered here, independent
            of `pending` — the old version of this lived inside
            pending.map(...) and could only show for a row still in that
            list, but load() removes the just-approved row from it
            immediately, so it never actually appeared. Stays visible
            (with a dismiss button) until the admin clears it, and now
            shows the real email_sent outcome instead of a hardcoded
            "not yet emailed" claim. */}
        {Object.keys(justApproved).length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {Object.entries(justApproved).map(([id, a]: [string, any]) => (
              <div key={id} className="taw-banner" style={{ position: "relative", paddingRight: 40 }}>
                <div>
                  <Icon name={a.email_sent || a.already_member ? "check" : "alert"} size={14} />
                  <b>{a.full_name}</b> ({a.email}) — approved.{" "}
                  <span className={cx("taw-status", "taw-status--" + (a.email_sent || a.already_member ? "success" : "danger"))}>
                    {a.already_member ? "Already a member — no new code" : a.email_sent ? "Invitation email sent" : "Email failed to send"}
                  </span>
                </div>
                <div style={{ marginTop: 6 }}>
                  Code: <b style={{ fontFamily: "monospace" }}>{prettyCode(a.code)}</b>
                  {a.seats > 1 ? ` — for up to ${a.seats} people; add the others from the Approved requests tab` : ""}
                  {a.already_member
                    ? ` — their existing code (same ${a.matched_on || "details"}); they sign in with it.`
                    : !a.email_sent ? " — the email did not go out, so send it to them yourself:" : " — or send it to them yourself:"}
                </div>
                {!a.already_member && a.code && a.link ? (
                  <ShareBar code={a.code} link={a.link} phone={a.phone} firstName={a.first_name} />
                ) : null}
                {a.already_member && a.matched_on === "phone" && a.email ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 6 }}>
                      Only the phone number matched, and {a.email} is a different address. If this is the same person with a second email, they can have
                      their own code and sign in with that email (a separate login and chat from the existing code).
                    </div>
                    <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busyId === id} onClick={() => approve({ id, email: a.email, full_name: a.full_name }, { newCode: true })}>
                      {busyId === id ? <Spinner /> : <Icon name="check" size={13} />}
                      Send a new code to {a.email}
                    </button>
                  </div>
                ) : null}
                <button
                  className="taw-btn taw-btn--ghost taw-btn--sm"
                  style={{ position: "absolute", top: 10, right: 10 }}
                  onClick={() => dismissApproved(id)}
                  aria-label={"Dismiss " + a.full_name + "'s approval notice"}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {tab === "pending" ? (
          <>
        {loading && rows == null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="taw-skel" style={{ height: 96 }} />
            ))}
          </div>
        ) : pending.length ? (
          <div className="taw-qlist">
            {pending.map((r: any) => {
              return (
                <div key={r.id} className="taw-qrow" style={{ display: "block" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                    <div className="taw-qrow-main">
                      <div className="taw-qrow-top">
                        <span className="taw-qtype taw-icrow">
                          <Icon name="user" size={13} />
                          {/* first_name/last_name are the authoritative name fields
                              (2026-09-17, direct request) — full_name is only a
                              backward-compat fallback for a pre-migration row that
                              never got backfilled for some reason. */}
                          {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : r.full_name}
                        </span>
                        <span className="taw-qstate info">{fmtDate(r.created_at)} {fmtTime(r.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
                        {r.email} · {r.phone}{r.city ? " · " + r.city : ""}
                      </div>
                      {(r.destination || r.travel_date) ? (
                        <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 5 }}>
                          {r.destination ? "Wants to go: " + r.destination : ""}
                          {r.destination && r.travel_date ? " · " : ""}
                          {r.travel_date ? "When: " + r.travel_date : ""}
                        </div>
                      ) : null}
                      {r.reason ? <div style={{ fontSize: 12.5, color: "var(--taupe)", marginTop: 5 }}>{r.reason}</div> : null}
                    </div>
                    <div className="taw-qrow-actions">
                      <select
                        className="taw-sel taw-sel--sm"
                        aria-label={"Who can use " + (r.first_name || r.full_name || "this") + "'s invitation"}
                        title="Who can use this invitation"
                        value={seatPick[r.id] || 1}
                        disabled={busyId === r.id}
                        onChange={(ev) => setSeatPick((p: any) => ({ ...p, [r.id]: Number(ev.target.value) }))}
                      >
                        {SEAT_CHOICES.map((n) => (
                          <option key={n} value={n}>
                            {seatChoiceLabel(n)}
                          </option>
                        ))}
                      </select>
                      <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                        {busyId === r.id ? <Spinner /> : <Icon name="check" size={13} />}
                        Approve
                      </button>
                      <button className="taw-btn taw-btn--ghost taw-btn--sm" disabled={busyId === r.id} onClick={() => deny(r)}>
                        <Icon name="x" size={13} />
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Icon name="inbox" size={28} />}>{needle ? "No pending requests match \"" + q.trim() + "\"." : "No pending access requests."}</Empty>
        )}
        {noCodeShown.length ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Approved without a code</div>
            <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 10 }}>
              Approved before codes were issued automatically, so they can't sign in or open itinerary links. Issuing a
              code emails it to them.
            </div>
            <div className="taw-qlist">
              {noCodeShown.map((r: any) => (
                <div key={r.id} className="taw-qrow" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                  <div className="taw-qrow-main">
                    <span className="taw-qtype taw-icrow">
                      <Icon name="user" size={13} />
                      {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : r.full_name}
                    </span>
                    <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
                      {r.email} · {r.phone}
                    </div>
                  </div>
                  <div className="taw-qrow-actions">
                    <button className="taw-btn taw-btn--accent taw-btn--sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                      {busyId === r.id ? <Spinner /> : <Icon name="check" size={13} />}
                      Issue code
                    </button>
                    <button className="taw-btn taw-btn--sm" style={{ marginTop: 6 }} disabled={busyId === r.id} onClick={() => approve(r, { newCode: true })}
                      title="Gives this email its own code even if its phone number belongs to a member">
                      New code for this email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
          </>
        ) : tab === "approved" ? (
          <ApprovedRequestsList rows={approvedShown} loading={loading} onChanged={load} limited={limited} />
        ) : (
          <>
            <NewSuperKeyForm onCreated={load} />
            <SuperKeysList keys={superKeysShown} loading={loading} onToggle={toggleSuperKey} busyCode={busyKey} />
          </>
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

  const [sub, setSub] = useState("orders"); // agents | advisor-work (admins) | orders | enquiries | access-requests | api-costs
  const [isTeamAdmin, setIsTeamAdmin] = useState(false);
  const picked = useRef(false);
  useEffect(() => {
    adminMe()
      .then((m: any) => {
        const a = !!(m && m.is_admin);
        setIsTeamAdmin(a);
        if (a && !picked.current) setSub("agents");
      })
      .catch(() => setIsTeamAdmin(false));
  }, []);
  function SubBtn(key: string, icon: string, label: string) {
    return (
      <button key={key} className={cx("taw-desk-tab", sub === key && "is-active")} role="tab" aria-selected={sub === key ? "true" : "false"} onClick={() => { picked.current = true; setSub(key); }}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="taw-fade-in">
      <Card title="Admin" icon={<Icon name="shield" size={18} />} sub="Orders · enquiry assignment · access requests · API costs (agents and advisor work: admins)">
        <div className="taw-desk-tabs" role="tablist" aria-label="Admin view" style={{ marginBottom: 16 }}>
          {isTeamAdmin ? SubBtn("agents", "user", "Agents") : null}
          {isTeamAdmin ? SubBtn("advisor-work", "trend", "Advisor work") : null}
          {SubBtn("orders", "luggage", "Orders")}
          {SubBtn("enquiries", "inbox", "Enquiry assignment")}
          {SubBtn("access-requests", "mail", "Access requests")}
          {SubBtn("api-costs", "trend", "API costs")}
        </div>
        {sub === "agents" && isTeamAdmin ? (
          <AgentsSection />
        ) : sub === "advisor-work" && isTeamAdmin ? (
          <AdvisorWorkSection />
        ) : sub === "orders" ? (
          <AdminOrdersSection membersById={membersById} advisorsById={advisorsById} />
        ) : sub === "enquiries" ? (
          <EnquiryAssignSection advisors={advisors} />
        ) : sub === "api-costs" ? (
          <ApiCostsSection />
        ) : (
          <AccessRequestsSection />
        )}
      </Card>
    </div>
  );
}
