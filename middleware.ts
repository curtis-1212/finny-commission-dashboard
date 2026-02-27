import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getUserRole } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const publicRoutes = ["/login", "/api/auth", "/api/cron/"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // Not authenticated and not on public route -> redirect to login
  if (!token && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user on protected route -> check role-based access
  if (token && !isPublicRoute) {
    const email = token.email as string | undefined;
    const role = getUserRole(email);
    const path = request.nextUrl.pathname;

    // No valid role -> redirect to login
    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Rep users: restrict to their own dashboard
    if (role.type === "rep") {
      const ownDashboard = `/dashboard/${role.repId}`;
      const ownApi = `/api/commissions/rep/${role.repId}`;

      // Root path -> redirect to own dashboard
      if (path === "/") {
        const url = request.nextUrl.clone();
        url.pathname = ownDashboard;
        return NextResponse.redirect(url);
      }

      // Trying to access another rep's dashboard -> redirect to own
      if (path.startsWith("/dashboard/") && path !== ownDashboard) {
        const url = request.nextUrl.clone();
        url.pathname = ownDashboard;
        return NextResponse.redirect(url);
      }

      // Trying to access another rep's API -> 403
      if (path.startsWith("/api/commissions/rep/") && !path.startsWith(ownApi)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Trying to access exec API -> 403
      if (path === "/api/commissions") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    // Exec users: allow all routes
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
