"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";
import { vi } from "@/lib/i18n/vi";

export interface AuthActionState {
  error?: string;
  successMessage?: string;
  fieldErrors?: {
    role?: string;
    displayName?: string;
    email?: string;
    password?: string;
    consentAccepted?: string;
  };
}

function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return vi.auth.errors.invalidCredentials;
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered")
  ) {
    return vi.auth.errors.emailAlreadyRegistered;
  }
  if (lower.includes("email not confirmed")) {
    return vi.auth.errors.emailNotConfirmed;
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return vi.auth.errors.rateLimited;
  }
  return vi.auth.errors.generic;
}

async function getActionClientIp(): Promise<string> {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() || "unknown";
    }
    return hdrs.get("x-real-ip") ?? "local";
  } catch {
    return "local";
  }
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawInput: unknown = {
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  };

  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: mapSupabaseAuthError(error.message),
    };
  }

  redirect("/dashboard");
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const rawInput: unknown = {
    role: formData.get("role") ?? "",
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    consentAccepted: formData.get("consentAccepted") === "on",
  };

  const parsed = signupSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        role: flattened.role?.[0],
        displayName: flattened.displayName?.[0],
        email: flattened.email?.[0],
        password: flattened.password?.[0],
        consentAccepted: flattened.consentAccepted?.[0],
      },
    };
  }

  const supabase = await createClient();
  const clientIp = await getActionClientIp();
  const { data: allowed } = await supabase.rpc("check_rate_limit", {
    p_key: `signup:${clientIp}`,
    p_max_hits: 10,
    p_window_seconds: 300,
  });

  if (allowed === false) {
    return {
      error: vi.auth.errors.rateLimited,
    };
  }

  const emailPrefix = parsed.data.email.split("@")[0] ?? "";
  const resolvedDisplayName =
    parsed.data.displayName && parsed.data.displayName.length > 0
      ? parsed.data.displayName
      : emailPrefix;

  // Server chỉ chấp nhận đúng 2 giá trị "student" | "teacher" đã qua Zod
  const safeRole: "student" | "teacher" =
    parsed.data.role === "teacher" ? "teacher" : "student";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: resolvedDisplayName,
        role: safeRole,
        consented_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    return {
      error: mapSupabaseAuthError(error.message),
    };
  }

  if (data.session) {
    redirect("/dashboard");
  }

  return {
    successMessage: vi.auth.signupSuccessNotice,
  };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
