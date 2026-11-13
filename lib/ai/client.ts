import "server-only";
import { GoogleGenAI } from "@google/genai";
import { getAiDailyLimitForRole, getAiGlobalDailyLimit } from "@/lib/ai/limits";
import { vi } from "@/lib/i18n/vi";

export type AiModelTier = "fast" | "strong";

export function getAiDailyLimit(): number {
  return getAiDailyLimitForRole("teacher");
}

export { getAiDailyLimitForRole, getAiGlobalDailyLimit };

export function getAiModelName(tier: AiModelTier): string {
  const modelName =
    tier === "fast"
      ? process.env.GEMINI_MODEL_FAST
      : process.env.GEMINI_MODEL_STRONG;

  if (!modelName || modelName.trim().length === 0) {
    throw new Error(vi.ai.missingApiKey);
  }

  return modelName.trim();
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(vi.ai.missingApiKey);
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  return cachedClient;
}

