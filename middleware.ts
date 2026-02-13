import { NextRequest, NextResponse } from "next/server";

// Routes that require token authentication
const PROTECTED_PATTERNS = [
  /^\/$/, // Exec dashboard
  /^\/dashboard\//, // Individual rep dashboards
  /^\/api\/commissions(?:$|\/)/, // Commission APIs
];

// Routes that use their own auth (cron secret)
const SELF_AUTH_PATTERNS = [/^\/api\/cron\//];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for self-authenticated routes
  if (SELF_AUTH_PATTERNS.some((p) => p.test(pathname))) {
    return NextResponse.next();
  }

  // Check if route needs protection
  const isProtected = PROTECTED_PATTERNS.some((p) => p.test(pathname));
  if (!isProtected) return NextResponse.next();

  // Extract token from query param or Authorization header
  const token =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (!token) {
    // For API routes, return JSON 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // For pages, return a minimal HTML 401
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Access Denied</title>
       <style>body{background:#0B1120;color:#64748B;font-family:system-ui;display:flex;
       align-items:center;justify-content:center;height:100vh;margin:0}
       div{text-align:center}h1{color:#CBD5E1;font-size:20px;font-weight:500}
       p{font-size:14px;margin-top:8px}</style></head>
       <body><div><h1>Access Denied</h1><p>Valid token required.</p></div></body></html>`,
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  // Determine which token to validate against based on route
  let role: string;
  if (pathname === "/") {
    role = "exec";
  } else if (pathname.startsWith("/dashboard/")) {
    role = pathname.split("/")[2]; // e.g., "kelcy", "jason", "max"
  } else if (pathname.match(/^\/api\/commissions\/rep\//)) {
    role = pathname.split("/")[4]; // /api/commissions/rep/[rep]
  } else {
    role = "exec"; // Default: exec-level API access
  }

  // Validate — we do this server-side in the API routes too,
  // but middleware provides the first gate + nice error pages
  const expected =
    role === "exec"
      ? process.env.TOKEN_EXEC
      : role === "kelcy"
        ? process.env.TOKEN_KELCY
        : role === "jason"
          ? process.env.TOKEN_JASON
          : role === "max"
            ? process.env.TOKEN_MAX
            : undefined;

  if (!expected || token !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Access Denied</title>
       <style>body{background:#0B1120;color:#64748B;font-family:system-ui;display:flex;
       align-items:center;justify-content:center;height:100vh;margin:0}
       div{text-align:center}h1{color:#CBD5E1;font-size:20px;font-weight:500}
       p{font-size:14px;margin-top:8px}</style></head>
       <body><div><h1>Access Denied</h1><p>Invalid or expired token.</p></div></body></html>`,
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/api/commissions/:path*",
  ],
};
