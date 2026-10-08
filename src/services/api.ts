// @ts-nocheck
// Ported verbatim from advisor-panel/src/lib/api.js (2064 lines). This file is
// pure dynamic JS (untyped payload shapes throughout) — @ts-nocheck keeps the
// port byte-for-byte faithful without fighting strict-mode noImplicitAny on
// every function param; see conversion rule 3 (use any/unknown liberally).
/* =============================================================================
 * TripAgent — src/lib/api.js
 * The live backend client. Ported from web/js/api.js (window.TA_API) into real
 * ES module exports. Every function name, every endpoint URL, every header-
 * building helper (fnHeaders, restHeaders, authBearer) is byte-identical in
 * behavior to the original — this is a port, not a rewrite.
 * ===========================================================================*/
import { accessToken } from "./auth";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseConfig";

// --- Live backend config (publishable anon key — safe for the browser) -----
const URL = SUPABASE_URL;
const KEY = SUPABASE_KEY;

// Server functions live in adminbe (FastAPI) under /fn/<name> — they
// replaced the Supabase edge functions previously called at
// <supabase>/functions/v1/<name>. Same request/response bodies; auth is the
// advisor's Supabase session JWT as the bearer (adminbe verifies it).
const FUNCTIONS_BASE = (process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://127.0.0.1:8787") + "/fn/";
const REST_BASE = URL + "/rest/v1/";

// ---------------------------------------------------------------------------
// Error type — lets callers distinguish HTTP/backend errors from network ones
// and inspect status + the parsed error payload.
// ---------------------------------------------------------------------------
function ApiError(message, info) {
  this.name = "ApiError";
  this.message = message || "Request failed.";
  info = info || {};
  this.status = info.status != null ? info.status : 0;
  this.fn = info.fn || null; // edge function name, if applicable
  this.path = info.path || null; // rest path, if applicable
  this.body = info.body || null; // parsed error body (if any)
  this.cause = info.cause || null; // underlying error (network, parse)
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

// ---------------------------------------------------------------------------
// Header builders
//
// AUTH (Gate 0 Stage 2): when a real Supabase Auth session exists, auth.js
// exposes its access JWT synchronously. We then send that user JWT as the
// Authorization bearer while keeping `apikey: <anon>` — exactly per ADR 0001.
// With NO session (today's default — no login UI yet), authBearer() returns
// null and we fall back to the anon key bearer, so headers are BYTE-IDENTICAL
// to before this change. Never throws.
// ---------------------------------------------------------------------------
function authBearer() {
  try {
    if (typeof accessToken === "function") {
      var t = accessToken();
      if (t) return t;
    }
  } catch (e) {
    /* fail-open to the anon path */
  }
  return null;
}

// No `apikey` header: these go to adminbe, not Supabase, and adminbe's CORS
// only allows Authorization + Content-Type.
function fnHeaders() {
  var jwt = authBearer();
  return {
    Authorization: "Bearer " + (jwt || KEY),
    "Content-Type": "application/json",
  };
}

function restHeaders(extra) {
  var jwt = authBearer();
  var h = {
    apikey: KEY,
    Authorization: "Bearer " + (jwt || KEY),
  };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Response parsing — tolerate empty bodies and non-JSON error pages.
// ---------------------------------------------------------------------------
function parseResponse(res) {
  return res.text().then(function (text) {
    var data = null;
    if (text && text.length) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        // Non-JSON payload (e.g. an HTML error page); keep raw text.
        data = { _raw: text };
      }
    }
    return data;
  });
}

function extractErrorMessage(data, status) {
  if (data && typeof data === "object") {
    if (data.error) {
      return typeof data.error === "string"
        ? data.error
        : data.error.message || JSON.stringify(data.error);
    }
    if (data.message) return data.message;
    if (data.msg) return data.msg;
    if (data.hint) return data.hint;
    if (data._raw && typeof data._raw === "string") {
      return data._raw.slice(0, 300);
    }
  }
  return "Request failed with status " + status + ".";
}

// ---------------------------------------------------------------------------
// call(fn, body) — POST an edge function. Returns parsed JSON (or throws).
// ---------------------------------------------------------------------------
function call(fn, body) {
  if (!fn || typeof fn !== "string") {
    return Promise.reject(new ApiError("call() requires a function name."));
  }
  var url = FUNCTIONS_BASE + encodeURIComponent(fn);
  var payload;
  try {
    payload = JSON.stringify(body == null ? {} : body);
  } catch (e) {
    return Promise.reject(
      new ApiError("Could not serialise request body for " + fn + ".", {
        fn: fn,
        cause: e,
      }),
    );
  }

  return fetch(url, {
    method: "POST",
    headers: fnHeaders(),
    body: payload,
  })
    .then(function (res) {
      return parseResponse(res).then(function (data) {
        if (!res.ok) {
          throw new ApiError(extractErrorMessage(data, res.status), {
            status: res.status,
            fn: fn,
            body: data,
          });
        }
        return data;
      });
    })
    .catch(function (err) {
      if (err instanceof ApiError) throw err;
      // Network / CORS / unexpected failure.
      throw new ApiError(
        "Network error calling " +
          fn +
          ": " +
          (err && err.message ? err.message : err),
        { fn: fn, cause: err },
      );
    });
}

// ---------------------------------------------------------------------------
// callAuthed(fn, body) — same as call(), but NEVER falls back to the anon/
// publishable key. call()/fnHeaders() send `jwt || KEY` because most calls
// must keep working for the anonymous/legacy caller; a caller proving real
// user identity (advisor session resolution) must NOT silently degrade to
// the anon key — that reads to the server as "valid login, not provisioned"
// for an unrelated reason (no JWT was ever sent). Rejects up front, before
// any network call, if no session JWT is present.
// ---------------------------------------------------------------------------
// TEMP DEBUG (remove after root-causing "Not yet provisioned") --------------
function _maskJwt(t) {
  if (!t || typeof t !== "string") return String(t);
  if (t.length <= 20) return t.slice(0, 4) + "…(" + t.length + " chars)";
  return t.slice(0, 12) + "…" + t.slice(-6) + " (" + t.length + " chars)";
}
// -----------------------------------------------------------------------

function callAuthed(fn, body) {
  if (!fn || typeof fn !== "string") {
    return Promise.reject(new ApiError("callAuthed() requires a function name."));
  }
  var jwt = authBearer();
  console.log("[TAL_DEBUG][api.js] callAuthed(" + fn + ") Authorization: Bearer", _maskJwt(jwt));
  if (!jwt) {
    console.warn("[TAL_DEBUG][api.js] callAuthed(" + fn + ") aborted — no jwt from authBearer()");
    return Promise.reject(
      new ApiError("No session JWT available for " + fn + ".", { fn: fn }),
    );
  }
  var url = FUNCTIONS_BASE + encodeURIComponent(fn);
  var payload;
  try {
    payload = JSON.stringify(body == null ? {} : body);
  } catch (e) {
    return Promise.reject(
      new ApiError("Could not serialise request body for " + fn + ".", {
        fn: fn,
        cause: e,
      }),
    );
  }

  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: payload,
  })
    .then(function (res) {
      return parseResponse(res).then(function (data) {
        console.log("[TAL_DEBUG][api.js] callAuthed(" + fn + ") HTTP", res.status, "body ->", JSON.stringify(data));
        if (!res.ok) {
          throw new ApiError(extractErrorMessage(data, res.status), {
            status: res.status,
            fn: fn,
            body: data,
          });
        }
        return data;
      });
    })
    .catch(function (err) {
      if (err instanceof ApiError) throw err;
      console.error("[TAL_DEBUG][api.js] callAuthed(" + fn + ") network error ->", err);
      throw new ApiError(
        "Network error calling " +
          fn +
          ": " +
          (err && err.message ? err.message : err),
        { fn: fn, cause: err },
      );
    });
}

// ---------------------------------------------------------------------------
// db(path) — PostgREST GET read. `path` is everything after /rest/v1/.
//   e.g. db("members?select=*&limit=20")
//   e.g. db("orders?select=*&order=created_at.desc")
// Optional opts: { headers } for things like Prefer/Range/count.
// Returns parsed JSON (array for table reads).
// ---------------------------------------------------------------------------
function db(path, opts?) {
  if (!path || typeof path !== "string") {
    return Promise.reject(new ApiError("db() requires a PostgREST path."));
  }
  // SECURITY: reads route through adminbe's service-role /fn/data-read with a
  // strict table+column allowlist. Once RLS is enabled the public key cannot
  // read tables directly, so member PII (passports) is never browser-exposed.
  var clean = path.charAt(0) === "/" ? path.slice(1) : path;
  var qi = clean.indexOf("?");
  var table = qi === -1 ? clean : clean.slice(0, qi);
  var qs = qi === -1 ? "" : clean.slice(qi + 1);
  var req = { table: table, filters: {} };
  qs.split("&").forEach(function (kv) {
    if (!kv) return;
    var eq = kv.indexOf("=");
    var k = eq === -1 ? kv : kv.slice(0, eq);
    var v = eq === -1 ? "" : decodeURIComponent(kv.slice(eq + 1));
    if (k === "select") return;
    if (k === "limit") {
      var n = parseInt(v, 10);
      if (n) req.limit = n;
      return;
    }
    if (k === "order") {
      var parts = v.split(".");
      req.order = parts[0];
      req.ascending = parts[1] !== "desc";
      return;
    }
    if (v.indexOf("eq.") === 0) v = v.slice(3);
    req.filters[k] = v;
  });
  var url = FUNCTIONS_BASE + "data-read";
  return fetch(url, {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify(req),
  })
    .then(function (res) {
      return parseResponse(res).then(function (data) {
        if (!res.ok) {
          throw new ApiError(extractErrorMessage(data, res.status), {
            status: res.status,
            path: clean,
            body: data,
          });
        }
        return data && data.rows ? data.rows : [];
      });
    })
    .catch(function (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        "Network error reading " +
          clean +
          ": " +
          (err && err.message ? err.message : err),
        { path: clean, cause: err },
      );
    });
}

// Small helper: fetch a single row (or null) from a PostgREST query.
function dbOne(path, opts?) {
  return db(path, opts).then(function (rows) {
    if (Array.isArray(rows)) return rows.length ? rows[0] : null;
    return rows || null;
  });
}

// ---------------------------------------------------------------------------
// inr(n) — Indian Rupee formatter. Amounts are plain integer INR (no paise).
//   inr(199961)        -> "₹1,99,961"
//   inr(199961, {paise:true}) -> "₹1,99,961.00"
//   inr(null)          -> "₹0"
// Uses Intl with the en-IN locale (lakh/crore grouping).
// ---------------------------------------------------------------------------
var _inrFmt = null;
function _getInrFmt(withPaise) {
  // Cache the no-paise formatter (the common case).
  if (!withPaise) {
    if (!_inrFmt) {
      try {
        _inrFmt = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        });
      } catch (e) {
        _inrFmt = null;
      }
    }
    return _inrFmt;
  }
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (e) {
    return null;
  }
}

