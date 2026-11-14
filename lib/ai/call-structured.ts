import "server-only";
import type { z } from "zod";
import type { Schema } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import {
  getAiModelName,
  getGeminiClient,
  type AiModelTier,
} from "@/lib/ai/client";
import {
  buildAiCacheKey,
  consumeUserAiQuotaOrThrow,
  lookupAiCache,
  recordUserAiTokens,
  saveAiCache,
} from "@/lib/ai/quota-and-cache";
import { AiClassifiedError, classifyAiError } from "@/lib/ai/errors";
import { vi } from "@/lib/i18n/vi";

export interface InlineMediaPart {
  mimeType: string;
  base64Data: string;
}

export interface RawModelResponse {
  text: string;
  totalTokens?: number;
}

export type RawModelGenerator = (params: {
  model: string;
  prompt: string;
  media?: InlineMediaPart;
  responseSchema: Schema;
  timeoutMs: number;
}) => Promise<RawModelResponse>;

export interface CallStructuredOptions<TOutput> {
  supabase: SupabaseClient<Database>;
  userId: string;
  task: string;
  modelTier: AiModelTier;
  promptVersion: string;
  cachePayload: string | Buffer;
  prompt: string;
  media?: InlineMediaPart;
  responseSchema: Schema;
  zodSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
  maxRetries?: number;
  timeoutMs?: number;
  customGenerator?: RawModelGenerator;
}

export interface CallStructuredResult<TOutput> {
  data: TOutput;
  cacheHit: boolean;
  tokensUsed: number;
  remainingQuota?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_RETRIES = 2; // Thử lại tối đa 2 lần (tổng cộng tối đa 3 lần gọi)

function stripMarkdownJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

async function defaultGeminiGenerator(params: {
  model: string;
  prompt: string;
  media?: InlineMediaPart;
  responseSchema: Schema;
  timeoutMs: number;
}): Promise<RawModelResponse> {
  const ai = getGeminiClient();

  const contents = params.media
    ? [
        {
          inlineData: {
            mimeType: params.media.mimeType,
            data: params.media.base64Data,
          },
        },
        params.prompt,
      ]
    : params.prompt;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(vi.ai.timeoutError));
    }, params.timeoutMs);
  });

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: params.model,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
          temperature: 0.1,
          maxOutputTokens: 16384,
        },
      }),
      timeoutPromise,
    ]);

    return {
      text: response.text ?? "",
      totalTokens: response.usageMetadata?.totalTokenCount,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Hàm gọi Gemini chuẩn hóa:
 * 1. Kiểm tra ai_cache của chủ sở hữu (nếu trúng -> trả về ngay, không tính lượt, không gọi AI).
 * 2. Tăng bộ đếm hạn mức nguyên tử trong ai_usage (nếu vượt -> báo lỗi tiếng Việt).
 * 3. Gọi Gemini với Structured Output + kiểm tra bằng Zod, thử lại tối đa 2 lần nếu lỗi mạng hoặc JSON/schema hỏng.
 * 4. Ghi nhận số token và lưu kết quả vào ai_cache.
 */
export async function callGeminiStructured<TOutput>(
  options: CallStructuredOptions<TOutput>
): Promise<CallStructuredResult<TOutput>> {
  const modelName = getAiModelName(options.modelTier);
  const cacheKey = buildAiCacheKey({
    inputHashOrText: options.cachePayload,
    task: options.task,
    model: modelName,
    promptVersion: options.promptVersion,
  });

  // 1. Kiểm tra cache trước
  const cachedRaw = await lookupAiCache({
    supabase: options.supabase,
    userId: options.userId,
    cacheKey,
  });

  if (cachedRaw !== null) {
    const parsedCached = options.zodSchema.safeParse(cachedRaw);
    if (parsedCached.success) {
      return {
        data: parsedCached.data,
        cacheHit: true,
        tokensUsed: 0,
      };
    }
  }

  // 2. Kiểm tra và trừ hạn mức nguyên tử trước khi gọi AI
  const quotaResult = await consumeUserAiQuotaOrThrow(
    options.supabase,
    undefined,
    options.userId
  );

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const generator = options.customGenerator ?? defaultGeminiGenerator;

  let lastClassified: AiClassifiedError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rawResp = await generator({
        model: modelName,
        prompt: options.prompt,
        media: options.media,
        responseSchema: options.responseSchema,
        timeoutMs,
      });

      const cleanedText = stripMarkdownJsonFences(rawResp.text);
      let jsonParsed: unknown;
      try {
        jsonParsed = JSON.parse(cleanedText);
      } catch {
        throw new AiClassifiedError({
          code: "schema_rejected",
          message: vi.ai.invalidSchemaError,
          httpStatus: 422,
          originalCode: "INVALID_JSON_OUTPUT",
          retryable: true,
        });
      }

      const validated = options.zodSchema.safeParse(jsonParsed);

      if (!validated.success) {
        throw new AiClassifiedError({
          code: "schema_rejected",
          message: vi.ai.invalidSchemaError,
          httpStatus: 422,
          originalCode: "SCHEMA_VALIDATION_FAILED",
          retryable: true,
        });
      }

      const tokens = rawResp.totalTokens ?? 0;
      if (tokens > 0) {
        await recordUserAiTokens(options.supabase, tokens);
      }

      await saveAiCache({
        supabase: options.supabase,
        userId: options.userId,
        cacheKey,
        task: options.task,
        result: jsonParsed as Json,
      });

      return {
        data: validated.data,
        cacheHit: false,
        tokensUsed: tokens,
        remainingQuota: quotaResult.remaining,
      };
    } catch (err) {
      lastClassified =
        err instanceof AiClassifiedError
          ? err
          : new AiClassifiedError(classifyAiError(err));

      if (!lastClassified.retryable) {
        break;
      }
    }
  }

  if (lastClassified) {
    throw lastClassified;
  }

  throw new AiClassifiedError({
    code: "unknown",
    message: vi.ai.callFailed,
    httpStatus: 500,
    originalCode: "UNKNOWN_ERROR",
    retryable: false,
  });
}
