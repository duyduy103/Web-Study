import type { AttemptStatus, QuestionType } from "@/lib/supabase/types";

export interface ExamChoiceSnapshot {
  id: string;
  text: string;
  is_correct: boolean;
  position: number;
}

export interface ExamQuestionSnapshot {
  id: string;
  type: QuestionType;
  stem: string;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
  choices: ExamChoiceSnapshot[];
  answer_text: string | null;
  accepted_variants: string[];
}

export interface ExamQuestionWithSnapshot {
  examQuestionId: string;
  questionId: string | null;
  points: number;
  position: number;
  snapshot: ExamQuestionSnapshot;
}

export interface GradedQuestionResult {
  examQuestionId: string;
  questionId: string | null;
  response: string;
  normalizedResponse: string;
  isCorrect: boolean | null;
  pointsAwarded: number;
  maxPoints: number;
  needsManualReview: boolean;
}

export interface GradedAttemptResult {
  score: number;
  maxPoints: number;
  correctCount: number;
  pendingReviewCount: number;
  needsManualReview: boolean;
  gradedAnswers: GradedQuestionResult[];
}

export interface AttemptSubmissionGuardInput {
  expectedToken: string;
  providedToken: string;
  attemptStatus: AttemptStatus;
  examIsOpen: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  deadlineAt?: string | null;
  nowIso: string;
  graceSeconds?: number;
}

export type AttemptGuardErrorCode =
  | "INVALID_TOKEN"
  | "ATTEMPT_ALREADY_SUBMITTED"
  | "EXAM_CLOSED"
  | "EXAM_NOT_YET_OPEN"
  | "EXAM_EXPIRED_WINDOW"
  | "ATTEMPT_TIME_EXPIRED";

export interface AttemptSubmissionGuardResult {
  allowed: boolean;
  isExpiredSubmission: boolean;
  errorCode: AttemptGuardErrorCode | null;
}

export interface StudentSanitizedChoice {
  id: string;
  text: string;
  position: number;
  is_correct?: boolean;
}

export interface StudentSanitizedQuestion {
  examQuestionId: string;
  questionId: string | null;
  points: number;
  position: number;
  type: QuestionType;
  stem: string;
  choices: StudentSanitizedChoice[];
  answer_text: string | null;
  explanation: string | null;
}

