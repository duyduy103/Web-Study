import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
  UserEntitlements,
  UserRole,
} from "@/lib/supabase/types";
import { getAiGlobalDailyLimit } from "@/lib/ai/limits";
import {
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
  getUserEntitlements,
  getVietnamDateString,
} from "@/lib/entitlements";
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

export async function getUserAiQuotaStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  _knownRole?: UserRole
): Promise<QuotaStatus> {
  void _knownRole;
  let dailyLimit: number = DEFAULT_FREE_LIMITS.ai_daily;
  try {
    const entitlements = await getUserEntitlements(supabase, userId);
    dailyLimit = entitlements.limits.ai_daily;
  } catch {
    dailyLimit = DEFAULT_FREE_LIMITS.ai_daily;
  }

  const todayVn = getVietnamDateString();

  const { data } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("date", todayVn)
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
 * Tăng bộ đếm hạn mức AI nguyên tử thông qua hàm RPC consume_ai_quota_v2.
 * Hạn mức AI do GÓI quyết định (hoặc custom_ai_daily_limit ngoại lệ của admin).
 * Kiểm tra fail-closed: nếu lỗi DB/RPC thì chặn và báo "Hệ thống tạm thời gặp sự cố".
 */
export async function consumeUserAiQuotaOrThrow(
  supabase: SupabaseClient<Database>,
  _knownRole?: UserRole,
  userId?: string
): Promise<QuotaConsumeResult> {
  void _knownRole;
  let resolvedUserId = userId;
  if (!resolvedUserId && supabase.auth?.getUser) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      resolvedUserId = user?.id;
    } catch {
      // ignore
    }
  }

  let entitlements: UserEntitlements;
  try {
    entitlements = await getUserEntitlements(supabase, resolvedUserId, {
      strict: Boolean(resolvedUserId),
    });
  } catch {
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  const userLimit = entitlements.limits.ai_daily;
  const globalLimit = getAiGlobalDailyLimit();

  let { data, error } = await supabase.rpc("consume_ai_quota_v2", {
    p_user_limit: userLimit,
    p_global_limit: globalLimit,
    p_tokens: 0,
  });

  if (error) {
    console.warn(
      `[AI Quota] consume_ai_quota_v2 lỗi (${error.code || "RPC_ERR"}), chuyển sang consume_ai_quota dự phòng.`
    );
    const fallback = await supabase.rpc("consume_ai_quota", {
      p_daily_limit: userLimit,
      p_tokens: 0,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  const payload = data as {
    allowed?: boolean;
    reason?: string | null;
    calls?: number;
    tokens?: number;
    remaining?: number;
    daily_limit?: number;
  } | null;

  if (!payload || payload.allowed !== true) {
    if (payload?.reason === "GLOBAL_LIMIT") {
      throw new Error(vi.ai.globalQuotaExhausted);
    }
    if (payload?.reason === "ACCOUNT_BLOCKED") {
      throw new Error(vi.ai.errors.accountBlocked);
    }

    const effectiveLimit = payload?.daily_limit ?? userLimit;
    const planLabel = entitlements.is_premium ? "Gói Premium" : "Gói miễn phí";
    const upgradeBenefit = entitlements.is_premium
      ? "Lượt AI sẽ tự động làm mới lúc 0:00 giờ Việt Nam."
      : `Nâng cấp lên gói Premium để có ${DEFAULT_PREMIUM_LIMITS.ai_daily} lượt AI/ngày (làm mới lúc 0:00 giờ Việt Nam).`;

    throw new Error(
      `Bạn đã dùng hết lượt AI hôm nay, quay lại vào ngày mai. ${planLabel} có tối đa ${effectiveLimit} lượt AI/ngày (đã dùng ${effectiveLimit}/${effectiveLimit}). ${upgradeBenefit}`
    );
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
