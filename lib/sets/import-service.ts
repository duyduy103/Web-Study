import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";
import {
  extractText,
  parseExtractedDocument,
  type DocumentFormat,
  type ParsedQuestion,
  type SpreadsheetColumnMapping,
} from "@/lib/parsing";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "@/lib/sets/schemas";
import {
  AI_QUESTION_BATCH_SIZE,
  PDF_PAGES_PER_BATCH,
} from "@/lib/ai/tasks";

export interface ValidatedSourceBuffer {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  textForDirectParse?: string;
}

export interface PreviewResponsePayload {
  detectedFormat: {
    format: DocumentFormat;
    confidence: number;
  };
  totalQuestions: number;
  confidenceCounts: {
    high: number;
    medium: number;
    low: number;
  };
  previewQuestions: ParsedQuestion[];
  allQuestions: ParsedQuestion[];
  rawExtractedText: string;
  globalWarnings: string[];
  isSpreadsheet: boolean;
  isMultimodal: boolean;
  pageCount?: number;
  aiSuggested: boolean;
  estimatedAiCallsWhole: number;
  estimatedAiCallsFixLow: number;
  remainingAiQuota: number;
  spreadsheetHeaders?: string[];
  spreadsheetMapping?: SpreadsheetColumnMapping;
}

export type ImportSetResult =
  | {
      status: "duplicate";
      existingSet: {
        id: string;
        title: string;
        createdAt: string;
      };
    }
  | {
      status: "created";
      setId: string;
    };

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function validateAndReadSource(
  file: File | null,
  pastedText: string | null
): Promise<ValidatedSourceBuffer> {
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(vi.importSet.validation.fileTooLarge);
    }

    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );
    if (!hasValidExt) {
      throw new Error(vi.parsing.unsupportedFileType);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      buffer,
      fileName: file.name,
      mimeType: file.type || inferMimeType(lowerName),
    };
  }

  const trimmedText = (pastedText ?? "").trim();
  if (trimmedText.length > 0) {
    const buffer = Buffer.from(trimmedText, "utf-8");
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new Error(vi.importSet.validation.fileTooLarge);
    }
    return {
      buffer,
      fileName: "van-ban-dan.txt",
      mimeType: "text/plain",
      textForDirectParse: trimmedText,
    };
  }

  throw new Error(vi.importSet.validation.sourceRequired);
}

function inferMimeType(lowerName: string): string {
  if (lowerName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerName.endsWith(".png")) {
    return "image/png";
  }
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerName.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lowerName.endsWith(".csv")) {
    return "text/csv";
  }
  return "text/plain";
}

export async function buildSourcePreview(
  source: ValidatedSourceBuffer,
  options?: {
    overrideFormat?: DocumentFormat;
    columnMapping?: SpreadsheetColumnMapping;
    remainingAiQuota?: number;
  }
): Promise<PreviewResponsePayload> {
  const extracted = await extractText({
    buffer: source.textForDirectParse ? undefined : source.buffer,
    text: source.textForDirectParse,
    fileName: source.fileName,
    mimeType: source.mimeType,
  });

  const remainingAiQuota = options?.remainingAiQuota ?? 30;

  if (extracted.isMultimodal) {
    const pageCount = extracted.pageCount ?? 1;
    const estimatedWhole = Math.max(
      1,
      Math.ceil(pageCount / PDF_PAGES_PER_BATCH)
    );
    return {
      detectedFormat: { format: "mcq_inline", confidence: 0.9 },
      totalQuestions: 0,
      confidenceCounts: { high: 0, medium: 0, low: 0 },
      previewQuestions: [],
      allQuestions: [],
      rawExtractedText: "",
      globalWarnings: [],
      isSpreadsheet: false,
      isMultimodal: true,
      pageCount,
      aiSuggested: true,
      estimatedAiCallsWhole: estimatedWhole,
      estimatedAiCallsFixLow: 0,
      remainingAiQuota,
    };
  }

  const parsed = parseExtractedDocument(extracted, options);

  let high = 0;
  let medium = 0;
  let low = 0;
  for (const q of parsed.questions) {
    if (q.confidence >= 0.8) {
      high++;
    } else if (q.confidence >= 0.5) {
      medium++;
    } else {
      low++;
    }
  }

  const total = parsed.questions.length;
  const lowRatio = total > 0 ? low / total : 1;
  const aiSuggested = total === 0 || lowRatio > 0.3;

  const needsFixCount = medium + low;
  const estimatedFixLow =
    needsFixCount > 0
      ? Math.ceil(needsFixCount / AI_QUESTION_BATCH_SIZE)
      : 0;

  return {
    detectedFormat: parsed.detectedFormat,
    totalQuestions: total,
    confidenceCounts: { high, medium, low },
    previewQuestions: parsed.questions.slice(0, 3),
    allQuestions: parsed.questions,
    rawExtractedText: extracted.text,
    globalWarnings: parsed.globalWarnings,
    isSpreadsheet: extracted.isSpreadsheet,
    isMultimodal: false,
    aiSuggested,
    estimatedAiCallsWhole: 1,
    estimatedAiCallsFixLow: estimatedFixLow,
    remainingAiQuota,
    spreadsheetHeaders: parsed.spreadsheetHeaders,
    spreadsheetMapping: parsed.spreadsheetMapping,
  };
}

