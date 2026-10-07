// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/accept-invite", "/request-access"];
const PUBLIC_API_PATHS = [
  "/api/accept-invite",
  "/api/reject-invite",
  "/api/request-access",
];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options });
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api");
  const isPublicPage = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const isPublicApi = PUBLIC_API_PATHS.some((p) => path.startsWith(p));

  // If unauthenticated and accessing a private route, redirect to /login
  if (!user && !isPublicPage && !isPublicApi) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If authenticated
  if (user && !isApi) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    const roleRoot = role ? `/${role}` : "/login";

    // If logged in and visiting login or request-access, send to their role root
    if (path === "/login" || path === "/request-access" || path === "/") {
      if (role) {
        const url = req.nextUrl.clone();
        url.pathname = roleRoot;
        return NextResponse.redirect(url);
      }
    }

    // Role-based route guard: non-admin accessing /admin
    if (path.startsWith("/admin") && role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = roleRoot;
      return NextResponse.redirect(url);
    }

    // Non-hod accessing /hod
    if (path.startsWith("/hod") && role !== "hod") {
      const url = req.nextUrl.clone();
      url.pathname = roleRoot;
      return NextResponse.redirect(url);
    }

    // Non-faculty accessing /faculty
    if (path.startsWith("/faculty") && role !== "faculty") {
      const url = req.nextUrl.clone();
      url.pathname = roleRoot;
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};