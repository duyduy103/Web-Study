import { describe, it, expect, vi as vitest } from "vitest";
import {
  evaluateEntitlements,
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
  getVietnamDateString,
  getRemainingSubscriptionDays,
} from "@/lib/entitlements";
import {
  validatePlanLimitsPure,
  enforceAccountImportLimits,
} from "@/lib/limits";
import { calculateYearlySavings } from "@/components/features/pricing/pricing-client";

describe("Bước 13 - Giai đoạn 1: Gói, Giới hạn theo gói (Fail-closed) & Thông báo", () => {
  it("1. Người dùng mặc định không có subscription được áp dụng gói Miễn phí (Free) theo đúng cấu hình Bước 13", () => {
    const entitlements = evaluateEntitlements({
      subscription: null,
      customAiDailyLimit: null,
    });

    expect(entitlements.plan_code).toBe("free");
    expect(entitlements.is_premium).toBe(false);
    expect(entitlements.limits.max_sets).toBe(3);
    expect(entitlements.limits.ai_daily).toBe(10);
    expect(entitlements.limits.max_file_mb).toBe(10);
    expect(entitlements.limits.max_pdf_pages).toBe(30);
    expect(entitlements.limits.storage_mb).toBe(50);
    expect(entitlements.limits.max_print_versions).toBe(4);
    expect(entitlements.limits.can_export_docx).toBe(false);
  });

  it("2. Gói Premium mở khóa đúng hạn mức Bước 13 (100 bộ, 50 AI/ngày, 20MB, 60 trang PDF, 500MB, 8 mã đề, xuất Word)", () => {
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
    expect(entitlements.limits.max_sets).toBe(100);
    expect(entitlements.limits.ai_daily).toBe(50);
    expect(entitlements.limits.max_file_mb).toBe(20);
    expect(entitlements.limits.max_pdf_pages).toBe(60);
    expect(entitlements.limits.storage_mb).toBe(500);
    expect(entitlements.limits.max_print_versions).toBe(8);
    expect(entitlements.limits.can_export_docx).toBe(true);
  });

  it("3. Gói Premium có thời hạn: còn hạn thì active, hết hạn thì tự động về Free", () => {
    const now = new Date("2026-11-13T12:00:00Z");

    const futureSub = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: "2026-11-25T12:00:00Z",
      },
      now,
    });
    expect(futureSub.is_premium).toBe(true);
    expect(futureSub.limits.ai_daily).toBe(50);
    expect(getRemainingSubscriptionDays(futureSub.period_end, now)).toBe(12);

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
    expect(expiredSub.limits.ai_daily).toBe(10);
    expect(expiredSub.limits.max_sets).toBe(3);
    expect(expiredSub.limits.can_export_docx).toBe(false);
  });

  it("4. Hạn mức AI riêng (custom_ai_daily_limit) từ Admin luôn được ưu tiên như ngoại lệ", () => {
    const freeCustom = evaluateEntitlements({
      subscription: null,
      customAiDailyLimit: 60,
    });
    expect(freeCustom.is_premium).toBe(false);
    expect(freeCustom.limits.ai_daily).toBe(60);
    expect(freeCustom.limits.ai_daily_limit).toBe(60);

    const premiumCustom = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: null,
      },
      customAiDailyLimit: 500,
    });
    expect(premiumCustom.is_premium).toBe(true);
    expect(premiumCustom.limits.ai_daily).toBe(500);
  });

  it("5. DEFAULT_FREE_LIMITS và DEFAULT_PREMIUM_LIMITS khớp chính xác seed Bước 13", () => {
    expect(DEFAULT_FREE_LIMITS).toMatchObject({
      max_sets: 3,
      ai_daily: 10,
      max_file_mb: 10,
      max_pdf_pages: 30,
      storage_mb: 50,
      max_print_versions: 4,
      can_export_docx: false,
    });

    expect(DEFAULT_PREMIUM_LIMITS).toMatchObject({
      max_sets: 100,
      ai_daily: 50,
      max_file_mb: 20,
      max_pdf_pages: 60,
      storage_mb: 500,
      max_print_versions: 8,
      can_export_docx: true,
    });
  });

  it("6. Người dùng có nhiều hơn max_sets: giữ nguyên bộ cũ, chỉ chặn khi tạo thêm bộ mới", () => {
    const freeEntitlements = evaluateEntitlements({ subscription: null });

    // Đang có 5/3 bộ (do từng ở gói cao hơn hoặc có từ trước):
    // Nếu KHÔNG tạo bộ mới (checkSetCount = false), không bị chặn vì lý do max_sets
    const checkWithoutCreating = validatePlanLimitsPure({
      isPremium: freeEntitlements.is_premium,
      limits: freeEntitlements.limits,
      currentSetCount: 5,
      currentStorageBytes: 1024 * 1024,
      newFileSizeBytes: 1024 * 1024,
      checkSetCount: false,
    });
    expect(checkWithoutCreating.allowed).toBe(true);

    // Nếu tạo thêm bộ mới (checkSetCount = true) khi đã có >= 3 bộ -> Chặn và báo rõ con số + quyền lợi Premium
    const checkCreatingNew = validatePlanLimitsPure({
      isPremium: freeEntitlements.is_premium,
      limits: freeEntitlements.limits,
      currentSetCount: 3,
      currentStorageBytes: 1024 * 1024,
      newFileSizeBytes: 1024 * 1024,
      checkSetCount: true,
    });
    expect(checkCreatingNew.allowed).toBe(false);
    if (!checkCreatingNew.allowed) {
      expect(checkCreatingNew.error).toContain("3/3");
      expect(checkCreatingNew.error).toContain("100 bộ");
    }
  });

  it("7. Kiểm tra giới hạn kích thước tệp, số trang PDF và dung lượng lưu trữ theo gói", () => {
    const freeEntitlements = evaluateEntitlements({ subscription: null });

    // Tệp 12 MB > 10 MB của gói Free
    const fileRes = validatePlanLimitsPure({
      isPremium: freeEntitlements.is_premium,
      limits: freeEntitlements.limits,
      currentSetCount: 1,
      currentStorageBytes: 0,
      newFileSizeBytes: 12 * 1024 * 1024,
    });
    expect(fileRes.allowed).toBe(false);
    if (!fileRes.allowed) {
      expect(fileRes.error).toContain("10 MB");
      expect(fileRes.error).toContain("20 MB");
    }

    // PDF 35 trang > 30 trang của gói Free
    const pdfRes = validatePlanLimitsPure({
      isPremium: freeEntitlements.is_premium,
      limits: freeEntitlements.limits,
      currentSetCount: 1,
      currentStorageBytes: 0,
      newFileSizeBytes: 1024 * 1024,
      pdfPageCount: 35,
    });
    expect(pdfRes.allowed).toBe(false);
    if (!pdfRes.allowed) {
      expect(pdfRes.error).toContain("30 trang");
      expect(pdfRes.error).toContain("60 trang");
    }
  });

  it("8. Các hàm kiểm tra hạn mức phải fail-closed khi DB/RPC gặp lỗi", async () => {
    const brokenSupabase = {
      rpc: vitest.fn().mockResolvedValue({
        data: null,
        error: { message: "DB connection error" },
      }),
      from: vitest.fn(),
    };

    await expect(
      enforceAccountImportLimits({
        supabase: brokenSupabase as never,
        userId: "user-123",
        role: "teacher",
        newFileSizeBytes: 1024,
        checkSetCount: true,
      })
    ).rejects.toThrow("Hệ thống tạm thời gặp sự cố");
  });

  it("9. Mốc ngày hạn mức AI tính theo múi giờ Asia/Ho_Chi_Minh và tiết kiệm gói năm tính tự động", () => {
    // 2026-11-14 18:30 UTC = 2026-11-15 01:30 giờ Việt Nam (UTC+7)
    const utcEvening = new Date("2026-11-14T18:30:00Z");
    expect(getVietnamDateString(utcEvening)).toBe("2026-11-15");

    const savings = calculateYearlySavings(39000, 299000);
    expect(savings.savedAmount).toBe(169000);
    expect(savings.savedPercent).toBe(36);
  });
});
