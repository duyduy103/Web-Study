import { z } from "zod";
import { vi } from "@/lib/i18n/vi";

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const ALLOWED_EXTENSIONS = [
  ".docx",
  ".pdf",
  ".xlsx",
  ".csv",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

export const documentFormatSchema = z.enum([
  "mcq_inline",
  "mcq_with_key_table",
  "qa_pairs",
  "true_false",
  "cloze",
  "spreadsheet",
]);

export const spreadsheetMappingSchema = z.object({
  stemCol: z.string().min(1),
  correctCol: z.string().min(1),
  optionACol: z.string().optional(),
  optionBCol: z.string().optional(),
  optionCCol: z.string().optional(),
  optionDCol: z.string().optional(),
  explanationCol: z.string().optional(),
  topicCol: z.string().optional(),
  difficultyCol: z.string().optional(),
});

export const parsedChoiceInputSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
  aiGenerated: z.boolean().optional(),
});

export const parsedQuestionInputSchema = z.object({
  type: z.enum(["mcq", "true_false", "cloze", "short_answer"]),
  stem: z.string().min(1),
  choices: z.array(parsedChoiceInputSchema).optional(),
  answerText: z.string().optional(),
  explanation: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.string().optional(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  sourceRef: z.string(),
  rawBlockText: z.string().optional(),
  aiGenerated: z.boolean().optional(),
});

export const importMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: vi.importSet.validation.titleRequired })
    .max(150, { message: vi.importSet.validation.titleMax }),
  subject: z.string().trim().max(80).optional(),
  grade: z.string().trim().max(40).optional(),
  overrideFormat: documentFormatSchema.optional(),
  forceDuplicate: z.boolean().optional(),
});