function inr(n, opts?) {
  opts = opts || {};
  var num = Number(n);
  if (!isFinite(num)) num = 0;
  var fmt = _getInrFmt(!!opts.paise);
  if (fmt) {
    try {
      return fmt.format(num);
    } catch (e) {
      /* fall through to manual formatting */
    }
  }
  // Manual fallback (Indian digit grouping) if Intl is unavailable.
  var neg = num < 0;
  var abs = Math.abs(opts.paise ? num : Math.round(num));
  var whole = Math.floor(abs);
  var frac = opts.paise ? (abs - whole).toFixed(2).slice(1) : "";
  var s = String(whole);
  var lastThree = s.length > 3 ? s.slice(-3) : s;
  var other = s.length > 3 ? s.slice(0, -3) : "";
  if (other) {
    lastThree = "," + lastThree;
    other = other.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  }
  return (neg ? "-₹" : "₹") + other + lastThree + frac;
}

// ---------------------------------------------------------------------------
// Convenience wrappers — one per edge function, in the documented shape.
// Each accepts plain JS args and returns the parsed JSON response promise.
// ---------------------------------------------------------------------------

// --- Services (search) -----------------------------------------------------

// searchFlights({ originCode, destCode, date, pax?, cabin?, member_id?, advisor_id? })
function searchFlights(params) {
  return call("flight-search", params || {});
}

// searchHotels({ city, checkIn, checkOut, rooms?, pax?, member_id?, advisor_id? })
function searchHotels(params) {
  return call("hotel-search", params || {});
}

// searchVisa({ nationality, destination, adult?, child?, infant?, category?,
// billing_state_code? }) — Phase 3: repointed from the legacy Supabase
// visa-search edge function to FastAPI's GET /visa/vendor/search
// (backend/app/routers/visa_router.py), which tries the real OneVasco
// vendor first and falls back to the same DB/hardcoded requirement data the
// edge function used, so the "source" field on the response tells you
// which one answered. Uses fastapiCall() (defined further below) for the
// same bearer-JWT + error-handling contract every other FASTAPI_BASE call
// in this file already uses.
function searchVisa(params) {
  var query = new URLSearchParams(params || {}).toString();
  return fastapiCall("/visa/vendor/search?" + query, { method: "GET" });
}

// visaQueue({ limit? }) — the advisor desk's cross-member visa worklist
// (submitted/in_review/docs_pending). Migrated off the legacy
// visa-application edge function's action=queue onto FastAPI's real
// GET /visa/queue (backend/app/routers/visa_router.py ->
// visa_service.advisor_queue()). Same role gate (ADVISOR_DESK_ROLES is
// byte-identical to the edge function's DECIDE_ROLES) and the same
// cross-advisor status filter, but no advisor_id param: FastAPI derives the
// caller's advisor identity from the session JWT itself
// (get_current_advisor), where the edge function took it explicitly in the
// POST body. Note: VisaDeskQueue.jsx's submit_docs/decide actions are NOT
// migrated here — they still go through callVisa()/the edge function.
function visaQueue(params) {
  var query = new URLSearchParams(params || {}).toString();
  return fastapiCall("/visa/queue" + (query ? "?" + query : ""), { method: "GET" });
}

// visaDecide(applicationId, { decision, note?, notify? }) — advisor
// adjudication (approve/reject). Migrated off the legacy visa-application
// edge function's action=decide onto FastAPI's real
// POST /visa/applications/{id}/decide (backend/app/routers/visa_router.py ->
// visa_service.decide()). No advisor_id/approver_id/approver_role — the
// edge function only ever used advisor_id for its role gate anyway; FastAPI
// derives the same thing from the session JWT. Note the field rename: the
// edge function's "reason" was never actually read server-side (it only
// checked note/decision_note) — FastAPI's field is "note".
function visaDecide(applicationId, payload) {
  return fastapiCall("/visa/applications/" + encodeURIComponent(applicationId) + "/decide", {
    method: "POST",
    body: payload,
  });
}

// commitDocs(applicationId, { documents, notify? }) — advisor-side document
// checklist commit (mark documents collected on someone else's application).
// Migrated off the legacy visa-application edge function's action=submit_docs
// onto FastAPI's real POST /visa/applications/{id}/advisor-commit-docs
// (backend/app/routers/visa_router.py -> visa_service.advisor_submit_docs()),
// gated by the same ADVISOR_DESK_ROLES check as visaQueue()/visaDecide(). No
// advisor_id — FastAPI derives the caller from the session JWT. `documents`
// is the checklist-item shape ([{key, status, ...}]), matching the
// member-owned submit-docs endpoint's contract — NOT the legacy edge
// function's `documents_collected` (array of key strings).
function commitDocs(applicationId, payload) {
  return fastapiCall("/visa/applications/" + encodeURIComponent(applicationId) + "/advisor-commit-docs", {
    method: "POST",
    body: payload,
  });
}

// flightReprice({ offer_id, prior_sell?, member_id? }) — bindable-quote reprice
// before pay (FLT-028/031/036). Returns a SELL-only price-delta + bind TTL.
function flightReprice(params) {
  var body = params || {};
  body.action = "reprice";
  return call("flight-hold", body);
}

// flightHold({ offer_id, member_id? }) — hold a fare as a PNR-with-TTL
// (FLT-032/033/034/035). Creates a HELD order; SELL-only response.
function flightHold(params) {
  var body = params || {};
  body.action = "hold";
  return call("flight-hold", body);
}

// --- Flight desk DEPTH (Wave-1 dedicated functions) ------------------------
// These call the DEDICATED flight depth functions deployed alongside the
// production flight-search engine (NOT data-read). All are NON-MONEY and
// SELL-ONLY: they read an existing offer/order and derive member-safe shop /
// post-ticket surfaces. The actual ticketing / reissue / refund money path
// stays behind order-servicing / booking-saga (FLAGGED, not these).

// flightFares(payload) — flight-fares: shop depth on a selected offer.
//   { action:'fare_rules'|'fare_family'|'ancillaries'|'seatmap'|'seat_select',
//     offer_id, member_id?, advisor_id?, ... }
//   fare_rules   FLT-020/021 — CAT-16 penalties + CAT-31 change rules (sell).
//   fare_family  FLT-018/019 — branded-fare comparison grid + upsell delta.
//   ancillaries  FLT-022    — bags/seats/meals/lounge/wifi sell catalogue.
//   seatmap      FLT-023    — per-segment seat map (read).
//   seat_select  FLT-023/026 — record a NON-MONEY seat/SSR hold (no EMD).
function flightFares(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("flightFares() requires { action, offer_id }."),
    );
  }
  return call("flight-fares", payload);
}

// flightIrrops(payload) — flight-irrops: post-ticket READ + QUOTE previews.
//   { action:'classify'|'reprotect'|'exchange_quote'|'void_quote'|'refund_quote',
//     order_id?, signal?, advisor_id?, member_id?, ... }
// Every action is READ/QUOTE-ONLY. NONE post a ledger, charge, refund, or void
// — the authoritative money execution is FLAGGED (order-servicing/booking-saga).
function flightIrrops(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("flightIrrops() requires { action, ... }."),
    );
  }
  return call("flight-irrops", payload);
}

// flightShop(payload) — flight-shop: stateless browse aids beside flight-search.
//   date_matrix  FLT-007/008 — { action:'date_matrix', originCode, destCode,
//                date, mode?:'nearby'|'cheapest_month', cabin?, pax? }
//   enrich       FLT-015/016/017 — { action:'enrich', offer } -> shop facets.
// SELL-ONLY, no DB writes.
function flightShop(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("flightShop() requires { action, ... }."),
    );
  }
  return call("flight-shop", payload);
}

// --- Hotel desk DEPTH (Wave-1 dedicated functions) -------------------------

// hotelProperty(payload) — hotel-property: PDP read model over an offer.
//   { offer_id, member_id?, advisor_id?, audience?, checkIn?, lang? }
// NET-RATE SUPPRESSION: a member / verified-member session gets the SELL-ONLY
// shape; net/margin room groups attach ONLY for the advisor (non-member) view.
function hotelProperty(payload) {
  if (!payload || typeof payload !== "object" || !payload.offer_id) {
    return Promise.reject(
      new ApiError("hotelProperty() requires { offer_id }."),
    );
  }
  return call("hotel-property", payload);
}

// hotelServicingRead(payload) — hotel-servicing-read: modify/cancel impact
// PREVIEW. { action:'cancel'|'amend', order_id, order_leg_id?, member_id?,
//   advisor_id?, asOf?, propertyTz?, change?, authorisedBy? }
// READ-ONLY + MONEY-SAFE: computes refund/penalty/fee + lifecycle preview from
// the frozen per-rate policy. WRITES NOTHING; the posting is order-servicing.
function hotelServicingRead(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("hotelServicingRead() requires { action, order_id }."),
    );
  }
  return call("hotel-servicing-read", payload);
}

// hotelCommissionRead(payload) — hotel-commission-read: commission / recon
// read model. { advisor_id (REQUIRED), order_id?, from?, to?, status?, limit? }
// ADVISOR-ONLY: this is the one hotel read that exposes net/commission, so it
// is HARD-GATED server-side — a verified MEMBER session is rejected (403) and
// there is NO sell-only variant. advisor_id is mandatory; member.js must never
// reach this.
function hotelCommissionRead(payload) {
  if (!payload || typeof payload !== "object" || !payload.advisor_id) {
    return Promise.reject(
      new ApiError("hotelCommissionRead() requires { advisor_id }."),
    );
  }
  return call("hotel-commission-read", payload);
}

// --- Advisor task engine + analytics (non-money advisor surfaces) ----------

// advisorTasks(payload) — advisor-tasks: the My Day task engine. advisor_id is
// the mandatory ownership/isolation key on every action.
//   list { advisor_id, status?, include_done?, limit? } -> ranked queue + counts
//   create / from_intent / complete / snooze / reassign / cancel
// NON-MONEY: posts no ledger; a payment_pending task only POINTS at an order.
function advisorTasks(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("advisorTasks() requires { action, advisor_id }."),
    );
  }
  return call("advisor-tasks", payload);
}

// analyticsSummary(ctx?) — analytics-summary: platform scorecard + per-advisor
// block. ctx: { advisor_id? } selects the self row + rank. MARGIN is gated
// SERVER-SIDE off the caller's DB advisor role (head_of_business) — a forged
// body role/show_margin can NEVER unlock it; the body is otherwise additive.
function analyticsSummary(ctx) {
  return call("analytics-summary", ctx && typeof ctx === "object" ? ctx : {});
}

// --- Advisor workbench DEPTH (approvals inbox / workload / handover) --------
// advisorWorkbench(payload) — advisor-workbench-read: the READ-MODEL behind the
// Approvals Inbox + Workload/SLA aging + warm-handover snapshot, plus the
// approve/reject/escalate DECISION ledger write. advisor_id is the mandatory
// caller-identity + cross-advisor scoping key on EVERY action (the backend
// resolves the caller's DB role from it — never a client-asserted role).
//   approvals_inbox  { action, advisor_id, scope?:'mine'|'all' } -> tiered inbox + counts
//   workload         { action, advisor_id } -> self load detail + anonymised peer ranking
//   handover         { action, advisor_id, member_id } -> member-360 work snapshot
//   approval_decide  { action, advisor_id, source_kind, source_id, decision, reason? }
// MONEY SAFETY: every amount returned is SELL-side (member pay/refund) or a
// policy LIMIT — NEVER net / cost / commission / margin (the function reads no
// such column). The amounts/limits are advisor-internal approval-control figures
// and this is an ADVISOR surface only; member.js must never reach this wrapper.
// approval_decide POSTS NO LEDGER and MOVES NO MONEY (money_status stays held);
// it requires db/071 (advisor_approval_decisions) to be APPLIED to persist —
// until then the function degrades to { error:'decide_failed' } (the panel
// surfaces that as a calm "decision log not live yet" notice).
function advisorWorkbench(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("advisorWorkbench() requires { action, advisor_id }."),
    );
  }
  return call("advisor-workbench-read", payload);
}

