import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ParsedQuestion } from "@/lib/parsing/types";
import {
  callGeminiStructured,
  type InlineMediaPart,
  type RawModelGenerator,
} from "@/lib/ai/call-structured";
import {
  aiDistractorsResponseZodSchema,
  aiExtractedQuestionsResponseZodSchema,
  geminiDistractorsResponseSchema,
  geminiExtractQuestionsResponseSchema,
  normalizeAiExtractedQuestions,
} from "@/lib/ai/schemas";
import {
  buildExtractQuestionsPrompt,
  EXTRACT_QUESTIONS_PROMPT_VERSION,
} from "@/lib/ai/prompts/extract-questions";
import {
  buildGenerateDistractorsPrompt,
  GENERATE_DISTRACTORS_PROMPT_VERSION,
  type DistractorPromptInputItem,
} from "@/lib/ai/prompts/generate-distractors";
import { normalizeInlineWhitespace } from "@/lib/parsing/normalize";

export const LOW_CONFIDENCE_THRESHOLD = 0.8;
export const AI_QUESTION_BATCH_SIZE = 25;
export const PDF_PAGES_PER_BATCH = 10;

export interface AiExtractBatchResult {
  questions: ParsedQuestion[];
  cacheHit: boolean;
  tokensUsed: number;
  remainingQuota?: number;
}

/**
 * Tác vụ 1A: Gửi toàn bộ hoặc một cụm trang (PDF/ảnh/văn bản) cho AI tách câu hỏi.
 */
export async function runAiExtractBatch(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  rawText?: string;
  media?: InlineMediaPart;
  contextHint?: string;
  mode: "whole" | "fix_low_confidence";
  customGenerator?: RawModelGenerator;
}): Promise<AiExtractBatchResult> {
  const prompt = buildExtractQuestionsPrompt({
    rawText: params.rawText,
    contextHint: params.contextHint,
    mode: params.mode,
  });

  const cachePayload = params.media
    ? `${params.contextHint ?? ""}|${params.media.mimeType}|${params.media.base64Data}`
    : `${params.contextHint ?? ""}|${params.rawText ?? ""}`;

  const result = await callGeminiStructured({
    supabase: params.supabase,
    userId: params.userId,
    task: `extract_${params.mode}`,
    modelTier: "fast",
    promptVersion: EXTRACT_QUESTIONS_PROMPT_VERSION,
    cachePayload,
    prompt,
    media: params.media,
    responseSchema: geminiExtractQuestionsResponseSchema,
    zodSchema: aiExtractedQuestionsResponseZodSchema,
    customGenerator: params.customGenerator,
  });

  const questions = normalizeAiExtractedQuestions(result.data);

  return {
    questions,
    cacheHit: result.cacheHit,
    tokensUsed: result.tokensUsed,
    remainingQuota: result.remainingQuota,
  };
}

/**
 * Tác vụ 1B (fix_low_confidence):
 * - Giữ nguyên các câu hỏi có confidence >= 0.8 từ parser quy tắc.
 * - Chỉ gom văn bản gốc (rawBlockText) của các câu có confidence < 0.8 theo lô 20-30 câu để gửi cho AI.
 * - Ghép lại theo đúng vị trí câu hỏi ban đầu.
 */
export async function fixLowConfidenceQuestionsWithAi(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  ruleQuestions: ParsedQuestion[];
  batchSize?: number;
  customGenerator?: RawModelGenerator;
}): Promise<{
  mergedQuestions: ParsedQuestion[];
  sentQuestionIndices: number[];
  batchesCalled: number;
  cacheHits: number;
}> {
  const batchSize = params.batchSize ?? AI_QUESTION_BATCH_SIZE;
  const lowConfidenceEntries: Array<{
    originalIndex: number;
    question: ParsedQuestion;
  }> = [];

  params.ruleQuestions.forEach((q, idx) => {
    if (q.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidenceEntries.push({ originalIndex: idx, question: q });
    }
  });

  if (lowConfidenceEntries.length === 0) {
    return {
      mergedQuestions: [...params.ruleQuestions],
      sentQuestionIndices: [],
      batchesCalled: 0,
      cacheHits: 0,
    };
  }

  const mergedQuestions = [...params.ruleQuestions];
  let batchesCalled = 0;
  let cacheHits = 0;

  for (let start = 0; start < lowConfidenceEntries.length; start += batchSize) {
    const chunk = lowConfidenceEntries.slice(start, start + batchSize);
    const combinedRawText = chunk
      .map((entry, idx) => {
        const block = entry.question.rawBlockText ?? entry.question.stem;
        return `--- CÂU CẦN SỬA #${idx + 1} (${entry.question.sourceRef}) ---\n${block}`;
      })
      .join("\n\n");

    const batchRes = await runAiExtractBatch({
      supabase: params.supabase,
      userId: params.userId,
      rawText: combinedRawText,
      mode: "fix_low_confidence",
      contextHint: `Lô câu cần sửa từ vị trí ${start + 1} đến ${start + chunk.length}`,
      customGenerator: params.customGenerator,
    });

    batchesCalled += 1;
    if (batchRes.cacheHit) {
      cacheHits += 1;
    }

    chunk.forEach((entry, idxWithinChunk) => {
      const fixedQuestion = batchRes.questions[idxWithinChunk];
      if (fixedQuestion) {
        mergedQuestions[entry.originalIndex] = fixedQuestion;
      }
    });
  }

  return {
    mergedQuestions,
    sentQuestionIndices: lowConfidenceEntries.map((e) => e.originalIndex),
    batchesCalled,
    cacheHits,
  };
}

