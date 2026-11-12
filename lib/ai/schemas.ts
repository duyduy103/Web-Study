import { z } from "zod";
import { Type, type Schema } from "@google/genai";
import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace } from "@/lib/parsing/normalize";
import type { ParsedQuestion } from "@/lib/parsing/types";

export const aiChoiceZodSchema = z.object({
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
});

export const aiExtractedQuestionZodSchema = z
  .object({
    type: z.enum(["mcq", "true_false", "cloze", "short_answer"]),
    stem: z.string().trim().min(1),
    choices: z.array(aiChoiceZodSchema).nullable().optional(),
    answerText: z.string().trim().nullable().optional(),
    explanation: z.string().trim().nullable().optional(),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string()).nullable().optional(),
    sourceRef: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => {
    if (val.type === "mcq") {
      if (!val.choices || val.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Câu trắc nghiệm (mcq) phải có ít nhất 2 lựa chọn.",
        });
      }
      const correctCount = (val.choices ?? []).filter((c) => c.isCorrect).length;
      if (correctCount > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Câu trắc nghiệm 1 đáp án không được có nhiều hơn 1 lựa chọn đúng.",
        });
      }
    }
  });

export const aiExtractedQuestionsResponseZodSchema = z.object({
  questions: z.array(aiExtractedQuestionZodSchema),
});

export type AiExtractedQuestionsResponse = z.infer<
  typeof aiExtractedQuestionsResponseZodSchema
>;

export const geminiExtractQuestionsResponseSchema: Schema = {
  type: Type.OBJECT,
  description: "Danh sách câu hỏi tách được từ tài liệu gốc.",
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ["mcq", "true_false", "cloze", "short_answer"],
            description: "Loại câu hỏi.",
          },
          stem: {
            type: Type.STRING,
            description: "Nội dung câu hỏi gốc (giữ nguyên ngôn ngữ trong tài liệu).",
          },
          choices: {
            type: Type.ARRAY,
            nullable: true,
            description: "Danh sách các lựa chọn nếu là mcq hoặc true_false.",
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                isCorrect: { type: Type.BOOLEAN },
              },
              required: ["text", "isCorrect"],
            },
          },
          answerText: {
            type: Type.STRING,
            nullable: true,
            description:
              "Đáp án văn bản nếu là short_answer hoặc cloze. Để null nếu tài liệu không ghi đáp án.",
          },
          explanation: {
            type: Type.STRING,
            nullable: true,
            description: "Lời giải thích nếu có sẵn trong tài liệu, ngược lại để null.",
          },
          confidence: {
            type: Type.NUMBER,
            description:
              "Độ tin cậy từ 0 đến 1. Nếu câu hỏi không có đáp án trong tài liệu, đặt <= 0.35.",
          },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Cảnh báo bằng tiếng Việt nếu thiếu đáp án hoặc cấu trúc bất thường.",
          },
          sourceRef: {
            type: Type.STRING,
            description: "Vị trí trích dẫn trong tài liệu (ví dụ: Trang 1, Câu 2).",
          },
        },
        required: ["type", "stem", "confidence", "warnings", "sourceRef"],
      },
    },
  },
  required: ["questions"],
};

/**
 * Chuẩn hóa kết quả AI sang ParsedQuestion, cưỡng bức quy tắc:
 * - Không có đáp án trong tài liệu -> confidence <= 0.35 và có cảnh báo thiếu đáp án.
 * - Đánh dấu aiGenerated = true.
 */
export function normalizeAiExtractedQuestions(
  raw: AiExtractedQuestionsResponse
): ParsedQuestion[] {
  return raw.questions.map((item) => {
    const warnings = [...(item.warnings ?? [])];
    let confidence = Number(item.confidence.toFixed(2));

    const stem = normalizeInlineWhitespace(item.stem);
    const explanation = item.explanation
      ? normalizeInlineWhitespace(item.explanation)
      : undefined;
    const sourceRef = normalizeInlineWhitespace(item.sourceRef);

    if (item.type === "mcq" || item.type === "true_false") {
      const choices = (item.choices ?? []).map((c) => ({
        text: normalizeInlineWhitespace(c.text),
        isCorrect: Boolean(c.isCorrect),
        aiGenerated: true,
      }));

      const hasCorrect = choices.some((c) => c.isCorrect);
      if (!hasCorrect) {
        if (!warnings.includes(vi.parsing.warnings.missingAnswer)) {
          warnings.push(vi.parsing.warnings.missingAnswer);
        }
        confidence = Math.min(confidence, 0.35);
      }

      if (item.type === "mcq" && choices.length === 2) {
        if (!warnings.includes(vi.parsing.warnings.onlyTwoChoicesMcq)) {
          warnings.push(vi.parsing.warnings.onlyTwoChoicesMcq);
        }
        confidence = Math.min(confidence, 0.72);
      }

      return {
        type: item.type,
        stem,
        choices,
        explanation,
        confidence,
        warnings,
        sourceRef,
        aiGenerated: true,
      };
    }

    const answerText =
      item.answerText && item.answerText.trim().length > 0
        ? normalizeInlineWhitespace(item.answerText)
        : undefined;

    if (!answerText) {
      if (!warnings.includes(vi.parsing.warnings.missingAnswer)) {
        warnings.push(vi.parsing.warnings.missingAnswer);
      }
      confidence = Math.min(confidence, 0.35);
    }

    return {
      type: item.type,
      stem,
      answerText,
      explanation,
      confidence,
      warnings,
      sourceRef,
      aiGenerated: true,
    };
  });
}

// ============================================================================
// Schema cho Tác vụ 2: Sinh đáp án nhiễu + giải thích (Distractor Generation)
// ============================================================================

export const aiDistractorItemZodSchema = z
  .object({
    questionId: z.string().min(1),
    distractors: z
      .array(z.string().trim().min(1))
      .length(3, "Phải có đúng 3 đáp án nhiễu."),
    explanation: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => {
    const normalized = val.distractors.map((d) => d.toLowerCase());
    if (new Set(normalized).size !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "3 đáp án nhiễu không được trùng nhau.",
      });
    }
  });

export const aiDistractorsResponseZodSchema = z.object({
  items: z.array(aiDistractorItemZodSchema),
});

export type AiDistractorsResponse = z.infer<
  typeof aiDistractorsResponseZodSchema
>;

export const geminiDistractorsResponseSchema: Schema = {
  type: Type.OBJECT,
  description: "Danh sách đáp án nhiễu và giải thích cho từng câu hỏi.",
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionId: {
            type: Type.STRING,
            description: "ID của câu hỏi đầu vào.",
          },
          distractors: {
            type: Type.ARRAY,
            description:
              "Đúng 3 phương án nhiễu (sai) hợp lý, cùng độ dài và văn phong với đáp án đúng.",
            items: { type: Type.STRING },
          },
          explanation: {
            type: Type.STRING,
            description:
              "Giải thích ngắn gọn bằng tiếng Việt vì sao đáp án đúng là chính xác.",
          },
        },
        required: ["questionId", "distractors", "explanation"],
      },
    },
  },
  required: ["items"],
};
