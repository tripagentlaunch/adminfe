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
import {
  adminListAdvisors,
  adminUpdateAdvisor,
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
import { cx } from "../../lib/cx";
import { errText, toast, shortId, fmtDate, fmtTime } from "../../lib/advisorHelpers";
import { Card, Empty, Spinner, Icon } from "../ui";
import { ApiCostsSection } from "./ApiCostsSection";

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

// ApprovedRequestsList: requests an advisor approved, each with whether the person has
// claimed their code yet: Claimed (with the date), Pending (code sent, not yet used,
// with its expiry), Expired (the code ran out unclaimed) or No code.
function ApprovedRequestsList({ rows, loading }: { rows: any[]; loading: boolean }) {
  const claimed = rows.filter((r) => r.claim_status === "claimed").length;
  const waiting = rows.filter((r) => r.claim_status === "pending").length;
  const badge = (r: any) => {
    if (r.claim_status === "claimed")
      return { cls: "success", text: "Claimed" + (r.claimed_at ? " " + fmtDate(r.claimed_at) : "") };
    if (r.claim_status === "pending")
      return { cls: "warn", text: "Pending" + (r.expires_at ? ", code expires " + fmtDate(r.expires_at) : "") };
    if (r.claim_status === "expired") return { cls: "danger", text: "Code expired, not claimed" };
    return { cls: "info", text: "No code issued" };
  };
  if (loading && !rows.length) return <div className="taw-skel" style={{ height: 96 }} />;
  if (!rows.length) return <Empty icon={<Icon name="inbox" size={28} />}>No approved requests yet.</Empty>;
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 10 }}>
        {claimed} claimed · {waiting} waiting to claim · {rows.length} approved
      </div>
      <div className="taw-qlist">
        {rows.map((r: any) => {
          const b = badge(r);
          return (
            <div key={r.id} className="taw-qrow" style={{ display: "block" }}>
              <div className="taw-qrow-top">
                <span className="taw-qtype taw-icrow">
                  <Icon name="user" size={13} />
                  {r.name}
                </span>
                <span className={cx("taw-status", "taw-status--" + b.cls)}>{b.text}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
                {r.email} · {r.phone}
                {r.city ? " · " + r.city : ""}
              </div>
              {r.destination || r.travel_date ? (
                <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 5 }}>
                  {r.destination ? "Wants to go: " + r.destination : ""}
                  {r.destination && r.travel_date ? " · " : ""}
                  {r.travel_date ? "When: " + r.travel_date : ""}
                </div>
              ) : null}
              <div style={{ fontSize: 12, color: "var(--taupe)", marginTop: 5 }}>
                Approved{r.approved_by ? " by " + r.approved_by : ""}
                {r.approved_at ? " on " + fmtDate(r.approved_at) + " " + fmtTime(r.approved_at) : ""}
                {r.code ? " · Code " : ""}
                {r.code ? <b style={{ fontFamily: "monospace" }}>{r.code}</b> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// SuperKeysList: fixed codes anyone can enter with no approval. Each shows how many
// times it was used and the latest entries; an entry shows where the visitor came in from
// when they pressed "Allow location" on the claim page. The switch turns a key off.
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
            <span className={cx("taw-status", "taw-status--" + (k.active ? "success" : "danger"))}>{k.active ? "On" : "Off"}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 7 }}>
            Entered <b>{k.total_entries}</b> {k.total_entries === 1 ? "time" : "times"}
            {k.last_entered_at ? " · last " + fmtDate(k.last_entered_at) + " " + fmtTime(k.last_entered_at) : ""}
            {k.total_entries ? " · " + k.located_entries + " shared a location" : ""}
          </div>
          <div style={{ marginTop: 8 }}>
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
                    <span style={{ fontSize: 12, color: "var(--taupe)" }}>
                      {fmtDate(e.entered_at)} {fmtTime(e.entered_at)}
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
function AccessRequestsSection() {
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
    siteSuperKeys()
      .then((list: any) => setSuperKeys(Array.isArray(list) ? list : []))
      .catch(() => setSuperKeys([]));
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

  function approve(row: any) {
    setBusyId(row.id);
    siteApproveAccessRequest(row.id)
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

  const pending = rows || [];

  return (
    <Card
      title="Access requests"
      icon={<Icon name="inbox" size={18} />}
      sub={pending.length ? pending.length + " pending" : ""}
      actions={
        <button className="taw-btn taw-btn--ghost taw-btn--sm" onClick={load} disabled={loading} aria-label="Refresh access requests">
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
        <div className="taw-tabs" role="tablist" style={{ marginBottom: 12, padding: 0 }}>
          <button className={cx("taw-tab", tab === "pending" && "is-active")} role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")}>
            Pending <span className="pill">{pending.length}</span>
          </button>
          <button className={cx("taw-tab", tab === "approved" && "is-active")} role="tab" aria-selected={tab === "approved"} onClick={() => setTab("approved")}>
            Approved requests <span className="pill">{approved.length}</span>
          </button>
          <button className={cx("taw-tab", tab === "superkey" && "is-active")} role="tab" aria-selected={tab === "superkey"} onClick={() => setTab("superkey")}>
            Super key <span className="pill">{superKeys.reduce((n: number, k: any) => n + (k.total_entries || 0), 0)}</span>
          </button>
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
                  Code: <b style={{ fontFamily: "monospace" }}>{a.code}</b>
                  {a.link ? (
                    <>
                      {" "}
                      — <a href={a.link} target="_blank" rel="noreferrer">{a.link}</a>
                    </>
                  ) : null}
                  {a.already_member
                    ? ` — their existing code (same ${a.matched_on || "details"}); they sign in with it.`
                    : !a.email_sent ? " — share this code with them directly." : ""}
                </div>
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
          <Empty icon={<Icon name="inbox" size={28} />}>No pending access requests.</Empty>
        )}
        {noCode.length ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Approved without a code</div>
            <div style={{ fontSize: 12.5, color: "var(--taupe)", marginBottom: 10 }}>
              Approved before codes were issued automatically, so they can't sign in or open itinerary links. Issuing a
              code emails it to them.
            </div>
            <div className="taw-qlist">
              {noCode.map((r: any) => (
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
          </>
        ) : tab === "approved" ? (
          <ApprovedRequestsList rows={approved} loading={loading} />
        ) : (
          <SuperKeysList keys={superKeys} loading={loading} onToggle={toggleSuperKey} busyCode={busyKey} />
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
      <Card title="Admin" icon={<Icon name="shield" size={18} />} sub="Agents · orders · enquiry assignment · access requests · API costs — admin only">
        <div className="taw-desk-tabs" role="tablist" aria-label="Admin view" style={{ marginBottom: 16 }}>
          {SubBtn("agents", "user", "Agents")}
          {SubBtn("orders", "luggage", "Orders")}
          {SubBtn("enquiries", "inbox", "Enquiry assignment")}
          {SubBtn("access-requests", "mail", "Access requests")}
          {SubBtn("api-costs", "trend", "API costs")}
        </div>
        {sub === "agents" ? (
          <AgentsSection />
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