// Thin convenience wrappers — one per action, each threading advisor_id (the
// mandatory scoping key) through to advisorWorkbench(). Mirrors the advisorTasks
// dispatch style; UI may use either these or the dispatcher directly.
function approvalsInbox(advisorId, opts) {
  var body = { action: "approvals_inbox", advisor_id: advisorId };
  if (opts && typeof opts === "object" && opts.scope) body.scope = opts.scope;
  return advisorWorkbench(body);
}
function advisorWorkload(advisorId) {
  return advisorWorkbench({ action: "workload", advisor_id: advisorId });
}
function advisorHandover(advisorId, memberId) {
  return advisorWorkbench({
    action: "handover",
    advisor_id: advisorId,
    member_id: memberId,
  });
}
// approvalDecide(advisorId, { source_kind, source_id, decision, reason? }) —
// records ONE approve/reject/escalate decision. Server gates authority on the
// caller's DB role vs the item tier; an under-authorised caller may only
// 'escalate'. No money moves.
function approvalDecide(advisorId, opts) {
  opts = opts || {};
  var body = {
    action: "approval_decide",
    advisor_id: advisorId,
    source_kind: opts.source_kind,
    source_id: opts.source_id,
    decision: opts.decision,
  };
  if (opts.reason != null) body.reason = opts.reason;
  return advisorWorkbench(body);
}

// --- Pricing / Orders ------------------------------------------------------

// price(cart) — cart may be { items:[...], inclusive? } or a bare array,
// OR a full payload object { cart, member_id?, advisor_id?, trip_id?, note? }.
function price(cart) {
  var payload;
  if (Array.isArray(cart)) {
    payload = { cart: cart };
  } else if (cart && typeof cart === "object" && cart.cart !== undefined) {
    // Already a full payload (has explicit `cart` key).
    payload = cart;
  } else if (cart && typeof cart === "object" && Array.isArray(cart.items)) {
    // A cart object { items:[...], inclusive? } passed directly.
    payload = { cart: cart };
  } else {
    payload = { cart: cart };
  }
  return call("quote-price", payload);
}

// createOrder(quote_id)
function createOrder(quote_id) {
  return call("order-create", { quote_id: quote_id });
}

// runSaga(order_id, opts) — opts may be a number (failLeg) or { failLeg }.
function runSaga(order_id, opts) {
  var body = { order_id: order_id };
  if (typeof opts === "number") {
    body.failLeg = opts;
  } else if (opts && typeof opts === "object" && opts.failLeg != null) {
    body.failLeg = opts.failLeg;
  }
  return call("booking-saga", body);
}

// --- RAG / AI --------------------------------------------------------------

// kbSearch(q, limit?)
function kbSearch(q, limit) {
  var body = { query: q };
  if (limit != null) body.limit = limit;
  return call("kb-search", body);
}

// concierge(msg, opts?) — opts: { member_id?, conversation_id? }
function concierge(msg, opts) {
  var body = { message: msg };
  if (opts && typeof opts === "object") {
    if (opts.member_id != null) body.member_id = opts.member_id;
    if (opts.conversation_id != null)
      body.conversation_id = opts.conversation_id;
  }
  return call("concierge", body);
}

// --- RFQ Engine (Supplier Broadcast & Bidding) -----------------------------

// rfqCompose(product, spec, opts?) — opts: { member_id?, advisor_id? }
// FastAPI (POST /rfq/compose). advisor_id is still accepted in `opts` for
// call-shape compatibility, but is now INERT — the backend always derives
// the composing advisor from the JWT (Depends(get_current_advisor)); a
// caller-supplied advisor_id in the body is silently ignored server-side.
function rfqCompose(product, spec, opts) {
  var body = { product: product, spec: spec || {} };
  if (opts && typeof opts === "object") {
    if (opts.member_id != null) body.member_id = opts.member_id;
  }
  return fastapiRfqCall("/rfq/compose", { method: "POST", body: body });
}

// rfqDispatch(rfq_id, advisor_id) — FastAPI (POST /rfq/{rfq_id}/dispatch).
// advisor_id kept in the signature for compatibility; unused — the backend
// derives the dispatching advisor from the JWT, no body needed at all.
function rfqDispatch(rfq_id, _advisor_id) {
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id) + "/dispatch", { method: "POST" });
}

// rfqSimulate(rfq_id) — demo helper: fabricate supplier replies.
// FastAPI (POST /rfq/{rfq_id}/simulate), gated server-side by
// RFQ_SIMULATE_ENABLED — deterministic-only, no AI-authored replies. The
// legacy rfq-simulate-responses Edge Function this used to call is dead.
function rfqSimulate(rfq_id) {
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id) + "/simulate", { method: "POST" });
}

// rfqInbound(payload) — capture a real/manual supplier reply.
// NOT moved. POST /rfq/inbound now requires the n8n-only X-Internal-Token
// shared secret (app/internal/internal_router.py) — an advisor JWT can't
// satisfy that gate, and the secret must never reach a browser. Stays on
// the legacy transport; nothing in the ported Supplier Broadcast UI calls
// this today.
// payload: { raw_text, correlation_token? | (rfq_id & supplier_id), channel? }
function rfqInbound(payload) {
  return call("rfq-inbound", payload || {});
}

// rfqParse(rfq_id) — FastAPI (POST /rfq/{rfq_id}/parse).
function rfqParse(rfq_id) {
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id) + "/parse", { method: "POST" });
}

// rfqRank(rfq_id) — FastAPI (POST /rfq/{rfq_id}/rank).
function rfqRank(rfq_id) {
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id) + "/rank", { method: "POST" });
}

// rfqAward(rfq_id, quote_id, advisor_id?) — FastAPI (POST /rfq/{rfq_id}/award).
// advisor_id kept in the signature for compatibility; unused — the backend
// derives the awarding advisor from the JWT.
function rfqAward(rfq_id, quote_id, _advisor_id) {
  var body = { rfq_id: rfq_id, quote_id: quote_id };
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id) + "/award", { method: "POST", body: body });
}

// --- Servicing case engine (post-booking) ----------------------------------
// servicing-case is the v2 SERVICING CASE ENGINE: one function, seven actions
// (open / simulate / approve / execute / status / dispute / reconcile). It is
// the simulate→approve→execute HITL spine for cancellations, amendments,
// reissues, disruptions, partial refunds, complaints and disputes.
//
// SECURITY: every MUTATING action is advisor-gated server-side (advisor_id is
// required for open/simulate/approve/execute/dispute/reconcile). There is NO
// member_id self-scoping slot on this surface — advisor.js drives it; member
// self-service goes through refundStatus() (read-only) below. We never inject
// member_id here, preserving the service-role write choke point.

// servicingCase(payload) — pass a plain object: { action, ... }.
//   open:      { action:'open', order_id, type, advisor_id, reason?, days_to_travel?, leg_id?, detail? }
//   simulate:  { action:'simulate', case_id, advisor_id, goodwill?, refund_route?, policy_snapshot?, ... }
//   approve:   { action:'approve', case_id, advisor_id, approver_role?, approver_id?, goodwill? }
//   execute:   { action:'execute', case_id, advisor_id }
//   status:    { action:'status', case_id } | { action:'status', order_id }
//   dispute:   { action:'dispute', order_id, advisor_id, reason?, amount_inr?, refund_route?, leg_id? }
//   reconcile: { action:'reconcile', case_id, advisor_id, outcome?:'won'|'lost', ... }
// Returns the parsed JSON envelope (never throws on a backend error code — the
// body carries { error } / { case_state }; only network/transport failures
// reject, as an ApiError, matching call()'s contract).
function servicingCase(payload) {
  if (!payload || typeof payload !== "object") {
    return Promise.reject(
      new ApiError(
        "servicingCase() requires a payload object with an `action`.",
      ),
    );
  }
  if (!payload.action || typeof payload.action !== "string") {
    return Promise.reject(
      new ApiError("servicingCase() payload must include a string `action`."),
    );
  }
  return call("servicing-case", payload);
}

// dispute(order_id, advisor_id, opts?) — convenience shorthand for opening a
// dispute-type case (SVC-059/060/061 + PAY-072). opts: { reason?, amount_inr?,
// refund_route?, leg_id?, detail? }. Delegates to servicingCase with
// action:'dispute'. Advisor-gated; no member_id slot (see note above).
function dispute(order_id, advisor_id, opts) {
  var body = {
    action: "dispute",
    order_id: order_id,
    advisor_id: advisor_id,
  };
  if (opts && typeof opts === "object") {
    if (opts.reason != null) body.reason = opts.reason;
    if (opts.amount_inr != null) body.amount_inr = opts.amount_inr;
    if (opts.refund_route != null) body.refund_route = opts.refund_route;
    if (opts.leg_id != null) body.leg_id = opts.leg_id;
    if (opts.detail != null) body.detail = opts.detail;
  }
  return servicingCase(body);
}

// reconcile(case_id, advisor_id, opts?) — convenience shorthand for resolving a
// SUPPLIER_PENDING case (e.g. a dispute win/loss adjudication, PAY-074/075).
// opts: { outcome?:'won'|'lost', refund_route?, ... }. Advisor-gated.
function reconcile(case_id, advisor_id, opts) {
  var body = {
    action: "reconcile",
    case_id: case_id,
    advisor_id: advisor_id,
  };
  if (opts && typeof opts === "object") {
    for (var k in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] != null) {
        body[k] = opts[k];
      }
    }
  }
  return servicingCase(body);
}

// --- Advisor proposals + lead routing (advisor breadth) --------------------
// advisorProposals(payload) — pass a plain object: { action, ... }. The new
// advisor-proposals edge fn is the only writer over proposals/proposal_options
// and the advisors routing columns / enquiries.detail. NON-MONEY: proposals are
// pure grouping over existing quote_ids; the member-facing artifact shows SELL
// only (the fn re-applies the quote-price member projection). Advisor-gated
// server-side (advisor_id required on every mutating action).
//   PROPOSALS:
//     create          { action:'create', advisor_id, member_id, title?, intro?, trip_id?, enquiry_id? }
//     add_option      { action:'add_option', advisor_id, proposal_id, quote_id, label?, blurb?, sort_order? }
//     set_recommended { action:'set_recommended', advisor_id, proposal_id, option_id }
//     send            { action:'send', advisor_id, proposal_id }
//     version         { action:'version', advisor_id, proposal_id, title? }
//     get             { action:'get', proposal_id, advisor_id? | member_id? }
//     list            { action:'list', advisor_id? | member_id? }
//     render_pdf      { action:'render_pdf', advisor_id, proposal_id }  -> { document, download_url }
//   LEAD ROUTING:
//     route             { action:'route', member_id, enquiry_id? }     -> { assigned_advisor_id, method }
//     reassign_enquiry  { action:'reassign_enquiry', advisor_id, enquiry_id, to_advisor_id, reason? }
//     handoff_summary   { action:'handoff_summary', advisor_id, enquiry_id } -> { handoff_summary }
function advisorProposals(payload) {
  if (!payload || typeof payload !== "object") {
    return Promise.reject(
      new ApiError(
        "advisorProposals() requires a payload object with an `action`.",
      ),
    );
  }
  if (!payload.action || typeof payload.action !== "string") {
    return Promise.reject(
      new ApiError(
        "advisorProposals() payload must include a string `action`.",
      ),
    );
  }
  return call("advisor-proposals", payload);
}

