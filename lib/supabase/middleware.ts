import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getUserRole } from "@/lib/roles";

function redirectWithCookies(url: URL, supabaseResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  redirect.cookies.setAll(supabaseResponse.cookies.getAll());
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT run any code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicRoutes = ["/login", "/auth/callback", "/api/cron/"];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url, supabaseResponse);
  }

  // --- Role-based access control ---
  if (user && !isPublicRoute) {
    const role = getUserRole(user.email);
    const path = request.nextUrl.pathname;

    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectWithCookies(url, supabaseResponse);
    }

    if (role.type === "rep") {
      const ownDashboard = `/dashboard/${role.repId}`;
      const ownApi = `/api/commissions/rep/${role.repId}`;

      if (path === "/") {
        const url = request.nextUrl.clone();
        url.pathname = ownDashboard;
        return redirectWithCookies(url, supabaseResponse);
      }

      if (path.startsWith("/dashboard/") && path !== ownDashboard) {
        const url = request.nextUrl.clone();
        url.pathname = ownDashboard;
        return redirectWithCookies(url, supabaseResponse);
      }

      if (path.startsWith("/api/commissions/rep/") && !path.startsWith(ownApi)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (path === "/api/commissions") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    // exec users: allow all routes
  }

  // IMPORTANT: You *must* return the supabaseResponse object as is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
