import { beforeEach, describe, expect, it, vi as vitest } from "vitest";

// Mock module server-only để chạy trong môi trường Vitest Node
vitest.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ParsedQuestion } from "@/lib/parsing/types";
import { callGeminiStructured } from "@/lib/ai/call-structured";
import {
  aiExtractedQuestionsResponseZodSchema,
  geminiExtractQuestionsResponseSchema,
  normalizeAiExtractedQuestions,
} from "@/lib/ai/schemas";
import {
  fixLowConfidenceQuestionsWithAi,
  generateDistractorsBatchWithAi,
} from "@/lib/ai/tasks";
import { vi } from "@/lib/i18n/vi";

interface MockSupabaseState {
  cacheStore: Map<string, unknown>;
  quotaAllowed: boolean;
  quotaCalls: number;
  quotaRemaining: number;
  rpcConsumeCalls: number;
  rpcRecordTokensCalls: number;
}

function createMockSupabase(initial?: Partial<MockSupabaseState>): {
  supabase: SupabaseClient<Database>;
  state: MockSupabaseState;
} {
  const state: MockSupabaseState = {
    cacheStore: initial?.cacheStore ?? new Map<string, unknown>(),
    quotaAllowed: initial?.quotaAllowed ?? true,
    quotaCalls: initial?.quotaCalls ?? 1,
    quotaRemaining: initial?.quotaRemaining ?? 29,
    rpcConsumeCalls: 0,
    rpcRecordTokensCalls: 0,
  };

  const mockFrom = (table: string) => {
    if (table === "ai_cache") {
      let filterOwner = "";
      let filterKey = "";

      const builder = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === "owner_id") filterOwner = val;
          if (col === "cache_key") filterKey = val;
          return builder;
        },
        maybeSingle: async () => {
          const composite = `${filterOwner}:${filterKey}`;
          if (state.cacheStore.has(composite)) {
            return {
              data: { result: state.cacheStore.get(composite) },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert: async (row: {
          owner_id: string;
          cache_key: string;
          result: unknown;
        }) => {
          state.cacheStore.set(`${row.owner_id}:${row.cache_key}`, row.result);
          return { data: null, error: null };
        },
      };
      return builder;
    }

    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { calls: state.quotaCalls },
              error: null,
            }),
          }),
        }),
      }),
    };
  };

  const mockRpc = async (fnName: string) => {
    if (fnName === "consume_ai_quota") {
      state.rpcConsumeCalls += 1;
      if (!state.quotaAllowed) {
        return {
          data: {
            allowed: false,
            calls: 30,
            tokens: 5000,
            remaining: 0,
          },
          error: null,
        };
      }
      return {
        data: {
          allowed: true,
          calls: state.quotaCalls,
          tokens: 100,
          remaining: state.quotaRemaining,
        },
        error: null,
      };
    }

    if (fnName === "record_ai_tokens") {
      state.rpcRecordTokensCalls += 1;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  };

  const supabase = {
    from: mockFrom,
    rpc: mockRpc,
  } as unknown as SupabaseClient<Database>;

  return { supabase, state };
}

