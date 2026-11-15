import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  PlanCatalogItem,
  PlanCode,
  PlanLimits,
  PlanPeriodDays,
  PlanPrices,
  SubscriptionStatus,
  UserEntitlements,
} from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

export const DEFAULT_FREE_LIMITS: PlanLimits = {
  max_sets: 3,
  ai_daily: 10,
  max_file_mb: 10,
  max_pdf_pages: 30,
  storage_mb: 50,
  max_print_versions: 4,
  can_export_docx: false,
  // Khóa đồng bộ tương thích
  ai_daily_limit: 10,
  max_export_versions: 4,
  max_questions_per_set: null,
  max_sets_per_day: null,
};

export const DEFAULT_PREMIUM_LIMITS: PlanLimits = {
  max_sets: 100,
  ai_daily: 50,
  max_file_mb: 20,
  max_pdf_pages: 60,
  storage_mb: 500,
  max_print_versions: 8,
  can_export_docx: true,
  // Khóa đồng bộ tương thích
  ai_daily_limit: 50,
  max_export_versions: 8,
  max_questions_per_set: null,
  max_sets_per_day: null,
};

export const DEFAULT_PREMIUM_PRICES: PlanPrices = {
  month: 39000,
  year: 299000,
};

export const DEFAULT_PREMIUM_PERIOD_DAYS: PlanPeriodDays = {
  month: 30,
  year: 365,
};

export interface ActiveSubscriptionInput {
  id?: string;
  plan_code: string;
  status: string;
  period_end: string | null;
  source?: string;
  revoked_at?: string | null;
  revoked_reason?: string | null;
}

/**
 * Lấy chuỗi ngày YYYY-MM-DD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 */
export function getVietnamDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * Tính số ngày còn lại của gói có thời hạn (làm tròn lên theo ngày).
 * Trả về null nếu gói không có hạn (vĩnh viễn) hoặc không có period_end.
 */
export function getRemainingSubscriptionDays(
  periodEnd?: string | null,
  now: Date = new Date()
): number | null {
  if (!periodEnd) return null;
  const expiryMs = new Date(periodEnd).getTime();
  if (!Number.isFinite(expiryMs)) return null;
  const diffMs = expiryMs - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / 86_400_000));
}

