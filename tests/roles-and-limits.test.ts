import { afterEach, describe, expect, it } from "vitest";
import { isTeacherRole, normalizeUserRole } from "@/lib/auth/roles";
import { signupSchema } from "@/lib/auth/schemas";
import {
  getAiDailyLimitForRole,
  getAiGlobalDailyLimit,
} from "@/lib/ai/limits";
import { validateImportLimitsPure } from "@/lib/limits";
import { mergeCardStatesWithoutDuplicates } from "@/lib/srs/merge";
import type { SrsCardStateRecord } from "@/lib/srs/types";
import { vi } from "@/lib/i18n/vi";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Step 9: Role Authorization, AI/Storage Limits & Anonymous Merge", () => {
  it("1. Phân quyền vai trò: chỉ 'teacher' có quyền giáo viên; giá trị lạ từ client bị ép về 'student' hoặc bị Zod từ chối", () => {
    expect(isTeacherRole("teacher")).toBe(true);
    expect(isTeacherRole("student")).toBe(false);
    expect(isTeacherRole(null)).toBe(false);
    expect(normalizeUserRole("admin")).toBe("student");
    expect(normalizeUserRole("teacher")).toBe("teacher");

    const invalidSignup = signupSchema.safeParse({
      role: "admin",
      email: "a@b.com",
      password: "StrongPassword2026!",
      confirmPassword: "StrongPassword2026!",
      consentAccepted: true,
    });
    expect(invalidSignup.success).toBe(false);

    const noConsentSignup = signupSchema.safeParse({
      role: "student",
      email: "a@b.com",
      password: "StrongPassword2026!",
      confirmPassword: "StrongPassword2026!",
      consentAccepted: false,
    });
    expect(noConsentSignup.success).toBe(false);

    const validStudentSignup = signupSchema.safeParse({
      role: "student",
      displayName: "Minh Khoa",
      email: "hs@b.com",
      password: "StrongPassword2026!",
      confirmPassword: "StrongPassword2026!",
      consentAccepted: true,
    });
    expect(validStudentSignup.success).toBe(true);
  });

  it("2. Hạn mức AI theo vai trò và hạn mức tổng toàn hệ thống đọc từ env (có fallback)", () => {
    delete process.env.AI_DAILY_LIMIT_TEACHER;
    delete process.env.AI_DAILY_LIMIT_STUDENT;
    delete process.env.AI_DAILY_LIMIT;
    delete process.env.AI_GLOBAL_DAILY_LIMIT;

    expect(getAiDailyLimitForRole("teacher")).toBe(30);
    expect(getAiDailyLimitForRole("student")).toBe(10);
    expect(getAiGlobalDailyLimit()).toBe(500);

    process.env.AI_DAILY_LIMIT = "25";
    expect(getAiDailyLimitForRole("teacher")).toBe(25);
    expect(getAiDailyLimitForRole("student")).toBe(25);

    process.env.AI_DAILY_LIMIT_TEACHER = "40";
    process.env.AI_DAILY_LIMIT_STUDENT = "8";
    process.env.AI_GLOBAL_DAILY_LIMIT = "600";
    expect(getAiDailyLimitForRole("teacher")).toBe(40);
    expect(getAiDailyLimitForRole("student")).toBe(8);
    expect(getAiGlobalDailyLimit()).toBe(600);
  });

  it("3. Giới hạn chống lạm dụng: số bộ câu hỏi, cỡ file, số trang PDF và tổng Storage 100MB", () => {
    const config = {
      studentMaxSets: 30,
      studentMaxFileSizeMb: 10,
      teacherMaxFileSizeMb: 20,
      studentMaxPdfPages: 30,
      teacherMaxPdfPages: 60,
      maxStorageMbPerUser: 100,
    };

    // Học sinh đạt 30 bộ -> chặn tạo bộ thứ 31
    const maxSetsRes = validateImportLimitsPure({
      role: "student",
      currentSetCount: 30,
      currentStorageBytes: 1024,
      newFileSizeBytes: 1024,
      config,
    });
    expect(maxSetsRes.allowed).toBe(false);
    if (!maxSetsRes.allowed) {
      expect(maxSetsRes.error).toContain(vi.limits.maxSetsReachedPrefix);
    }

    // Giáo viên 30 bộ vẫn được tạo tiếp
    const teacherSetsRes = validateImportLimitsPure({
      role: "teacher",
      currentSetCount: 30,
      currentStorageBytes: 1024,
      newFileSizeBytes: 1024,
      config,
    });
    expect(teacherSetsRes.allowed).toBe(true);

    // File 12MB: học sinh bị chặn (>10MB), giáo viên hợp lệ (<=20MB)
    const studentBigFile = validateImportLimitsPure({
      role: "student",
      currentSetCount: 2,
      currentStorageBytes: 0,
      newFileSizeBytes: 12 * 1024 * 1024,
      config,
    });
    expect(studentBigFile.allowed).toBe(false);

    const teacherBigFile = validateImportLimitsPure({
      role: "teacher",
      currentSetCount: 2,
      currentStorageBytes: 0,
      newFileSizeBytes: 12 * 1024 * 1024,
      config,
    });
    expect(teacherBigFile.allowed).toBe(true);

    // PDF 35 trang: học sinh bị chặn (>30 trang)
    const studentPdfPages = validateImportLimitsPure({
      role: "student",
      currentSetCount: 1,
      currentStorageBytes: 0,
      newFileSizeBytes: 1024 * 1024,
      pdfPageCount: 35,
      config,
    });
    expect(studentPdfPages.allowed).toBe(false);

    // Tổng dung lượng vượt 100MB -> chặn
    const storageExceeded = validateImportLimitsPure({
      role: "teacher",
      currentSetCount: 5,
      currentStorageBytes: 98 * 1024 * 1024,
      newFileSizeBytes: 5 * 1024 * 1024,
      config,
    });
    expect(storageExceeded.allowed).toBe(false);
    if (!storageExceeded.allowed) {
      expect(storageExceeded.error).toContain(
        vi.limits.storageQuotaExceededPrefix
      );
    }
  });

  it("4. Gộp hồ sơ ẩn danh vào tài khoản: không trùng thẻ, ưu tiên giữ thẻ có lịch sử mới hơn", () => {
    const accountCards: SrsCardStateRecord[] = [
      {
        question_id: "q-1",
        due: "2026-11-15T00:00:00Z",
        stability: 3,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 3,
        learning_steps: 0,
        reps: 2,
        lapses: 0,
        state: 2,
        last_review: "2026-11-12T08:00:00Z",
      },
      {
        question_id: "q-2",
        due: "2026-11-13T00:00:00Z",
        stability: 1,
        difficulty: 6,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 1,
        last_review: "2026-11-10T08:00:00Z",
      },
    ];

    const anonymousCards: SrsCardStateRecord[] = [
      // q-1 cũ hơn bản trên tài khoản -> giữ bản trên tài khoản
      {
        question_id: "q-1",
        due: "2026-11-11T00:00:00Z",
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 1,
        state: 3,
        last_review: "2026-11-09T08:00:00Z",
      },
      // q-2 mới hơn bản trên tài khoản -> cập nhật sang bản mới hơn
      {
        question_id: "q-2",
        due: "2026-11-20T00:00:00Z",
        stability: 8,
        difficulty: 4,
        elapsed_days: 2,
        scheduled_days: 8,
        learning_steps: 0,
        reps: 4,
        lapses: 0,
        state: 2,
        last_review: "2026-11-12T10:00:00Z",
      },
      // q-3 chỉ có ở hồ sơ ẩn danh -> thêm vào tài khoản
      {
        question_id: "q-3",
        due: "2026-11-14T00:00:00Z",
        stability: 2,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 2,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 2,
        last_review: "2026-11-12T09:00:00Z",
      },
    ];

    const merged = mergeCardStatesWithoutDuplicates(
      accountCards,
      anonymousCards
    );

    expect(merged).toHaveLength(3);
    const byId = new Map(merged.map((c) => [c.question_id, c]));
    expect(byId.get("q-1")?.reps).toBe(2);
    expect(byId.get("q-2")?.reps).toBe(4);
    expect(byId.get("q-2")?.stability).toBe(8);
    expect(byId.get("q-3")?.reps).toBe(1);
  });
});