// --- Refund status (member-facing "where's my refund?" read model) ---------
// refundStatus(id, member_id?) — id is an order_id by default; pass a full
// payload object to address a case directly. Pure read (SVC-027 / PAY-070).
//
// SECURITY (defence in depth): member_id, WHEN SUPPLIED, scopes the result to
// that member — refund-status enforces the filter server-side (returns 403 /
// an empty set otherwise). member.js passes member_id for self-scoping; advisor
// calls omit it and see the full order view. We never fabricate a member_id.
//
// Forms:
//   refundStatus(order_id)                         -> { order_id, primary, trackers, count }
//   refundStatus(order_id, member_id)              -> member-scoped order view
//   refundStatus({ order_id, member_id? })         -> explicit payload
//   refundStatus({ case_id, member_id? })          -> { tracker } for one case
function refundStatus(id, member_id) {
  var body;
  if (id && typeof id === "object") {
    // Explicit payload form — pass through (only the recognised keys).
    body = {};
    if (id.order_id != null) body.order_id = id.order_id;
    if (id.case_id != null) body.case_id = id.case_id;
    if (id.member_id != null) body.member_id = id.member_id;
  } else {
    body = { order_id: id };
  }
  // A separately-supplied member_id always wins (self-scoping by member.js).
  if (member_id != null) body.member_id = member_id;
  if (body.order_id == null && body.case_id == null) {
    return Promise.reject(
      new ApiError("refundStatus() requires an order_id or case_id."),
    );
  }
  return call("refund-status", body);
}

// --- Servicing intake (NON-money capture / validation / surface) -----------
// servicingIntake(payload) — pass a plain object: { action, ... }. The new
// servicing-intake edge fn captures + validates + surfaces STRUCTURED, NON-MONEY
// servicing inputs on an order. NONE of these move money. The single chargeable
// branch (a name-CHANGE, FLT-089) is HELD and handed to servicingCase() to
// charge — this fn NEVER posts to the ledger.
//
// SECURITY: every MUTATING action is advisor-gated server-side (advisor_id
// required). The READ actions (list/status) accept an OPTIONAL member_id that
// scopes the result to that member (defence in depth); member_id is otherwise
// resolved server-side off the order — never trusted for authorization.
//
// Actions:
//   ssr               { action:'ssr', order_id, advisor_id, leg_id?, ssrs:[{code,text?,pax?}] }   (FLT-026)
//   ssr_reconcile     { action:'ssr_reconcile', order_id, advisor_id, intake_id, statuses?:{CODE:'HK'..} } (FLT-027)
//   special_request   { action:'special_request', order_id, advisor_id, leg_id?, requests:[{category,text?}] } (HTL-057)
//   name_check        { action:'name_check', order_id, advisor_id, leg_id?, old_name, new_name, marriage_doc?, open_money_case? } (FLT-089)
//   idempotency_probe { action:'idempotency_probe', order_id, advisor_id }   (FLT-099)
//   list              { action:'list', order_id, kind?, member_id? }
//   status            { action:'status', intake_id, member_id? }
// Returns the parsed JSON envelope (only network/transport failures reject).
function servicingIntake(payload) {
  if (!payload || typeof payload !== "object") {
    return Promise.reject(
      new ApiError(
        "servicingIntake() requires a payload object with an `action`.",
      ),
    );
  }
  if (!payload.action || typeof payload.action !== "string") {
    return Promise.reject(
      new ApiError(
        "servicingIntake() payload must include a string `action`.",
      ),
    );
  }
  return call("servicing-intake", payload);
}

// --- Hold lifecycle & pre-issue servicing (NON-money) ----------------------
// holdServicing(payload) — pass a plain object: { action, ... }. The new
// hold-servicing edge fn SERVICES an already-created PNR/option HOLD (the HELD
// order + db/022 hold-TTL legs produced by flight-hold). A hold is PRE-PAY, so
// NONE of these move money — releasing / extending / lapsing a hold posts
// NOTHING to the ledger, charges nothing, refunds nothing. (A POST-pay
// cancel/refund/void is servicingCase()'s job — this fn never calls it.)
//
// SECURITY: every MUTATING action is advisor-gated server-side (advisor_id
// required). READ actions (inspect/list) accept an OPTIONAL member_id that
// scopes the result to that member; member_id is otherwise resolved server-side
// off the order — never trusted for authorization.
//
// Actions:
//   inspect  { action:'inspect', order_id, member_id? }                          (read — live TTL posture)
//   list     { action:'list', member_id? }                                       (read — all HELD orders, scoped)
//   extend   { action:'extend', order_id, advisor_id, extend_minutes? }          (courtesy TTL push; NON-money)
//   release  { action:'release', order_id, advisor_id, reason? }                 (SVC-003 voluntary abandon; HELD->CANCELLED, no money)
//   lapse    { action:'lapse', order_id, advisor_id }                            (SVC-002 on-demand TTL lapse; HELD->EXPIRED)
// Guarded FSM (SVC-053): an action on a non-HELD/terminal order returns
// { error:'ILLEGAL_TRANSITION', live_status } ; a replay is a no-op success.
// Returns the parsed JSON envelope (only network/transport failures reject).
function holdServicing(payload) {
  if (!payload || typeof payload !== "object") {
    return Promise.reject(
      new ApiError(
        "holdServicing() requires a payload object with an `action`.",
      ),
    );
  }
  if (!payload.action || typeof payload.action !== "string") {
    return Promise.reject(
      new ApiError("holdServicing() payload must include a string `action`."),
    );
  }
  return call("hold-servicing", payload);
}

// ---------------------------------------------------------------------------
// Servicing work queues — advisor-facing read wrappers over servicing_requests
// (CX-045 escalation queue / CX-047 supplier-reconciliation queue). These read
// through the same service-role data-read choke point as db(); they carry NO
// member_id (advisor surface), and never write. Each returns an array of rows
// newest-first. An optional extra PostgREST query string is appended.
// ---------------------------------------------------------------------------

// escalationQueue(query?) — cases parked in ESCALATED (a guarded step failed:
// illegal FSM edge or unbalanced ledger) awaiting manual resolution (CX-045).
function escalationQueue(query) {
  var q = "case_state=eq.ESCALATED&select=*&order=created_at.desc";
  if (query && typeof query === "string" && query.length) q += "&" + query;
  return db("servicing_requests?" + q);
}

// reconciliationQueue(query?) — cases in SUPPLIER_PENDING awaiting supplier
// credit / dispute adjudication, the inputs to reconcile() (CX-047).
function reconciliationQueue(query) {
  var q = "case_state=eq.SUPPLIER_PENDING&select=*&order=created_at.desc";
  if (query && typeof query === "string" && query.length) q += "&" + query;
  return db("servicing_requests?" + q);
}

// servicingCases(query?) — generic read of the servicing_requests table for the
// advisor servicing console (defaults to newest-first). A thin sibling of the
// table readers below, kept here so all servicing reads live together.
function servicingCases(query) {
  var q =
    query && typeof query === "string" && query.length
      ? query
      : "select=*&order=created_at.desc";
  return db("servicing_requests?" + q);
}

// ---------------------------------------------------------------------------
// quote-share — tokenised public sharing + DPDP consent.
//   createShareLink(quoteId, opts?)  -> { ok, token, expires_at }
//     opts: { expires_in_days, title, fare_rules, created_by, options }
//   getSharedQuote(token)            -> public sell-only view (no member session)
//   revokeShareLink(token)           -> { ok, status:'revoked' }
//   setConsent(memberId, consent)    -> DPDP write (marketing/dpdp/quiet_hours)
// The viewer fetch is the ONLY browser path to a shared quote; it re-projects
// pricing sell-only server-side and never routes through data-read.
// ---------------------------------------------------------------------------
function createShareLink(quoteId, opts) {
  var b = opts && typeof opts === "object" ? opts : {};
  b.action = "create";
  b.quote_id = quoteId;
  return call("quote-share", b);
}
function getSharedQuote(token) {
  return call("quote-share", { action: "view", token: token });
}
function revokeShareLink(token) {
  return call("quote-share", { action: "revoke", token: token });
}
function setConsent(memberId, consent) {
  var b =
    consent && typeof consent === "object" ? Object.assign({}, consent) : {};
  b.action = "consent";
  b.member_id = memberId;
  return call("quote-share", b);
}

// ---------------------------------------------------------------------------
// comms-consent — dedicated member communication-preference function.
//   commsConsent({ action:'dashboard'|'opt_in'|'opt_out'|'quiet_hours',
//                  member_id, channel?, quiet_hours?, ... })
//   dashboard    read model: per-channel opt-in state + quiet hours (sell-safe,
//                no money fields by construction; member-scoped server-side).
//   opt_in       record an explicit opt-in for a channel (source-stamped).
//   opt_out      record an opt-out for a channel.
//   quiet_hours  persist { start_hour, end_hour, tz_offset_min }.
// The function resolves & verifies member ownership from the bearer JWT; we
// pass member_id only for self-scoping (defence in depth). No money / net.
// ---------------------------------------------------------------------------
function commsConsent(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("commsConsent() requires { action, member_id }."),
    );
  }
  return call("comms-consent", payload);
}

// ---------------------------------------------------------------------------
// comms-read — read-only window onto the communications spine (inbox threads,
//   a single conversation transcript, the template catalogue + a render
//   preview, and the per-order delivery outbox).
//   commsRead({ action:'inbox'|'thread'|'templates'|'render'|'delivery_status',
//               ... })
//   inbox            { advisor_id?, member_id?, channel?, status?, limit? }
//   thread           { conversation_id (required), limit? }
//   templates        { kind?, category?, status?, language?, limit? }
//   render           { template_key OR kind, channel?, locale?, variables? }
//   delivery_status  { order_id OR member_id OR correlation_id, limit? }
// READ / PREVIEW only — never sends. Margin-free by construction; member scope
// is enforced server-side. Same { action }-validated shape as commsConsent.
// ---------------------------------------------------------------------------
function commsRead(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(new ApiError("commsRead() requires { action }."));
  }
  return call("comms-read", payload);
}

// ===========================================================================
// Wave-N dedicated functions (deployed this session). Each is a generic
// { action }-validated dispatcher over call("<fn-name>", payload), matching the
// servicingIntake / advisorWorkbench style above. Member-facing surfaces are
// SELL-ONLY (never net/commission/margin); advisor-internal ones are noted.
// ===========================================================================

// hotelModifyOrchestrate(payload) — hotel-modify-orchestrate: the simulate→
// approve→execute HITL spine for a hotel modification (date/room/occupancy
// change). { action:'propose'|'queue'|'get'|'approve'|'reject', ... }
//   propose  build the change + refund/penalty/fee impact (SELL-side preview).
//   queue    park the proposal for advisor approval.
//   get      read one proposal's current posture.
//   approve  advisor authorises the queued change.
//   reject   advisor declines the queued change.
// Member-facing amounts are SELL-only (member pay/refund) — never net/margin.
function hotelModifyOrchestrate(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("hotelModifyOrchestrate() requires { action, ... }."),
    );
  }
  return call("hotel-modify-orchestrate", payload);
}