export function normalizePlanLimits(
  raw: Record<string, unknown> | null | undefined,
  isPremium: boolean,
  customAiDailyLimit?: number | null
): PlanLimits {
  const r = raw ?? {};
  const hasExplicitKeys = Object.keys(r).length > 0;
  // Nếu không truyền object limits (null/rỗng) thì dùng mặc định theo gói;
  // nếu có object limits nhưng THIẾU khóa cụ thể thì dùng mặc định an toàn của gói Free cho khóa thiếu (không để lỗi null).
  const fallbackDefaults = hasExplicitKeys
    ? DEFAULT_FREE_LIMITS
    : isPremium
    ? DEFAULT_PREMIUM_LIMITS
    : DEFAULT_FREE_LIMITS;

  const maxSets =
    typeof r.max_sets === "number" && Number.isFinite(r.max_sets) && r.max_sets > 0
      ? Math.floor(r.max_sets)
      : fallbackDefaults.max_sets;

  const baseAiDaily =
    typeof r.ai_daily === "number" && Number.isFinite(r.ai_daily) && r.ai_daily >= 0
      ? Math.floor(r.ai_daily)
      : typeof r.ai_daily_limit === "number" &&
        Number.isFinite(r.ai_daily_limit) &&
        r.ai_daily_limit >= 0
      ? Math.floor(r.ai_daily_limit)
      : fallbackDefaults.ai_daily;

  const effectiveAiDaily =
    typeof customAiDailyLimit === "number" &&
    Number.isFinite(customAiDailyLimit) &&
    customAiDailyLimit >= 0
      ? Math.floor(customAiDailyLimit)
      : baseAiDaily;

  const maxFileMb =
    typeof r.max_file_mb === "number" &&
    Number.isFinite(r.max_file_mb) &&
    r.max_file_mb > 0
      ? Math.floor(r.max_file_mb)
      : fallbackDefaults.max_file_mb;

  const maxPdfPages =
    typeof r.max_pdf_pages === "number" &&
    Number.isFinite(r.max_pdf_pages) &&
    r.max_pdf_pages > 0
      ? Math.floor(r.max_pdf_pages)
      : fallbackDefaults.max_pdf_pages;

  const storageMb =
    typeof r.storage_mb === "number" &&
    Number.isFinite(r.storage_mb) &&
    r.storage_mb > 0
      ? Math.floor(r.storage_mb)
      : fallbackDefaults.storage_mb;

  const maxPrintVersions =
    typeof r.max_print_versions === "number" &&
    Number.isFinite(r.max_print_versions) &&
    r.max_print_versions > 0
      ? Math.floor(r.max_print_versions)
      : typeof r.max_export_versions === "number" &&
        Number.isFinite(r.max_export_versions) &&
        r.max_export_versions > 0
      ? Math.floor(r.max_export_versions)
      : fallbackDefaults.max_print_versions;

  const canExportDocx =
    typeof r.can_export_docx === "boolean"
      ? r.can_export_docx
      : fallbackDefaults.can_export_docx;

  const maxQuestionsPerSet =
    r.max_questions_per_set === null ||
    (typeof r.max_questions_per_set === "number" &&
      Number.isFinite(r.max_questions_per_set))
      ? (r.max_questions_per_set as number | null)
      : fallbackDefaults.max_questions_per_set;

  const maxSetsPerDay =
    r.max_sets_per_day === null ||
    (typeof r.max_sets_per_day === "number" &&
      Number.isFinite(r.max_sets_per_day))
      ? (r.max_sets_per_day as number | null)
      : fallbackDefaults.max_sets_per_day;

  return {
    max_sets: maxSets,
    ai_daily: effectiveAiDaily,
    max_file_mb: maxFileMb,
    max_pdf_pages: maxPdfPages,
    storage_mb: storageMb,
    max_print_versions: maxPrintVersions,
    can_export_docx: canExportDocx,
    ai_daily_limit: effectiveAiDaily,
    max_export_versions: maxPrintVersions,
    max_questions_per_set: maxQuestionsPerSet,
    max_sets_per_day: maxSetsPerDay,
  };
}

/**
 * Hàm thuần tính toán quyền lợi hiệu lực (Entitlements) tại thời điểm đọc.
 * Tự động chuyển về Free nếu quá hạn (period_end <= now).
 * Ưu tiên custom_ai_daily_limit (ngoại lệ do admin cấu hình).
 */
export function evaluateEntitlements(params: {
  customAiDailyLimit?: number | null;
  subscription?: ActiveSubscriptionInput | null;
  subscriptions?: ActiveSubscriptionInput[] | null;
  planLimitsOverride?: Record<string, unknown> | null;
  planPrices?: PlanPrices;
  planPeriodDays?: PlanPeriodDays;
  now?: Date;
}): UserEntitlements {
  const checkTime = params.now ? params.now.getTime() : Date.now();
  const candidateSubs: ActiveSubscriptionInput[] =
    params.subscriptions && params.subscriptions.length > 0
      ? params.subscriptions
      : params.subscription
      ? [params.subscription]
      : [];

  // Chọn dòng hiệu lực tốt nhất (status = 'active', chưa bị thu hồi, period_end > checkTime; ưu tiên vĩnh viễn hoặc hạn xa nhất)
  const validSubs = candidateSubs
    .filter((s) => {
      if (s.plan_code !== "premium") return false;
      if (s.status !== "active" || Boolean(s.revoked_at)) return false;
      if (!s.period_end) return true;
      const exp = new Date(s.period_end).getTime();
      return Number.isFinite(exp) && exp > checkTime;
    })
    .sort((a, b) => {
      if (!a.period_end && b.period_end) return -1;
      if (a.period_end && !b.period_end) return 1;
      if (!a.period_end && !b.period_end) return 0;
      return (
        new Date(b.period_end!).getTime() - new Date(a.period_end!).getTime()
      );
    });

  const sub = validSubs[0] ?? candidateSubs[0] ?? null;

  let isPremium = false;
  let status: SubscriptionStatus = "active";
  let periodEnd: string | null = null;
  let source = "default";

  if (sub && sub.plan_code === "premium") {
    if (sub.status === "revoked" || Boolean(sub.revoked_at)) {
      isPremium = false;
      status = "revoked";
      periodEnd = sub.period_end;
      source = sub.source ?? "manual_grant";
    } else if (sub.status === "canceled") {
      isPremium = false;
      status = "canceled";
      periodEnd = sub.period_end;
      source = sub.source ?? "manual_grant";
    } else if (sub.status === "active") {
      if (!sub.period_end) {
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
          isPremium = false;
          status = "expired";
          periodEnd = sub.period_end;
          source = sub.source ?? "manual_grant";
        }
      }
    } else {
      isPremium = false;
      status = "expired";
      periodEnd = sub.period_end;
      source = sub.source ?? "manual_grant";
    }
  }

  const limits = normalizePlanLimits(
    params.planLimitsOverride,
    isPremium,
    params.customAiDailyLimit
  );

  const planCode: PlanCode = isPremium ? "premium" : "free";
  const planName = isPremium ? "Premium" : "Miễn phí";

  return {
    plan_code: planCode,
    plan_name: planName,
    is_premium: isPremium,
    status,
    period_end: periodEnd,
    source,
    limits,
    prices: params.planPrices ?? (isPremium ? DEFAULT_PREMIUM_PRICES : {}),
    period_days:
      params.planPeriodDays ?? (isPremium ? DEFAULT_PREMIUM_PERIOD_DAYS : {}),
    custom_ai_daily_limit: params.customAiDailyLimit ?? null,
  };
}

