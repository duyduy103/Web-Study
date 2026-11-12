import { z } from "zod";
import { vi } from "@/lib/i18n/vi";
import type { QuestionStatus, QuestionType } from "@/lib/supabase/types";
import type { ReviewChoiceItem } from "@/lib/review/types";

const CLOZE_BLANK_REGEX = /(?:_{2,}|\.{3,}|…|\[\s*(?:\.+|_+|\d+)?\s*\]|\(\s*_{2,}\s*\))/;

export function hasClozeBlank(stem: string): boolean {
  return CLOZE_BLANK_REGEX.test(stem);
}

export interface ValidatableQuestionInput {
  type: QuestionType;
  stem: string;
  choices?: Array<{ text: string; is_correct: boolean }> | null;
  answer_text?: string | null;
}

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Kiểm tra tính hợp lệ của câu hỏi theo đúng quy tắc từng loại câu (B.3):
 * - stem không rỗng
 * - mcq: >= 2 lựa chọn không rỗng, không trùng nhau, đúng 1 đáp án đúng
 * - true_false: đúng 2 lựa chọn không rỗng, không trùng nhau, đúng 1 đáp án đúng
 * - cloze: có ít nhất 1 ký hiệu chỗ trống trong stem và có answer_text không rỗng
 * - short_answer: có answer_text không rỗng
 */
export function validateQuestionForReview(
  input: ValidatableQuestionInput
): QuestionValidationResult {
  const errors: string[] = [];
  const trimmedStem = input.stem.trim();

  if (trimmedStem.length === 0) {
    errors.push(vi.review.validation.stemEmpty);
  }

  if (input.type === "mcq") {
    const rawChoices = input.choices ?? [];
    const nonEmptyChoices = rawChoices.filter((c) => c.text.trim().length > 0);

    if (
      rawChoices.length < 2 ||
      nonEmptyChoices.length < 2 ||
      nonEmptyChoices.length !== rawChoices.length
    ) {
      errors.push(vi.review.validation.mcqMinChoices);
    }

    const normalizedTexts = nonEmptyChoices.map((c) =>
      c.text.trim().toLowerCase()
    );
    if (new Set(normalizedTexts).size !== normalizedTexts.length) {
      errors.push(vi.review.validation.mcqDuplicateChoices);
    }

    const correctCount = nonEmptyChoices.filter((c) => c.is_correct).length;
    if (correctCount !== 1) {
      errors.push(vi.review.validation.mcqSingleCorrect);
    }
  } else if (input.type === "true_false") {
    const rawChoices = input.choices ?? [];
    const nonEmptyChoices = rawChoices.filter((c) => c.text.trim().length > 0);

    if (rawChoices.length !== 2 || nonEmptyChoices.length !== 2) {
      errors.push(vi.review.validation.tfExactTwoChoices);
    } else {
      const normalizedTexts = nonEmptyChoices.map((c) =>
        c.text.trim().toLowerCase()
      );
      if (new Set(normalizedTexts).size !== 2) {
        errors.push(vi.review.validation.mcqDuplicateChoices);
      }
    }

    const correctCount = nonEmptyChoices.filter((c) => c.is_correct).length;
    if (correctCount !== 1) {
      errors.push(vi.review.validation.tfSingleCorrect);
    }
  } else if (input.type === "cloze") {
    if (!hasClozeBlank(trimmedStem)) {
      errors.push(vi.review.validation.clozeMissingBlank);
    }
    const ans = (input.answer_text ?? "").trim();
    if (ans.length === 0) {
      errors.push(vi.review.validation.clozeMissingAnswer);
    }
  } else if (input.type === "short_answer") {
    const ans = (input.answer_text ?? "").trim();
    if (ans.length === 0) {
      errors.push(vi.review.validation.shortAnswerEmpty);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Kiểm tra chuyển trạng thái câu hỏi:
 * - Chuyển sang 'approved' bắt buộc câu hỏi phải hợp lệ.
 * - Chuyển sang 'draft' hoặc 'archived' luôn được phép.
 */
export function canTransitionQuestionStatus(
  question: ValidatableQuestionInput,
  targetStatus: QuestionStatus
): { allowed: boolean; errors: string[] } {
  if (targetStatus === "approved") {
    const check = validateQuestionForReview(question);
    return {
      allowed: check.valid,
      errors: check.errors,
    };
  }
  return { allowed: true, errors: [] };
}

/**
 * Chuyển đổi thông minh dữ liệu đáp án khi giáo viên đổi loại câu (tránh bắt gõ lại đáp án)
 */
export function convertAnswerDataForNewType(params: {
  currentType: QuestionType;
  nextType: QuestionType;
  choices: ReviewChoiceItem[];
  answerText: string | null;
}): {
  choices: ReviewChoiceItem[];
  answerText: string | null;
} {
  if (params.currentType === params.nextType) {
    return {
      choices: params.choices,
      answerText: params.answerText,
    };
  }

  const currentCorrectText =
    params.choices.find((c) => c.is_correct)?.text.trim() ??
    (params.answerText ?? "").trim();

  if (params.nextType === "true_false") {
    const isFalse = /^(sai|false|f|no|không)$/i.test(currentCorrectText);
    return {
      choices: [
        {
          text: vi.setDetails.trueValue,
          is_correct: !isFalse,
          position: 0,
          ai_generated: false,
        },
        {
          text: vi.setDetails.falseValue,
          is_correct: isFalse,
          position: 1,
          ai_generated: false,
        },
      ],
      answerText: null,
    };
  }

  if (params.nextType === "mcq") {
    if (params.choices.length >= 2) {
      return {
        choices: params.choices.map((c, idx) => ({ ...c, position: idx })),
        answerText: null,
      };
    }
    return {
      choices: [
        {
          text: currentCorrectText,
          is_correct: true,
          position: 0,
          ai_generated: false,
        },
        {
          text: "",
          is_correct: false,
          position: 1,
          ai_generated: false,
        },
      ],
      answerText: null,
    };
  }

  // Chuyển sang cloze hoặc short_answer
  return {
    choices: [],
    answerText: currentCorrectText || null,
  };
}

// ============================================================================
// Schema Zod kiểm tra dữ liệu đầu vào ở cả Client và Server
// ============================================================================

export const reviewChoiceZodSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim(),
  is_correct: z.boolean(),
  position: z.number().int().min(0),
  ai_generated: z.boolean().default(false),
});

export const inlineSaveQuestionZodSchema = z
  .object({
    questionId: z.string().uuid(),
    expectedUpdatedAt: z.string().nullable().optional(),
    type: z.enum(["mcq", "true_false", "cloze", "short_answer"]),
    stem: z.string().trim().min(1, { message: vi.review.validation.stemEmpty }),
    explanation: z.string().trim().nullable().optional(),
    topic: z.string().trim().nullable().optional(),
    difficulty: z.string().trim().nullable().optional(),
    status: z.enum(["draft", "approved", "archived"]),
    choices: z.array(reviewChoiceZodSchema).optional().default([]),
    answer_text: z.string().trim().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const check = validateQuestionForReview({
      type: val.type,
      stem: val.stem,
      choices: val.choices,
      answer_text: val.answer_text,
    });

    if (!check.valid) {
      for (const errMsg of check.errors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: errMsg,
        });
      }
    }
  });