// flightEmd(payload) — flight-emd: EMD (ancillary) issue / recon lifecycle for
// an order. { action:'issue'|'reconcile'|'residual'|'void'|'list'|'status', ... }
//   issue      issue an EMD for a paid ancillary (SELL-side amount).
//   reconcile  reconcile an issued EMD against the supplier record.
//   residual   compute residual value on a partially-used EMD.
//   void       void an unused EMD.
//   list       list EMDs on an order.
//   status     read one EMD's posture.
// Member-facing amounts are SELL-only — never net/commission.
function flightEmd(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("flightEmd() requires { action, ... }."),
    );
  }
  return call("flight-emd", payload);
}

// commsDelivery(payload) — comms-delivery: delivery-side spine for outbound
// comms (provider receipts, fallback routing, reconciliation tick, status).
//   { action:'receipt'|'fallback'|'reconcile_tick'|'status', ... }
//   receipt         record a provider delivery receipt / DLR.
//   fallback        route to a fallback channel on non-delivery.
//   reconcile_tick  periodic reconciliation sweep of in-flight sends.
//   status          read delivery status for a message/correlation.
// READ / DELIVERY-CONTROL only; no money, margin-free by construction.
function commsDelivery(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("commsDelivery() requires { action, ... }."),
    );
  }
  return call("comms-delivery", payload);
}

// payRefundPreview(payload) — pay-refund-preview: READ-ONLY refund preview.
//   { action:'preview'|'get'|'list', ... }
//   preview  compute a refund preview (route/amount/timeline) — SELL-side.
//   get      read one previously-computed preview.
//   list     list refund previews for an order/member.
// READ-ONLY + MONEY-SAFE: computes the member refund figure only; posts NOTHING
// to the ledger (the authoritative refund execution lives behind servicingCase).
function payRefundPreview(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("payRefundPreview() requires { action, ... }."),
    );
  }
  return call("pay-refund-preview", payload);
}

// visaReadiness(payload) — visa-readiness: document/eligibility readiness check.
//   { action:'check'|'list_trip', ... }
//   check      run a readiness check for a member/trip (missing docs, gaps).
//   list_trip  list readiness items across a trip.
// NON-MONEY member-facing read; no net/commission by construction.
function visaReadiness(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("visaReadiness() requires { action, ... }."),
    );
  }
  return call("visa-readiness", payload);
}

// visaCopilot(payload) — visa-copilot: AI visa-guidance assistant + its eval
// harness. { action:'answer'|'run_eval'|'list_golden', ... }
//   answer       answer a visa question (grounded guidance).
//   run_eval     run the golden-set evaluation over the copilot.
//   list_golden  list the golden eval questions.
// NON-MONEY; informational guidance only.
function visaCopilot(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("visaCopilot() requires { action, ... }."),
    );
  }
  return call("visa-copilot", payload);
}

// disputeCase(payload) — dispute-case: dedicated dispute lifecycle engine.
//   { action:'open'|'evidence'|'submit'|'resolve'|'list'|'get', ... }
//   open      open a dispute case on an order.
//   evidence  attach evidence to a dispute.
//   submit    submit the dispute to the supplier/network.
//   resolve   record the adjudication outcome.
//   list      list dispute cases.
//   get       read one dispute case.
// Member-facing amounts are SELL-only (member refund/credit) — never net/margin.
function disputeCase(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("disputeCase() requires { action, ... }."),
    );
  }
  return call("dispute-case", payload);
}

// flightGroup(payload) — flight-group: group-booking lifecycle (10+ pax).
//   { action:'open'|'name_list'|'deposit_terms'|'phase_plan'|'attrition'|'status', ... }
//   open          open a group booking request.
//   name_list     manage the group passenger name list.
//   deposit_terms read the deposit schedule / terms (SELL-side).
//   phase_plan    payment phase plan for the group.
//   attrition     attrition (drop) allowance + penalties.
//   status        read group booking posture.
// Member-facing amounts are SELL-only — never net/commission.
function flightGroup(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("flightGroup() requires { action, ... }."),
    );
  }
  return call("flight-group", payload);
}

// commsPreferences(payload) — comms-preferences: channel/language preference
// resolution + directory. { action:'set_channel'|'set_language'|'resolve'|
//   'dashboard'|'directory', ... }
//   set_channel   set preferred channel for a member.
//   set_language  set preferred language.
//   resolve       resolve the effective channel/language for a send.
//   dashboard     read model of a member's preferences.
//   directory     directory of contactable members/channels.
// NON-MONEY; preference data only, margin-free by construction.
function commsPreferences(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("commsPreferences() requires { action, ... }."),
    );
  }
  return call("comms-preferences", payload);
}

// hotelStayDeviation(payload) — hotel-stay-deviation: in-stay change spine
// (early check-out, extension, no-show) — simulate→approve→execute HITL.
//   { action:'propose'|'queue'|'get'|'approve'|'reject', ... }
//   propose  build the deviation + refund/penalty/fee impact (SELL-side).
//   queue    park the deviation for advisor approval.
//   get      read one deviation's posture.
//   approve  advisor authorises the queued deviation.
//   reject   advisor declines the queued deviation.
// Member-facing amounts are SELL-only — never net/margin.
function hotelStayDeviation(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("hotelStayDeviation() requires { action, ... }."),
    );
  }
  return call("hotel-stay-deviation", payload);
}

// advisorBookOfBusiness(payload) — advisor-book-of-business: advisor scorecard,
// earnings + statement engine. { action:'scorecard'|'earnings'|'statement'|
//   'set_goal'|'mark_paid', advisor_id, ... }
//   scorecard  advisor performance scorecard.
//   earnings   advisor earnings breakdown.
//   statement  generate an earnings statement.
//   set_goal   set an advisor target.
//   mark_paid  mark an earnings line as paid out.
// ADVISOR-INTERNAL: this surface EXPOSES advisor net/commission/earnings — it is
// an advisor-only read/write keyed on advisor_id and HARD-GATED server-side.
// member.js must NEVER reach this wrapper.
function advisorBookOfBusiness(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError(
        "advisorBookOfBusiness() requires { action, advisor_id }.",
      ),
    );
  }
  return call("advisor-book-of-business", payload);
}

// visaAppointment(payload) — visa-appointment: appointment-slot lifecycle.
//   { action:'offer_slots'|'book'|'reschedule'|'cancel'|'complete'|
//     'scan_reminders'|'status_note'|'status', ... }
//   offer_slots     offer available appointment slots.
//   book            book a slot.
//   reschedule      move an existing appointment.
//   cancel          cancel an appointment.
//   complete        mark an appointment completed.
//   scan_reminders  sweep for upcoming-appointment reminders.
//   status_note     attach a status note.
//   status          read appointment posture.
// NON-MONEY scheduling surface; no net/commission by construction.
function visaAppointment(payload) {
  if (!payload || typeof payload !== "object" || !payload.action) {
    return Promise.reject(
      new ApiError("visaAppointment() requires { action, ... }."),
    );
  }
  return call("visa-appointment", payload);
}

// ---------------------------------------------------------------------------
// Convenience table readers — thin helpers over db() for the documented
// tables. Accept an optional PostgREST query string (without the leading
// table name) to append filters/select/order/limit, e.g.
//   members("select=id,full_name&limit=20")
//   orders("select=*&order=created_at.desc&limit=50")
// Default selects everything.
// ---------------------------------------------------------------------------
function _tableReader(table) {
  return function (query) {
    var q =
      query && typeof query === "string" && query.length ? query : "select=*";
    return db(table + "?" + q);
  };
}

const members = _tableReader("members");
const advisors = _tableReader("advisors");
const enquiries = _tableReader("enquiries");
const suppliers = _tableReader("suppliers");
const orders = _tableReader("orders");
const quotes = _tableReader("quotes");
const rfqs = _tableReader("rfqs");
const rfqQuotes = _tableReader("rfq_quotes");
const visaRequirements = _tableReader("visa_requirements");
const journeys = _tableReader("customer_journeys");
const journeyTouchpoints = _tableReader("journey_touchpoints");

// ---------------------------------------------------------------------------
// Journeys (Concierge Care lifecycle) — journey-tick runs the touchpoint
// delivery scheduler; journey-approve records the advisor's sign-off on a
// gated (requires_approval) touchpoint before it can send. Mirrors the
// rfqCompose/rfqAward-style thin wrappers above.
// ---------------------------------------------------------------------------
function journeyTick(payload) {
  return call("journey-tick", payload && typeof payload === "object" ? payload : {});
}
function journeyApprove(payload) {
  if (!payload || typeof payload !== "object" || !payload.touchpoint_id || !payload.decision) {
    return Promise.reject(new ApiError("journeyApprove() requires { touchpoint_id, advisor_id, decision }."));
  }
  return call("journey-approve", payload);
}

// ---------------------------------------------------------------------------
// FastAPI backend (separate service — not a Supabase edge function).
// Every call below except acceptAdvisorInvite() requires a real advisor
// session and never falls back to the anon/publishable key. acceptAdvisorInvite
// is the one deliberate exception: it's called from /join by someone with no
// account yet, so there is no session to attach.
// ---------------------------------------------------------------------------
// VITE_FASTAPI_BASE lets each environment (local/staging/prod) point at its
// own FastAPI deployment via .env without touching this file; the hardcoded
// 127.0.0.1:8787 stays as the local-dev fallback so nothing breaks for
// anyone without that env var set yet.
const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://127.0.0.1:8787";

// SITE_API_BASE (2026-09-16, Phase C access-request admin review) —
// tripagent-site-main's OWN backend, a SEPARATE codebase/deployment from
// this one, NOT the same thing as FASTAPI_BASE above (that's tripagent-
// full — this app's own backend). site_access_requests/create_invitation_
// code() only exist there — confirmed both point at the same Supabase
// project (gnifmusartvwngcuquou) during investigation, but that backend's
// own RLS denies anon/authenticated access to that table outright (deny-
// all, service-role only — see supabase/migrations/0008_site_access_
// requests.sql over there), so this app can't read/write it directly via
// its own Supabase client; it has to go through THAT backend's API, same
// as any other cross-service call.
//
// UPDATED 2026-09-16 (direct request): that backend's 3 review endpoints
// now require a shared-secret X-Admin-Key header (app/dependencies/
// admin_auth.py over there). AdminPanel.tsx is a "use client" component —
// its code runs in the browser — so siteApiCall() below no longer calls
// SITE_API_BASE directly; it goes through this app's OWN same-origin proxy
// (src/app/api/site-admin/[...path]/route.ts), a real Next.js Route
// Handler that runs server-side and attaches the key from a server-only
// ADMIN_API_KEY env var (never NEXT_PUBLIC_-prefixed, never in the client
// bundle). The browser never sees the key. SITE_API_BASE itself is now
// only read server-side, by that route handler.
function siteApiCall(path, options) {
  return fetch("/api/site-admin" + path, {
    method: options.method,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(typeof body.detail === "string" ? body.detail : "Request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// siteAccessRequestsPending() -> real site_access_requests rows,
// status='pending', newest first (backend's own order-by).
function siteAccessRequestsPending() {
  return siteApiCall("/access-requests/pending", { method: "GET" });
}

// siteApproveAccessRequest(id) -> { ok, code, expires_at, expires_on,
// link, email_sent } — a real invite code, emailed to the applicant.
// email_sent=false means the send failed; the code is still valid and the
// UI shows it for manual sharing.
function siteApproveAccessRequest(id) {
  return siteApiCall("/access-requests/" + encodeURIComponent(id) + "/approve", { method: "POST", body: {} });
}

// siteDenyAccessRequest(id, declineReason?) -> { ok: true }
function siteDenyAccessRequest(id, declineReason) {
  return siteApiCall("/access-requests/" + encodeURIComponent(id) + "/deny", {
    method: "POST",
    body: { decline_reason: declineReason || null },
  });
}

// acceptAdvisorInvite(token, password) — /join's only call. Public endpoint
// (backend/app/routers/advisor_team_router.py's POST /advisor/team/accept-
// invite/{token}): the invitee has no Supabase session yet, so unlike every
// other function in this section, this one sends no Authorization header.
function acceptAdvisorInvite(token, password) {
  return fetch(FASTAPI_BASE + "/advisor/team/accept-invite/" + encodeURIComponent(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password }),
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Could not activate this account.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

function inviteCustomer(payload) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + "/advisor/customers/invite", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_name: payload.customer_name,
      customer_email: payload.customer_email,
    }),
  })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          throw new ApiError(body.detail || "Invite failed.", { status: res.status, body: body });
        }
        return body;
      });
    });
}

