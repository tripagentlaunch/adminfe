"use client";
/* =============================================================================
 * TripAgent — src/lib/advisorHelpers.ts
 * Small, pure helpers shared across the ported advisor panels (Phase 3+).
 * Ported verbatim from web/js/advisor.js (line ranges noted per function) —
 * these were plain module-scope functions inside advisor.js's IIFE; here
 * they're named exports so panel components can import only what they need.
 * ===========================================================================*/
import { Ic } from "../components/ui";

// pointsOn() — web/js/advisor.js line ~102. Loyalty/points redemption is OFF
// by default; flip window.TA_POINTS_ENABLED = true to re-enable.
export function pointsOn() {
  return typeof window !== "undefined" && (window as any).TA_POINTS_ENABLED === true;
}

// canSeeMargin() — web/js/advisor.js line ~82. Margin disclosure is
// HEAD-OF-BUSINESS ONLY; advisors and members never see it by default.
export function canSeeMargin() {
  return typeof window !== "undefined" && ((window as any).TA_ROLE === "head_of_business" || (window as any).TA_SHOW_MARGIN === true);
}

// isAdmin() — same window.TA_ROLE the Gate sets (see AdvisorLoginGate.jsx),
// gating the Admin tab. The backend re-checks this independently on every
// /admin/* call (get_current_admin) — this is a UI convenience, not the
// authority.
export function isAdmin() {
  return typeof window !== "undefined" && (window as any).TA_ROLE === "admin";
}

// marginHealth(frac) — web/js/advisor.js line ~109. Band: floor 8%, cap 28% of sell.
export function marginHealth(frac: any) {
  var n = Number(frac);
  if (!isFinite(n)) n = 0;
  if (n < 0.08) return { cls: "low", txt: "Below target margin" };
  if (n <= 0.28) return { cls: "ok", txt: "Healthy margin" };
  return { cls: "high", txt: "Premium markup" };
}

// pct(frac) — web/js/advisor.js line ~72.
export function pct(frac: any) {
  var n = Number(frac);
  if (!isFinite(n)) n = 0;
  return (n * 100).toFixed(1) + "%";
}

// shortId(id) — web/js/advisor.js line ~116.
export function shortId(id: any) {
  if (!id) return "—";
  return String(id).slice(0, 8);
}

// r(n) — web/js/advisor.js line ~147. INR whole-number rounder (money is
// integer INR throughout).
export function r(n: any) {
  return Math.round(Number(n) || 0);
}

