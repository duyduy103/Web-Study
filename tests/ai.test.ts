import { beforeEach, describe, expect, it, vi as vitest } from "vitest";

// Mock module server-only để chạy trong môi trường Vitest Node
vitest.mock("server-only", () => ({}));

import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ParsedQuestion } from "@/lib/parsing/types";
import { callGeminiStructured } from "@/lib/ai/call-structured";
import { AiClassifiedError, classifyAiError } from "@/lib/ai/errors";
import {
  aiExtractedQuestionsResponseZodSchema,
  geminiExtractQuestionsResponseSchema,
  normalizeAiExtractedQuestions,
} from "@/lib/ai/schemas";
import {
  fixLowConfidenceQuestionsWithAi,
  generateDistractorsBatchWithAi,
  runAiExtractBatch,
} from "@/lib/ai/tasks";
import { validateAndReadSource } from "@/lib/sets/import-service";
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
    if (fnName === "consume_ai_quota" || fnName === "consume_ai_quota_v2") {
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

  it("7. Hồi quy đường PDF: tự động fallback sang consume_ai_quota khi consume_ai_quota_v2 lỗi 42703 (updated_at) và chuẩn hóa MIME PDF", async () => {
    const pdfPath = path.resolve(
      process.cwd(),
      "samples",
      "08_de_cuong_text_pdf.pdf"
    );
    const pdfBuffer = fs.readFileSync(pdfPath);
    const fakePdfFile = new File([pdfBuffer], "08_de_cuong_text_pdf.pdf", {
      type: "application/octet-stream",
    });

    const source = await validateAndReadSource(fakePdfFile, null);
    expect(source.mimeType).toBe("application/pdf");

    let v2Called = 0;
    let v1FallbackCalled = 0;
    let receivedMimeType = "";

    const { supabase: baseSupabase } = createMockSupabase();
    const supabaseWithBrokenV2 = {
      ...baseSupabase,
      rpc: async (fnName: string) => {
        if (fnName === "consume_ai_quota_v2") {
          v2Called += 1;
          return {
            data: null,
            error: {
              code: "42703",
              message: 'column "updated_at" of relation "ai_usage" does not exist',
            },
          };
        }
        if (fnName === "consume_ai_quota") {
          v1FallbackCalled += 1;
          return {
            data: { allowed: true, calls: 1, tokens: 0, remaining: 29 },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient<Database>;

    const result = await runAiExtractBatch({
      supabase: supabaseWithBrokenV2,
      userId: "teacher-pdf-1",
      media: {
        mimeType: source.mimeType,
        base64Data: source.buffer.toString("base64"),
      },
      contextHint: "Chỉ trích xuất các câu hỏi thuộc từ Trang 1 đến Trang 1",
      mode: "whole",
      customGenerator: async ({ media }) => {
        receivedMimeType = media?.mimeType ?? "";
        return {
          text: JSON.stringify({
            questions: [
              {
                type: "mcq",
                stem: "Ngôn ngữ nào dùng để định nghĩa cấu trúc bảng?",
                choices: [
                  { text: "DDL", isCorrect: true },
                  { text: "DML", isCorrect: false },
                ],
                confidence: 1,
                warnings: [],
                sourceRef: "Trang 1, Câu 1",
              },
            ],
          }),
          totalTokens: 2029,
        };
      },
    });

    expect(v2Called).toBe(1);
    expect(v1FallbackCalled).toBe(1);
    expect(receivedMimeType).toBe("application/pdf");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].stem).toContain("định nghĩa cấu trúc bảng");
  });

  it("8. Phân loại đủ 8 mã lỗi cho đường PDF và không retry các lỗi không thể phục hồi", async () => {
    const { supabase } = createMockSupabase();

    // Kiểm tra không retry lỗi invalid_key (401/API_KEY_INVALID) trên đường PDF
    let attempts = 0;
    await expect(
      runAiExtractBatch({
        supabase,
        userId: "teacher-pdf-err",
        media: { mimeType: "application/pdf", base64Data: "JVBERi0xLjQ=" },
        mode: "whole",
        customGenerator: async () => {
          attempts += 1;
          const err = new Error("API key not valid. Please pass a valid API key.") as Error & {
            status?: number;
            code?: string;
          };
          err.status = 400;
          err.code = "API_KEY_INVALID";
          throw err;
        },
      })
    ).rejects.toThrow(AiClassifiedError);
    expect(attempts).toBe(1);

    // Kiểm tra đủ 8 mã phân loại lỗi: invalid_key, model_unavailable, quota, payload_too_large, schema_rejected, app_limit, invalid_request, unknown
    expect(
      classifyAiError({ status: 401, message: "API_KEY_INVALID" }).code
    ).toBe("invalid_key");
    expect(
      classifyAiError({
        status: 503,
        message: "This model is currently experiencing high demand.",
      }).code
    ).toBe("model_unavailable");
    expect(
      classifyAiError({ status: 429, message: "RESOURCE_EXHAUSTED" }).code
    ).toBe("quota");
    expect(
      classifyAiError({
        status: 413,
        message: "Request payload size exceeds the limit",
      }).code
    ).toBe("payload_too_large");
    expect(
      classifyAiError(new Error(vi.ai.invalidSchemaError)).code
    ).toBe("schema_rejected");
    expect(
      classifyAiError(
        new Error(`${vi.limits.pdfTooManyPagesPrefix} 60 ${vi.limits.pdfTooManyPagesSuffix}`)
      ).code
    ).toBe("app_limit");
    expect(
      classifyAiError({
        status: 400,
        code: "INVALID_ARGUMENT",
        message: "Unable to process input image/pdf",
      }).code
    ).toBe("invalid_request");
    expect(
      classifyAiError(new Error("Socket hang up")).code
    ).toBe("unknown");
  });

  it("9. Tác vụ distractors: xử lý độc lập từng câu khi một phần câu hỏng (2 câu thành công, 1 câu lỗi trùng đáp án, 1 câu thiếu đáp án nhiễu)", async () => {
    const { supabase } = createMockSupabase();

    const items = [
      {
        questionId: "q-1",
        stem: "Cấu trúc dữ liệu nào hoạt động theo nguyên tắc LIFO?",
        correctAnswer: "Ngăn xếp (Stack)",
      },
      {
        questionId: "q-2",
        stem: "Giao thức nào dùng để cấp phát IP động?",
        correctAnswer: "DHCP",
      },
      {
        questionId: "q-3",
        stem: "Trong SQL, từ khóa nào loại bỏ dòng trùng lặp?",
        correctAnswer: "DISTINCT",
      },
      {
        questionId: "q-4",
        stem: "Đơn vị đo cơ bản nhất của thông tin là gì?",
        correctAnswer: "Bit",
      },
    ];

    const genRes = await generateDistractorsBatchWithAi({
      supabase,
      userId: "teacher-distractor-partial",
      items,
      customGenerator: async () => ({
        text: JSON.stringify({
          items: [
            {
              questionId: "q-1",
              distractors: ["Hàng đợi (Queue)", "Cây nhị phân", "Bảng băm"],
              explanation: "Stack hoạt động theo cơ chế Last In First Out.",
            },
            {
              questionId: "q-2",
              // Lỗi: phương án nhiễu trùng với đáp án đúng "DHCP"
              distractors: ["dhcp", "DNS", "FTP"],
              explanation: "DHCP cấp phát IP động.",
            },
            {
              questionId: "q-3",
              distractors: ["UNIQUE", "GROUP BY", "ORDER BY"],
              explanation: "DISTINCT loại bỏ các dòng trùng lặp.",
            },
            {
              questionId: "q-4",
              // Lỗi: chỉ có 2 phương án nhiễu
              distractors: ["Byte", "Nibble"],
              explanation: "Bit là đơn vị nhỏ nhất.",
            },
          ],
        }),
        totalTokens: 400,
      }),
    });

    // 2 câu thành công (q-1 và q-3), 2 câu vào danh sách failed (q-2 và q-4)
    expect(genRes.results).toHaveLength(2);
    expect(genRes.failed).toHaveLength(2);

    // Kiểm tra câu thành công: đáp án giáo viên giữ nguyên 100%, aiGenerated = false, 3 nhiễu không trùng
    const q1 = genRes.results.find((r) => r.questionId === "q-1")!;
    expect(q1.correctAnswer).toBe("Ngăn xếp (Stack)");
    expect(q1.choices).toHaveLength(4);
    const correctChoice1 = q1.choices.find((c) => c.isCorrect)!;
    expect(correctChoice1.text).toBe("Ngăn xếp (Stack)");
    expect(correctChoice1.aiGenerated).toBe(false);
    expect(q1.choices.filter((c) => !c.isCorrect)).toHaveLength(3);

    const q3 = genRes.results.find((r) => r.questionId === "q-3")!;
    expect(q3.correctAnswer).toBe("DISTINCT");
    expect(q3.choices).toHaveLength(4);

    // Kiểm tra câu thất bại: báo rõ lý do
    const failedQ2 = genRes.failed.find((f) => f.questionId === "q-2")!;
    expect(failedQ2.reason).toContain("trùng với đáp án đúng");

    const failedQ4 = genRes.failed.find((f) => f.questionId === "q-4")!;
    expect(failedQ4.reason).toContain("không tạo đủ 3 đáp án nhiễu");
  });

  it("10. Lỗi cấu hình (model_unavailable do model không tồn tại hoặc invalid_key): không thử lại nhiều lần và hoàn lại lượt AI cho người dùng", async () => {
    let callsInDb = 5;
    const mockSupabase = {
      from: (table: string) => {
        if (table === "ai_cache") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "ai_usage") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { calls: callsInDb },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (payload: { calls: number }) => ({
              eq: () => ({
                eq: async () => {
                  callsInDb = payload.calls;
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {};
      },
      rpc: async (fn: string) => {
        if (fn === "consume_ai_quota_v2" || fn === "consume_ai_quota") {
          callsInDb += 1;
          return {
            data: { allowed: true, calls: callsInDb, tokens: 0, remaining: 25 },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient<Database>;

    let attempts = 0;
    await expect(
      generateDistractorsBatchWithAi({
        supabase: mockSupabase,
        userId: "user-config-err",
        items: [
          {
            questionId: "q-err-1",
            stem: "Câu hỏi test lỗi model không tồn tại",
            correctAnswer: "Đáp án",
          },
        ],
        customGenerator: async () => {
          attempts += 1;
          const err = new Error(
            "models/gemini-nonexistent is not found for API version v1beta"
          ) as Error & { status?: number };
          err.status = 404;
          throw err;
        },
      })
    ).rejects.toThrow(AiClassifiedError);

    // Lỗi 404 model không tồn tại: không retry (attempts = 1)
    expect(attempts).toBe(1);
    // Lượt AI được hoàn lại về giá trị ban đầu (callsInDb = 5)
    expect(callsInDb).toBe(5);
  });

  it("11. Route distractors: hỗ trợ action preview_generate khi người dùng nạp file / xem trước 4 câu hỏi-đáp ngắn", async () => {
    const { supabase } = createMockSupabase();

    const sampleItems = [
      { questionId: "0", stem: "Thủ đô của Việt Nam là gì?", correctAnswer: "Hà Nội" },
      { questionId: "1", stem: "Sông nào dài nhất thế giới?", correctAnswer: "Sông Nile" },
      { questionId: "2", stem: "Đỉnh núi cao nhất thế giới là gì?", correctAnswer: "Everest" },
      { questionId: "3", stem: "Hành tinh nào gần Mặt Trời nhất?", correctAnswer: "Sao Thủy" },
    ];

    const aiRes = await generateDistractorsBatchWithAi({
      supabase,
      userId: "teacher-preview-distractor",
      items: sampleItems,
      customGenerator: async () => ({
        text: JSON.stringify({
          items: [
            {
              questionId: "0",
              distractors: ["Đà Nẵng", "TP. Hồ Chí Minh", "Huế"],
              explanation: "Hà Nội là thủ đô của Việt Nam.",
            },
            {
              questionId: "1",
              distractors: ["Sông Amazon", "Sông Mê Kông", "Sông Dương Tử"],
              explanation: "Sông Nile dài nhất thế giới.",
            },
            {
              questionId: "2",
              distractors: ["K2", "Kangchenjunga", "Lhotse"],
              explanation: "Everest là đỉnh núi cao nhất.",
            },
            {
              questionId: "3",
              distractors: ["Sao Kim", "Sao Hỏa", "Sao Mộc"],
              explanation: "Sao Thủy nằm gần Mặt Trời nhất.",
            },
          ],
        }),
        totalTokens: 500,
      }),
    });

    expect(aiRes.results).toHaveLength(4);
    expect(aiRes.failed).toHaveLength(0);
    for (const r of aiRes.results) {
      expect(r.choices).toHaveLength(4);
      expect(r.choices.find((c) => c.isCorrect)?.aiGenerated).toBe(false);
      expect(r.choices.filter((c) => !c.isCorrect)).toHaveLength(3);
    }
  });
});

