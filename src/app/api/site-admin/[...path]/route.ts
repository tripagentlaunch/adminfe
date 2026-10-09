/* =============================================================================
 * TripAgent — src/app/api/site-admin/[...path]/route.ts
 *
 * Server-side proxy for tripagent-site-main's access-request admin-review
 * endpoints (GET /access-requests/pending, POST /access-requests/{id}/approve,
 * POST /access-requests/{id}/deny — added 2026-09-16, direct request, to close
 * the "anyone can call this" gap those 3 endpoints previously had).
 *
 * WHY THIS FILE EXISTS: that backend now requires a shared-secret ADMIN_API_KEY
 * on every request to those 3 endpoints. AdminPanel.tsx is a "use client"
 * component — its code runs in the browser. Any secret referenced from a
 * client component (or a NEXT_PUBLIC_* env var, which Next.js inlines into the
 * client bundle at build time) is visible to anyone who opens devtools. This
 * app IS a Next.js app (not a static SPA), so it can hold a real secret
 * server-side: this Route Handler runs only on the server, reads ADMIN_API_KEY
 * (deliberately NOT prefixed NEXT_PUBLIC_) from the server environment, and
 * attaches it to the outbound request itself. The browser only ever talks to
 * this same-origin /api/site-admin/* path — it never sees the key.
 *
 * src/services/api.ts's siteApiCall() was repointed here from calling
 * tripagent-site-main's backend directly — see that file's own note.
 *
 * FIXED 2026-10-09 (security): this route used to attach the admin key to
 * ANY request — no login needed — so anyone could list applicants' PII or
 * approve/deny requests through it. It now requires the caller's advisor
 * session (Bearer token) and checks with adminbe's GET /advisor/profile
 * that it belongs to an active admin, and only forwards the
 * access-requests endpoints.
 * =============================================================================*/
import { NextRequest, NextResponse } from "next/server";

// Server-only — never prefixed NEXT_PUBLIC_, so Next.js never inlines this
// into the client bundle. Must match tripagent-site-main's own ADMIN_API_KEY
// (backend/.env's ADMIN_API_KEY, checked by app/dependencies/admin_auth.py).
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

// Reuses the same env var api.ts already documents for this feature (still
// fine to read server-side even though it's NEXT_PUBLIC_-prefixed — the
// browser no longer needs this value for this feature at all, since it now
// only ever calls this same-origin route).
const SITE_API_BASE = process.env.NEXT_PUBLIC_SITE_API_BASE || "http://localhost:8000";

// adminbe — validates the advisor's Supabase session (same base api.ts uses).
const FASTAPI_BASE = process.env.NEXT_PUBLIC_FASTAPI_BASE || "http://127.0.0.1:8787";

// Only the access-request review endpoints go through this proxy.
const ALLOWED = [/^access-requests\/pending$/, /^access-requests\/[A-Za-z0-9-]+\/(approve|deny)$/];

// null when the caller is a signed-in, active admin; otherwise the response
// to send back.
async function rejectUnlessAdmin(req: NextRequest): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(auth)) {
    return NextResponse.json({ detail: "Not signed in." }, { status: 401 });
  }
  let res: Response;
  try {
    res = await fetch(`${FASTAPI_BASE}/advisor/profile`, { headers: { Authorization: auth }, cache: "no-store" });
  } catch {
    return NextResponse.json({ detail: "Could not verify your session." }, { status: 502 });
  }
  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ detail: "Not signed in." }, { status: 401 });
  }
  if (!res.ok) {
    return NextResponse.json({ detail: "Could not verify your session." }, { status: 502 });
  }
  const profile = (await res.json().catch(() => ({}))) as { role?: string; status?: string };
  if (profile.role !== "admin" || profile.status !== "active") {
    return NextResponse.json({ detail: "Admin access required." }, { status: 403 });
  }
  return null;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  // Fail CLOSED: no key configured on this deployment means every proxied
  // call is refused, never silently forwarded without the header.
  if (!ADMIN_API_KEY) {
    return NextResponse.json(
      { detail: "ADMIN_API_KEY not configured on this TRIPAGENT-FE deployment" },
      { status: 500 },
    );
  }

  const joined = path.join("/");
  if (!ALLOWED.some((re) => re.test(joined))) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }
  const rejected = await rejectUnlessAdmin(req);
  if (rejected) return rejected;

  const target = `${SITE_API_BASE}/${joined}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": ADMIN_API_KEY,
    },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const bodyText = await req.text();
    init.body = bodyText || "{}";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { detail: "Could not reach tripagent-site-main's backend." },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
