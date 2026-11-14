import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, UserRole } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

export interface AuthenticatedProfile {
  user: User;
  role: UserRole;
  displayName: string;
}

export function normalizeUserRole(raw: unknown): UserRole {
  return raw === "teacher" ? "teacher" : "student";
}

export function isTeacherRole(role: UserRole | null | undefined): boolean {
  return role === "teacher";
}

export async function getAuthenticatedProfile(
  supabase: SupabaseClient<Database>
): Promise<AuthenticatedProfile | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const role: UserRole =
    profile?.role === "teacher" || profile?.role === "student"
      ? profile.role
      : "student";

  const displayName =
    profile?.display_name ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "") ||
    user.email?.split("@")[0] ||
    vi.dashboard.defaultTeacherName;

  return { user, role, displayName };
}

export async function requireTeacherRole(
  supabase: SupabaseClient<Database>
): Promise<
  | { ok: true; profile: AuthenticatedProfile }
  | { ok: false; status: 401 | 403; error: string }
> {
  const profile = await getAuthenticatedProfile(supabase);
  if (!profile) {
    return {
      ok: false,
      status: 401,
      error: vi.importSet.errors.unauthorized,
    };
  }

  if (!isTeacherRole(profile.role)) {
    return {
      ok: false,
      status: 403,
      error: vi.roles.teacherOnlyForbidden,
    };
  }

  return { ok: true, profile };
}

