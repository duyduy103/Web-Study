import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ReviewQuestionItem } from "@/lib/review/types";
import {
  canTransitionQuestionStatus,
  convertAnswerDataForNewType,
  validateQuestionForReview,
} from "@/lib/review/validation";
import {
  computeReviewSummaryStats,
  evaluateGreenBulkApproval,
  filterReviewQuestions,
  getInitialReviewFilterState,
} from "@/lib/review/filters";
import {
  applySnapshotsToQuestions,
  createEmptyUndoRedoState,
  createSnapshotFromQuestion,
  popRedoStep,
  popUndoStep,
  pushUndoStep,
} from "@/lib/review/undo-stack";
import {
  applyQuestionSnapshotsOnServer,
  isUpdatedAtConflict,
  saveInlineQuestionOnServer,
} from "@/lib/review/server-service";
import { vi } from "@/lib/i18n/vi";

function makeQuestion(
  overrides: Partial<ReviewQuestionItem> & { id: string }
): ReviewQuestionItem {
  return {
    id: overrides.id,
    set_id: overrides.set_id ?? "set-1",
    orderNumber: overrides.orderNumber ?? 1,
    type: overrides.type ?? "mcq",
    stem: overrides.stem ?? "Câu hỏi trắc nghiệm mẫu hợp lệ?",
    explanation: overrides.explanation ?? null,
    source_ref: overrides.source_ref ?? "Câu 1, dòng 1",
    raw_source_text: overrides.raw_source_text ?? "Câu 1: ...",
    topic: overrides.topic ?? null,
    difficulty: overrides.difficulty ?? null,
    confidence: overrides.confidence ?? 0.95,
    status: overrides.status ?? "draft",
    warnings: overrides.warnings ?? [],
    ai_generated: overrides.ai_generated ?? false,
    reviewed_by_human: overrides.reviewed_by_human ?? false,
    reviewed_at: overrides.reviewed_at ?? null,
    created_at: overrides.created_at ?? "2026-11-12T08:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-11-12T08:00:00.000Z",
    choices: overrides.choices ?? [
      { text: "Đáp án A", is_correct: true, position: 0, ai_generated: false },
      { text: "Đáp án B", is_correct: false, position: 1, ai_generated: false },
      { text: "Đáp án C", is_correct: false, position: 2, ai_generated: false },
      { text: "Đáp án D", is_correct: false, position: 3, ai_generated: false },
    ],
    answer_text: overrides.answer_text ?? null,
  };
}

