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

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  // Fail CLOSED: no key configured on this deployment means every proxied
  // call is refused, never silently forwarded without the header.
  if (!ADMIN_API_KEY) {
    return NextResponse.json(
      { detail: "ADMIN_API_KEY not configured on this TRIPAGENT-FE deployment" },
      { status: 500 },
    );
  }

  const target = `${SITE_API_BASE}/${path.join("/")}`;
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
