import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const verifiedUser = authError ? null : user;

  const redirectWithCookies = (targetPathname: string) => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = targetPathname;
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  };

  const pathname = request.nextUrl.pathname;
  const isDashboardRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isBlockedRoute = pathname === "/blocked";
  const isProtectedAppRoute =
    isDashboardRoute ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/study" ||
    pathname.startsWith("/study/");

  if (!verifiedUser && isDashboardRoute) {
    return redirectWithCookies("/login");
  }

  if (verifiedUser && isAuthRoute) {
    return redirectWithCookies("/dashboard");
  }

  // Kiểm tra tài khoản bị khóa và cập nhật last_seen_at
  if (verifiedUser && (isProtectedAppRoute || isBlockedRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_blocked")
      .eq("id", verifiedUser.id)
      .single();

    const isBlocked = Boolean((profile as { is_blocked?: boolean } | null)?.is_blocked);

    if (isBlocked) {
      if (!isBlockedRoute) {
        return redirectWithCookies("/blocked");
      }
    } else {
      if (isBlockedRoute) {
        return redirectWithCookies("/dashboard");
      }
      // Người dùng hợp lệ: cập nhật last_seen_at (tối đa 1 lần/giờ)
      try {
        await supabase.rpc("update_last_seen");
      } catch {
        // Bỏ qua lỗi ngầm
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
