import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_PATTERNS = [
  /^\/$/, // Exec dashboard
  /^\/dashboard\//, // Individual rep dashboards
  /^\/api\/commissions(?:$|\/)/, // Commission APIs
];

// Routes that use their own auth (cron secret)
const SELF_AUTH_PATTERNS = [/^\/api\/cron\//];

// Public routes (no auth needed)
const PUBLIC_PATTERNS = [/^\/login$/, /^\/api\/auth\//];

// Legacy token map (kept for backward compat, cron jobs, API access)
const TOKEN_MAP: Record<string, string | undefined> = {
  exec: process.env.TOKEN_EXEC,
  kelcy: process.env.TOKEN_KELCY,
  jason: process.env.TOKEN_JASON,
  max: process.env.TOKEN_MAX,
  austin: process.env.TOKEN_AUSTIN,
  roy: process.env.TOKEN_ROY,
};

function validateLegacyToken(pathname: string, token: string): boolean {
  let role: string;
  if (pathname === "/") {
    role = "exec";
  } else if (pathname.startsWith("/dashboard/")) {
    role = pathname.split("/")[2];
  } else if (pathname.match(/^\/api\/commissions\/rep\//)) {
    role = pathname.split("/")[4];
  } else {
    role = "exec";
  }
  const expected = TOKEN_MAP[role];
  if (!expected || expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip self-authenticated routes (cron)
  if (SELF_AUTH_PATTERNS.some((p) => p.test(pathname))) {
    return NextResponse.next();
  }

  // Handle public routes
  if (PUBLIC_PATTERNS.some((p) => p.test(pathname))) {
    // If user is already logged in and hits /login, redirect to home
    if (pathname === "/login") {
      const { supabase, response } = createClient(request);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return response;
    }
    return NextResponse.next();
  }

  // Check if route needs protection
  const isProtected = PROTECTED_PATTERNS.some((p) => p.test(pathname));
  if (!isProtected) return NextResponse.next();

  // --- AUTH CHECK 1: Legacy token (query param or Bearer header) ---
  const token =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (token && validateLegacyToken(pathname, token)) {
    return NextResponse.next();
  }

  // --- AUTH CHECK 2: Supabase session (cookie-based) ---
  const { supabase, response } = createClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return response;
  }

  // --- Neither auth method succeeded ---
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect unauthenticated page requests to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/api/commissions/:path*",
    "/api/auth/:path*",
  ],
};
