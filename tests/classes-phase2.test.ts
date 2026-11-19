import { describe, it, expect, vi as vitest } from "vitest";
vitest.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import {
  createClassAssignmentSchema,
  deleteClassAssignmentSchema,
  isAssignmentDueSoon,
  mapAssignmentRpcError,
  updateClassAssignmentSchema,
} from "@/lib/classes/assignments";

describe("Bước 14 - Giai đoạn 2: Giao bài kiểm tra & ôn tập FSRS cho lớp", () => {
  it("1. Kiểm tra Zod schema giao bài: bắt buộc đúng loại exam/set và tiêu đề hợp lệ", () => {
    const validExam = createClassAssignmentSchema.safeParse({
      kind: "exam",
      examId: "11111111-1111-4111-8111-111111111111",
      title: "Kiểm tra 15 phút Chương 1",
      dueAt: "2026-11-25T10:00:00.000Z",
      lockAfterDue: true,
      setExamClassOnly: true,
    });
    expect(validExam.success).toBe(true);

    const missingExamId = createClassAssignmentSchema.safeParse({
      kind: "exam",
      title: "Bài thi thiếu examId",
    });
    expect(missingExamId.success).toBe(false);

    const validStudy = createClassAssignmentSchema.safeParse({
      kind: "study",
      setId: "22222222-2222-4222-8222-222222222222",
      title: "Ôn tập từ vựng Unit 1",
    });
    expect(validStudy.success).toBe(true);

    const missingSetId = createClassAssignmentSchema.safeParse({
      kind: "study",
      title: "Ôn tập thiếu setId",
    });
    expect(missingSetId.success).toBe(false);

    expect(
      updateClassAssignmentSchema.safeParse({
        assignmentId: "33333333-3333-4333-8333-333333333333",
        closed: true,
      }).success
    ).toBe(true);

    expect(
      deleteClassAssignmentSchema.safeParse({
        assignmentId: "33333333-3333-4333-8333-333333333333",
      }).success
    ).toBe(true);
  });

  it("2. Nhắc bài sắp đến hạn (trong 24 giờ tới, chưa nộp)", () => {
    const now = new Date("2026-11-18T10:00:00.000Z");

    // Còn 6 giờ, chưa làm -> sắp đến hạn
    expect(
      isAssignmentDueSoon("2026-11-18T16:00:00.000Z", "not_started", now)
    ).toBe(true);
    // Còn 6 giờ, đang làm -> sắp đến hạn
    expect(
      isAssignmentDueSoon("2026-11-18T16:00:00.000Z", "in_progress", now)
    ).toBe(true);
    // Đã nộp -> không nhắc nữa
    expect(
      isAssignmentDueSoon("2026-11-18T16:00:00.000Z", "submitted", now)
    ).toBe(false);
    // Còn 48 giờ -> chưa đến ngưỡng 24h
    expect(
      isAssignmentDueSoon("2026-11-20T10:00:00.000Z", "not_started", now)
    ).toBe(false);
    // Đã quá hạn -> không phải sắp đến hạn
    expect(
      isAssignmentDueSoon("2026-11-18T09:00:00.000Z", "overdue", now)
    ).toBe(false);
    // Không đặt hạn
    expect(isAssignmentDueSoon(null, "not_started", now)).toBe(false);
  });

  it("3. Ánh xạ mã lỗi bảo mật phía server cho giao bài, khóa sau hạn, thu hồi quyền lớp", () => {
    expect(mapAssignmentRpcError("CLASS_ACCESS_REVOKED").status).toBe(403);
    expect(mapAssignmentRpcError("TARGET_NOT_OWNED").status).toBe(403);
    expect(mapAssignmentRpcError("TEACHER_ONLY").status).toBe(403);
    expect(mapAssignmentRpcError("ASSIGNMENT_CLOSED").status).toBe(400);
    expect(mapAssignmentRpcError("ASSIGNMENT_LOCKED_AFTER_DUE").status).toBe(
      400
    );
    expect(mapAssignmentRpcError("MAX_ATTEMPTS_REACHED").status).toBe(400);
    expect(mapAssignmentRpcError("NO_APPROVED_QUESTIONS").status).toBe(400);
  });

  it("4. Kiểm tra DB thật (nếu đã chạy migration 19 và có mạng): các RPC giao bài & làm bài chặn truy cập chưa đăng nhập", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.rpc("get_student_class_assignments", {
      p_class_id: null,
    });

    if (
      error &&
      (String(error.message).toLowerCase().includes("fetch failed") ||
        error.code === "PGRST202" ||
        error.code === "42883")
    ) {
      return;
    }

    expect(error).toBeNull();
    expect((data as { error?: string })?.error).toBe("UNAUTHORIZED");
  });
});