/**
 * Kiểm tra và ghi thông báo mốc sắp hết hạn (7 ngày, 1 ngày) hoặc vừa hết hạn
 * khi người dùng mở ứng dụng (idempotent qua dedupe_key).
 */
async function ensureSubscriptionMilestoneNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  sub: ActiveSubscriptionInput | null
): Promise<void> {
  if (!sub || sub.plan_code !== "premium" || !sub.period_end) return;

  try {
    const subId = sub.id ?? `${userId}_${sub.period_end}`;
    const expiryDate = new Date(sub.period_end);
    const diffDays = (expiryDate.getTime() - Date.now()) / 86_400_000;
    const formattedDate = expiryDate.toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });

    if (diffDays <= 0) {
      await supabase.rpc("create_user_notification", {
        p_user_id: userId,
        p_type: "plan_expired",
        p_title: "Gói Premium đã hết hạn",
        p_body:
          "Gói Premium của bạn đã hết hạn và tài khoản chuyển về gói Miễn phí. Toàn bộ bộ câu hỏi, bài kiểm tra và lịch ôn tập của bạn vẫn được giữ nguyên an toàn.",
        p_metadata: { subscription_id: subId, period_end: sub.period_end },
        p_dedupe_key: `sub_expired_${subId}`,
      });
    } else if (diffDays <= 1) {
      await supabase.rpc("create_user_notification", {
        p_user_id: userId,
        p_type: "plan_expiring_soon",
        p_title: "Gói Premium còn dưới 1 ngày",
        p_body: `Gói Premium của bạn sẽ hết hạn vào ngày ${formattedDate}. Hãy gia hạn để duy trì 50 lượt AI/ngày và tải đề Word (.docx).`,
        p_metadata: {
          subscription_id: subId,
          milestone: "1d",
          period_end: sub.period_end,
        },
        p_dedupe_key: `sub_expiring_1d_${subId}`,
      });
    } else if (diffDays <= 7) {
      const daysLeft = Math.ceil(diffDays);
      await supabase.rpc("create_user_notification", {
        p_user_id: userId,
        p_type: "plan_expiring_soon",
        p_title: "Gói Premium sắp hết hạn",
        p_body: `Gói Premium của bạn còn ${daysLeft} ngày (đến ${formattedDate}). Bạn có thể gia hạn bất cứ lúc nào để cộng dồn ngày sử dụng.`,
        p_metadata: {
          subscription_id: subId,
          milestone: "7d",
          period_end: sub.period_end,
        },
        p_dedupe_key: `sub_expiring_7d_${subId}`,
      });
    }
  } catch {
    // Bỏ qua nếu bảng notifications chưa tạo trong môi trường test mock
  }
}