describe("MemoQuiz Step 4 - Fast Review Logic Suite", () => {
  it("1. Kiểm tra hợp lệ từng loại câu hỏi (mcq, true_false, cloze, short_answer) và chặn duyệt câu lỗi", () => {
    // 1.1 MCQ hợp lệ
    const validMcq = makeQuestion({ id: "q-valid" });
    expect(validateQuestionForReview(validMcq).valid).toBe(true);
    expect(canTransitionQuestionStatus(validMcq, "approved").allowed).toBe(true);

    // 1.2 MCQ có 0 đáp án đúng -> không thể duyệt
    const zeroCorrectMcq = makeQuestion({
      id: "q-zero",
      choices: [
        { text: "A", is_correct: false, position: 0, ai_generated: false },
        { text: "B", is_correct: false, position: 1, ai_generated: false },
      ],
    });
    const zeroCheck = validateQuestionForReview(zeroCorrectMcq);
    expect(zeroCheck.valid).toBe(false);
    expect(zeroCheck.errors).toContain(vi.review.validation.mcqSingleCorrect);
    expect(canTransitionQuestionStatus(zeroCorrectMcq, "approved").allowed).toBe(
      false
    );
    // Nhưng vẫn cho phép chuyển sang 'archived' (Loại)
    expect(canTransitionQuestionStatus(zeroCorrectMcq, "archived").allowed).toBe(
      true
    );

    // 1.3 MCQ có 2 đáp án đúng + lựa chọn trùng nhau -> không thể duyệt
    const twoCorrectDupMcq = makeQuestion({
      id: "q-two",
      choices: [
        { text: "Hà Nội", is_correct: true, position: 0, ai_generated: false },
        { text: "hà nội", is_correct: true, position: 1, ai_generated: false },
      ],
    });
    const twoCheck = validateQuestionForReview(twoCorrectDupMcq);
    expect(twoCheck.valid).toBe(false);
    expect(twoCheck.errors).toContain(vi.review.validation.mcqSingleCorrect);
    expect(twoCheck.errors).toContain(vi.review.validation.mcqDuplicateChoices);

    // 1.4 True/False phải có đúng 2 lựa chọn và 1 đáp án đúng
    const invalidTf = makeQuestion({
      id: "q-tf",
      type: "true_false",
      choices: [
        { text: "Đúng", is_correct: true, position: 0, ai_generated: false },
        { text: "Sai", is_correct: false, position: 1, ai_generated: false },
        { text: "Không rõ", is_correct: false, position: 2, ai_generated: false },
      ],
    });
    expect(validateQuestionForReview(invalidTf).errors).toContain(
      vi.review.validation.tfExactTwoChoices
    );

    // 1.5 Cloze phải có chỗ trống trong stem và có answer_text
    const invalidClozeNoBlank = makeQuestion({
      id: "q-cloze-1",
      type: "cloze",
      stem: "Chiến thắng Điện Biên Phủ diễn ra vào năm 1954.",
      choices: [],
      answer_text: "1954",
    });
    expect(validateQuestionForReview(invalidClozeNoBlank).errors).toContain(
      vi.review.validation.clozeMissingBlank
    );

    const validCloze = makeQuestion({
      id: "q-cloze-2",
      type: "cloze",
      stem: "Chiến thắng Điện Biên Phủ diễn ra vào năm ____.",
      choices: [],
      answer_text: "1954",
    });
    expect(validateQuestionForReview(validCloze).valid).toBe(true);

    // 1.6 Short answer phải có answer_text không rỗng
    const invalidSa = makeQuestion({
      id: "q-sa",
      type: "short_answer",
      choices: [],
      answer_text: "   ",
    });
    expect(validateQuestionForReview(invalidSa).errors).toContain(
      vi.review.validation.shortAnswerEmpty
    );
  });

  it("2. 'Duyệt tất cả câu xanh' chỉ chọn câu draft xanh chuẩn, tuyệt đối loại trừ câu AI, vàng/đỏ, có cảnh báo hoặc không hợp lệ", () => {
    const qGreenEligible = makeQuestion({
      id: "11111111-1111-1111-1111-111111111111",
      confidence: 0.95,
      ai_generated: false,
      warnings: [],
      status: "draft",
    });

    const qAiGenerated = makeQuestion({
      id: "22222222-2222-2222-2222-222222222222",
      confidence: 0.95,
      ai_generated: true,
      warnings: [],
      status: "draft",
    });

    const qYellow = makeQuestion({
      id: "33333333-3333-3333-3333-333333333333",
      confidence: 0.72,
      ai_generated: false,
      warnings: [],
      status: "draft",
    });

    const qRed = makeQuestion({
      id: "44444444-4444-4444-4444-444444444444",
      confidence: 0.35,
      ai_generated: false,
      warnings: [],
      status: "draft",
    });

    const qGreenWithWarning = makeQuestion({
      id: "55555555-5555-5555-5555-555555555555",
      confidence: 0.9,
      ai_generated: false,
      warnings: ["Cảnh báo nhảy số thứ tự câu"],
      status: "draft",
    });

    const qGreenInvalid = makeQuestion({
      id: "66666666-6666-6666-6666-666666666666",
      confidence: 0.92,
      ai_generated: false,
      warnings: [],
      status: "draft",
      choices: [
        { text: "A", is_correct: false, position: 0, ai_generated: false },
        { text: "B", is_correct: false, position: 1, ai_generated: false },
      ],
    });

    const qAlreadyApproved = makeQuestion({
      id: "77777777-7777-7777-7777-777777777777",
      confidence: 0.95,
      status: "approved",
    });

    const evalResult = evaluateGreenBulkApproval([
      qGreenEligible,
      qAiGenerated,
      qYellow,
      qRed,
      qGreenWithWarning,
      qGreenInvalid,
      qAlreadyApproved,
    ]);

    expect(evalResult.eligibleIds).toEqual([qGreenEligible.id]);
    expect(evalResult.skippedCount).toBe(6);
    expect(evalResult.skippedBreakdown).toEqual({
      aiGenerated: 1,
      mediumOrLowConfidence: 2,
      hasWarnings: 1,
      invalid: 1,
      alreadyProcessed: 1,
    });
  });

  it("3. Bộ lọc mặc định mở 'Cần kiểm tra' khi có câu cần xem, và kết hợp nhiều tiêu chí lọc chính xác", () => {
    const qGreen = makeQuestion({ id: "q-green", confidence: 0.95 });
    const qAi = makeQuestion({
      id: "q-ai",
      confidence: 0.92,
      ai_generated: true,
      stem: "Câu hỏi về giao thức HTTPS",
    });

    const initialWithNeedsCheck = getInitialReviewFilterState([qGreen, qAi]);
    expect(initialWithNeedsCheck.needsCheckPreset).toBe(true);

    const filteredNeedsCheck = filterReviewQuestions(
      [qGreen, qAi],
      initialWithNeedsCheck
    );
    expect(filteredNeedsCheck.map((q) => q.id)).toEqual(["q-ai"]);

    // Khi toàn bộ đều xanh chuẩn và không có câu cần kiểm tra -> mở mặc định Tất cả
    const initialAllClean = getInitialReviewFilterState([qGreen]);
    expect(initialAllClean.needsCheckPreset).toBe(false);

    const stats = computeReviewSummaryStats([qGreen, qAi]);
    expect(stats.total).toBe(2);
    expect(stats.needsCheckCount).toBe(1);
  });

  it("4. Ngăn xếp Hoàn tác / Làm lại (Undo / Redo): lưu >= 20 bước và gộp thao tác hàng loạt thành 1 bước duy nhất", () => {
    const q1 = makeQuestion({ id: "q-1", status: "draft", topic: null });
    const q2 = makeQuestion({ id: "q-2", status: "draft", topic: null });
    const q3 = makeQuestion({ id: "q-3", status: "draft", topic: null });

    let questions = [q1, q2, q3];
    let state = createEmptyUndoRedoState();

    // Đẩy 25 bước đơn lẻ vào ngăn xếp -> giữ đủ >= 20 bước
    for (let i = 1; i <= 25; i++) {
      const before = [createSnapshotFromQuestion(q1)];
      const after = [{ ...before[0], topic: `Chủ đề ${i}` }];
      state = pushUndoStep(state, {
        id: `step-${i}`,
        label: `Bước ${i}`,
        createdAt: i,
        beforeSnapshots: before,
        afterSnapshots: after,
      });
    }
    expect(state.undoStack.length).toBeGreaterThanOrEqual(20);

    // Thực hiện 1 thao tác hàng loạt duyệt cả 3 câu -> chỉ là 1 bước hoàn tác duy nhất
    const bulkBefore = questions.map(createSnapshotFromQuestion);
    const bulkAfter = bulkBefore.map((s) => ({
      ...s,
      status: "approved" as const,
      topic: "Mạng máy tính",
    }));

    questions = applySnapshotsToQuestions(questions, bulkAfter);
    expect(questions.every((q) => q.status === "approved")).toBe(true);

    state = pushUndoStep(state, {
      id: "bulk-step",
      label: "Duyệt hàng loạt 3 câu",
      createdAt: 999,
      beforeSnapshots: bulkBefore,
      afterSnapshots: bulkAfter,
    });

    // Bấm Hoàn tác 1 lần -> cả 3 câu quay về trạng thái draft và topic = null
    const poppedUndo = popUndoStep(state);
    state = poppedUndo.nextState;
    expect(poppedUndo.step?.id).toBe("bulk-step");

    questions = applySnapshotsToQuestions(
      questions,
      poppedUndo.step!.beforeSnapshots
    );
    expect(questions.every((q) => q.status === "draft")).toBe(true);
    expect(questions.every((q) => q.topic === null)).toBe(true);

    // Bấm Làm lại (Redo) 1 lần -> cả 3 câu trở lại approved
    const poppedRedo = popRedoStep(state);
    questions = applySnapshotsToQuestions(
      questions,
      poppedRedo.step!.afterSnapshots
    );
    expect(questions.every((q) => q.status === "approved")).toBe(true);
  });

  it("5. Xử lý xung đột updated_at (Optimistic Concurrency): phát hiện sửa đồng thời ở 2 tab và không ghi đè", async () => {
    const tOld = "2026-11-12T09:00:00.100Z";
    const tNew = "2026-11-12T09:01:15.450Z";

    expect(isUpdatedAtConflict(tOld, tOld)).toBe(false);
    expect(isUpdatedAtConflict(tOld, tNew)).toBe(true);

    // Giả lập Supabase trả về conflict = true khi Tab 2 gửi expectedUpdatedAt cũ
    const mockConflictSupabase = {
      rpc: async () => ({
        data: {
          conflict: true,
          server_updated_at: tNew,
        },
        error: null,
      }),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const saveRes = await saveInlineQuestionOnServer({
      supabase: mockConflictSupabase,
      setId: "11111111-1111-4111-8111-111111111111",
      rawPayload: {
        questionId: "22222222-2222-4222-8222-222222222222",
        expectedUpdatedAt: tOld,
        type: "short_answer",
        stem: "Câu hỏi sửa ở Tab 2",
        status: "draft",
        choices: [],
        answer_text: "Đáp án Tab 2",
      },
    });

    expect(saveRes.status).toBe("conflict");

    // Kiểm tra applyQuestionSnapshotsOnServer phát hiện xung đột trước khi gọi RPC
    let rpcCalled = false;
    const mockBulkConflictSupabase = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                updated_at: tNew,
              },
            ],
            error: null,
          }),
        }),
      }),
      rpc: async () => {
        rpcCalled = true;
        return { data: [], error: null };
      },
    } as unknown as SupabaseClient<Database>;

    const qSnap = createSnapshotFromQuestion(
      makeQuestion({
        id: "22222222-2222-4222-8222-222222222222",
        updated_at: tOld,
      })
    );

    const bulkRes = await applyQuestionSnapshotsOnServer({
      supabase: mockBulkConflictSupabase,
      snapshots: [{ ...qSnap, status: "approved" }],
      expectedUpdatedAtById: {
        "22222222-2222-4222-8222-222222222222": tOld,
      },
    });

    expect(bulkRes.status).toBe("conflict");
    expect(rpcCalled).toBe(false);
  });

  it("6. Chuyển đổi thông minh dữ liệu đáp án khi đổi loại câu (convertAnswerDataForNewType)", () => {
    const convertedToSa = convertAnswerDataForNewType({
      currentType: "mcq",
      nextType: "short_answer",
      choices: [
        { text: "Sai", is_correct: false, position: 0, ai_generated: false },
        { text: "Hà Nội", is_correct: true, position: 1, ai_generated: false },
      ],
      answerText: null,
    });
    expect(convertedToSa.answerText).toBe("Hà Nội");
    expect(convertedToSa.choices).toHaveLength(0);

    const convertedToTf = convertAnswerDataForNewType({
      currentType: "short_answer",
      nextType: "true_false",
      choices: [],
      answerText: "Sai",
    });
    expect(convertedToTf.choices).toHaveLength(2);
    expect(convertedToTf.choices[1].is_correct).toBe(true);
  });
});

