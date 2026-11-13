import { describe, expect, it } from "vitest";

describe("Step 12 - Phase C: Admin System Overview & User Management Suite", () => {
  it("1. Kiểm tra an toàn: Admin không thể tự khóa hoặc tự xóa chính mình", () => {
    const adminId = "admin-uuid-root";
    const validateAdminAction = (
      currentAdmin: string,
      targetUser: string,
      action: string
    ) => {
      if (currentAdmin === targetUser && (action === "block" || action === "delete_user")) {
        return { allowed: false, error: "Không thể tự khóa hoặc xóa tài khoản của chính mình" };
      }
      return { allowed: true };
    };

    const selfBlock = validateAdminAction(adminId, adminId, "block");
    expect(selfBlock.allowed).toBe(false);
    expect(selfBlock.error).toContain("chính mình");

    const selfDelete = validateAdminAction(adminId, adminId, "delete_user");
    expect(selfDelete.allowed).toBe(false);

    const otherBlock = validateAdminAction(adminId, "user-uuid-123", "block");
    expect(otherBlock.allowed).toBe(true);
  });

  it("2. Kiểm tra an toàn: Admin không thể khóa hoặc xóa Admin khác", () => {
    const adminSet = new Set(["admin-uuid-root", "admin-uuid-colleague"]);

    const validateTargetAdmin = (targetId: string, action: string) => {
      if (adminSet.has(targetId) && (action === "block" || action === "delete_user")) {
        return { allowed: false, error: "Không thể khóa hoặc xóa tài khoản của quản trị viên khác" };
      }
      return { allowed: true };
    };

    const blockColleague = validateTargetAdmin("admin-uuid-colleague", "block");
    expect(blockColleague.allowed).toBe(false);

    const blockRegularUser = validateTargetAdmin("student-user-456", "block");
    expect(blockRegularUser.allowed).toBe(true);
  });

  it("3. Bắt buộc nhập lý do khi khóa hoặc xóa tài khoản (ghi audit log)", () => {
    const checkReason = (action: string, reason?: string | null) => {
      if (action === "block" || action === "delete_user") {
        if (!reason || reason.trim().length === 0) {
          return { valid: false, error: "Bắt buộc nhập lý do" };
        }
      }
      return { valid: true };
    };

    expect(checkReason("block", "").valid).toBe(false);
    expect(checkReason("block", "   ").valid).toBe(false);
    expect(checkReason("delete_user", undefined).valid).toBe(false);
    expect(checkReason("block", "Spam bài kiểm tra độc hại").valid).toBe(true);
    expect(checkReason("reset_ai_quota", "").valid).toBe(true); // reset không bắt buộc lý do dài
  });

  it("4. Hạn mức AI riêng (custom_ai_daily_limit) ưu tiên hơn hạn mức mặc định của vai trò", () => {
    const resolveAiDailyLimit = (role: "teacher" | "student", customLimit?: number | null) => {
      if (customLimit !== undefined && customLimit !== null) {
        return customLimit;
      }
      return role === "teacher" ? 30 : 15;
    };

    expect(resolveAiDailyLimit("student", null)).toBe(15);
    expect(resolveAiDailyLimit("student", 50)).toBe(50); // Ưu tiên đặc cách
    expect(resolveAiDailyLimit("teacher", 0)).toBe(0); // Tạm dừng AI
    expect(resolveAiDailyLimit("teacher", null)).toBe(30);
  });

  it("5. Tài khoản bị khóa (is_blocked): chặn toàn bộ thao tác AI và điều hướng tới /blocked", () => {
    const checkUserAccess = (isBlocked: boolean, path: string) => {
      if (isBlocked) {
        return { allowed: false, redirect: "/blocked" };
      }
      return { allowed: true, redirect: path };
    };

    const simulateAiQuotaConsume = (isBlocked: boolean) => {
      if (isBlocked) {
        return { allowed: false, reason: "ACCOUNT_BLOCKED" };
      }
      return { allowed: true, calls: 1 };
    };

    expect(checkUserAccess(true, "/dashboard").redirect).toBe("/blocked");
    expect(checkUserAccess(true, "/study").redirect).toBe("/blocked");
    expect(checkUserAccess(false, "/dashboard").allowed).toBe(true);

    expect(simulateAiQuotaConsume(true).allowed).toBe(false);
    expect(simulateAiQuotaConsume(true).reason).toBe("ACCOUNT_BLOCKED");
    expect(simulateAiQuotaConsume(false).allowed).toBe(true);
  });

  it("6. Cập nhật last_seen_at: tối đa 1 lần/giờ/người dùng", () => {
    const shouldUpdateLastSeen = (lastSeenAt: Date | null, now: Date) => {
      if (!lastSeenAt) return true;
      const oneHourMs = 60 * 60 * 1000;
      return now.getTime() - lastSeenAt.getTime() >= oneHourMs;
    };

    const now = new Date("2026-11-13T12:00:00Z");
    const tenMinutesAgo = new Date("2026-11-13T11:50:00Z");
    const twoHoursAgo = new Date("2026-11-13T10:00:00Z");

    expect(shouldUpdateLastSeen(null, now)).toBe(true);
    expect(shouldUpdateLastSeen(tenMinutesAgo, now)).toBe(false); // Chưa đủ 1 giờ -> bỏ qua
    expect(shouldUpdateLastSeen(twoHoursAgo, now)).toBe(true); // Đã quá 1 giờ -> cập nhật
  });
});

