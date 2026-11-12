import { describe, expect, it } from "vitest";
import {
  buildDeterministicAttemptOrder,
  generateExamJoinCode,
  gradeAttempt,
  gradeSingleQuestion,
  isTextAnswerMatched,
  normalizeAnswerText,
  sanitizeQuestionForStudent,
  validateAttemptSubmissionGuard,
} from "@/lib/grading";
import {
  generateExamAttemptsCsv,
  generateQrCodeSvg,
} from "@/lib/grading/qr-and-csv";
import type { ExamQuestionWithSnapshot } from "@/lib/grading/types";

describe("lib/grading - Chuẩn hóa & Chấm điểm tự động", () => {
  it("chuẩn hóa tiếng Việt có dấu (NFC/NFD), gộp khoảng trắng, không phân biệt hoa/thường và bỏ dấu câu cuối", () => {
    // Chuỗi NFD (tổ hợp dấu rời) và chuỗi NFC
    const nfd = "Chi\u0065\u0302\u0301n   th\u0061\u0306\u0301ng   Đi\u0065\u0323\u0302n  Biên   Phủ!!!";
    const nfc = "chiến thắng điện biên phủ";

    expect(normalizeAnswerText(nfd)).toBe(nfc);
    expect(normalizeAnswerText("  HÀ   NỘI. ")).toBe("hà nội");
    expect(normalizeAnswerText("«1945»")).toBe("1945");
  });

  it("so khớp accepted_variants cho câu điền khuyết (cloze) và tự luận ngắn (short_answer)", () => {
    expect(
      isTextAnswerMatched("TP. Hồ Chí Minh.", "Thành phố Hồ Chí Minh", [
        "TP Hồ Chí Minh",
        "TP. Hồ Chí Minh",
        "Sài Gòn",
      ])
    ).toBe(true);

    expect(
      isTextAnswerMatched("   sài   gòn! ", "Thành phố Hồ Chí Minh", [
        "TP. Hồ Chí Minh",
        "Sài Gòn",
      ])
    ).toBe(true);

    expect(
      isTextAnswerMatched("Đà Nẵng", "Thành phố Hồ Chí Minh", ["Sài Gòn"])
    ).toBe(false);
  });

  it("xử lý câu bỏ trống và câu short_answer không khớp tự động (đánh dấu cần giáo viên xem)", () => {
    const mcqItem: ExamQuestionWithSnapshot = {
      examQuestionId: "eq-1",
      questionId: "q-1",
      points: 2.5,
      position: 0,
      snapshot: {
        id: "q-1",
        type: "mcq",
        stem: "Thủ đô của Việt Nam là gì?",
        explanation: "Hà Nội là thủ đô.",
        topic: "Địa lý",
        difficulty: "easy",
        choices: [
          { id: "c-1", text: "Hà Nội", is_correct: true, position: 0 },
          { id: "c-2", text: "Huế", is_correct: false, position: 1 },
        ],
        answer_text: null,
        accepted_variants: [],
      },
    };

    const shortAnswerItem: ExamQuestionWithSnapshot = {
      examQuestionId: "eq-2",
      questionId: "q-2",
      points: 2.5,
      position: 1,
      snapshot: {
        id: "q-2",
        type: "short_answer",
        stem: "Chiến dịch Điện Biên Phủ kết thúc vào ngày tháng năm nào?",
        explanation: "Ngày 7/5/1954.",
        topic: "Lịch sử",
        difficulty: "medium",
        choices: [],
        answer_text: "07/05/1954",
        accepted_variants: ["7/5/1954", "ngày 7 tháng 5 năm 1954"],
      },
    };

    // 1. Bỏ trống câu short_answer -> 0 điểm, không cần giáo viên chấm
    const blankShort = gradeSingleQuestion(shortAnswerItem, "   ");
    expect(blankShort.isCorrect).toBe(false);
    expect(blankShort.pointsAwarded).toBe(0);
    expect(blankShort.needsManualReview).toBe(false);

    // 2. Trả lời khớp accepted_variants -> đủ điểm, không cần giáo viên chấm
    const matchedShort = gradeSingleQuestion(
      shortAnswerItem,
      "Ngày 7 tháng 5 năm 1954."
    );
    expect(matchedShort.isCorrect).toBe(true);
    expect(matchedShort.pointsAwarded).toBe(2.5);
    expect(matchedShort.needsManualReview).toBe(false);

    // 3. Trả lời diễn đạt khác chưa khớp tự động -> đánh dấu needsManualReview = true, điểm tạm tính
    const attemptResult = gradeAttempt([mcqItem, shortAnswerItem], {
      "eq-1": "c-1",
      "eq-2": "Mùng 7 tháng 5 năm 54",
    });

    expect(attemptResult.score).toBe(2.5);
    expect(attemptResult.maxPoints).toBe(5);
    expect(attemptResult.correctCount).toBe(1);
    expect(attemptResult.needsManualReview).toBe(true);
    expect(attemptResult.pendingReviewCount).toBe(1);
    expect(attemptResult.gradedAnswers[1]?.isCorrect).toBeNull();
    expect(attemptResult.gradedAnswers[1]?.needsManualReview).toBe(true);
  });

  it("trộn thứ tự câu hỏi và lựa chọn cố định theo seed lượt làm (tải lại không đổi thứ tự)", () => {
    const questions = [
      { examQuestionId: "eq-1", choiceIds: ["c1", "c2", "c3", "c4"] },
      { examQuestionId: "eq-2", choiceIds: ["d1", "d2", "d3", "d4"] },
      { examQuestionId: "eq-3", choiceIds: ["e1", "e2", "e3", "e4"] },
      { examQuestionId: "eq-4", choiceIds: ["f1", "f2", "f3", "f4"] },
      { examQuestionId: "eq-5", choiceIds: ["g1", "g2", "g3", "g4"] },
    ];

    const firstRun = buildDeterministicAttemptOrder({
      attemptSeed: "token-student-A-12345",
      questions,
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const reloadRun = buildDeterministicAttemptOrder({
      attemptSeed: "token-student-A-12345",
      questions,
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const otherStudentRun = buildDeterministicAttemptOrder({
      attemptSeed: "token-student-B-99999",
      questions,
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    expect(firstRun).toEqual(reloadRun);
    expect(firstRun.questionOrder).not.toEqual(otherStudentRun.questionOrder);
  });

  it("sinh mã tham gia 6 ký tự không chứa ký tự dễ nhầm (0, O, 1, I)", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateExamJoinCode();
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[0O1I]/);
    }
  });

  it("chặn nộp bài khi sai attempt_token, đã nộp rồi, bài đã đóng hoặc quá hạn giờ làm", () => {
    const validToken = "a".repeat(48);

    // Sai token
    expect(
      validateAttemptSubmissionGuard({
        expectedToken: validToken,
        providedToken: "b".repeat(48),
        attemptStatus: "in_progress",
        examIsOpen: true,
        nowIso: "2026-11-12T08:10:00Z",
      })
    ).toEqual({
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "INVALID_TOKEN",
    });

    // Đã nộp rồi
    expect(
      validateAttemptSubmissionGuard({
        expectedToken: validToken,
        providedToken: validToken,
        attemptStatus: "submitted",
        examIsOpen: true,
        nowIso: "2026-11-12T08:10:00Z",
      })
    ).toEqual({
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "ATTEMPT_ALREADY_SUBMITTED",
    });

    // Bài đã đóng
    expect(
      validateAttemptSubmissionGuard({
        expectedToken: validToken,
        providedToken: validToken,
        attemptStatus: "in_progress",
        examIsOpen: false,
        nowIso: "2026-11-12T08:10:00Z",
      })
    ).toEqual({
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "EXAM_CLOSED",
    });

    // Quá hạn deadline_at vượt quá thời gian ân hạn
    expect(
      validateAttemptSubmissionGuard({
        expectedToken: validToken,
        providedToken: validToken,
        attemptStatus: "in_progress",
        examIsOpen: true,
        deadlineAt: "2026-11-12T08:15:00Z",
        nowIso: "2026-11-12T08:16:00Z",
        graceSeconds: 15,
      })
    ).toEqual({
      allowed: false,
      isExpiredSubmission: true,
      errorCode: "ATTEMPT_TIME_EXPIRED",
    });
  });

  it("không gửi đáp án đúng và giải thích về trình duyệt trước khi nộp bài", () => {
    const item: ExamQuestionWithSnapshot = {
      examQuestionId: "eq-1",
      questionId: "q-1",
      points: 1,
      position: 0,
      snapshot: {
        id: "q-1",
        type: "mcq",
        stem: "Câu hỏi bảo mật?",
        explanation: "Giải thích bí mật",
        topic: null,
        difficulty: null,
        choices: [
          { id: "c1", text: "Đáp án A", is_correct: true, position: 0 },
          { id: "c2", text: "Đáp án B", is_correct: false, position: 1 },
        ],
        answer_text: "Đáp án ẩn",
        accepted_variants: ["Biến thể ẩn"],
      },
    };

    const sanitizedBeforeSubmit = sanitizeQuestionForStudent(item, false);
    expect(sanitizedBeforeSubmit.answer_text).toBeNull();
    expect(sanitizedBeforeSubmit.explanation).toBeNull();
    expect(sanitizedBeforeSubmit.choices[0]).not.toHaveProperty("is_correct");

    const revealedAfterSubmit = sanitizeQuestionForStudent(item, true);
    expect(revealedAfterSubmit.explanation).toBe("Giải thích bí mật");
    expect(revealedAfterSubmit.choices[0]?.is_correct).toBe(true);
  });

  it("sinh mã QR SVG và xuất CSV chuẩn UTF-8 BOM", () => {
    const svg = generateQrCodeSvg("https://memoquiz.local/t/ABCDEF");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("<path")).toBe(true);

    const csv = generateExamAttemptsCsv([
      {
        studentName: "Nguyễn Văn An",
        studentClass: "9A1",
        score: 8.5,
        totalPoints: 10,
        status: "submitted",
        needsManualReview: false,
        durationSeconds: 420,
        startedAt: "2026-11-12T08:00:00Z",
        submittedAt: "2026-11-12T08:07:00Z",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Nguyễn Văn An");
    expect(csv).toContain("9A1");
  });
});

