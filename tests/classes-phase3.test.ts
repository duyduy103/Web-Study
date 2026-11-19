import { describe, it, expect, vi as vitest } from "vitest";
vitest.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import {
  computeClassExamAssignmentAnalytics,
  computeScoreDistribution,
  generateClassGradebookCsv,
  type ClassExamCell,
  type ClassExamDetailPayload,
  type ClassResultAssignment,
  type ClassResultStudent,
  type ClassStudyCell,
} from "@/lib/classes/results";
import { sanitizeQuestionForStudent } from "@/lib/grading";
import type { ExamQuestionWithSnapshot } from "@/lib/grading/types";

describe("Bước 14 - Giai đoạn 3: Kết quả lớp học, Xuất CSV, Bảo mật 2 GV × 2 HS & Hoàn thiện", () => {
  const teacherAStudents: ClassResultStudent[] = [
    {
      user_id: "11111111-1111-4111-8111-000000000001",
      display_name: "Nguyễn Văn An",
      email: "an.student@example.com",
      status: "active",
      joined_at: "2026-11-18T08:00:00.000Z",
    },
    {
      user_id: "11111111-1111-4111-8111-000000000002",
      display_name: "Trần Thị Bình",
      email: "binh.student@example.com",
      status: "active",
      joined_at: "2026-11-18T08:05:00.000Z",
    },
  ];

  const teacherBStudentId = "99999999-9999-4999-8999-999999999999";

  const assignments: ClassResultAssignment[] = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
      kind: "exam",
      exam_id: "eeeeeeee-eeee-4eee-8eee-000000000001",
      set_id: null,
      title: "Kiểm tra 15 phút Chương 1",
      due_at: "2026-11-25T10:00:00.000Z",
      lock_after_due: true,
      is_open: true,
      created_at: "2026-11-18T09:00:00.000Z",
      exam_total_points: 10,
      set_approved_cards: 0,
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
      kind: "study",
      exam_id: null,
      set_id: "ssssssss-ssss-4sss-8sss-000000000001",
      title: "Ôn tập FSRS Bài 1",
      due_at: null,
      lock_after_due: false,
      is_open: true,
      created_at: "2026-11-18T09:30:00.000Z",
      exam_total_points: 0,
      set_approved_cards: 20,
    },
  ];

  const examCells: ClassExamCell[] = [
    {
      assignment_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
      exam_id: "eeeeeeee-eeee-4eee-8eee-000000000001",
      student_id: "11111111-1111-4111-8111-000000000001",
      attempts_count: 1,
      submitted_count: 1,
      status: "submitted",
      is_late: false,
      score: 9,
      total_points: 10,
      needs_manual_review: false,
      duration_seconds: 420,
      started_at: "2026-11-18T10:00:00.000Z",
      submitted_at: "2026-11-18T10:07:00.000Z",
      latest_attempt_id: "dddddddd-dddd-4ddd-8ddd-000000000001",
    },
    {
      assignment_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
      exam_id: "eeeeeeee-eeee-4eee-8eee-000000000001",
      student_id: "11111111-1111-4111-8111-000000000002",
      attempts_count: 0,
      submitted_count: 0,
      status: "not_submitted",
      is_late: false,
      score: null,
      total_points: 10,
      needs_manual_review: false,
      duration_seconds: null,
      started_at: null,
      submitted_at: null,
      latest_attempt_id: null,
    },
    // Dữ liệu giả định từ lớp khác (Giáo viên B) vô tình lọt vào mảng cells
    {
      assignment_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
      exam_id: "eeeeeeee-eeee-4eee-8eee-000000000001",
      student_id: teacherBStudentId,
      attempts_count: 1,
      submitted_count: 1,
      status: "submitted",
      is_late: false,
      score: 10,
      total_points: 10,
      needs_manual_review: false,
      duration_seconds: 300,
      started_at: "2026-11-18T10:00:00.000Z",
      submitted_at: "2026-11-18T10:05:00.000Z",
      latest_attempt_id: "dddddddd-dddd-4ddd-8ddd-000000000099",
    },
  ];

  const studyCells: ClassStudyCell[] = [
    {
      assignment_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
      set_id: "ssssssss-ssss-4sss-8sss-000000000001",
      student_id: "11111111-1111-4111-8111-000000000001",
      total_cards: 20,
      cards_reviewed: 15,
      total_reviews: 25,
      retention_rate: 88,
      leech_count: 1,
      last_studied_at: "2026-11-18T11:00:00.000Z",
      status: "submitted",
    },
    {
      assignment_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
      set_id: "ssssssss-ssss-4sss-8sss-000000000001",
      student_id: "11111111-1111-4111-8111-000000000002",
      total_cards: 20,
      cards_reviewed: 0,
      total_reviews: 0,
      retention_rate: 0,
      leech_count: 0,
      last_studied_at: null,
      status: "not_submitted",
    },
  ];

  it("1. Tính thống kê bài kiểm tra trong lớp: điểm trung bình, phân bố điểm thanh CSS, câu sai nhiều nhất và số học sinh chưa nộp", () => {
    const dist = computeScoreDistribution([4, 6.5, 7.5, 9, 9.5], 10);
    expect(dist).toHaveLength(4);
    expect(dist[0]?.count).toBe(1); // < 50% (4/10)
    expect(dist[1]?.count).toBe(1); // 50-69% (6.5/10)
    expect(dist[2]?.count).toBe(1); // 70-84% (7.5/10)
    expect(dist[3]?.count).toBe(2); // 85-100% (9, 9.5)

    const detail: ClassExamDetailPayload = {
      exam_id: "eeeeeeee-eeee-4eee-8eee-000000000001",
      total_points: 10,
      questions: [
        {
          examQuestionId: "eq-1",
          questionId: "q-1",
          points: 5,
          position: 1,
          snapshot: {
            id: "q-1",
            type: "mcq",
            stem: "Câu 1 dễ",
            topic: "Chương 1",
            difficulty: "easy",
            choices: [
              { id: "c1", text: "A", position: 1, is_correct: true },
              { id: "c2", text: "B", position: 2, is_correct: false },
            ],
            answer_text: null,
            accepted_variants: [],
            explanation: "Giải thích 1",
          },
        },
        {
          examQuestionId: "eq-2",
          questionId: "q-2",
          points: 5,
          position: 2,
          snapshot: {
            id: "q-2",
            type: "short_answer",
            stem: "Câu 2 khó nhiều học sinh sai",
            topic: "Chương 1",
            difficulty: "hard",
            choices: [],
            answer_text: "1945",
            accepted_variants: [],
            explanation: "Giải thích 2",
          },
        },
      ],
      attempts: [
        {
          id: "att-1",
          studentName: "Nguyễn Văn An",
          studentClass: "Lớp 9A1",
          startedAt: "2026-11-18T10:00:00.000Z",
          submittedAt: "2026-11-18T10:07:00.000Z",
          status: "submitted",
          score: 5,
          needsManualReview: false,
          answers: [
            {
              examQuestionId: "eq-1",
              questionId: "q-1",
              response: "c1",
              isCorrect: true,
              pointsAwarded: 5,
              needsReview: false,
            },
            {
              examQuestionId: "eq-2",
              questionId: "q-2",
              response: "1930",
              isCorrect: false,
              pointsAwarded: 0,
              needsReview: false,
            },
          ],
        },
      ],
    };

    const analytics = computeClassExamAssignmentAnalytics({
      studentsCount: 2,
      cells: examCells.slice(0, 2),
      detail,
    });

    expect(analytics.submittedCount).toBe(1);
    expect(analytics.notSubmittedCount).toBe(1);
    expect(analytics.averageScore).toBe(9);
    expect(analytics.questionStats[0]?.correctRate).toBe(100);
    expect(analytics.questionStats[0]?.isMostMissed).toBe(false);
    expect(analytics.questionStats[1]?.correctRate).toBe(0);
    expect(analytics.questionStats[1]?.isMostMissed).toBe(true);
  });

  it("2. Xuất CSV bảng điểm lớp (UTF-8 BOM): chỉ chứa dữ liệu học sinh của lớp đó, đánh dấu rõ 'Chưa nộp'", () => {
    // 2.1. Xuất toàn bộ ma trận lớp
    const matrixCsv = generateClassGradebookCsv({
      className: "Lớp 9A1 - Lịch sử",
      students: teacherAStudents,
      assignments,
      examCells,
      studyCells,
      selectedAssignmentId: null,
    });

    expect(matrixCsv.startsWith("\uFEFF")).toBe(true);
    expect(matrixCsv).toContain("Nguyễn Văn An");
    expect(matrixCsv).toContain("Trần Thị Bình");
    expect(matrixCsv).toContain("9/10");
    expect(matrixCsv).toContain("15/20 thẻ (88% nhớ)");
    expect(matrixCsv).toContain("Chưa nộp");
    // Tuyệt đối không chứa dữ liệu của học sinh lớp khác dù examCells có dòng thừa
    expect(matrixCsv).not.toContain(teacherBStudentId);

    // 2.2. Xuất riêng 1 bài kiểm tra
    const examCsv = generateClassGradebookCsv({
      className: "Lớp 9A1 - Lịch sử",
      students: teacherAStudents,
      assignments,
      examCells,
      studyCells,
      selectedAssignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    });
    expect(examCsv.startsWith("\uFEFF")).toBe(true);
    expect(examCsv).toContain("Kiểm tra 15 phút Chương 1");
    expect(examCsv).toContain("420"); // thời gian làm bài 420 giây của An
    expect(examCsv).toContain("Chưa nộp"); // trạng thái của Bình

    // 2.3. Xuất riêng 1 bộ ôn tập
    const studyCsv = generateClassGradebookCsv({
      className: "Lớp 9A1 - Lịch sử",
      students: teacherAStudents,
      assignments,
      examCells,
      studyCells,
      selectedAssignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002",
    });
    expect(studyCsv.startsWith("\uFEFF")).toBe(true);
    expect(studyCsv).toContain("Ôn tập FSRS Bài 1");
    expect(studyCsv).toContain("Đã ôn tập");
    expect(studyCsv).toContain("Chưa nộp");
  });

  it("3. Không lộ đáp án đúng và giải thích trong payload gửi về học sinh trước khi nộp bài", () => {
    const rawQuestion: ExamQuestionWithSnapshot = {
      examQuestionId: "eq-secret-1",
      questionId: "q-secret-1",
      points: 2,
      position: 1,
      snapshot: {
        id: "q-secret-1",
        type: "mcq",
        stem: "Chiến thắng Điện Biên Phủ diễn ra năm nào?",
        topic: "Lịch sử Việt Nam",
        difficulty: "medium",
        choices: [
          { id: "c1", text: "1945", position: 1, is_correct: false },
          { id: "c2", text: "1954", position: 2, is_correct: true },
        ],
        answer_text: "1954",
        accepted_variants: ["năm 1954"],
        explanation: "Chiến thắng Điện Biên Phủ ngày 7/5/1954.",
      },
    };

    const beforeSubmit = sanitizeQuestionForStudent(rawQuestion, false);
    expect(beforeSubmit.answer_text).toBeNull();
    expect(beforeSubmit.explanation).toBeNull();
    for (const c of beforeSubmit.choices) {
      expect("is_correct" in c).toBe(false);
    }

    const afterSubmitWithShowAnswers = sanitizeQuestionForStudent(
      rawQuestion,
      true
    );
    expect(afterSubmitWithShowAnswers.answer_text).toBe("1954");
    expect(afterSubmitWithShowAnswers.explanation).toContain("7/5/1954");
  });

  it("4. Kiểm tra tích hợp DB thật (nếu đã áp dụng migration 20 và có kết nối): get_teacher_class_results chặn truy cập trái phép", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.rpc("get_teacher_class_results", {
      p_class_id: "00000000-0000-4000-8000-000000000000",
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
    expect((data as { error?: string })?.error).toBe("TEACHER_ROLE_REQUIRED");
  });
});
