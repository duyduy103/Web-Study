import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import type {
  SrsCardStateRecord,
  SrsDayForecastBucket,
  SrsDayHistoryBucket,
  SrsLearnerAnalytics,
  SrsPreviewIntervals,
  SrsReviewLogRecord,
  SrsStudyQueueResult,
  StudyRatingButton,
} from "@/lib/srs/types";

export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
export const DEFAULT_DAILY_NEW_LIMIT = 20;
export const MIN_DAILY_NEW_LIMIT = 5;
export const MAX_DAILY_NEW_LIMIT = 50;
export const DEFAULT_LEECH_THRESHOLD = 3;

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
});

const vnDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const vnHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VIETNAM_TIMEZONE,
  hour: "2-digit",
  hour12: false,
});

/**
 * Chuyển đổi thời điểm bất kỳ sang khóa ngày YYYY-MM-DD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 */
export function getVietnamDateKey(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return vnDateFormatter.format(d);
}

/**
 * Lấy giờ hiện tại (0..23) theo múi giờ Việt Nam (dùng để nhắc ngủ đủ giấc sau 22:00)
 */
export function getVietnamHour(dateInput: Date | string): number {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const formatted = vnHourFormatter.format(d);
  return Number.parseInt(formatted, 10) || 0;
}

/**
 * Cộng/trừ số ngày trên chuỗi YYYY-MM-DD một cách thuần khiết
 */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map((v) => Number.parseInt(v, 10));
  const utc = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + deltaDays));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ánh xạ 4 nút tự chấm (Quên / Khó / Tốt / Dễ) sang Rating của FSRS
 */
export function mapButtonToFsrsRating(button: StudyRatingButton): Grade {
  switch (button) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "good":
      return Rating.Good;
    case "easy":
      return Rating.Easy;
  }
}

/**
 * Chuyển bản ghi card_states từ DB sang đối tượng Card của ts-fsrs
 */
export function toFsrsCard(
  record: SrsCardStateRecord | null | undefined,
  now: Date
): Card {
  if (!record) {
    return createEmptyCard(now);
  }

  return {
    due: new Date(record.due),
    stability: Number(record.stability) || 0,
    difficulty: Number(record.difficulty) || 0,
    scheduled_days: Number(record.scheduled_days) || 0,
    learning_steps: Number(record.learning_steps) || 0,
    reps: Number(record.reps) || 0,
    lapses: Number(record.lapses) || 0,
    state: (record.state as State) ?? State.New,
    last_review: record.last_review ? new Date(record.last_review) : undefined,
  };
}

/**
 * Định dạng khoảng thời gian đến lần ôn kế tiếp sang tiếng Việt ngắn gọn ("10 phút", "1 ngày", "4 ngày"...)
 */
export function formatIntervalLabelVi(from: Date, due: Date): string {
  const diffMs = Math.max(0, due.getTime() - from.getTime());
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 1) {
    return "1 phút";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} phút`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ`;
  }

  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 30) {
    return `${Math.max(1, diffDays)} ngày`;
  }

  if (diffDays < 365) {
    const months = Math.round((diffDays / 30) * 10) / 10;
    return `${months} tháng`;
  }

  const years = Math.round((diffDays / 365) * 10) / 10;
  return `${years} năm`;
}

/**
 * Tính trước nhãn khoảng lặp kế tiếp cho cả 4 nút (Quên / Khó / Tốt / Dễ)
 */
export function previewNextIntervals(
  currentState: SrsCardStateRecord | null | undefined,
  now: Date
): SrsPreviewIntervals {
  const card = toFsrsCard(currentState, now);
  const preview = scheduler.repeat(card, now);

  return {
    again: formatIntervalLabelVi(now, preview[Rating.Again].card.due),
    hard: formatIntervalLabelVi(now, preview[Rating.Hard].card.due),
    good: formatIntervalLabelVi(now, preview[Rating.Good].card.due),
    easy: formatIntervalLabelVi(now, preview[Rating.Easy].card.due),
  };
}

/**
 * Thực hiện chấm 1 thẻ bằng ts-fsrs và trả về trạng thái thẻ mới + bản ghi review_log
 */
export function scheduleCardReview(params: {
  questionId: string;
  currentState: SrsCardStateRecord | null | undefined;
  button: StudyRatingButton;
  now: Date;
}): {
  nextCardState: SrsCardStateRecord;
  reviewLog: SrsReviewLogRecord;
} {
  const { questionId, currentState, button, now } = params;
  const card = toFsrsCard(currentState, now);
  const grade = mapButtonToFsrsRating(button);
  const stateBefore = currentState ? currentState.state : State.New;

  const elapsedDays =
    currentState?.last_review
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(currentState.last_review).getTime()) /
              86400000
          )
        )
      : 0;

  const result = scheduler.next(card, now, grade);
  const updatedCard = result.card;

  const nextCardState: SrsCardStateRecord = {
    question_id: questionId,
    due: updatedCard.due.toISOString(),
    stability: Math.round(updatedCard.stability * 10000) / 10000,
    difficulty: Math.round(updatedCard.difficulty * 10000) / 10000,
    elapsed_days: elapsedDays,
    scheduled_days: updatedCard.scheduled_days,
    learning_steps: updatedCard.learning_steps,
    reps: updatedCard.reps,
    lapses: updatedCard.lapses,
    state: Number(updatedCard.state),
    last_review: now.toISOString(),
  };

  const reviewLog: SrsReviewLogRecord = {
    question_id: questionId,
    rating: Number(grade),
    state_before: Number(stateBefore),
    elapsed_days: elapsedDays,
    scheduled_days: updatedCard.scheduled_days,
    reviewed_at: now.toISOString(),
  };

  return { nextCardState, reviewLog };
}

