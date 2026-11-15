import { describe, it, expect, vi as vitest } from "vitest";
vitest.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import {
  evaluateEntitlements,
  getUserEntitlements,
  normalizePlanLimits,
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
  getVietnamDateString,
  getRemainingSubscriptionDays,
} from "@/lib/entitlements";
import {
  validatePlanLimitsPure,
  enforceAccountImportLimits,
} from "@/lib/limits";
import {
  executeActivateSubscriptionFromOrder,
  executeAdminRevokePremium,
  type InMemoryPaymentState,
} from "@/lib/payments/sepay";
import { buildSourcePreview, validateAndReadSource } from "@/lib/sets/import-service";
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

  it("10. Hồi quy lỗi Postgres 55000 (v_latest_prem unassigned) và đồng bộ đơn paid -> subscriptions hiệu lực -> preview/import thành công với ai_daily = 50", async () => {
    const now = new Date("2026-11-15T04:00:00Z");
    const state: InMemoryPaymentState = {
      plans: {
        free: {
          code: "free",
          name: "Miễn phí",
          active: true,
          prices: {},
          period_days: {},
        },
        premium: {
          code: "premium",
          name: "Premium",
          active: true,
          prices: { month: 39000, year: 299000 },
          period_days: { month: 30, year: 365 },
        },
      },
      orders: new Map([
        [
          "ord-prem-1",
          {
            id: "ord-prem-1",
            user_id: "user-prem-1",
            plan_code: "premium",
            period: "month",
            amount: 39000,
            currency: "VND",
            status: "pending",
            provider: "sepay",
            provider_ref: null,
            payment_code: "MQTEST50AI",
            created_at: now.toISOString(),
            paid_at: null,
            expires_at: new Date(now.getTime() + 48 * 3600_000).toISOString(),
          },
        ],
      ]),
      subscriptions: [],
      paymentEvents: new Map(),
      notifications: [],
    };

    // Kích hoạt đơn -> tạo dòng subscriptions hiệu lực đúng hạn 30 ngày
    const act = executeActivateSubscriptionFromOrder(state, "ord-prem-1", now, "SIM-50AI");
    expect(act.ok).toBe(true);
    expect(act.status).toBe("activated");
    expect(act.daysAdded).toBe(30);
    expect(state.orders.get("ord-prem-1")?.status).toBe("paid");
    expect(state.subscriptions).toHaveLength(1);
    const activeSub = state.subscriptions[0]!;
    expect(activeSub.status).toBe("active");
    expect(activeSub.plan_code).toBe("premium");

    // Giả lập Supabase client khi RPC get_entitlements gặp lỗi 55000 (trước khi chạy migration 16)
    // nhưng bảng subscriptions/orders có gói Premium đang active
    const mockSupabaseWith55000 = {
      rpc: vitest.fn().mockResolvedValue({
        data: null,
        error: {
          code: "55000",
          message: 'record "v_latest_prem" is not assigned yet',
          details: null,
        },
      }),
      from: vitest.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { custom_ai_daily_limit: null },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: activeSub,
                        error: null,
                      }),
                    }),
                  }),
                }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: activeSub,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: state.orders.get("ord-prem-1"),
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "plans") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { code: "free", name: "Miễn phí", limits: DEFAULT_FREE_LIMITS },
                  { code: "premium", name: "Premium", limits: DEFAULT_PREMIUM_LIMITS },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "question_sets") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: "set-1" }, { id: "set-2" }, { id: "set-3" }, { id: "set-4" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "source_files") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ file_size_bytes: 1024 * 1024 }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    };

    // 1. Kiểm tra getUserEntitlements strict trả về Premium 50 lượt/ngày
    const ent = await getUserEntitlements(
      mockSupabaseWith55000 as never,
      "user-prem-1",
      { strict: true }
    );
    expect(ent.is_premium).toBe(true);
    expect(ent.plan_code).toBe("premium");
    expect(ent.limits.ai_daily).toBe(50);
    expect(ent.limits.max_sets).toBe(100);

    // 2. Tài khoản Premium đang có 4 bộ (> 3 bộ của Free) và nạp file 15MB (> 10MB của Free)
    // gọi enforceAccountImportLimits + buildSourcePreview (luồng preview/import) thành công!
    const enforcedEnt = await enforceAccountImportLimits({
      supabase: mockSupabaseWith55000 as never,
      userId: "user-prem-1",
      role: "teacher",
      newFileSizeBytes: 15 * 1024 * 1024,
      pdfPageCount: 45,
      checkSetCount: true,
    });
    expect(enforcedEnt.is_premium).toBe(true);
    expect(enforcedEnt.limits.ai_daily).toBe(50);

    const source = await validateAndReadSource(
      null,
      "Câu 1: Thủ đô của Việt Nam là gì?\nA. Hà Nội\n*B. Hà Nội\nC. Huế\nD. Đà Nẵng"
    );
    const preview = await buildSourcePreview(source, {
      remainingAiQuota: enforcedEnt.limits.ai_daily,
    });
    expect(preview.remainingAiQuota).toBe(50);
    expect(preview.totalQuestions).toBeGreaterThanOrEqual(1);
  });

  it("11. Nếu plans.limits thiếu khóa cụ thể thì dùng mặc định an toàn của gói Free cho khóa thiếu (không trả null)", () => {
    const partialPremiumLimits = normalizePlanLimits(
      { max_sets: 100 }, // Thiếu ai_daily, max_file_mb, max_pdf_pages, storage_mb, can_export_docx
      true,
      null
    );
    expect(partialPremiumLimits.max_sets).toBe(100);
    expect(partialPremiumLimits.ai_daily).toBe(10); // Mặc định an toàn của Free cho khóa thiếu
    expect(partialPremiumLimits.max_file_mb).toBe(10);
    expect(partialPremiumLimits.max_pdf_pages).toBe(30);
    expect(partialPremiumLimits.storage_mb).toBe(50);
    expect(partialPremiumLimits.max_print_versions).toBe(4);
    expect(partialPremiumLimits.can_export_docx).toBe(false);
  });

  it("12. Kiểm tra tích hợp trực tiếp trên DB thật (nếu có kết nối mạng & .env): plans và get_entitlements hoạt động đúng", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return;
    }

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: plans, error: plansErr } = await sb
      .from("plans")
      .select("code, name, limits, prices, period_days")
      .in("code", ["free", "premium"]);

    // Nếu chạy trong sandbox không có mạng (ENOTFOUND/fetch failed) thì bỏ qua nhẹ nhàng,
    // còn khi chạy có mạng thì kiểm tra dữ liệu thật trên DB
    if (plansErr && String(plansErr.message).toLowerCase().includes("fetch failed")) {
      return;
    }

    expect(plansErr).toBeNull();
    const freePlan = (plans ?? []).find((p) => p.code === "free");
    const premPlan = (plans ?? []).find((p) => p.code === "premium");
    expect(freePlan).toBeDefined();
    expect(premPlan).toBeDefined();
    expect((freePlan?.limits as Record<string, unknown>)?.ai_daily).toBe(10);
    expect((premPlan?.limits as Record<string, unknown>)?.ai_daily).toBe(50);
    expect((premPlan?.prices as Record<string, unknown>)?.month).toBe(39000);
    expect((premPlan?.prices as Record<string, unknown>)?.year).toBe(299000);

    const { data: freeEnt, error: freeEntErr } = await sb.rpc(
      "get_entitlements",
      { p_user_id: "00000000-0000-0000-0000-000000000001" }
    );
    expect(freeEntErr).toBeNull();
    expect((freeEnt as Record<string, unknown>)?.plan_code).toBe("free");
    expect(
      ((freeEnt as Record<string, unknown>)?.limits as Record<string, unknown>)
        ?.ai_daily
    ).toBe(10);
  });

  it("13. Thu hồi gói Premium: vô hiệu hóa TẤT CẢ dòng subscriptions (từ đơn + cấp tay), không tự sống lại từ đơn paid, xóa hạn mức AI riêng, tạo audit log + thông báo, giữ nguyên dữ liệu cũ và chặn tạo bộ thứ 4", async () => {
    const now = new Date("2026-11-15T05:00:00Z");
    const userId = "user-revoke-test";
    const state: InMemoryPaymentState = {
      plans: {
        free: {
          code: "free",
          name: "Miễn phí",
          active: true,
          prices: {},
          period_days: {},
        },
        premium: {
          code: "premium",
          name: "Premium",
          active: true,
          prices: { month: 39000, year: 299000 },
          period_days: { month: 30, year: 365 },
        },
      },
      orders: new Map([
        [
          "ord-paid-1",
          {
            id: "ord-paid-1",
            user_id: userId,
            plan_code: "premium",
            period: "month",
            amount: 39000,
            currency: "VND",
            status: "pending",
            provider: "sepay",
            provider_ref: null,
            payment_code: "WSREVOKE01",
            created_at: now.toISOString(),
            paid_at: null,
            expires_at: new Date(now.getTime() + 48 * 3600_000).toISOString(),
          },
        ],
      ]),
      subscriptions: [],
      profiles: new Map([[userId, { custom_ai_daily_limit: 50 }]]),
      auditLogs: [],
      paymentEvents: new Map(),
      notifications: [],
    };

    // Bước 1: Kích hoạt từ đơn -> 1 dòng subscription từ sepay
    executeActivateSubscriptionFromOrder(state, "ord-paid-1", now, "REF-1");
    // Cấp thêm 1 dòng manual_grant đồng thời active (tổng cộng 2 dòng hiệu lực: 1 từ đơn, 1 cấp tay)
    state.subscriptions.push({
      id: "sub_manual_2",
      user_id: userId,
      plan_code: "premium",
      status: "active",
      period_end: new Date(now.getTime() + 90 * 86_400_000).toISOString(),
      source: "manual_grant",
    });

    // Trước khi thu hồi: evaluateEntitlements chọn gói tốt nhất hợp lệ -> Premium (50 lượt AI)
    const beforeRevoke = evaluateEntitlements({
      subscriptions: state.subscriptions.filter((s) => s.user_id === userId),
      customAiDailyLimit: state.profiles?.get(userId)?.custom_ai_daily_limit,
      now,
    });
    expect(beforeRevoke.is_premium).toBe(true);
    expect(beforeRevoke.plan_code).toBe("premium");
    expect(beforeRevoke.limits.ai_daily).toBe(50);
    expect(beforeRevoke.limits.max_sets).toBe(100);

    // Bước 2: Admin thu hồi gói Premium (kèm xóa hạn mức AI riêng & hoàn tiền đơn liên quan)
    const revokeTime = new Date("2026-11-15T06:00:00Z");
    const revokeRes = executeAdminRevokePremium({
      state,
      userId,
      reason: "Hoàn tiền theo yêu cầu người dùng",
      clearCustomAiLimit: true,
      refundLatestOrder: true,
      now: revokeTime,
    });

    // Cả 2 dòng subscriptions (từ đơn + cấp tay) đều bị đặt status = 'revoked' và period_end = revokeTime
    expect(revokeRes.ok).toBe(true);
    expect(revokeRes.revokedCount).toBe(2);
    expect(revokeRes.refundedOrderId).toBe("ord-paid-1");
    for (const s of state.subscriptions) {
      expect(s.status).toBe("revoked");
      expect(s.period_end).toBe(revokeTime.toISOString());
      expect(s.revoked_reason).toBe("Hoàn tiền theo yêu cầu người dùng");
    }

    // Đơn liên quan đã chuyển sang refunded, custom_ai_daily_limit đã xóa
    expect(state.orders.get("ord-paid-1")?.status).toBe("refunded");
    expect(state.profiles?.get(userId)?.custom_ai_daily_limit).toBeNull();

    // Bước 3: Kiểm tra get_entitlements trả về Free ngay lập tức (ai_daily = 10, max_sets = 3)
    const afterRevoke = evaluateEntitlements({
      subscriptions: state.subscriptions.filter((s) => s.user_id === userId),
      customAiDailyLimit: state.profiles?.get(userId)?.custom_ai_daily_limit,
      now: revokeTime,
    });
    expect(afterRevoke.is_premium).toBe(false);
    expect(afterRevoke.plan_code).toBe("free");
    expect(afterRevoke.status).toBe("revoked");
    expect(afterRevoke.limits.ai_daily).toBe(10);
    expect(afterRevoke.limits.max_sets).toBe(3);
    expect(afterRevoke.limits.can_export_docx).toBe(false);

    // Kể cả qua getUserEntitlements (RPC trả về revoked), tuyệt đối KHÔNG tự khôi phục từ bảng orders
    const mockSupabaseAfterRevoke = {
      rpc: vitest.fn().mockResolvedValue({
        data: {
          plan_code: "free",
          plan_name: "Miễn phí",
          is_premium: false,
          status: "revoked",
          period_end: revokeTime.toISOString(),
          source: "manual_grant",
          limits: DEFAULT_FREE_LIMITS,
          custom_ai_daily_limit: null,
        },
        error: null,
      }),
      from: vitest.fn(),
    };
    const entFromServer = await getUserEntitlements(
      mockSupabaseAfterRevoke as never,
      userId,
      { strict: true }
    );
    expect(entFromServer.is_premium).toBe(false);
    expect(entFromServer.plan_code).toBe("free");
    expect(entFromServer.status).toBe("revoked");
    expect(entFromServer.limits.ai_daily).toBe(10);

    // Bước 4: Audit log (trước/sau) và thông báo cho người dùng được tạo đầy đủ
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs?.[0]?.action).toBe("revoke_premium");
    expect(state.auditLogs?.[0]?.reason).toBe("Hoàn tiền theo yêu cầu người dùng");
    expect(
      (state.auditLogs?.[0]?.metadata.before_subscriptions as unknown[]).length
    ).toBe(2);

    const revokeNotif = state.notifications.find(
      (n) => n.title === "Gói Premium của bạn đã bị thu hồi"
    );
    expect(revokeNotif).toBeDefined();
    expect(revokeNotif?.body).toContain("Hoàn tiền theo yêu cầu người dùng");

    // Bước 5: Người dùng đang có 3 bộ câu hỏi: giữ nguyên 100% dữ liệu cũ (không xóa bộ nào), nhưng bị chặn khi tạo bộ thứ 4
    const check4thSet = validatePlanLimitsPure({
      isPremium: entFromServer.is_premium,
      limits: entFromServer.limits,
      currentSetCount: 3,
      currentStorageBytes: 1024 * 1024,
      newFileSizeBytes: 512 * 1024,
      checkSetCount: true,
    });
    expect(check4thSet.allowed).toBe(false);
    if (!check4thSet.allowed) {
      expect(check4thSet.error).toContain("3/3");
    }
  });
});
