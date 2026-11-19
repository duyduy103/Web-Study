import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextRedirectPath } from "@/lib/classes/constants";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const safeNext = sanitizeNextRedirectPath(searchParams.get("next"), "/dashboard");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery" || safeNext === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      const target =
        safeNext === "/dashboard" ? "/dashboard?confirmed=true" : safeNext;
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      if (type === "recovery" || safeNext === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      const target =
        safeNext === "/dashboard" ? "/dashboard?confirmed=true" : safeNext;
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

