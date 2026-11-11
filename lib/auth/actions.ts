"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";
import { vi } from "@/lib/i18n/vi";

export interface AuthActionState {
  error?: string;
  successMessage?: string;
  fieldErrors?: {
    displayName?: string;
    email?: string;
    password?: string;
  };
}

function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return vi.auth.errors.invalidCredentials;
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
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
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  };

  const parsed = signupSchema.safeParse(rawInput);
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        displayName: flattened.displayName?.[0],
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      },
    };
  }

  const emailPrefix = parsed.data.email.split("@")[0] ?? "";
  const resolvedDisplayName =
    parsed.data.displayName && parsed.data.displayName.length > 0
      ? parsed.data.displayName
      : emailPrefix;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: resolvedDisplayName,
        role: "teacher",
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

