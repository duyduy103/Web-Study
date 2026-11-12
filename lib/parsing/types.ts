import type { QuestionType } from "@/lib/supabase/types";

export type DocumentFormat =
  | "mcq_inline"
  | "mcq_with_key_table"
  | "qa_pairs"
  | "true_false"
  | "cloze"
  | "spreadsheet";

export interface ParsedChoice {
  text: string;
  isCorrect: boolean;
  aiGenerated?: boolean;
}

export interface ParsedQuestion {
  type: QuestionType;
  stem: string;
  choices?: ParsedChoice[];
  answerText?: string;
  explanation?: string;
  topic?: string;
  difficulty?: string;
  confidence: number;
  warnings: string[];
  sourceRef: string;
  aiGenerated?: boolean;
  rawBlockText?: string;
}

export interface FormatDetectionResult {
  format: DocumentFormat;
  confidence: number;
}

export interface SpreadsheetColumnMapping {
  stemCol: string;
  correctCol: string;
  optionACol?: string;
  optionBCol?: string;
  optionCCol?: string;
  optionDCol?: string;
  explanationCol?: string;
  topicCol?: string;
  difficultyCol?: string;
}

export interface ExtractedDocument {
  text: string;
  markedText?: string;
  isSpreadsheet: boolean;
  isMultimodal?: boolean;
  mimeType?: string;
  pageCount?: number;
  headers?: string[];
  rows?: Record<string, string>[];
}

export interface ParseDocumentResult {
  detectedFormat: FormatDetectionResult;
  questions: ParsedQuestion[];
  globalWarnings: string[];
  spreadsheetHeaders?: string[];
  spreadsheetMapping?: SpreadsheetColumnMapping;
}