// TripSure hotel search (real preprod data, via the FastAPI /hotels/* routes —
// see backend/app/routers/hotel_router.py). "V2" names distinguish these from
// the existing synthetic searchHotels()/hotelProperty() while both are live.
function fastapiHotelCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Hotel request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

function hotelAutosuggestV2(query) {
  return fastapiHotelCall("/hotels/locations?q=" + encodeURIComponent(query), { method: "GET" });
}

function hotelListingV2(payload) {
  return fastapiHotelCall("/hotels/listing", { method: "POST", body: payload });
}

function hotelDetailsV2(payload) {
  return fastapiHotelCall("/hotels/details", { method: "POST", body: payload });
}

function hotelPriceCheckV2(payload) {
  return fastapiHotelCall("/hotels/price-check", { method: "POST", body: payload });
}

// hotelRecommendations(payload) — POST /hotels/recommendations (2026-09-15,
// hotel-suggestion flow). payload: { city, checkIn, checkOut, adults, rooms,
// starMin?, budgetTotal? }. Real TripSure search, ranked into up to 3 real
// candidates (best_match/best_value/premium) server-side, no LLM involved —
// see itinerary_service.recommend_hotels's own docstring. One call per
// hotel base (one city + date range); the caller groups a multi-city
// itinerary into its real per-city bases before calling this per base.
function hotelRecommendations(payload) {
  return fastapiHotelCall("/hotels/recommendations", { method: "POST", body: payload });
}

// hotelSetWebsite(hotelKey, website) — PATCH /hotels/{hotelKey}/website
// (backend db/149). Advisor-entered override for hotel_snapshots.website:
// the hotel's OWN real, official site, filled in manually since neither
// TripSure nor an automated lookup (Google Places, ruled out as unreliable
// for independent/regional properties — 2026-09-11 investigation) can
// supply this reliably. `website` null clears it. Reused everywhere this
// hotelKey's link is built (proposalTemplateData.ts's hotelUrl(), the
// public /hotel/{hotelKey} page) once set.
function hotelSetWebsite(hotelKey, website) {
  return fastapiHotelCall("/hotels/" + encodeURIComponent(hotelKey) + "/website", { method: "PATCH", body: { website: website || null } });
}

// --- Flight search (real preprod data, via FastAPI's /flights/search — ----
// backend/app/routers/flight_router.py). Kept alongside the legacy
// searchFlights()/flight-search edge function while FlightDesk.jsx's
// USE_REAL_FLIGHTS toggle picks between them — same live-cutover pattern as
// hotelListingV2()/USE_REAL_HOTELS above. SCOPE: search only. Offer
// selection (fare family/rules/ancillaries/seatmap, hold, reprice) stays on
// the legacy flight-fares/flight-hold/flight-irrops/flight-shop edge
// functions — those depend on a persisted `offers` table row id that
// TripSure's response has no equivalent of, and migrating them needs the
// Fare Family -> Create Itinerary -> Update Itinerary flow (backend already
// has it; no UI calls it yet), not a shape adapter like this one.
function fastapiFlightCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Flight request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// A handful of common Indian airport codes, used ONLY to approximate the
// DOM/INTL chip on a result card. TripSure's search response carries no
// explicit domestic/international flag (unlike the old synthetic offers,
// which had one baked in) — this is a best-effort guess, not authoritative.
// A route through a real Indian airport missing from this list is
// over-classified as international. Nothing money-related reads
// o.international; it's cosmetic display only.
var _INDIAN_AIRPORT_CODES = {
  DEL: 1, BOM: 1, BLR: 1, MAA: 1, CCU: 1, HYD: 1, AMD: 1, PNQ: 1, COK: 1,
  GOI: 1, JAI: 1, LKO: 1, IXC: 1, PAT: 1, GAU: 1, TRV: 1, VNS: 1, IXR: 1,
  VTZ: 1, IDR: 1, BBI: 1, IXB: 1, ATQ: 1, SXR: 1, IXJ: 1, NAG: 1, RPR: 1,
};
function _isDomesticRoute(origin, dest) {
  return !!(_INDIAN_AIRPORT_CODES[origin] && _INDIAN_AIRPORT_CODES[dest]);
}

// In-memory cache of composite-id -> the identifiers needed to drive a real
// TripSure offer further (searchKey/providerId/fareSourceCode/raw payload).
// Cleared at the START of every new search (see fastapiFlightSearch()
// below), so its lifetime is bounded by "since the last search ran" — never
// longer than TripSure's own ~15 min itinerary-lock window, and usually much
// shorter. NOT persisted anywhere (no localStorage/sessionStorage): a page
// reload loses it exactly like a real TripSure itinerary session would
// expire anyway. NOTHING reads from this map yet — flight-fares/flight-hold/
// flight-irrops/flight-shop are staying on the legacy edge functions in this
// pass (see module comment above). This exists so a future migration of
// those has somewhere to look up "what did fastapiFlightSearch() actually
// return for this id" without threading the raw offer through every prop.
var _tripsureFlightOfferCache = new Map();

// getTripsureFlightOffer(id) — look up a previously-mapped real offer by its
// composite id ({searchKey}::{providerId}::{fareSourceCode}). Returns null
// on a miss — id never existed, the page reloaded, or (most likely) a
// second search ran since and wiped the cache. A caller holding an id from
// "a few minutes ago" should not assume a hit; TripSure's own itinerary
// session may also have expired server-side by then regardless of what
// this cache says.
export function getTripsureFlightOffer(id) {
  return _tripsureFlightOfferCache.get(id) || null;
}

// mapTripSureFlightOffer(rawOffer, ctx) — reshapes one entry of FastAPI's
// data.search_result.<LEG>[] array into the old synthetic
// { id, international, base_net, detail: {...} } shape FlightDesk.jsx,
// FlightFareDetail and flightCartItem() already expect, so none of that
// downstream rendering code has to change to show real offers.
//
// Field-casing note: TripSure's own casing for these fields has FLIP-
// FLOPPED live, confirmed twice now — 2026-08-07 had rawOffer.fare_
// source_code/validating_carrier as snake_case (not the guide's/
// Postman's documented fareSourceCode/validatingCarrier), but a live
// re-check today (2026-09-06, this pass — the actual bug behind "NET
// COST always shows ₹0") found the OPPOSITE: fareSourceCode/
// validatingCarrier back to camelCase, AND rawOffer.PriceSummaries (one
// level deeper, previously "not reported as affected") had flipped to
// lowercase priceSummaries too — silently zeroing base_net below, since
// `(rawOffer.PriceSummaries || [])[0]` read undefined against the live
// shape. Both fareSourceCode and PriceSummaries are read tolerantly now
// (either casing) so this can't silently break again the next time
// TripSure's response shape shifts.
//
// There is no persisted offer id from TripSure (unlike the old `offers`
// table row this UI was built around) — {searchKey}::{providerId}::
// {fareSourceCode} is used as a synthetic stand-in, unique for the lifetime
// of one search, and the only three values that together identify "this
// exact fare" per the guide's own identifier chain (section 5).
function mapTripSureFlightOffer(rawOffer, ctx) {
  var segments = rawOffer.segments || [];
  var first = segments[0] || {};
  var last = segments[segments.length - 1] || first;
  var price = (rawOffer.PriceSummaries || rawOffer.priceSummaries || [])[0] || {};
  var fareSourceCode = rawOffer.fare_source_code || rawOffer.fareSourceCode;

  var depMs = Date.parse(first.departureDateTime);
  var arrMs = Date.parse(last.arrivalDateTime);
  var durationMin = isFinite(depMs) && isFinite(arrMs) ? Math.round((arrMs - depMs) / 60000) : null;
  var flightNo = segments.map(function (s) { return s.flightNumber; }).filter(Boolean).join(" + ");
  var baggage = price.baggageAllowance;

  var id = [ctx.searchKey, rawOffer.provider, fareSourceCode].join("::");

  _tripsureFlightOfferCache.set(id, {
    searchKey: ctx.searchKey,
    providerId: rawOffer.provider,
    fareSourceCode: fareSourceCode,
    // Keyed by supplier name (e.g. "tbo"), per the guide's own sample — no
    // confirmed mapping from providerId to a specific key here, so the
    // whole object is kept as-is rather than guessing which entry applies.
    supplierTraceIds: ctx.supplierTraceIds || {},
    raw: rawOffer,
    mintedAt: Date.now(),
  });

  return {
    id: id,
    international: !_isDomesticRoute(first.departureAirport, last.arrivalAirport),
    base_net: Number(price.totalFare) || 0,
    detail: {
      airline: first.airlineCode,
      airlineName: first.airlineName,
      flightNo: flightNo,
      originCode: first.departureAirport,
      destCode: last.arrivalAirport,
      depTime: (first.departureDateTime || "").slice(11, 16),
      arrTime: (last.arrivalDateTime || "").slice(11, 16),
      duration: durationMin != null ? Math.floor(durationMin / 60) + "h " + (durationMin % 60) + "m" : "",
      durationMin: durationMin,
      // Number of segments minus one — TripSure's per-segment "stops" field
      // (guide section 6.2 sample) reads as technical stops on that one
      // flight number, not connections; segments.length - 1 is the
      // connection count the old UI's stop-count filter/display expects.
      stops: Math.max(0, segments.length - 1),
      baggageKg: baggage ? Number(baggage.Value) || null : null,
      refundable: !!price.refundStatus,
      cabin: String(ctx.cabin || "economy").toLowerCase(),
      pax: ctx.pax,
    },
  };
}

// mapTripSureSearchResponse(searchResponse, ctx) — turns FastAPI's already-
// unwrapped /flights/search response ({search_result, errors,
// supplierTraceIds, searchKey}) into the {count, offers, errors} shape
// FlightDesk.jsx's run() already reads off searchFlights()'s old result.
function mapTripSureSearchResponse(searchResponse, ctx) {
  _tripsureFlightOfferCache.clear();
  var searchResult = searchResponse.search_result || searchResponse.searchResult || {};
  var offers = [];
  Object.keys(searchResult).forEach(function (leg) {
    (searchResult[leg] || []).forEach(function (rawOffer) {
      offers.push(
        mapTripSureFlightOffer(rawOffer, {
          searchKey: searchResponse.searchKey,
          supplierTraceIds: searchResponse.supplierTraceIds,
          cabin: ctx.cabin,
          pax: ctx.pax,
        })
      );
    });
  });
  return { count: offers.length, offers: offers, errors: searchResponse.errors || [] };
}