/**
 * Lấy quyền lợi tài khoản từ Supabase (RPC get_entitlements hoặc truy vấn bảng).
 * Nếu options.strict = true (dùng khi kiểm tra chặn giới hạn), mọi lỗi DB sẽ throw fail-closed.
 */
export async function getUserEntitlements(
  supabase: SupabaseClient<Database>,
  userId?: string,
  options?: { strict?: boolean }
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
      limits?: Record<string, unknown>;
      prices?: PlanPrices;
      period_days?: PlanPeriodDays;
      custom_ai_daily_limit?: number | null;
    };

    const rawStatus = (raw.status as SubscriptionStatus) ?? "active";
    const rawPeriodEnd = raw.period_end ?? null;
    const isNotExpired =
      !rawPeriodEnd || new Date(rawPeriodEnd).getTime() > Date.now();

    // Chỉ coi là Premium hợp lệ khi status === 'active' VÀ chưa hết hạn (period_end > now())
    const isPrem = Boolean(
      (raw.is_premium || raw.plan_code === "premium") &&
        rawStatus === "active" &&
        isNotExpired
    );

    const effectiveStatus: SubscriptionStatus = isPrem
      ? "active"
      : rawStatus === "revoked" || rawStatus === "canceled" || rawStatus === "expired"
      ? rawStatus
      : !isNotExpired && raw.plan_code === "premium"
      ? "expired"
      : "active";

    const customLimit =
      typeof raw.custom_ai_daily_limit === "number"
        ? raw.custom_ai_daily_limit
        : null;

    // Nếu bị thu hồi/hết hạn mà raw.limits vẫn mang giá trị của gói cũ thì ép tính lại theo gói Free
    const rawLimitsToNormalize =
      isPrem === Boolean(raw.is_premium || raw.plan_code === "premium")
        ? raw.limits
        : null;

    const effectiveLimits = normalizePlanLimits(
      rawLimitsToNormalize,
      isPrem,
      customLimit
    );

    return {
      plan_code: isPrem ? "premium" : "free",
      plan_name: isPrem ? "Premium" : "Miễn phí",
      is_premium: isPrem,
      status: effectiveStatus,
      period_end: rawPeriodEnd,
      source: raw.source ?? "default",
      limits: effectiveLimits,
      prices: raw.prices ?? (isPrem ? DEFAULT_PREMIUM_PRICES : {}),
      period_days:
        raw.period_days ?? (isPrem ? DEFAULT_PREMIUM_PERIOD_DAYS : {}),
      custom_ai_daily_limit: customLimit,
    };
  }

  if (rpcError) {
    console.error("[get_entitlements] Postgres RPC error:", {
      code: rpcError.code ?? "UNKNOWN",
      message: rpcError.message,
      details: rpcError.details ?? null,
    });
  }

  // Nếu đang kiểm tra strict (fail-closed) và RPC trả về lỗi hệ thống thật (ngoài lỗi 55000 v_latest_prem của migration 14)
  if (options?.strict && rpcError && rpcError.code !== "55000") {
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  // 2. Dự phòng: Truy vấn trực tiếp profiles, subscriptions (chỉ nhận status='active' & period_end > now) & plans
  const safeQueryProfile = async () => {
    try {
      return await supabase
        .from("profiles")
        .select("custom_ai_daily_limit")
        .eq("id", userId)
        .maybeSingle();
    } catch {
      return { data: null, error: null };
    }
  };

  const safeQuerySubscription = async () => {
    try {
      const activeRes = await supabase
        .from("subscriptions")
        .select("id, plan_code, status, period_end, source")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRes.error || activeRes.data) {
        return activeRes;
      }

      return await supabase
        .from("subscriptions")
        .select("id, plan_code, status, period_end, source")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    } catch {
      return { data: null, error: null };
    }
  };

  const safeQueryPlans = async () => {
    try {
      return await supabase
        .from("plans")
        .select("code, name, limits")
        .eq("active", true);
    } catch {
      return { data: null, error: null };
    }
  };

  const [profileRes, subRes, plansRes] = await Promise.all([
    safeQueryProfile(),
    safeQuerySubscription(),
    safeQueryPlans(),
  ]);

  if (options?.strict && (profileRes?.error || subRes?.error)) {
    console.error("[get_entitlements] Fallback DB query error:", {
      profileErrorCode: profileRes?.error?.code ?? null,
      subErrorCode: subRes?.error?.code ?? null,
    });
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  const sub = subRes.data as ActiveSubscriptionInput | null;

  if (sub) {
    void ensureSubscriptionMilestoneNotifications(supabase, userId, sub);
  }

  const evaluated = evaluateEntitlements({
    customAiDailyLimit: profileRes.data?.custom_ai_daily_limit,
    subscription: sub,
  });

  const matchedPlan = (plansRes.data ?? []).find(
    (p) => p.code === evaluated.plan_code
  );
  if (matchedPlan && matchedPlan.limits && typeof matchedPlan.limits === "object") {
    return {
      ...evaluated,
      plan_name: matchedPlan.name || evaluated.plan_name,
      limits: normalizePlanLimits(
        matchedPlan.limits as Record<string, unknown>,
        evaluated.is_premium,
        evaluated.custom_ai_daily_limit
      ),
    };
  }

  return evaluated;
}

