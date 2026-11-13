import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  PlanLimits,
  UserEntitlements,
  PlanCode,
  SubscriptionStatus,
} from "@/lib/supabase/types";

export const DEFAULT_FREE_LIMITS: PlanLimits = {
  max_questions_per_set: 100,
  max_sets_per_day: 1,
  ai_daily_limit: 30,
  max_export_versions: 1,
};

export const DEFAULT_PREMIUM_LIMITS: PlanLimits = {
  max_questions_per_set: null, // không giới hạn
  max_sets_per_day: null, // không giới hạn
  ai_daily_limit: 300,
  max_export_versions: 4,
};

export interface ActiveSubscriptionInput {
  plan_code: string;
  status: string;
  period_end: string | null;
  source?: string;
}

/**
 * Hàm thuần tính toán quyền lợi hiệu lực (Entitlements) tại thời điểm đọc.
 * Tự động chuyển về Free nếu quá hạn (period_end < now).
 * Ưu tiên custom_ai_daily_limit do admin cấu hình.
 */
export function evaluateEntitlements(params: {
  customAiDailyLimit?: number | null;
  subscription?: ActiveSubscriptionInput | null;
  now?: Date;
}): UserEntitlements {
  const checkTime = params.now ? params.now.getTime() : Date.now();
  const sub = params.subscription;

  let isPremium = false;
  let status: SubscriptionStatus = "active";
  let periodEnd: string | null = null;
  let source = "default";

  if (sub && sub.plan_code === "premium" && sub.status === "active") {
    if (!sub.period_end) {
      // Vĩnh viễn (lifetime)
      isPremium = true;
      periodEnd = null;
      source = sub.source ?? "manual_grant";
    } else {
      const expiry = new Date(sub.period_end).getTime();
      if (expiry > checkTime) {
        isPremium = true;
        periodEnd = sub.period_end;
        source = sub.source ?? "manual_grant";
      } else {
        // Đã hết hạn -> tự động về gói Free
        isPremium = false;
        status = "expired";
        periodEnd = sub.period_end;
        source = sub.source ?? "manual_grant";
      }
    }
  }

  const baseLimits: PlanLimits = isPremium
    ? { ...DEFAULT_PREMIUM_LIMITS }
    : { ...DEFAULT_FREE_LIMITS };

  if (
    typeof params.customAiDailyLimit === "number" &&
    Number.isFinite(params.customAiDailyLimit) &&
    params.customAiDailyLimit >= 0
  ) {
    baseLimits.ai_daily_limit = Math.floor(params.customAiDailyLimit);
  }

  const planCode: PlanCode = isPremium ? "premium" : "free";
  const planName = isPremium ? "Cao cấp (Premium)" : "Miễn phí";

  return {
    plan_code: planCode,
    plan_name: planName,
    is_premium: isPremium,
    status,
    period_end: periodEnd,
    source,
    limits: baseLimits,
    custom_ai_daily_limit: params.customAiDailyLimit ?? null,
  };
}

/**
 * Lấy quyền lợi tài khoản từ Supabase (RPC get_entitlements hoặc truy vấn bảng).
 */
export async function getUserEntitlements(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<UserEntitlements> {
  if (!userId) {
    return evaluateEntitlements({});
  }

  // 1. Thử gọi RPC get_entitlements
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_entitlements",
    { p_user_id: userId }
  );

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const raw = rpcData as unknown as {
      plan_code?: string;
      plan_name?: string;
      is_premium?: boolean;
      status?: string;
      period_end?: string | null;
      source?: string;
      limits?: Partial<PlanLimits>;
      custom_ai_daily_limit?: number | null;
    };

    const isPrem = Boolean(raw.is_premium || raw.plan_code === "premium");
    const rawLimits = raw.limits ?? {};

    return {
      plan_code: isPrem ? "premium" : "free",
      plan_name: raw.plan_name ?? (isPrem ? "Cao cấp (Premium)" : "Miễn phí"),
      is_premium: isPrem,
      status: (raw.status as SubscriptionStatus) ?? "active",
      period_end: raw.period_end ?? null,
      source: raw.source ?? "default",
      limits: {
        max_questions_per_set:
          rawLimits.max_questions_per_set !== undefined
            ? rawLimits.max_questions_per_set
            : isPrem
            ? null
            : DEFAULT_FREE_LIMITS.max_questions_per_set,
        max_sets_per_day:
          rawLimits.max_sets_per_day !== undefined
            ? rawLimits.max_sets_per_day
            : isPrem
            ? null
            : DEFAULT_FREE_LIMITS.max_sets_per_day,
        ai_daily_limit:
          typeof rawLimits.ai_daily_limit === "number"
            ? rawLimits.ai_daily_limit
            : isPrem
            ? DEFAULT_PREMIUM_LIMITS.ai_daily_limit
            : DEFAULT_FREE_LIMITS.ai_daily_limit,
        max_export_versions:
          typeof rawLimits.max_export_versions === "number"
            ? rawLimits.max_export_versions
            : isPrem
            ? DEFAULT_PREMIUM_LIMITS.max_export_versions
            : DEFAULT_FREE_LIMITS.max_export_versions,
      },
      custom_ai_daily_limit: raw.custom_ai_daily_limit ?? null,
    };
  }

  // 2. Dự phòng: Truy vấn trực tiếp profiles & subscriptions
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select("custom_ai_daily_limit")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan_code, status, period_end, source")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle(),
  ]);

  return evaluateEntitlements({
    customAiDailyLimit: profile?.custom_ai_daily_limit,
    subscription: sub as ActiveSubscriptionInput | null,
  });
}
