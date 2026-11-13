"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/auth/schemas";
import { vi } from "@/lib/i18n/vi";

export interface AuthActionState {
  error?: string;
  successMessage?: string;
  emailAlreadyRegistered?: boolean;
  needsEmailConfirmation?: boolean;
  unconfirmedEmail?: string;
  values?: {
    email?: string;
    displayName?: string;
    role?: "student" | "teacher";
    consentAccepted?: boolean;
  };
  fieldErrors?: {
    role?: string;
    displayName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    consentAccepted?: string;
  };
}

function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials") ||
    lower.includes("user not found")
  ) {
    return vi.auth.errors.invalidCredentials;
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("email already in use")
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

async function getOriginUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl && envUrl.startsWith("http")) {
    return envUrl.replace(/\/+$/, "");
  }
  try {
    const hdrs = await headers();
    const host = hdrs.get("host") || "localhost:3000";
    const proto = hdrs.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = (formData.get("email") as string | null) ?? "";
  const passwordRaw = (formData.get("password") as string | null) ?? "";

  const rawInput = {
    email: emailRaw,
    password: passwordRaw,
  };

  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      values: { email: emailRaw },
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
    const lower = error.message.toLowerCase();
    if (lower.includes("email not confirmed")) {
      return {
        error: vi.auth.emailNotConfirmedWithResend,
        needsEmailConfirmation: true,
        unconfirmedEmail: parsed.data.email,
        values: { email: parsed.data.email },
      };
    }

    return {
      error: vi.auth.errors.invalidCredentials,
      values: { email: parsed.data.email },
    };
  }

  redirect("/dashboard");
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const roleRaw = (formData.get("role") as "student" | "teacher" | null) ?? "student";
  const displayNameRaw = (formData.get("displayName") as string | null) ?? "";
  const emailRaw = (formData.get("email") as string | null) ?? "";
  const passwordRaw = (formData.get("password") as string | null) ?? "";
  const confirmPasswordRaw =
    (formData.get("confirmPassword") as string | null) ?? "";
  const consentAcceptedRaw = formData.get("consentAccepted") === "on";

  const rawInput = {
    role: roleRaw,
    displayName: displayNameRaw,
    email: emailRaw,
    password: passwordRaw,
    confirmPassword: confirmPasswordRaw,
    consentAccepted: consentAcceptedRaw,
  };

  const currentValues = {
    role: roleRaw,
    displayName: displayNameRaw,
    email: emailRaw,
    consentAccepted: consentAcceptedRaw,
  };

  const parsed = signupSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      values: currentValues,
      fieldErrors: {
        role: flattened.role?.[0],
        displayName: flattened.displayName?.[0],
        email: flattened.email?.[0],
        password: flattened.password?.[0],
        confirmPassword: flattened.confirmPassword?.[0],
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
      values: currentValues,
      error: vi.auth.errors.rateLimited,
    };
  }

  const emailPrefix = parsed.data.email.split("@")[0] ?? "";
  const resolvedDisplayName =
    parsed.data.displayName && parsed.data.displayName.length > 0
      ? parsed.data.displayName
      : emailPrefix;

  const safeRole: "student" | "teacher" =
    parsed.data.role === "teacher" ? "teacher" : "student";

  const origin = await getOriginUrl();
  const emailRedirectTo = `${origin}/auth/callback?next=/dashboard`;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
      data: {
        display_name: resolvedDisplayName,
        role: safeRole,
        consented_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("user already registered") ||
      lower.includes("already been registered") ||
      lower.includes("email already in use")
    ) {
      return {
        emailAlreadyRegistered: true,
        error: vi.auth.errors.emailAlreadyRegistered,
        values: currentValues,
      };
    }

    return {
      values: currentValues,
      error: mapSupabaseAuthError(error.message),
    };
  }

  // Supabase anti-enumeration behavior: when email exists and confirm is enabled, identities array is empty
  if (
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    return {
      emailAlreadyRegistered: true,
      error: vi.auth.errors.emailAlreadyRegistered,
      values: currentValues,
    };
  }

  if (data.session) {
    redirect("/dashboard");
  }

  return {
    successMessage: vi.auth.signupSuccessNotice,
    unconfirmedEmail: parsed.data.email,
  };
}

export async function resendConfirmationEmailAction(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = (email || "").trim();
    if (!trimmed || !trimmed.includes("@")) {
      return { success: false, error: vi.auth.validation.emailInvalid };
    }

    const supabase = await createClient();
    const origin = await getOriginUrl();
    const emailRedirectTo = `${origin}/auth/callback?next=/dashboard`;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      return { success: false, error: mapSupabaseAuthError(error.message) };
    }

    return { success: true };
  } catch {
    return { success: false, error: vi.auth.errors.generic };
  }
}

export async function forgotPasswordAction(
  _prevState: { success?: boolean; error?: string; message?: string },
  formData: FormData
): Promise<{ success?: boolean; error?: string; message?: string }> {
  const emailRaw = (formData.get("email") as string | null) ?? "";
  const parsed = forgotPasswordSchema.safeParse({ email: emailRaw });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? vi.auth.validation.emailInvalid,
    };
  }

  const supabase = await createClient();
  const origin = await getOriginUrl();
  const redirectTo = `${origin}/auth/callback?type=recovery&next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo }
  );

  if (error) {
    // Không tiết lộ email có tồn tại hay không, trừ rate limit
    if (error.message.toLowerCase().includes("rate limit")) {
      return { error: vi.auth.errors.rateLimited };
    }
  }

  return {
    success: true,
    message: vi.auth.forgotPassword.successDesc,
  };
}

export async function resetPasswordAction(
  _prevState: { success?: boolean; error?: string; fieldErrors?: Record<string, string> },
  formData: FormData
): Promise<{ success?: boolean; error?: string; fieldErrors?: Record<string, string> }> {
  const passwordRaw = (formData.get("password") as string | null) ?? "";
  const confirmPasswordRaw =
    (formData.get("confirmPassword") as string | null) ?? "";

  const parsed = resetPasswordSchema.safeParse({
    password: passwordRaw,
    confirmPassword: confirmPasswordRaw,
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        password: flattened.password?.[0] ?? "",
        confirmPassword: flattened.confirmPassword?.[0] ?? "",
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: vi.auth.resetPassword.errorGeneric,
    };
  }

  return {
    success: true,
  };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
