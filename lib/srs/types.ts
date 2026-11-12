export type StudyRatingButton = "again" | "hard" | "good" | "easy";

export interface SrsCardStateRecord {
  question_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export interface SrsReviewLogRecord {
  id?: string;
  question_id: string;
  set_id?: string;
  rating: number;
  state_before: number;
  elapsed_days: number;
  scheduled_days: number;
  reviewed_at: string;
}

export interface SrsPreviewIntervals {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export interface SrsStudyQueueResult {
  dueQuestionIds: string[];
  newQuestionIds: string[];
  queueQuestionIds: string[];
  totalDueCount: number;
  totalNewAvailableCount: number;
  newCardsLearnedToday: number;
  remainingNewAllowanceToday: number;
}

export interface SrsDayForecastBucket {
  dateKey: string;
  label: string;
  dueCount: number;
}

export interface SrsDayHistoryBucket {
  dateKey: string;
  label: string;
  totalReviews: number;
  rememberedCount: number;
}

export interface SrsLearnerAnalytics {
  streakDays: number;
  totalReviews: number;
  retentionRate: number;
  forecast7Days: SrsDayForecastBucket[];
  history14Days: SrsDayHistoryBucket[];
  leechQuestionIds: string[];
}