/**
 * Xây dựng hàng đợi ôn tập hôm nay:
 * - Ưu tiên toàn bộ thẻ đến hạn (due <= now) trước
 * - Tiếp theo là thẻ mới chưa học, giới hạn theo dailyNewLimit (5..50, mặc định 20) tính theo ngày giờ Việt Nam
 */
export function buildDailyStudyQueue(params: {
  approvedQuestionIds: readonly string[];
  cardStates: readonly SrsCardStateRecord[];
  reviewLogs: readonly SrsReviewLogRecord[];
  dailyNewLimit?: number;
  now: Date;
  leechOnlyThreshold?: number;
}): SrsStudyQueueResult {
  const {
    approvedQuestionIds,
    cardStates,
    reviewLogs,
    dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT,
    now,
    leechOnlyThreshold,
  } = params;

  const clampedLimit = Math.min(
    MAX_DAILY_NEW_LIMIT,
    Math.max(MIN_DAILY_NEW_LIMIT, dailyNewLimit)
  );

  const stateByQuestionId = new Map<string, SrsCardStateRecord>();
  for (const cs of cardStates) {
    stateByQuestionId.set(cs.question_id, cs);
  }

  // Nếu bật chế độ "Ôn riêng nhóm câu hay quên" (leech only)
  if (leechOnlyThreshold !== undefined) {
    const leechIds = approvedQuestionIds.filter((qId) => {
      const cs = stateByQuestionId.get(qId);
      return Boolean(cs && cs.lapses >= leechOnlyThreshold);
    });
    return {
      dueQuestionIds: leechIds,
      newQuestionIds: [],
      queueQuestionIds: leechIds,
      totalDueCount: leechIds.length,
      totalNewAvailableCount: 0,
      newCardsLearnedToday: 0,
      remainingNewAllowanceToday: 0,
    };
  }

  const todayVnKey = getVietnamDateKey(now);
  const approvedSet = new Set(approvedQuestionIds);

  // Đếm số thẻ mới thuộc bộ này đã được học lần đầu trong ngày hôm nay (theo múi giờ VN)
  const newLearnedTodaySet = new Set<string>();
  for (const log of reviewLogs) {
    if (
      approvedSet.has(log.question_id) &&
      log.state_before === State.New &&
      getVietnamDateKey(log.reviewed_at) === todayVnKey
    ) {
      newLearnedTodaySet.add(log.question_id);
    }
  }

  const newCardsLearnedToday = newLearnedTodaySet.size;
  const remainingNewAllowanceToday = Math.max(
    0,
    clampedLimit - newCardsLearnedToday
  );

  const nowMs = now.getTime();
  const dueEntries: Array<{ id: string; dueMs: number }> = [];
  const allUnlearnedIds: string[] = [];

  for (const qId of approvedQuestionIds) {
    const cs = stateByQuestionId.get(qId);
    if (!cs || (cs.state === State.New && cs.reps === 0)) {
      allUnlearnedIds.push(qId);
    } else {
      const dueMs = new Date(cs.due).getTime();
      if (dueMs <= nowMs) {
        dueEntries.push({ id: qId, dueMs });
      }
    }
  }

  // Thẻ quá hạn lâu nhất được ưu tiên lên đầu
  dueEntries.sort((a, b) => a.dueMs - b.dueMs);
  const dueQuestionIds = dueEntries.map((item) => item.id);
  const newQuestionIds = allUnlearnedIds.slice(0, remainingNewAllowanceToday);

  return {
    dueQuestionIds,
    newQuestionIds,
    queueQuestionIds: [...dueQuestionIds, ...newQuestionIds],
    totalDueCount: dueQuestionIds.length,
    totalNewAvailableCount: allUnlearnedIds.length,
    newCardsLearnedToday,
    remainingNewAllowanceToday,
  };
}

/**
 * Phát hiện danh sách câu hay quên (leech: lapses >= threshold, mặc định 3)
 */
export function detectLeechQuestionIds(
  cardStates: readonly SrsCardStateRecord[],
  threshold = DEFAULT_LEECH_THRESHOLD
): string[] {
  return [...cardStates]
    .filter((cs) => cs.lapses >= threshold)
    .sort((a, b) => b.lapses - a.lapses)
    .map((cs) => cs.question_id);
}

