import type {
  ConfidenceTier,
  GreenBulkEvaluation,
  GreenBulkSkipBreakdown,
  ReviewFilterState,
  ReviewQuestionItem,
} from "@/lib/review/types";
import { validateQuestionForReview } from "@/lib/review/validation";

export function getConfidenceTier(confidence: number | null): ConfidenceTier {
  const val = confidence ?? 0;
  if (val >= 0.8) {
    return "high";
  }
  if (val >= 0.5) {
    return "medium";
  }
  return "low";
}

/**
 * Một câu hỏi thuộc diện "Cần kiểm tra" khi đang ở trạng thái nháp (draft) VÀ:
 * - Độ tin cậy Vàng hoặc Đỏ (< 0.8), HOẶC
 * - Do AI tạo (ai_generated = true), HOẶC
 * - Có cảnh báo định dạng mà chưa được người kiểm tra (warnings.length > 0 && !reviewed_by_human), HOẶC
 * - Dữ liệu câu hỏi chưa hợp lệ.
 */
export function isQuestionNeedsCheck(q: ReviewQuestionItem): boolean {
  if (q.status !== "draft") {
    return false;
  }

  const tier = getConfidenceTier(q.confidence);
  if (tier !== "high") {
    return true;
  }

  if (q.ai_generated) {
    return true;
  }

  if (q.warnings.length > 0 && !q.reviewed_by_human) {
    return true;
  }

  if (!validateQuestionForReview(q).valid) {
    return true;
  }

  return false;
}

/**
 * Mặc định mở bằng bộ lọc "Cần kiểm tra" nếu trong bộ đề có ít nhất 1 câu cần kiểm tra,
 * ngược lại hiển thị tất cả.
 */
export function getInitialReviewFilterState(
  questions: ReviewQuestionItem[]
): ReviewFilterState {
  const hasAnyNeedsCheck = questions.some((q) => isQuestionNeedsCheck(q));
  return {
    needsCheckPreset: hasAnyNeedsCheck,
    confidenceTiers: [],
    statuses: [],
    aiOnly: false,
    warningsOnly: false,
    searchQuery: "",
  };
}

export function filterReviewQuestions(
  questions: ReviewQuestionItem[],
  filter: ReviewFilterState
): ReviewQuestionItem[] {
  const normalizedQuery = filter.searchQuery.trim().toLowerCase();

  return questions.filter((q) => {
    if (filter.needsCheckPreset && !isQuestionNeedsCheck(q)) {
      return false;
    }

    if (filter.confidenceTiers.length > 0) {
      const tier = getConfidenceTier(q.confidence);
      if (!filter.confidenceTiers.includes(tier)) {
        return false;
      }
    }

    if (filter.statuses.length > 0 && !filter.statuses.includes(q.status)) {
      return false;
    }

    if (filter.aiOnly && !q.ai_generated) {
      return false;
    }

    if (filter.warningsOnly && q.warnings.length === 0) {
      return false;
    }

    if (normalizedQuery.length > 0) {
      const inStem = q.stem.toLowerCase().includes(normalizedQuery);
      const inAnswer = (q.answer_text ?? "")
        .toLowerCase()
        .includes(normalizedQuery);
      const inTopic = (q.topic ?? "").toLowerCase().includes(normalizedQuery);
      const inChoices = q.choices.some((c) =>
        c.text.toLowerCase().includes(normalizedQuery)
      );
      if (!inStem && !inAnswer && !inTopic && !inChoices) {
        return false;
      }
    }

    return true;
  });
}

export interface ReviewSummaryStats {
  total: number;
  needsCheckCount: number;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
  byStatus: {
    draft: number;
    approved: number;
    archived: number;
  };
}

export function computeReviewSummaryStats(
  questions: ReviewQuestionItem[]
): ReviewSummaryStats {
  const stats: ReviewSummaryStats = {
    total: questions.length,
    needsCheckCount: 0,
    byConfidence: { high: 0, medium: 0, low: 0 },
    byStatus: { draft: 0, approved: 0, archived: 0 },
  };

  for (const q of questions) {
    const tier = getConfidenceTier(q.confidence);
    stats.byConfidence[tier] += 1;
    stats.byStatus[q.status] += 1;

    if (isQuestionNeedsCheck(q)) {
      stats.needsCheckCount += 1;
    }
  }

  return stats;
}

/**
 * Đánh giá danh sách câu hỏi đủ điều kiện cho nút "Duyệt tất cả câu xanh" (C.2):
 * Chỉ duyệt câu:
 * 1. status === 'draft'
 * 2. confidence >= 0.8 (Xanh)
 * 3. ai_generated === false
 * 4. Không có cảnh báo (warnings.length === 0)
 * 5. Hợp lệ hoàn toàn theo validateQuestionForReview
 */
export function evaluateGreenBulkApproval(
  questions: ReviewQuestionItem[]
): GreenBulkEvaluation {
  const eligibleQuestions: ReviewQuestionItem[] = [];
  const skippedBreakdown: GreenBulkSkipBreakdown = {
    aiGenerated: 0,
    mediumOrLowConfidence: 0,
    hasWarnings: 0,
    invalid: 0,
    alreadyProcessed: 0,
  };

  for (const q of questions) {
    if (q.status !== "draft") {
      skippedBreakdown.alreadyProcessed += 1;
      continue;
    }

    if (q.ai_generated) {
      skippedBreakdown.aiGenerated += 1;
      continue;
    }

    const tier = getConfidenceTier(q.confidence);
    if (tier !== "high") {
      skippedBreakdown.mediumOrLowConfidence += 1;
      continue;
    }

    if (q.warnings.length > 0) {
      skippedBreakdown.hasWarnings += 1;
      continue;
    }

    const validation = validateQuestionForReview(q);
    if (!validation.valid) {
      skippedBreakdown.invalid += 1;
      continue;
    }

    eligibleQuestions.push(q);
  }

  const skippedCount =
    skippedBreakdown.aiGenerated +
    skippedBreakdown.mediumOrLowConfidence +
    skippedBreakdown.hasWarnings +
    skippedBreakdown.invalid +
    skippedBreakdown.alreadyProcessed;

  return {
    eligibleQuestions,
    eligibleIds: eligibleQuestions.map((q) => q.id),
    skippedCount,
    skippedBreakdown,
  };
}