export interface GeneratedDistractorOutput {
  questionId: string;
  stem: string;
  correctAnswer: string;
  choices: Array<{
    text: string;
    isCorrect: boolean;
    aiGenerated: boolean;
  }>;
  explanation: string;
}

/**
 * Tác vụ 2: Sinh đáp án nhiễu + giải thích cho các câu Hỏi - Đáp ngắn (short_answer).
 * - Đáp án đúng của giáo viên được giữ nguyên 100% (aiGenerated = false).
 * - 3 phương án nhiễu do AI sinh có isCorrect = false, aiGenerated = true.
 * - Kiểm tra chặt: phương án nhiễu không được trùng với đáp án đúng của giáo viên.
 */
export async function generateDistractorsBatchWithAi(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  items: DistractorPromptInputItem[];
  customGenerator?: RawModelGenerator;
}): Promise<{
  results: GeneratedDistractorOutput[];
  cacheHit: boolean;
  tokensUsed: number;
  remainingQuota?: number;
}> {
  const validItems = params.items.filter(
    (item) => item.stem.trim().length > 0 && item.correctAnswer.trim().length > 0
  );

  if (validItems.length === 0) {
    return { results: [], cacheHit: true, tokensUsed: 0 };
  }

  const prompt = buildGenerateDistractorsPrompt(validItems);
  const cachePayload = JSON.stringify(validItems);

  const aiResult = await callGeminiStructured({
    supabase: params.supabase,
    userId: params.userId,
    task: "generate_distractors",
    modelTier: "strong",
    promptVersion: GENERATE_DISTRACTORS_PROMPT_VERSION,
    cachePayload,
    prompt,
    responseSchema: geminiDistractorsResponseSchema,
    zodSchema: aiDistractorsResponseZodSchema,
    customGenerator: params.customGenerator,
  });

  const byId = new Map(aiResult.data.items.map((i) => [i.questionId, i]));
  const outputs: GeneratedDistractorOutput[] = [];

  for (const inputItem of validItems) {
    const generated = byId.get(inputItem.questionId);
    if (!generated) {
      throw new Error("AI trả về thiếu kết quả cho câu hỏi trong lô.");
    }

    const teacherAnswerClean = normalizeInlineWhitespace(
      inputItem.correctAnswer
    );
    const teacherLower = teacherAnswerClean.toLowerCase();

    const cleanDistractors = generated.distractors.map((d) =>
      normalizeInlineWhitespace(d)
    );

    if (cleanDistractors.some((d) => d.toLowerCase() === teacherLower)) {
      throw new Error(
        "AI sinh phương án nhiễu trùng với đáp án đúng của giáo viên."
      );
    }

    outputs.push({
      questionId: inputItem.questionId,
      stem: inputItem.stem,
      correctAnswer: teacherAnswerClean,
      choices: [
        {
          text: teacherAnswerClean,
          isCorrect: true,
          aiGenerated: false,
        },
        ...cleanDistractors.map((d) => ({
          text: d,
          isCorrect: false,
          aiGenerated: true,
        })),
      ],
      explanation: normalizeInlineWhitespace(generated.explanation),
    });
  }

  return {
    results: outputs,
    cacheHit: aiResult.cacheHit,
    tokensUsed: aiResult.tokensUsed,
    remainingQuota: aiResult.remainingQuota,
  };
}

