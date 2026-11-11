import { z } from "zod";
import { vi } from "@/lib/i18n/vi";

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const ALLOWED_EXTENSIONS = [".docx", ".xlsx", ".csv", ".txt"] as const;

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

