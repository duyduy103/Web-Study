import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { getAiDailyLimit } from "@/lib/ai/client";
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
  userId: string
): Promise<QuotaStatus> {
  const dailyLimit = getAiDailyLimit();
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
  supabase: SupabaseClient<Database>
): Promise<QuotaConsumeResult> {
  const dailyLimit = getAiDailyLimit();

  const { data, error } = await supabase.rpc("consume_ai_quota", {
    p_daily_limit: dailyLimit,
    p_tokens: 0,
  });

  if (error) {
    throw new Error(vi.ai.callFailed);
  }

  const payload = data as {
    allowed?: boolean;
    calls?: number;
    tokens?: number;
    remaining?: number;
  } | null;

  if (!payload || payload.allowed !== true) {
    throw new Error(vi.ai.quotaExhausted);
  }

  return {
    allowed: true,
    calls: payload.calls ?? 1,
    tokens: payload.tokens ?? 0,
    remaining: payload.remaining ?? Math.max(0, dailyLimit - 1),
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