/**
 * Đọc danh mục gói Free và Premium trực tiếp từ bảng `plans` trong DB cho trang `/pricing` và `/dashboard/account`.
 */
export async function getPlansCatalog(
  supabase: SupabaseClient<Database>
): Promise<{
  free: PlanCatalogItem;
  premium: PlanCatalogItem;
}> {
  const defaultFree: PlanCatalogItem = {
    code: "free",
    name: "Miễn phí",
    limits: { ...DEFAULT_FREE_LIMITS },
    prices: {},
    period_days: {},
    active: true,
  };

  const defaultPremium: PlanCatalogItem = {
    code: "premium",
    name: "Premium",
    limits: { ...DEFAULT_PREMIUM_LIMITS },
    prices: { ...DEFAULT_PREMIUM_PRICES },
    period_days: { ...DEFAULT_PREMIUM_PERIOD_DAYS },
    active: true,
  };

  try {
    const { data: rows, error } = await supabase
      .from("plans")
      .select("*")
      .eq("active", true);

    if (error || !rows || rows.length === 0) {
      return { free: defaultFree, premium: defaultPremium };
    }

    for (const row of rows) {
      const rawRow = row as unknown as {
        code: string;
        name: string;
        limits?: Record<string, unknown>;
        prices?: PlanPrices;
        period_days?: PlanPeriodDays;
        active?: boolean;
      };

      if (rawRow.code === "free") {
        defaultFree.name = rawRow.name || defaultFree.name;
        defaultFree.limits = normalizePlanLimits(rawRow.limits, false, null);
        defaultFree.prices =
          rawRow.prices && typeof rawRow.prices === "object"
            ? rawRow.prices
            : {};
        defaultFree.period_days =
          rawRow.period_days && typeof rawRow.period_days === "object"
            ? rawRow.period_days
            : {};
      } else if (rawRow.code === "premium") {
        defaultPremium.name = rawRow.name || defaultPremium.name;
        defaultPremium.limits = normalizePlanLimits(rawRow.limits, true, null);
        defaultPremium.prices =
          rawRow.prices &&
          typeof rawRow.prices === "object" &&
          (typeof rawRow.prices.month === "number" ||
            typeof rawRow.prices.year === "number")
            ? rawRow.prices
            : { ...DEFAULT_PREMIUM_PRICES };
        defaultPremium.period_days =
          rawRow.period_days &&
          typeof rawRow.period_days === "object" &&
          (typeof rawRow.period_days.month === "number" ||
            typeof rawRow.period_days.year === "number")
            ? rawRow.period_days
            : { ...DEFAULT_PREMIUM_PERIOD_DAYS };
      }
    }
  } catch {
    // Dự phòng an toàn nếu cột prices/period_days chưa được chạy migration
  }

  return { free: defaultFree, premium: defaultPremium };
}
