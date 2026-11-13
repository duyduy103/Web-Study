import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, UserRole } from "@/lib/supabase/types";
import {
  getAiDailyLimitForRole,
  getAiGlobalDailyLimit,
} from "@/lib/ai/limits";
import { getUserEntitlements } from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";

export interface QuotaStatus {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
}

export interface QuotaConsumeResult {
  allowed: boolean;
  calls: number;
  tokens: number;
  remaining: number;
}

/**
 * Tính cache_key = SHA-256(nội dung đầu vào + tên tác vụ + tên model + phiên bản prompt)
 */
export function buildAiCacheKey(params: {
  inputHashOrText: string | Buffer;
  task: string;
  model: string;
  promptVersion: string;
}): string {
  const hash = crypto.createHash("sha256");
  hash.update(params.task);
  hash.update("|");
  hash.update(params.model);
  hash.update("|");
  hash.update(params.promptVersion);
  hash.update("|");
  hash.update(params.inputHashOrText);
  return hash.digest("hex");
}

async function resolveUserRole(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<UserRole> {
  let targetId = userId;
  if (!targetId && supabase.auth?.getUser) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    targetId = user?.id;
  }
  if (!targetId) return "student";

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", targetId)
      .maybeSingle();

    return profile?.role === "teacher" ? "teacher" : "student";
  } catch {
    return "student";
  }
}

export async function getUserAiQuotaStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  knownRole?: UserRole
): Promise<QuotaStatus> {
  let dailyLimit: number;
  try {
    const entitlements = await getUserEntitlements(supabase, userId);
    dailyLimit = entitlements.limits.ai_daily_limit;
  } catch {
    const role = knownRole ?? (await resolveUserRole(supabase, userId));
    dailyLimit = getAiDailyLimitForRole(role);
  }
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  const usedToday = data?.calls ?? 0;
  return {
    dailyLimit,
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
  };
}

export async function lookupAiCache(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  cacheKey: string;
}): Promise<unknown | null> {
  const { data } = await params.supabase
    .from("ai_cache")
    .select("result")
    .eq("owner_id", params.userId)
    .eq("cache_key", params.cacheKey)
    .maybeSingle();

  return data?.result ?? null;
}

export async function saveAiCache(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  cacheKey: string;
  task: string;
  result: Json;
}): Promise<void> {
  await params.supabase.from("ai_cache").upsert(
    {
      owner_id: params.userId,
      cache_key: params.cacheKey,
      task: params.task,
      result: params.result,
    },
    { onConflict: "owner_id,cache_key" }
  );
}

/**
 * Tăng bộ đếm hạn mức AI nguyên tử thông qua hàm RPC consume_ai_quota.
 * Nếu vượt hạn mức ngày, ném lỗi tiếng Việt thân thiện.
 */
export async function consumeUserAiQuotaOrThrow(
  supabase: SupabaseClient<Database>,
  knownRole?: UserRole,
  userId?: string
): Promise<QuotaConsumeResult> {
  let userLimit: number;
  if (userId) {
    try {
      const entitlements = await getUserEntitlements(supabase, userId);
      userLimit = entitlements.limits.ai_daily_limit;
    } catch {
      const role = knownRole ?? (await resolveUserRole(supabase, userId));
      userLimit = getAiDailyLimitForRole(role);
    }
  } else {
    const role = knownRole ?? (await resolveUserRole(supabase, userId));
    userLimit = getAiDailyLimitForRole(role);
  }
  const globalLimit = getAiGlobalDailyLimit();

  const { data, error } = await supabase.rpc("consume_ai_quota_v2", {
    p_user_limit: userLimit,
    p_global_limit: globalLimit,
    p_tokens: 0,
  });

  if (error) {
    throw new Error(vi.ai.callFailed);
  }

  const payload = data as {
    allowed?: boolean;
    reason?: string | null;
    calls?: number;
    tokens?: number;
    remaining?: number;
  } | null;

  if (!payload || payload.allowed !== true) {
    if (payload?.reason === "GLOBAL_LIMIT") {
      throw new Error(vi.ai.globalQuotaExhausted);
    }
    throw new Error(vi.ai.quotaExhausted);
  }

  return {
    allowed: true,
    calls: payload.calls ?? 1,
    tokens: payload.tokens ?? 0,
    remaining: payload.remaining ?? Math.max(0, userLimit - 1),
  };
}

export async function recordUserAiTokens(
  supabase: SupabaseClient<Database>,
  tokens: number
): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return;
  }
  await supabase.rpc("record_ai_tokens", {
    p_tokens: Math.floor(tokens),
  });
}