// fastapiFlightSearch({ originCode, destCode, date, pax, cabin }) — same
// call signature FlightDesk.jsx already builds for the legacy
// searchFlights(), mapped into FastAPI's ONE_WAY/segments[] shape and back
// out into the old {count, offers} shape via mapTripSureSearchResponse()
// above. No children/infants in the current search form — both default 0.
function fastapiFlightSearch(params) {
  params = params || {};
  var body = {
    trip_type: "ONE_WAY",
    segments: [
      {
        origin: String(params.originCode || "").toUpperCase(),
        destination: String(params.destCode || "").toUpperCase(),
        departure_date: params.date,
      },
    ],
    adults: Number(params.pax) || 1,
    children: 0,
    infants: 0,
    cabin_class: String(params.cabin || "economy").toUpperCase(),
  };
  return fastapiFlightCall("/flights/search", { method: "POST", body: body }).then(function (searchResponse) {
    return mapTripSureSearchResponse(searchResponse, { cabin: params.cabin, pax: Number(params.pax) || 1 });
  });
}

// fastapiFlightAutosuggest(query, limit?) — GET /flights/autosuggest
// (backend/app/routers/flight_router.py -> flight_service.autosuggest()).
// Advisor-scoped only: member_flight_router.py has no autosuggest route at
// all, so this is the one and only path for FlightDesk.jsx (an advisor-panel
// component) to use. Confirmed live (route exists, resolves, and is
// auth-gated) against a local backend run during this pass; the exact
// response shape below is the guide's own documented sample (this endpoint
// was never flagged with the search()-style live snake_case surprise).
// Returns the response body directly — it's already a bare JSON array of
// { country, country_code, airport_name, city, airport_code, location,
// popularity_score, aliases } objects (flight_service.autosuggest()'s
// _unwrap_status_envelope already strips the {status,statusCode,data}
// envelope down to just the data array).
function fastapiFlightAutosuggest(query, limit) {
  var qs = "q=" + encodeURIComponent(query) + "&limit=" + (limit || 8);
  return fastapiFlightCall("/flights/autosuggest?" + qs, { method: "GET" });
}

// --- RFQ engine (real backend — backend/app/routers/rfq_router.py) --------
// Same contract as fastapiHotelCall/fastapiFlightCall: real advisor JWT,
// FASTAPI_BASE. rfqInbound deliberately stays on the legacy transport
// below — see its comment (n8n-only shared secret, not an advisor JWT gate).
function fastapiRfqCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "RFQ request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// rfqList({ status?, limit? }) — GET /rfq
function rfqList(opts) {
  opts = opts || {};
  var qs = [];
  if (opts.status) qs.push("status=" + encodeURIComponent(opts.status));
  if (opts.limit) qs.push("limit=" + encodeURIComponent(opts.limit));
  return fastapiRfqCall("/rfq" + (qs.length ? "?" + qs.join("&") : ""), { method: "GET" });
}

// rfqGet(rfq_id) — GET /rfq/{rfq_id}, now includes { ...rfq, quotes: [...] }
function rfqGet(rfq_id) {
  return fastapiRfqCall("/rfq/" + encodeURIComponent(rfq_id), { method: "GET" });
}

// fetchAdvisors() — GET /admin/advisors (admin_router.py, admin-role-gated
// server-side via get_current_admin). Same real advisor JWT + FASTAPI_BASE
// pattern as fastapiRfqCall/fastapiPulseCall above.
function fetchAdvisors() {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));
  return fetch(FASTAPI_BASE + "/admin/advisors", {
    method: "GET",
    headers: { Authorization: "Bearer " + jwt },
  }).then(function (res) {
    if (!res.ok) return res.text().then(function (t) { throw new ApiError(t || "Request failed", { status: res.status }); });
    return res.json();
  });
}

// --- Pulse engine (real backend — backend/app/routers/pulse_router.py) ----
// Same contract as fastapiRfqCall: real advisor JWT, FASTAPI_BASE.
function fastapiPulseCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Pulse request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// pulseTrending({ service?, country?, limit? }) — GET /pulse/trending
function pulseTrending(opts) {
  opts = opts || {};
  var qs = [];
  if (opts.service) qs.push("service=" + encodeURIComponent(opts.service));
  if (opts.country) qs.push("country=" + encodeURIComponent(opts.country));
  if (opts.limit) qs.push("limit=" + encodeURIComponent(opts.limit));
  return fastapiPulseCall("/pulse/trending" + (qs.length ? "?" + qs.join("&") : ""), { method: "GET" });
}

// pulseNeedsReview(limit?) — GET /pulse/needs-review
function pulseNeedsReview(limit) {
  return fastapiPulseCall("/pulse/needs-review" + (limit ? "?limit=" + encodeURIComponent(limit) : ""), { method: "GET" });
}

// pulseCompose(payload) — POST /pulse/compose
function pulseCompose(payload) {
  return fastapiPulseCall("/pulse/compose", { method: "POST", body: payload });
}

// pulseApprove(offer_id, decision) — POST /pulse/{offer_id}/approve
function pulseApprove(offer_id, decision) {
  return fastapiPulseCall("/pulse/" + encodeURIComponent(offer_id) + "/approve", { method: "POST", body: { decision: decision } });
}

// --- Call Copilot (real backend — backend/app/routers/call_assist_router.py)
// Same contract as fastapiRfqCall/fastapiPulseCall: real advisor JWT,
// FASTAPI_BASE. Replaces the legacy call-assist Edge Function's anon-key,
// CORS-open access — the whole point of this port.
function fastapiCallAssistCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Call Copilot request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// callAssistRun({ chunk, context?, member_id? }) — POST /call-assist
function callAssistRun(payload) {
  return fastapiCallAssistCall("/call-assist", { method: "POST", body: payload });
}

// --- Enquiries (real backend — backend/app/routers/enquiry_router.py) ------
// Advisor-JWT-gated, same contract as fastapiCallAssistCall above. This is
// NOT the member-facing enquiry surface — today the only caller is Call
// Copilot's Share action (advisor-initiated, channel:'advisor').
// timeoutMs (2026-09-11, "Generate AI Itinerary" abort investigation) —
// optional per-call cap via a real AbortController, since plain fetch()
// never times out on its own. Reproduced live: this endpoint calls Claude
// for a draft, then real TripSure flight/hotel searches (itinerary_
// service.py) — a 4-city itinerary took 122s with every TripSure call
// succeeding on its FIRST attempt (no retries), purely from those searches
// running one after another; now ~40-50s after parallelizing them
// (itinerary_service.py's own 2026-09-11 fix) — but still real, non-
// trivial time with nothing bounding it before, which is what an
// unexplained "signal is aborted without reason" actually was: not a
// timeout THIS code set, something upstream (proxy/browser/network) doing
// it uncontrolled. Timing it out here instead, comfortably above the
// measured range, turns that into an honest, specific error message.
function fastapiEnquiryCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  var timeoutMs = options.timeoutMs;
  var controller = typeof AbortController !== "undefined" && timeoutMs ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: controller ? controller.signal : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Enquiry request failed.", { status: res.status, body: body });
      }
      return body;
    });
  }).catch(function (err) {
    // Checked against OUR OWN controller's aborted flag, not err.name/
    // err.message — a raw AbortError's message ("signal is aborted
    // without reason") is exactly the unhelpful text this replaces, and
    // its exact wording isn't guaranteed across runtimes anyway.
    if (controller && controller.signal.aborted) {
      throw new ApiError(
        "Still processing after " + Math.round(timeoutMs / 1000) + "s — longer than usual. It may finish shortly; please check back or try again.",
        { status: 0, cause: err }
      );
    }
    throw err;
  }).finally(function () {
    if (timer) clearTimeout(timer);
  });
}

// enquiryCreate({ member_id, channel?, message?, intent?, reuse? }) — POST /enquiries
function enquiryCreate(payload) {
  return fastapiEnquiryCall("/enquiries", { method: "POST", body: payload });
}

// enquiryTravellerProfile(enquiryId) — GET /enquiries/{id}/traveller-profile.
// Replaces the Traveller Profile panel's old mock/db()-merged member+enquiry
// with a real, backend-shaped {member, enquiry} pair — see
// enquiry_service.get_traveller_profile's own module note on the field
// contract. Works for a concierge_chat lead (member_id null) same as any
// other enquiry.
function enquiryTravellerProfile(enquiryId) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/traveller-profile", { method: "GET" });
}

// enquiryGenerateItinerary(enquiryId) — POST /enquiries/{id}/generate-itinerary.
// Itinerary Builder's "Generate AI Itinerary" button — replaces the old
// MOCK_ITINERARY clone (lib/mockItinerary.ts) with a real, destination-
// specific draft from the enquiry's own stored profile. See
// itinerary_service.py's module note: every generated item is an explicit,
// unverified draft (status "draft") — never a fabricated confirmed booking.
// 180s (2026-09-11) — comfortably above the measured real range: ~40-50s
// typical for a 4-city itinerary after itinerary_service.py's parallel-
// search fix, ~122s in the worst case seen pre-fix with zero retries
// involved. See fastapiEnquiryCall's own note on why this exists.
const GENERATE_ITINERARY_TIMEOUT_MS = 180000;

function enquiryGenerateItinerary(enquiryId) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/generate-itinerary", {
    method: "POST",
    timeoutMs: GENERATE_ITINERARY_TIMEOUT_MS,
  });
}

// enquiryRefreshItinerary(enquiryId) — POST /enquiries/{id}/generate-itinerary/refresh.
// Fires right after enquiryGenerateItinerary resolves (which now returns
// FAST — Claude draft only, no real TripSure search). This second call
// re-runs ONLY the real flight/hotel search using the same cached draft,
// so the advisor sees the drafted plan almost instantly and the real
// flights/hotels fill in a bit later, instead of staring at one long
// spinner for the whole thing.
function enquiryRefreshItinerary(enquiryId) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/generate-itinerary/refresh", {
    method: "POST",
    timeoutMs: GENERATE_ITINERARY_TIMEOUT_MS,
  });
}

// enquiryItineraryStarted(enquiryId) — POST /enquiries/{id}/itinerary-started.
// Real "Building" signal for the Pipeline tab (console/pipeline/page.tsx) —
// idempotent, so safe to call every time a "scratch" or Search-added
// itinerary is first seeded (the "ai" path already gets this set server-side
// by generate-itinerary itself; see itinerary_service.py). Best-effort by
// convention at the call site — a persistence hiccup here must never block
// the itinerary work the advisor is actually doing.
function enquiryItineraryStarted(enquiryId) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/itinerary-started", { method: "POST" });
}

// enquiryProposalSend(enquiryId) — POST /enquiries/{id}/proposal-sends.
// Real "Sent to Proposal" record backing Pipeline — call alongside (not
// instead of) sendItineraryToProposal's existing local proposalQueue write.
// Upserts by enquiry: a re-send replaces sent_at and resets outcome to
// "awaiting" server-side too, matching proposalQueue's own upsert semantics.
function enquiryProposalSend(enquiryId) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/proposal-sends", { method: "POST" });
}

// enquiryProposalOutcome(enquiryId, outcome) — PATCH /enquiries/{id}/proposal-sends/outcome.
// outcome is one of "accepted"|"revision_requested"|"rejected" (never
// "awaiting" — that's a server-set default on send, not a value this PATCHes
// to). 404s if this enquiry was never sent.
function enquiryProposalOutcome(enquiryId, outcome) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/proposal-sends/outcome", { method: "PATCH", body: { outcome: outcome } });
}

