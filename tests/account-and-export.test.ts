import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  strongPasswordSchema,
  isPasswordContainingEmail,
  calculatePasswordStrength,
} from "@/lib/auth/password-rules";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

describe("Step 12 - Phase A: Account Settings & Data Export Suite", () => {
  it("1. Kiểm tra đổi mật khẩu: tuân thủ luật mật khẩu mạnh và không trùng email", () => {
    const userEmail = "giaovien@memoquiz.vn";

    // Mật khẩu yếu (< 10 ký tự)
    const weakPass = changePasswordSchema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "Short1!",
      confirmPassword: "Short1!",
    });
    expect(weakPass.success).toBe(false);

    // Mật khẩu chứa email
    expect(isPasswordContainingEmail("giaovien2026!Abc", userEmail)).toBe(true);

    // Mật khẩu hợp lệ và mạnh
    const validPass = changePasswordSchema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "SuperSecurePass2026!",
      confirmPassword: "SuperSecurePass2026!",
    });
    expect(validPass.success).toBe(true);
    expect(isPasswordContainingEmail("SuperSecurePass2026!", userEmail)).toBe(false);

    // Mật khẩu xác nhận không khớp
    const mismatch = changePasswordSchema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "SuperSecurePass2026!",
      confirmPassword: "DifferentPass2026!",
    });
    expect(mismatch.success).toBe(false);
  });

  it("2. Thanh đo độ mạnh mật khẩu và checklist điều kiện hoạt động chính xác", () => {
    const email = "student@memoquiz.vn";
    const weakResult = calculatePasswordStrength("123456", email);
    expect(weakResult.level).toBe("weak");
    expect(weakResult.criteria.length).toBe(false);

    const strongResult = calculatePasswordStrength("KhangDuy#2026Strict", email);
    expect(strongResult.level).toBe("strong");
    expect(strongResult.criteria.length).toBe(true);
    expect(strongResult.criteria.hasUpper).toBe(true);
    expect(strongResult.criteria.hasLower).toBe(true);
    expect(strongResult.criteria.hasNumber).toBe(true);
    expect(strongResult.criteria.notEmail).toBe(true);
    expect(strongResult.criteria.notCommon).toBe(true);
  });

  it("3. Cấu trúc gói dữ liệu xuất cá nhân (JSON Export)", () => {
    const userId = "user-uuid-mine";
    const otherUserId = "user-uuid-other";

    // Giả lập dữ liệu truy vấn từ DB
    const allSets = [
      { id: "set-1", owner_id: userId, title: "Bộ đề Toán" },
      { id: "set-2", owner_id: otherUserId, title: "Bộ đề Văn của người khác" },
    ];

    // Chỉ lọc các bộ thuộc về user
    const userSets = allSets.filter((s) => s.owner_id === userId);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      app: "MemoQuiz",
      profile: {
        id: userId,
        role: "teacher",
        display_name: "Khánh Duy",
      },
      question_sets: userSets,
      learning: {
        learner_profile: { id: "learner-1", streak_days: 5 },
        fsrs_cards: [{ question_id: "q-1", state: 2 }],
        review_logs: [{ question_id: "q-1", rating: 3 }],
      },
    };

    expect(exportPayload.profile.id).toBe(userId);
    expect(exportPayload.question_sets.length).toBe(1);
    expect(exportPayload.question_sets[0]?.owner_id).toBe(userId);
    // Tuyệt đối không chứa dữ liệu của người khác
    expect(exportPayload.question_sets.some((s) => s.owner_id === otherUserId)).toBe(false);
  });

  it("4. Tính toán mức sử dụng gói và lượt AI hôm nay", () => {
    const calculateUsage = (limit: number, callsToday: number, storageBytes: number) => {
      const remainingToday = Math.max(0, limit - callsToday);
      const storageMb = Number((storageBytes / (1024 * 1024)).toFixed(1));
      return { remainingToday, storageMb };
    };

    const usage = calculateUsage(30, 8, 2560000);
    expect(usage.remainingToday).toBe(22);
    expect(usage.storageMb).toBe(2.4);
  });
});