describe("MemoQuiz AI Infrastructure & Tasks (Mocked Unit Tests)", () => {
  beforeEach(() => {
    process.env.GEMINI_MODEL_FAST = "gemini-3.5-flash-lite";
    process.env.GEMINI_MODEL_STRONG = "gemini-3.5-flash";
    process.env.AI_DAILY_LIMIT = "30";
  });

  it("1. Schema từ chối dữ liệu sai cấu trúc và thử lại tối đa 2 lần trước khi trả kết quả hoặc báo lỗi", async () => {
    const { supabase, state } = createMockSupabase();
    let generatorAttempts = 0;

    // Lần 1: JSON hỏng; Lần 2: MCQ chỉ có 1 lựa chọn (vi phạm schema); Lần 3: Hợp lệ
    const result = await callGeminiStructured({
      supabase,
      userId: "teacher-1",
      task: "extract_whole",
      modelTier: "fast",
      promptVersion: "1.0.0",
      cachePayload: "noi-dung-kiem-thu-retry",
      prompt: "Prompt tách câu",
      responseSchema: geminiExtractQuestionsResponseSchema,
      zodSchema: aiExtractedQuestionsResponseZodSchema,
      maxRetries: 2,
      customGenerator: async () => {
        generatorAttempts += 1;
        if (generatorAttempts === 1) {
          return { text: "{json_hong_khong_dong_ngoac" };
        }
        if (generatorAttempts === 2) {
          return {
            text: JSON.stringify({
              questions: [
                {
                  type: "mcq",
                  stem: "Câu hỏi lỗi chỉ có 1 lựa chọn?",
                  choices: [{ text: "Chỉ 1 lựa chọn", isCorrect: true }],
                  confidence: 0.9,
                  warnings: [],
                  sourceRef: "Câu 1",
                },
              ],
            }),
          };
        }
        return {
          text: JSON.stringify({
            questions: [
              {
                type: "mcq",
                stem: "Thủ đô của Việt Nam là gì?",
                choices: [
                  { text: "Hà Nội", isCorrect: true },
                  { text: "Đà Nẵng", isCorrect: false },
                ],
                confidence: 0.95,
                warnings: [],
                sourceRef: "Câu 1",
              },
            ],
          }),
          totalTokens: 240,
        };
      },
    });

    expect(generatorAttempts).toBe(3);
    expect(result.cacheHit).toBe(false);
    expect(result.tokensUsed).toBe(240);
    expect(result.data.questions).toHaveLength(1);
    expect(state.rpcConsumeCalls).toBe(1);
    expect(state.rpcRecordTokensCalls).toBe(1);

    // Nếu cả 3 lần đều trả về MCQ có 2 đáp án đúng -> ném lỗi schema thân thiện
    await expect(
      callGeminiStructured({
        supabase,
        userId: "teacher-1",
        task: "extract_whole",
        modelTier: "fast",
        promptVersion: "1.0.0",
        cachePayload: "noi-dung-luon-sai-schema",
        prompt: "Prompt tách câu",
        responseSchema: geminiExtractQuestionsResponseSchema,
        zodSchema: aiExtractedQuestionsResponseZodSchema,
        maxRetries: 2,
        customGenerator: async () => ({
          text: JSON.stringify({
            questions: [
              {
                type: "mcq",
                stem: "Câu hỏi có 2 đáp án đúng?",
                choices: [
                  { text: "Đáp án A", isCorrect: true },
                  { text: "Đáp án B", isCorrect: true },
                ],
                confidence: 0.9,
                warnings: [],
                sourceRef: "Câu 1",
              },
            ],
          }),
        }),
      })
    ).rejects.toThrow(vi.ai.invalidSchemaError);
  });

  it("2. Cache trúng (ai_cache hit): không gọi hàm AI và không trừ hạn mức ai_usage", async () => {
    const { supabase, state } = createMockSupabase();
    let generatorCallCount = 0;

    const runCall = () =>
      callGeminiStructured({
        supabase,
        userId: "teacher-cache-user",
        task: "extract_whole",
        modelTier: "fast",
        promptVersion: "1.0.0",
        cachePayload: "cung-mot-noi-dung-tai-lieu",
        prompt: "Prompt tách câu",
        responseSchema: geminiExtractQuestionsResponseSchema,
        zodSchema: aiExtractedQuestionsResponseZodSchema,
        customGenerator: async () => {
          generatorCallCount += 1;
          return {
            text: JSON.stringify({
              questions: [
                {
                  type: "short_answer",
                  stem: "Ai là tác giả Truyện Kiều?",
                  answerText: "Nguyễn Du",
                  confidence: 0.95,
                  warnings: [],
                  sourceRef: "Câu 1",
                },
              ],
            }),
            totalTokens: 150,
          };
        },
      });

    // Lần 1: chưa có cache -> gọi AI và trừ 1 lượt
    const first = await runCall();
    expect(first.cacheHit).toBe(false);
    expect(generatorCallCount).toBe(1);
    expect(state.rpcConsumeCalls).toBe(1);

    // Lần 2: cùng user, cùng nội dung + tác vụ + model + promptVersion -> trúng cache
    const second = await runCall();
    expect(second.cacheHit).toBe(true);
    expect(second.tokensUsed).toBe(0);
    expect(generatorCallCount).toBe(1); // Không gọi lại AI
    expect(state.rpcConsumeCalls).toBe(1); // Không trừ thêm hạn mức
    expect(second.data.questions[0].answerText).toBe("Nguyễn Du");
  });

  it("3. Vượt hạn mức ngày: chặn ngay với thông báo tiếng Việt chuẩn và không gọi AI", async () => {
    const { supabase } = createMockSupabase({
      quotaAllowed: false,
      quotaCalls: 30,
      quotaRemaining: 0,
    });
    let generatorCalled = false;

    await expect(
      callGeminiStructured({
        supabase,
        userId: "teacher-exhausted",
        task: "extract_whole",
        modelTier: "fast",
        promptVersion: "1.0.0",
        cachePayload: "tai-lieu-moi-khi-het-luot",
        prompt: "Prompt tách câu",
        responseSchema: geminiExtractQuestionsResponseSchema,
        zodSchema: aiExtractedQuestionsResponseZodSchema,
        customGenerator: async () => {
          generatorCalled = true;
          return { text: '{"questions":[]}' };
        },
      })
    ).rejects.toThrow("Bạn đã dùng hết lượt AI hôm nay, quay lại vào ngày mai.");

    expect(generatorCalled).toBe(false);
  });

  it("4. Chống bịa đáp án: câu hỏi không có đáp án trong tài liệu bị ép confidence <= 0.35 và gắn cảnh báo", () => {
    const normalized = normalizeAiExtractedQuestions({
      questions: [
        {
          type: "mcq",
          stem: "Câu hỏi không đánh dấu đáp án đúng trong tài liệu?",
          choices: [
            { text: "Phương án A", isCorrect: false },
            { text: "Phương án B", isCorrect: false },
            { text: "Phương án C", isCorrect: false },
            { text: "Phương án D", isCorrect: false },
          ],
          confidence: 0.9, // Giả sử model trả confidence cao sai quy tắc
          warnings: [],
          sourceRef: "Đoạn 2",
        },
        {
          type: "short_answer",
          stem: "Câu hỏi tự luận ngắn nhưng tài liệu không có lời giải?",
          answerText: null,
          confidence: 0.85,
          warnings: [],
          sourceRef: "Đoạn 3",
        },
      ],
    });

    expect(normalized[0].confidence).toBeLessThanOrEqual(0.35);
    expect(normalized[0].warnings).toContain(vi.parsing.warnings.missingAnswer);
    expect(normalized[0].aiGenerated).toBe(true);

    expect(normalized[1].answerText).toBeUndefined();
    expect(normalized[1].confidence).toBeLessThanOrEqual(0.35);
    expect(normalized[1].warnings).toContain(vi.parsing.warnings.missingAnswer);
    expect(normalized[1].aiGenerated).toBe(true);
  });

  it("5. Chế độ fix_low_confidence: chỉ gửi các câu có confidence < 0.8 và giữ nguyên câu >= 0.8", async () => {
    const { supabase } = createMockSupabase();
    const sentPrompts: string[] = [];

    const ruleQuestions: ParsedQuestion[] = [
      {
        type: "mcq",
        stem: "Câu 1 đã chuẩn từ parser quy tắc",
        choices: [
          { text: "Đúng A", isCorrect: true },
          { text: "Sai B", isCorrect: false },
          { text: "Sai C", isCorrect: false },
          { text: "Sai D", isCorrect: false },
        ],
        confidence: 0.95,
        warnings: [],
        sourceRef: "Câu 1, dòng 1-5",
        rawBlockText: "Câu 1: Câu 1 đã chuẩn từ parser quy tắc...",
      },
      {
        type: "mcq",
        stem: "Câu 2 bị lỗi tách lựa chọn dính liền",
        choices: [{ text: "A. Một B. Hai", isCorrect: false }],
        confidence: 0.3,
        warnings: [vi.parsing.warnings.missingAnswer],
        sourceRef: "Câu 2, dòng 6-9",
        rawBlockText: "Câu 2: 1 + 1 bằng mấy? A. 1 *B. 2 C. 3 D. 4",
      },
      {
        type: "short_answer",
        stem: "Câu 3 đã chuẩn từ parser quy tắc",
        answerText: "1945",
        confidence: 0.92,
        warnings: [],
        sourceRef: "Câu 3, dòng 10-11",
        rawBlockText: "Câu 3: Năm đọc Tuyên ngôn Độc lập? Đáp án: 1945",
      },
    ];

    const fixResult = await fixLowConfidenceQuestionsWithAi({
      supabase,
      userId: "teacher-fix",
      ruleQuestions,
      customGenerator: async ({ prompt }) => {
        sentPrompts.push(prompt);
        return {
          text: JSON.stringify({
            questions: [
              {
                type: "mcq",
                stem: "1 + 1 bằng mấy?",
                choices: [
                  { text: "1", isCorrect: false },
                  { text: "2", isCorrect: true },
                  { text: "3", isCorrect: false },
                  { text: "4", isCorrect: false },
                ],
                confidence: 0.95,
                warnings: [],
                sourceRef: "Câu 2, dòng 6-9",
              },
            ],
          }),
          totalTokens: 180,
        };
      },
    });

    // Chỉ có Câu 2 (index = 1) được gửi cho AI
    expect(fixResult.sentQuestionIndices).toEqual([1]);
    expect(fixResult.batchesCalled).toBe(1);
    expect(sentPrompts[0]).toContain("1 + 1 bằng mấy?");
    expect(sentPrompts[0]).not.toContain("Câu 1 đã chuẩn từ parser quy tắc");
    expect(sentPrompts[0]).not.toContain("Câu 3 đã chuẩn từ parser quy tắc");

    // Câu 1 và Câu 3 giữ nguyên bản gốc không có cờ aiGenerated
    expect(fixResult.mergedQuestions[0].stem).toBe(
      "Câu 1 đã chuẩn từ parser quy tắc"
    );
    expect(fixResult.mergedQuestions[0].aiGenerated).toBeUndefined();

    // Câu 2 đã được AI sửa và đánh dấu aiGenerated = true
    expect(fixResult.mergedQuestions[1].stem).toBe("1 + 1 bằng mấy?");
    expect(fixResult.mergedQuestions[1].aiGenerated).toBe(true);
    expect(fixResult.mergedQuestions[1].confidence).toBe(0.95);

    expect(fixResult.mergedQuestions[2].stem).toBe(
      "Câu 3 đã chuẩn từ parser quy tắc"
    );
    expect(fixResult.mergedQuestions[2].aiGenerated).toBeUndefined();
  });

  it("6. Sinh đáp án nhiễu: giữ nguyên 100% đáp án đúng của giáo viên (aiGenerated=false) và chặn nhiễu trùng đáp án đúng", async () => {
    const { supabase } = createMockSupabase();

    const genRes = await generateDistractorsBatchWithAi({
      supabase,
      userId: "teacher-distractor",
      items: [
        {
          questionId: "q-uuid-1",
          stem: "Nguyên tố hóa học nào có ký hiệu là Fe?",
          correctAnswer: "Sắt",
        },
      ],
      customGenerator: async () => ({
        text: JSON.stringify({
          items: [
            {
              questionId: "q-uuid-1",
              distractors: ["Đồng", "Nhôm", "Kẽm"],
              explanation: "Fe là ký hiệu hóa học của nguyên tố Sắt (Ferrum).",
            },
          ],
        }),
        totalTokens: 120,
      }),
    });

    expect(genRes.results).toHaveLength(1);
    const item = genRes.results[0];
    expect(item.correctAnswer).toBe("Sắt");
    expect(item.choices).toHaveLength(4);

    // Đáp án đúng của giáo viên giữ nguyên và aiGenerated = false
    const correctChoice = item.choices.find((c) => c.isCorrect);
    expect(correctChoice).toEqual({
      text: "Sắt",
      isCorrect: true,
      aiGenerated: false,
    });

    // 3 đáp án nhiễu có isCorrect = false và aiGenerated = true
    const distractorChoices = item.choices.filter((c) => !c.isCorrect);
    expect(distractorChoices).toHaveLength(3);
    expect(distractorChoices.every((c) => c.aiGenerated === true)).toBe(true);

    // Nếu AI sinh phương án nhiễu trùng với đáp án đúng "Sắt" -> từ chối
    await expect(
      generateDistractorsBatchWithAi({
        supabase,
        userId: "teacher-distractor",
        items: [
          {
            questionId: "q-uuid-2",
            stem: "Nguyên tố hóa học nào có ký hiệu là Fe?",
            correctAnswer: "Sắt",
          },
        ],
        customGenerator: async () => ({
          text: JSON.stringify({
            items: [
              {
                questionId: "q-uuid-2",
                distractors: ["sắt", "Đồng", "Nhôm"],
                explanation: "Giải thích mẫu.",
              },
            ],
          }),
        }),
      })
    ).rejects.toThrow(
      "AI sinh phương án nhiễu trùng với đáp án đúng của giáo viên."
    );
  });
});