// enquiryPipelineStatus() — GET /enquiries/pipeline-status. One bulk read
// for the whole Pipeline tab: { statuses: [{ enquiry_id, itinerary_generated_at,
// proposal: { sent_at, outcome, decided_at } | null }] } — real, persisted
// state surviving a reload, merged with (and overridden by, for freshness)
// this session's own itinerariesByEnquiry/proposalQueue local state.
function enquiryPipelineStatus() {
  return fastapiEnquiryCall("/enquiries/pipeline-status", { method: "GET" });
}

// enquiryProposalShareCreate(enquiryId, snapshot) — POST /enquiries/{id}/
// proposal-share. Proposal Composer's "Web link" button (2026-09-10):
// `snapshot` is buildProposalTemplateData()'s already-assembled output
// (the exact same object ProposalDocument/downloadPdf already render from);
// this call mints a token and stores a sanitized, frozen copy of it server-
// side. Returns { token, expires_at }.
function enquiryProposalShareCreate(enquiryId, snapshot) {
  return fastapiEnquiryCall("/enquiries/" + encodeURIComponent(enquiryId) + "/proposal-share", {
    method: "POST",
    body: { snapshot: snapshot },
  });
}

// proposalShareGet(token) — GET /proposal-share/{token}. PUBLIC endpoint —
// same deliberate exception as acceptAdvisorInvite() above: the viewer on
// the public /proposal/[token] page has no TripAgent session at all, so
// this sends no Authorization header. Resolves with the sanitized snapshot
// for an active link; rejects with an ApiError carrying { status: 404 } for
// an unknown token or { status: 410, body: { detail: { status: "expired"
// | "revoked" } } } for a dead one — the public page reads e.body.detail.
function proposalShareGet(token) {
  return fetch(FASTAPI_BASE + "/proposal-share/" + encodeURIComponent(token), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        // detail is a plain string for a 404 (unknown token) but a
        // {status:"expired"|"revoked", ...} object for a 410 (see
        // proposal_share_router.py's get_proposal_share) — only ever use it
        // as the ApiError message when it's actually a string; the full
        // parsed body (including a structured detail) is always on
        // err.body for the public page to read directly.
        var detail = body.detail;
        var message = typeof detail === "string" ? detail : "This proposal link isn't available.";
        throw new ApiError(message, { status: res.status, body: body });
      }
      return body;
    });
  });
}

// hotelPublicGet(hotelKey) — GET /hotels/public/{hotelKey}. PUBLIC endpoint —
// same deliberate exception as proposalShareGet() above: the viewer on the
// public /hotel/[hotelKey] page (a hotel name/photo clicked in a Proposal
// PDF or its in-app preview) has no TripAgent session at all, so this sends
// no Authorization header. Resolves with the display-only hotel_snapshots
// row for a hotelKey that's appeared in a real TripSure listing() search;
// rejects with an ApiError carrying { status: 404 } for one that hasn't.
function hotelPublicGet(hotelKey) {
  return fetch(FASTAPI_BASE + "/hotels/public/" + encodeURIComponent(hotelKey), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(typeof body.detail === "string" ? body.detail : "This hotel link isn't available.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// --- Platform Analytics (real backend — backend/app/routers/analytics_router.py)
// Same contract as fastapiCallAssistCall/fastapiEnquiryCall above: real
// advisor JWT, FASTAPI_BASE. A NEW, separate surface from analyticsSummary()
// below (the per-advisor view AnalyticsPanel.jsx consumes, which stays on
// the legacy analytics-summary edge function, untouched) — this is the
// platform-wide dashboard.
function fastapiAnalyticsCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Analytics request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// getPlatformSummary() — GET /analytics/platform-summary
function getPlatformSummary() {
  return fastapiAnalyticsCall("/analytics/platform-summary", { method: "GET" });
}

// --- Admin oversight (backend/app/routers/admin_router.py) -----------------
// Same bearer-JWT contract as fastapiHotelCall() above — not renamed/reused
// because "hotel" is baked into that name; this is a generic sibling for the
// /admin/* routes. Every call requires a real session (get_current_admin
// re-checks role === 'admin' server-side on every request — this file never
// is the authority, just the transport).
function fastapiCall(path, options) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + path, {
    method: options.method,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError(body.detail || "Request failed.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// adminListAdvisors() -> [{ id, name, email, role, status }]
function adminListAdvisors() {
  return fastapiCall("/admin/advisors", { method: "GET" });
}

// adminUpdateAdvisor(id, { status?, role? }) -> updated advisor row
function adminUpdateAdvisor(id, updates) {
  return fastapiCall("/admin/advisors/" + encodeURIComponent(id), { method: "PATCH", body: updates });
}

// adminListOrders() -> every order, unfiltered by advisor/member
function adminListOrders() {
  return fastapiCall("/admin/orders", { method: "GET" });
}

// adminAssignEnquiry(enquiryId, advisorId) -> updated enquiry row
function adminAssignEnquiry(enquiryId, advisorId) {
  return fastapiCall("/admin/enquiries/" + encodeURIComponent(enquiryId) + "/assign", {
    method: "PATCH",
    body: { advisor_id: advisorId },
  });
}

// ---------------------------------------------------------------------------
// Public surface — named exports (mirrors the shape of window.TA_API).
// ---------------------------------------------------------------------------
export {
  // config (read-only references)
  URL,
  KEY,

  // core
  call,
  callAuthed,
  db,
  dbOne,
  ApiError,

  // formatter
  inr,

  // services (search)
  searchFlights,
  searchHotels,
  searchVisa,
  visaQueue,
  visaDecide,
  commitDocs,
  flightReprice,
  flightHold,

  // flight desk depth (Wave-1 dedicated functions, sell-only / quote-only)
  flightFares,
  flightIrrops,
  flightShop,

  // hotel desk depth (Wave-1 dedicated functions)
  hotelProperty,
  hotelServicingRead,
  hotelCommissionRead,

  // advisor task engine + analytics
  advisorTasks,
  analyticsSummary,

  // advisor workbench depth (approvals inbox / workload / handover / decide)
  advisorWorkbench,
  approvalsInbox,
  advisorWorkload,
  advisorHandover,
  approvalDecide,

  // pricing / orders / saga
  price,
  createOrder,
  runSaga,

  // quote sharing + DPDP consent
  createShareLink,
  getSharedQuote,
  revokeShareLink,
  setConsent,
  commsConsent,
  commsRead,
  getConversationMessages,
  getMessagesByPhone,
  sendMessageByPhone,

  // RAG / AI
  kbSearch,
  concierge,

  // RFQ engine
  rfqCompose,
  rfqDispatch,
  rfqSimulate,
  rfqInbound,
  rfqParse,
  rfqRank,
  rfqAward,
  rfqList,
  rfqGet,
  fetchAdvisors,

  // Pulse engine (Trending Now + Great Deals)
  pulseTrending,
  pulseNeedsReview,
  pulseCompose,
  pulseApprove,

  // Call Copilot
  callAssistRun,

  // Enquiries (advisor-initiated only — see enquiry_service.py)
  enquiryCreate,
  enquiryTravellerProfile,
  enquiryGenerateItinerary,
  enquiryRefreshItinerary,
  enquiryItineraryStarted,
  enquiryProposalSend,
  enquiryProposalOutcome,
  enquiryPipelineStatus,
  enquiryProposalShareCreate,
  proposalShareGet,

  // Public hotel page (/hotel/[hotelKey]) — hotelKey/image threaded onto
  // itinerary items, see hotel_router.py's public_router
  hotelPublicGet,

  // Platform Analytics (new, separate from analyticsSummary's per-advisor view)
  getPlatformSummary,

  // journeys (Concierge Care lifecycle)
  journeyTick,
  journeyApprove,

  // servicing case engine + refund status (post-booking spine)
  servicingCase,
  dispute,
  reconcile,
  advisorProposals,
  refundStatus,
  servicingIntake,
  holdServicing,
  escalationQueue,
  reconciliationQueue,
  servicingCases,

  // Wave-N dedicated functions (deployed this session)
  hotelModifyOrchestrate,
  flightEmd,
  commsDelivery,
  payRefundPreview,
  visaReadiness,
  visaCopilot,
  disputeCase,
  flightGroup,
  commsPreferences,
  hotelStayDeviation,
  advisorBookOfBusiness, // ADVISOR-INTERNAL (net/commission)
  visaAppointment,

  // table readers
  members,
  advisors,
  enquiries,
  suppliers,
  orders,
  quotes,
  rfqs,
  rfqQuotes,
  visaRequirements,
  journeys,
  journeyTouchpoints,

  // FastAPI backend (separate service)
  inviteCustomer,
  acceptAdvisorInvite,
  hotelAutosuggestV2,
  hotelListingV2,
  hotelDetailsV2,
  hotelPriceCheckV2,
  hotelRecommendations,
  hotelSetWebsite,
  fastapiFlightSearch,
  fastapiFlightAutosuggest,

  // Admin oversight (admin-only; server re-checks role on every call)
  adminListAdvisors,
  adminUpdateAdvisor,
  adminListOrders,
  adminAssignEnquiry,

  // Phase C access-request admin review (tripagent-site-main's backend —
  // see siteApiCall's own note: gated by a shared-secret ADMIN_API_KEY,
  // attached server-side by this app's own /api/site-admin proxy route,
  // never sent from browser-visible code. Real gate, but a shared secret,
  // not per-admin identity — unlike the role re-check the admin calls
  // above get from their own backend.)
  siteAccessRequestsPending,
  siteApproveAccessRequest,
  siteDenyAccessRequest,
};

// getConversationMessages(conversationId) — live chat messages for the
// admin console's 3rd column. Calls the new FastAPI endpoint directly
// (backend/app/routers/comms_router.py's GET /comms/conversations/{id}/messages),
// not the old comms-read edge function.
function getConversationMessages(conversationId) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + "/comms/conversations/" + encodeURIComponent(conversationId) + "/messages", {
    headers: { Authorization: "Bearer " + jwt },
  }).then(function (res) {
    return res.json().catch(function () { return []; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError((body && body.detail) || "Failed to fetch conversation messages.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// getMessagesByPhone(phone) — live chat messages for the admin console's
// 3rd column, resolved by the traveller's raw phone number (no member_id
// needed). Calls backend/app/routers/comms_router.py's GET
// /comms/by-phone/{phone}/messages.
function getMessagesByPhone(phone) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + "/comms/by-phone/" + encodeURIComponent(phone) + "/messages", {
    headers: { Authorization: "Bearer " + jwt },
  }).then(function (res) {
    return res.json().catch(function () { return []; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError((body && body.detail) || "Failed to fetch messages.", { status: res.status, body: body });
      }
      return body;
    });
  });
}

// sendMessageByPhone(phone, text) — send a WhatsApp reply from the admin
// console's live chat column, resolved by the traveller's raw phone
// number. Calls backend/app/routers/comms_router.py's POST
// /comms/by-phone/{phone}/send.
function sendMessageByPhone(phone, text) {
  var jwt = authBearer();
  if (!jwt) return Promise.reject(new ApiError("Not signed in.", { status: 401 }));

  return fetch(FASTAPI_BASE + "/comms/by-phone/" + encodeURIComponent(phone) + "/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: text }),
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok) {
        throw new ApiError((body && body.detail) || "Failed to send message.", { status: res.status, body: body });
      }
      return body;
    });
  });
}
