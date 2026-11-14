import { describe, it, expect } from "vitest";
import {
  evaluateEntitlements,
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
} from "@/lib/entitlements";

describe("Bước 12 - Giai đoạn B: Gói và quyền lợi (Plans & Entitlements)", () => {
  it("1. Người dùng mặc định không có subscription được áp dụng gói Miễn phí (Free)", () => {
    const entitlements = evaluateEntitlements({
      subscription: null,
      customAiDailyLimit: null,
    });

    expect(entitlements.plan_code).toBe("free");
    expect(entitlements.is_premium).toBe(false);
    expect(entitlements.limits.max_questions_per_set).toBe(100);
    expect(entitlements.limits.max_sets_per_day).toBe(1);
    expect(entitlements.limits.ai_daily_limit).toBe(30);
    expect(entitlements.limits.max_export_versions).toBe(1);
  });

  it("2. Gói Premium vĩnh viễn (period_end = null) mở khóa không giới hạn và 4 mã đề", () => {
    const entitlements = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: null,
        source: "manual_grant",
      },
      customAiDailyLimit: null,
    });

    expect(entitlements.plan_code).toBe("premium");
    expect(entitlements.is_premium).toBe(true);
    expect(entitlements.limits.max_questions_per_set).toBeNull(); // Không giới hạn
    expect(entitlements.limits.max_sets_per_day).toBeNull(); // Không giới hạn
    expect(entitlements.limits.ai_daily_limit).toBe(300);
    expect(entitlements.limits.max_export_versions).toBe(4);
  });

  it("3. Gói Premium có thời hạn: còn hạn thì active, hết hạn thì tự động về Free", () => {
    const now = new Date("2026-11-13T12:00:00Z");

    // Trường hợp 1: Hết hạn vào ngày mai -> Vẫn Premium
    const futureSub = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: "2026-11-14T12:00:00Z",
      },
      now,
    });
    expect(futureSub.is_premium).toBe(true);
    expect(futureSub.limits.ai_daily_limit).toBe(300);

    // Trường hợp 2: Đã hết hạn hôm qua -> Tự động chuyển về Free
    const expiredSub = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: "2026-11-12T12:00:00Z",
      },
      now,
    });
    expect(expiredSub.is_premium).toBe(false);
    expect(expiredSub.status).toBe("expired");
    expect(expiredSub.limits.ai_daily_limit).toBe(30);
    expect(expiredSub.limits.max_export_versions).toBe(1);
  });

  it("4. Hạn mức AI riêng (custom_ai_daily_limit) từ Admin luôn được ưu tiên cao nhất", () => {
    // Trên gói Free, admin tăng lên 60
    const freeCustom = evaluateEntitlements({
      subscription: null,
      customAiDailyLimit: 60,
    });
    expect(freeCustom.is_premium).toBe(false);
    expect(freeCustom.limits.ai_daily_limit).toBe(60);

    // Trên gói Premium, admin gán hạn mức đặc biệt 500
    const premiumCustom = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: null,
      },
      customAiDailyLimit: 500,
    });
    expect(premiumCustom.is_premium).toBe(true);
    expect(premiumCustom.limits.ai_daily_limit).toBe(500);
  });

  it("5. Giá trị mặc định DEFAULT_FREE_LIMITS và DEFAULT_PREMIUM_LIMITS khớp yêu cầu PRD", () => {
    expect(DEFAULT_FREE_LIMITS).toEqual({
      max_questions_per_set: 100,
      max_sets_per_day: 1,
      ai_daily_limit: 30,
      max_export_versions: 1,
    });

    expect(DEFAULT_PREMIUM_LIMITS).toEqual({
      max_questions_per_set: null,
      max_sets_per_day: null,
      ai_daily_limit: 300,
      max_export_versions: 4,
    });
  });
});

