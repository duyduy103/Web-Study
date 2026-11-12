import type { QuestionStatus, QuestionType } from "@/lib/supabase/types";

export type ConfidenceTier = "high" | "medium" | "low";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface ReviewChoiceItem {
  id?: string;
  text: string;
  is_correct: boolean;
  position: number;
  ai_generated: boolean;
}

export interface ReviewQuestionItem {
  id: string;
  set_id: string;
  orderNumber: number;
  type: QuestionType;
  stem: string;
  explanation: string | null;
  source_ref: string | null;
  raw_source_text: string | null;
  topic: string | null;
  difficulty: string | null;
  confidence: number | null;
  status: QuestionStatus;
  warnings: string[];
  ai_generated: boolean;
  reviewed_by_human: boolean;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  choices: ReviewChoiceItem[];
  answer_text: string | null;
}

/**
 * Bản chụp đầy đủ của một câu hỏi (dùng để Hoàn tác / Làm lại trên cả client và server)
 */
export interface QuestionSnapshot {
  id: string;
  type: QuestionType;
  stem: string;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
  confidence: number | null;
  status: QuestionStatus;
  warnings: string[];
  ai_generated: boolean;
  reviewed_by_human: boolean;
  reviewed_at: string | null;
  choices: ReviewChoiceItem[];
  answer_text: string | null;
}

export interface UndoStep {
  id: string;
  label: string;
  createdAt: number;
  beforeSnapshots: QuestionSnapshot[];
  afterSnapshots: QuestionSnapshot[];
}

export interface ReviewFilterState {
  needsCheckPreset: boolean;
  confidenceTiers: ConfidenceTier[];
  statuses: QuestionStatus[];
  aiOnly: boolean;
  warningsOnly: boolean;
  searchQuery: string;
}

export interface GreenBulkSkipBreakdown {
  aiGenerated: number;
  mediumOrLowConfidence: number;
  hasWarnings: number;
  invalid: number;
  alreadyProcessed: number;
}

export interface GreenBulkEvaluation {
  eligibleQuestions: ReviewQuestionItem[];
  eligibleIds: string[];
  skippedCount: number;
  skippedBreakdown: GreenBulkSkipBreakdown;
}