// fmtDate(d) / fmtTime(d) — web/js/advisor.js line ~121/128.
export function fmtDate(d: any) {
  if (!d) return "";
  try {
    var dt = new Date(d);
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch (e) {
    return String(d);
  }
}
export function fmtTime(d: any) {
  if (!d) return "";
  try {
    var dt = new Date(d);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (e) {
    return String(d);
  }
}

// errText(e) — web/js/advisor.js line ~221.
export function errText(e: any) {
  if (!e) return "Unknown error.";
  if (e instanceof Error || e.message) return e.message;
  return String(e);
}

// toast(msg, kind) — web/js/advisor.js line ~227. TA_UI is never loaded in
// this port (ui.js hasn't been converted), so this always falls through to
// the local toast implementation — same effective behavior as the original
// running standalone without ui.js.
export function toast(msg: any, kind?: any) {
  if (typeof window !== "undefined" && (window as any).TA_UI && typeof (window as any).TA_UI.toast === "function") {
    try {
      (window as any).TA_UI.toast(msg, kind);
      return;
    } catch (e) {
      /* fall through */
    }
  }
  var host = document.getElementById("ta-adv-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "ta-adv-toasts";
    host.className = "ta-adv-toasts";
    document.body.appendChild(host);
  }
  var el = document.createElement("div");
  el.className = "ta-toast ta-toast--" + (kind || "info");
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(function () {
    el.classList.add("is-in");
  });
  setTimeout(function () {
    el.classList.remove("is-in");
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 280);
  }, 3600);
}

// enqSla(e) — web/js/advisor.js line ~1600. Response-SLA on an open enquiry
// (CM-014 breach alert / AN-008 response SLA target: 15 business minutes).
export function enqSla(e: any) {
  if (!e || (e.status && e.status !== "open")) return null;
  var t = e.created_at ? new Date(e.created_at).getTime() : 0;
  if (!t) return null;
  var mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  var label = mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h " + (mins % 60) + "m";
  if (mins <= 15) return { cls: "ok", txt: "Awaiting · " + label };
  return { cls: "breach", txt: "SLA breached · " + label };
}

// productIconName / productIcon — web/js/advisor.js line ~773/780.
export function productIconName(p: any) {
  if (p === "flight") return "flight";
  if (p === "hotel") return "hotel";
  if (p === "visa") return "visa";
  if (p === "experience") return "tag";
  return "luggage";
}
export function productIcon(p: any, size?: any) {
  return Ic(productIconName(p), { size: size || 18 });
}

// commsChannelClass(ch) / deliveryStateClass(st) / threadStateClass(st) —
// web/js/advisor.js line ~3579/3586/3594. Chip color classes for the comms
// suite (inbox/thread/templates/delivery).
export function commsChannelClass(ch: any) {
  var s = String(ch || "").toLowerCase();
  if (s === "email") return "info";
  if (s === "whatsapp" || s === "wa") return "ok";
  if (s === "sms") return "warn";
  return "muted";
}
export function deliveryStateClass(st: any) {
  var s = String(st || "").toLowerCase();
  if (s === "delivered" || s === "sent" || s === "read") return "ok";
  if (s === "queued" || s === "pending" || s === "sending") return "info";
  if (s === "suppressed" || s === "skipped" || s === "deferred") return "warn";
  if (s === "failed" || s === "bounced" || s === "undelivered") return "err";
  return "muted";
}
export function threadStateClass(st: any) {
  var s = String(st || "").toLowerCase();
  if (s === "closed" || s === "resolved") return "ok";
  if (s === "waiting" || s === "snoozed" || s === "pending") return "warn";
  if (s === "open" || s === "active") return "info";
  return "muted";
}

// capLabel(n) — compact Indian-lakh/crore shorthand for a budget cap, new
// 2026-09-02 for Member360's "Cap ₹2.4L" chip. inr() (services/api.ts)
// gives the full grouped figure ("₹2,40,000") which is right for a line
// item but too long for a small pill chip next to route/pax — this trims
// it to the shorthand an advisor would actually say out loud.
//   capLabel(240000)   -> "₹2.4L"
//   capLabel(15000000) -> "₹1.5Cr"
//   capLabel(45000)    -> "₹45K"
export function capLabel(n: any) {
  var v = Number(n);
  if (!isFinite(v) || v <= 0) return "—";
  if (v >= 10000000) return "₹" + trimZero(v / 10000000) + "Cr";
  if (v >= 100000) return "₹" + trimZero(v / 100000) + "L";
  if (v >= 1000) return "₹" + trimZero(v / 1000) + "K";
  return "₹" + v;
}
function trimZero(n: number) {
  return n.toFixed(1).replace(/\.0$/, "");
}

// todayISO(offsetDays) — web/js/advisor.js line ~136.
export function todayISO(offsetDays?: any) {
  var dt = new Date();
  dt.setDate(dt.getDate() + (offsetDays || 0));
  return dt.toISOString().slice(0, 10);
}

// uniqId() — web/js/advisor.js line ~142.
export function uniqId() {
  return "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// fareBrand(d) — web/js/advisor.js line ~791. Derives a branded-fare label
// honestly from cabin + refundability (the levers branded fares actually
// differ on); premium cabins keep their cabin name.
export function fareBrand(d: any) {
  var cab = (d && d.cabin) || "economy";
  if (cab === "business") return "Business";
  if (cab === "first") return "First";
  if (cab === "premium_economy") return "Premium";
  return d && d.refundable ? "Flex" : "Lite";
}

// Cart-item builders — web/js/advisor.js line ~799/821/842. Map raw offers
// (from search) into the shape the pricing engine reads (type + baseNet +
// label fields).
export function flightCartItem(offer: any) {
  var d = offer.detail || {};
  var net = Number(offer.base_net != null ? offer.base_net : offer.baseNet != null ? offer.baseNet : d.baseNet) || 0;
  return {
    _cid: uniqId(),
    type: "flight",
    product: "flight",
    baseNet: net,
    international: !!(offer.international || d.international),
    airlineName: d.airlineName || d.airline,
    airline: d.airline,
    flightNo: d.flightNo,
    originCode: d.originCode,
    destCode: d.destCode,
    cabin: d.cabin,
    pax: d.pax,
    refundable: d.refundable,
    _title: (d.airlineName || d.airline || "Flight") + " " + (d.flightNo || ""),
    _sub: (d.originCode || "") + " → " + (d.destCode || "") + (d.duration ? " · " + d.duration : ""),
    _detail: d,
  };
}
export function hotelCartItem(offer: any) {
  var d = offer.detail || {};
  var net = Number(offer.base_net != null ? offer.base_net : offer.baseNet != null ? offer.baseNet : d.baseNet) || 0;
  return {
    _cid: uniqId(),
    type: "hotel",
    product: "hotel",
    baseNet: net,
    international: !!(offer.international || d.international),
    hotelName: d.hotelName,
    cityName: d.cityName,
    nights: d.nights,
    stars: d.stars,
    board: d.board,
    roomType: d.roomType,
    refundable: d.refundable,
    _title: d.hotelName || "Hotel",
    _sub: (d.cityName || "") + (d.nights ? " · " + d.nights + "N" : "") + (d.roomType ? " · " + d.roomType : ""),
    _detail: d,
  };
}
// softNotice(msg) — web/js/advisor.js line ~5322. A calm "degrade" classifier:
// turns a backend/transport failure into a soft notice when it's a not-live /
// migration / auth gap, and a hard error only for genuine faults.
export function softNotice(msg: any) {
  return /not live|unavailable|not found|404|403|forbidden|not permitted|migration|relation .* does not exist|does not exist|undefined function|no such|required/i.test(
    String(msg || "")
  );
}

// queueSla(dueAt) — web/js/advisor.js line ~208. SLA countdown for queue rows.
export function queueSla(dueAt: any) {
  if (!dueAt) return { label: "No SLA", cls: "muted" };
  var due = new Date(dueAt).getTime();
  if (!isFinite(due)) return { label: "No SLA", cls: "muted" };
  var ms = due - Date.now();
  var abs = Math.abs(ms);
  var hrs = Math.floor(abs / 3600000),
    mins = Math.floor((abs % 3600000) / 60000);
  var human = hrs >= 1 ? hrs + "h " + mins + "m" : mins + "m";
  if (ms <= 0) return { label: "Breached · " + human + " over", cls: "err" };
  if (ms < 2 * 3600000) return { label: "Due in " + human, cls: "warn" };
  return { label: "Due in " + human, cls: "ok" };
}

// sevClass(sev) — web/js/advisor.js line ~4167.
export function sevClass(sev: any) {
  var s = String(sev || "").toLowerCase();
  if (s === "critical") return "err";
  if (s === "major") return "warn";
  if (s === "minor") return "info";
  return "muted";
}

// caseStateClass(state) — web/js/advisor.js line ~197. Servicing-case state ->
// display class for queue chips (mirrors the ServicingPanel taxonomy so the
// queue and the panel read consistently).
export function caseStateClass(state: any) {
  var s = String(state || "").toUpperCase();
  if (s === "CLOSED" || s === "SETTLED" || s === "RECONCILED") return "ok";
  if (s === "REJECTED" || s === "CANCELLED") return "err";
  if (s === "AWAITING_APPROVAL" || s === "ESCALATED") return "warn";
  return "info";
}

export function visaCartItem(offer: any) {
  var d = offer.detail || {};
  var net = Number(offer.base_net != null ? offer.base_net : offer.baseNet != null ? offer.baseNet : d.fee_inr) || 0;
  return {
    _cid: uniqId(),
    type: "visa",
    product: "visa",
    baseNet: net,
    international: true,
    title: (d.visa_type || "Visa") + " — " + (d.destination || ""),
    name: d.destination,
    destination: d.destination,
    nationality: d.nationality,
    pax: d.pax,
    _title: (d.destination || "Visa") + " visa",
    _sub: (d.visa_type || "") + (d.processing_days ? " · " + d.processing_days + "d processing" : "") + (d.pax ? " · " + d.pax + " pax" : ""),
    _detail: d,
  };
}