/**
 * Tính toán thống kê học tập cho học sinh:
 * - Chuỗi ngày học liên tiếp (streak) theo múi giờ Việt Nam
 * - Tỉ lệ nhớ
 * - Lịch dự kiến 7 ngày tới
 * - Lịch sử 14 ngày qua
 * - Danh sách câu hay quên (leech)
 */
export function computeLearnerStudyAnalytics(params: {
  cardStates: readonly SrsCardStateRecord[];
  reviewLogs: readonly SrsReviewLogRecord[];
  now: Date;
  leechThreshold?: number;
}): SrsLearnerAnalytics {
  const {
    cardStates,
    reviewLogs,
    now,
    leechThreshold = DEFAULT_LEECH_THRESHOLD,
  } = params;

  const todayKey = getVietnamDateKey(now);

  // Tập hợp các ngày có ôn tập (theo múi giờ VN)
  const studiedDays = new Set<string>();
  const logsByDay = new Map<
    string,
    { total: number; remembered: number }
  >();

  let totalRemembered = 0;
  for (const log of reviewLogs) {
    const dayKey = getVietnamDateKey(log.reviewed_at);
    studiedDays.add(dayKey);
    const curr = logsByDay.get(dayKey) ?? { total: 0, remembered: 0 };
    curr.total += 1;
    if (log.rating >= Rating.Hard) {
      curr.remembered += 1;
      totalRemembered += 1;
    }
    logsByDay.set(dayKey, curr);
  }

  // Tính streak liên tiếp tính đến hôm nay (hoặc hôm qua nếu hôm nay chưa ôn)
  let streakDays = 0;
  let cursorKey = studiedDays.has(todayKey)
    ? todayKey
    : addDaysToDateKey(todayKey, -1);

  while (studiedDays.has(cursorKey)) {
    streakDays += 1;
    cursorKey = addDaysToDateKey(cursorKey, -1);
  }

  // Lịch dự kiến 7 ngày tới
  const forecast7Days: SrsDayForecastBucket[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const key = addDaysToDateKey(todayKey, offset);
    const shortLabel =
      offset === 0 ? "Hôm nay" : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
    let dueCount = 0;
    for (const cs of cardStates) {
      if (cs.reps <= 0) continue;
      const cardDueKey = getVietnamDateKey(cs.due);
      if (offset === 0) {
        if (cardDueKey <= todayKey) {
          dueCount += 1;
        }
      } else if (cardDueKey === key) {
        dueCount += 1;
      }
    }
    forecast7Days.push({
      dateKey: key,
      label: shortLabel,
      dueCount,
    });
  }

  // Lịch sử 14 ngày qua (từ 13 ngày trước đến hôm nay)
  const history14Days: SrsDayHistoryBucket[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const key = addDaysToDateKey(todayKey, -offset);
    const stat = logsByDay.get(key) ?? { total: 0, remembered: 0 };
    history14Days.push({
      dateKey: key,
      label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
      totalReviews: stat.total,
      rememberedCount: stat.remembered,
    });
  }

  const retentionRate =
    reviewLogs.length > 0
      ? Math.round((totalRemembered / reviewLogs.length) * 1000) / 10
      : 0;

  const leechQuestionIds = detectLeechQuestionIds(cardStates, leechThreshold);

  return {
    streakDays,
    totalReviews: reviewLogs.length,
    retentionRate,
    forecast7Days,
    history14Days,
    leechQuestionIds,
  };
}

export type PomodoroPhase = "work" | "short_break" | "long_break";

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
}

export const STANDARD_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

export const KIDS_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 10,
  shortBreakMinutes: 3,
  longBreakMinutes: 10,
  cyclesBeforeLongBreak: 4,
};

export function getNextPomodoroPhase(params: {
  currentPhase: PomodoroPhase;
  completedWorkCycles: number;
  settings: PomodoroSettings;
}): {
  nextPhase: PomodoroPhase;
  nextCompletedWorkCycles: number;
  durationSeconds: number;
} {
  const { currentPhase, completedWorkCycles, settings } = params;

  if (currentPhase === "work") {
    const nextCycles = completedWorkCycles + 1;
    if (nextCycles % settings.cyclesBeforeLongBreak === 0) {
      return {
        nextPhase: "long_break",
        nextCompletedWorkCycles: nextCycles,
        durationSeconds: Math.max(1, settings.longBreakMinutes) * 60,
      };
    }
    return {
      nextPhase: "short_break",
      nextCompletedWorkCycles: nextCycles,
      durationSeconds: Math.max(1, settings.shortBreakMinutes) * 60,
    };
  }

  return {
    nextPhase: "work",
    nextCompletedWorkCycles: completedWorkCycles,
    durationSeconds: Math.max(1, settings.workMinutes) * 60,
  };
}

export function isLateNightStudyTime(
  now: Date,
  lateHourThreshold = 22
): boolean {
  const hour = getVietnamHour(now);
  return hour >= lateHourThreshold || hour < 4;
}
