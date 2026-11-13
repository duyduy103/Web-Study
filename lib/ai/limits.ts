import type { UserRole } from "@/lib/supabase/types";

function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number
): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getAiDailyLimitForRole(role: UserRole): number {
  const fallback = parseNonNegativeInt(
    process.env.AI_DAILY_LIMIT,
    role === "teacher" ? 30 : 10
  );

  if (role === "teacher") {
    return parseNonNegativeInt(process.env.AI_DAILY_LIMIT_TEACHER, fallback);
  }
  return parseNonNegativeInt(process.env.AI_DAILY_LIMIT_STUDENT, fallback);
}

export function getAiGlobalDailyLimit(): number {
  return parseNonNegativeInt(process.env.AI_GLOBAL_DAILY_LIMIT, 500);
}