export async function importQuestionSetToDatabase(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  title: string;
  subject?: string;
  grade?: string;
  source: ValidatedSourceBuffer;
  overrideFormat?: DocumentFormat;
  columnMapping?: SpreadsheetColumnMapping;
  forceDuplicate?: boolean;
  preParsedQuestions?: ParsedQuestion[];
}): Promise<ImportSetResult> {
  const {
    supabase,
    userId,
    title,
    subject,
    grade,
    source,
    overrideFormat,
    columnMapping,
    forceDuplicate,
    preParsedQuestions,
  } = params;

  const fileHash = computeSha256(source.buffer);

  // 1. Kiểm tra cache theo source_file_hash của cùng chủ sở hữu
  if (!forceDuplicate) {
    const { data: existingSet } = await supabase
      .from("question_sets")
      .select("id, title, created_at")
      .eq("owner_id", userId)
      .eq("source_file_hash", fileHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSet) {
      return {
        status: "duplicate",
        existingSet: {
          id: existingSet.id,
          title: existingSet.title,
          createdAt: existingSet.created_at,
        },
      };
    }
  }

  // 2. Lấy danh sách câu hỏi (từ kết quả AI/xem trước hoặc tách trực tiếp bằng quy tắc)
  const extracted = await extractText({
    buffer: source.textForDirectParse ? undefined : source.buffer,
    text: source.textForDirectParse,
    fileName: source.fileName,
    mimeType: source.mimeType,
  });

  const questionsToSave =
    preParsedQuestions && preParsedQuestions.length > 0
      ? preParsedQuestions
      : parseExtractedDocument(extracted, {
          overrideFormat,
          columnMapping,
        }).questions;

  if (questionsToSave.length === 0) {
    throw new Error(vi.importSet.validation.noQuestionsParsed);
  }

  let createdSetId: string | null = null;
  let uploadedStoragePath: string | null = null;

  try {
    const { data: createdSet, error: setError } = await supabase
      .from("question_sets")
      .insert({
        owner_id: userId,
        title,
        subject: subject || null,
        grade: grade || null,
        source_file_hash: fileHash,
      })
      .select("id")
      .single();

    if (setError || !createdSet) {
      throw new Error(setError?.message ?? vi.importSet.errors.saveFailed);
    }

    createdSetId = createdSet.id;

    const safeFileName = source.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/${createdSetId}/${Date.now()}_${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("source-files")
      .upload(storagePath, source.buffer, {
        contentType: source.mimeType,
        upsert: false,
      });

    if (!uploadError) {
      uploadedStoragePath = storagePath;
    }

    const { error: sourceFileRecordError } = await supabase
      .from("source_files")
      .insert({
        set_id: createdSetId,
        storage_path: uploadedStoragePath ?? `local://${safeFileName}`,
        file_hash: fileHash,
        mime_type: source.mimeType,
        page_count: extracted.pageCount ?? null,
      });

    if (sourceFileRecordError) {
      throw new Error(sourceFileRecordError.message);
    }

    for (const q of questionsToSave) {
      const { data: insertedQuestion, error: questionError } = await supabase
        .from("questions")
        .insert({
          set_id: createdSetId,
          type: q.type,
          stem: q.stem,
          explanation: q.explanation ?? null,
          source_ref: q.sourceRef,
          topic: q.topic ?? null,
          difficulty: q.difficulty ?? null,
          confidence: q.confidence,
          status: "draft",
          warnings: q.warnings,
          ai_generated: Boolean(q.aiGenerated),
        })
        .select("id")
        .single();

      if (questionError || !insertedQuestion) {
        throw new Error(
          questionError?.message ?? vi.importSet.errors.saveFailed
        );
      }

      if (q.choices && q.choices.length > 0) {
        const choiceRows = q.choices.map((c, idx) => ({
          question_id: insertedQuestion.id,
          text: c.text,
          is_correct: c.isCorrect,
          position: idx,
          ai_generated: Boolean(c.aiGenerated ?? q.aiGenerated),
        }));
        const { error: choicesError } = await supabase
          .from("choices")
          .insert(choiceRows);
        if (choicesError) {
          throw new Error(choicesError.message);
        }
      }

      if (q.answerText) {
        const { error: answerError } = await supabase.from("answers").insert({
          question_id: insertedQuestion.id,
          answer_text: q.answerText,
          accepted_variants: [],
        });
        if (answerError) {
          throw new Error(answerError.message);
        }
      }
    }

    return {
      status: "created",
      setId: createdSetId,
    };
  } catch (err) {
    if (uploadedStoragePath) {
      await supabase.storage
        .from("source-files")
        .remove([uploadedStoragePath]);
    }
    if (createdSetId) {
      await supabase.from("question_sets").delete().eq("id", createdSetId);
    }
    throw err;
  }
}
