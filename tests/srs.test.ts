import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import {
  buildDailyStudyQueue,
  computeLearnerStudyAnalytics,
  detectLeechQuestionIds,
  getVietnamDateKey,
  mapButtonToFsrsRating,
  previewNextIntervals,
  scheduleCardReview,
} from "@/lib/srs";
import {
  generateLearnerRecoveryCode,
  getNextPomodoroPhase,
  hashLearnerTokenSha256,
  isLateNightStudyTime,
  normalizeRecoveryCode,
  STANDARD_POMODORO_SETTINGS,
} from "@/lib/srs/crypto-and-pomodoro";
import type { SrsCardStateRecord, SrsReviewLogRecord } from "@/lib/srs/types";

describe("lib/srs - Active Recall, FSRS (ts-fsrs) & Lịch ôn tập", () => {
  it("ánh xạ chính xác 4 nút tự chấm (Quên / Khó / Tốt / Dễ) sang Rating của ts-fsrs", () => {
    expect(mapButtonToFsrsRating("again")).toBe(Rating.Again);
    expect(mapButtonToFsrsRating("hard")).toBe(Rating.Hard);
    expect(mapButtonToFsrsRating("good")).toBe(Rating.Good);
    expect(mapButtonToFsrsRating("easy")).toBe(Rating.Easy);
  });

  it("lịch đến hạn (scheduled_days) tăng dần khi chọn Tốt liên tiếp và thẻ quay lại đúng hạn vào ngày hôm sau", () => {
    const startTime = new Date("2026-11-12T08:00:00Z");

    // Lần 1: Thẻ mới -> bấm Easy/Good để vào trạng thái ôn tập theo ngày
    const step1 = scheduleCardReview({
      questionId: "q-1",
      currentState: null,
      button: "easy",
      now: startTime,
    });
    expect(step1.nextCardState.reps).toBe(1);
    expect(step1.nextCardState.scheduled_days).toBeGreaterThanOrEqual(1);

    // Mô phỏng đến đúng ngày hẹn (step1.nextCardState.due) -> thẻ xuất hiện trong danh sách Due
    const dueTime1 = new Date(step1.nextCardState.due);
    const queueAtDue1 = buildDailyStudyQueue({
      approvedQuestionIds: ["q-1"],
      cardStates: [step1.nextCardState],
      reviewLogs: [step1.reviewLog],
      now: dueTime1,
    });
    expect(queueAtDue1.dueQuestionIds).toContain("q-1");

    // Lần 2: Chọn Tốt (Good) tại ngày hẹn
    const step2 = scheduleCardReview({
      questionId: "q-1",
      currentState: step1.nextCardState,
      button: "good",
      now: dueTime1,
    });

    // Lần 3: Chọn Tốt (Good) tiếp ở lần hẹn kế tiếp
    const dueTime2 = new Date(step2.nextCardState.due);
    const step3 = scheduleCardReview({
      questionId: "q-1",
      currentState: step2.nextCardState,
      button: "good",
      now: dueTime2,
    });

    expect(step2.nextCardState.scheduled_days).toBeGreaterThan(
      step1.nextCardState.scheduled_days
    );
    expect(step3.nextCardState.scheduled_days).toBeGreaterThan(
      step2.nextCardState.scheduled_days
    );
  });

  it("thẻ bấm Quên (again) tăng số lần quên (lapses) và quay lại sớm ngay trong ngày", () => {
    const day0 = new Date("2026-11-12T02:00:00Z");
    const first = scheduleCardReview({
      questionId: "q-lapse",
      currentState: null,
      button: "easy",
      now: day0,
    });

    const reviewDay = new Date(first.nextCardState.due);
    const forgotten = scheduleCardReview({
      questionId: "q-lapse",
      currentState: first.nextCardState,
      button: "again",
      now: reviewDay,
    });

    expect(forgotten.nextCardState.lapses).toBe(1);
    const diffMinutes =
      (new Date(forgotten.nextCardState.due).getTime() - reviewDay.getTime()) /
      60000;
    // Quay lại sớm trong vòng vài chục phút (ngắn hơn rất nhiều so với 1 ngày)
    expect(diffMinutes).toBeLessThan(120);

    const intervals = previewNextIntervals(
      forgotten.nextCardState,
      reviewDay
    );
    expect(intervals.again).toBeTruthy();
    expect(intervals.good).toBeTruthy();
  });

  it("ưu tiên thẻ đến hạn trước thẻ mới và giới hạn số thẻ mới mỗi ngày theo múi giờ Asia/Ho_Chi_Minh", () => {
    const approvedIds = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    // 2026-11-12T16:30:00Z = 23:30 ngày 12/11/2026 giờ Việt Nam (UTC+7)
    const lateNightVn = new Date("2026-11-12T16:30:00Z");
    expect(getVietnamDateKey(lateNightVn)).toBe("2026-11-12");

    const cardStates: SrsCardStateRecord[] = [
      {
        question_id: "q1",
        due: "2026-11-12T10:00:00Z", // Đã đến hạn
        stability: 2,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: 2,
        last_review: "2026-11-11T10:00:00Z",
      },
      {
        question_id: "q2",
        due: "2026-11-15T10:00:00Z", // Chưa đến hạn
        stability: 4,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 3,
        learning_steps: 0,
        reps: 2,
        lapses: 0,
        state: 2,
        last_review: "2026-11-12T05:00:00Z",
      },
    ];

    // Học sinh đã học 3 thẻ mới trong ngày 12/11 (giờ VN)
    const logsToday: SrsReviewLogRecord[] = [
      {
        question_id: "q2",
        rating: 3,
        state_before: 0,
        elapsed_days: 0,
        scheduled_days: 3,
        reviewed_at: "2026-11-12T05:00:00Z",
      },
      {
        question_id: "q3",
        rating: 3,
        state_before: 0,
        elapsed_days: 0,
        scheduled_days: 1,
        reviewed_at: "2026-11-12T15:00:00Z",
      },
      {
        question_id: "q4",
        rating: 3,
        state_before: 0,
        elapsed_days: 0,
        scheduled_days: 1,
        reviewed_at: "2026-11-12T16:00:00Z",
      },
    ];

    // Đặt dailyNewLimit = 5 -> Hôm nay đã học 3 thẻ mới, chỉ còn được học thêm 2 thẻ mới
    const queueDay12 = buildDailyStudyQueue({
      approvedQuestionIds: approvedIds,
      cardStates,
      reviewLogs: logsToday,
      dailyNewLimit: 5,
      now: lateNightVn,
    });

    expect(queueDay12.newCardsLearnedToday).toBe(3);
    expect(queueDay12.remainingNewAllowanceToday).toBe(2);
    expect(queueDay12.dueQuestionIds).toEqual(["q1"]);
    expect(queueDay12.newQuestionIds).toHaveLength(2);
    // Thẻ đến hạn q1 đứng đầu hàng đợi trước các thẻ mới
    expect(queueDay12.queueQuestionIds[0]).toBe("q1");

    // 1 tiếng sau: 2026-11-12T17:30:00Z = 00:30 ngày 13/11/2026 giờ Việt Nam (sang ngày mới!)
    const nextDayEarlyMorningVn = new Date("2026-11-12T17:30:00Z");
    expect(getVietnamDateKey(nextDayEarlyMorningVn)).toBe("2026-11-13");

    const queueDay13 = buildDailyStudyQueue({
      approvedQuestionIds: approvedIds,
      cardStates,
      reviewLogs: logsToday,
      dailyNewLimit: 5,
      now: nextDayEarlyMorningVn,
    });
    expect(queueDay13.newCardsLearnedToday).toBe(0);
    expect(queueDay13.remainingNewAllowanceToday).toBe(5);
  });

  it("phát hiện câu hay quên (leech: lapses >= 3) và tính đúng streak, tỉ lệ nhớ", () => {
    const now = new Date("2026-11-12T08:00:00Z");
    const states: SrsCardStateRecord[] = [
      {
        question_id: "q-easy",
        due: "2026-11-15T08:00:00Z",
        stability: 10,
        difficulty: 3,
        elapsed_days: 3,
        scheduled_days: 5,
        learning_steps: 0,
        reps: 4,
        lapses: 1,
        state: 2,
        last_review: "2026-11-12T08:00:00Z",
      },
      {
        question_id: "q-leech-1",
        due: "2026-11-12T09:00:00Z",
        stability: 1,
        difficulty: 8,
        elapsed_days: 1,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 6,
        lapses: 4,
        state: 3,
        last_review: "2026-11-12T08:00:00Z",
      },
      {
        question_id: "q-leech-2",
        due: "2026-11-12T09:00:00Z",
        stability: 1.2,
        difficulty: 7.5,
        elapsed_days: 1,
        scheduled_days: 1,
        learning_steps: 0,
        reps: 5,
        lapses: 3,
        state: 2,
        last_review: "2026-11-12T08:00:00Z",
      },
    ];

    const leeches = detectLeechQuestionIds(states, 3);
    expect(leeches).toEqual(["q-leech-1", "q-leech-2"]);

    const logs: SrsReviewLogRecord[] = [
      {
        question_id: "q-easy",
        rating: 3,
        state_before: 2,
        elapsed_days: 1,
        scheduled_days: 3,
        reviewed_at: "2026-11-10T08:00:00Z",
      },
      {
        question_id: "q-leech-1",
        rating: 1,
        state_before: 2,
        elapsed_days: 1,
        scheduled_days: 0,
        reviewed_at: "2026-11-11T08:00:00Z",
      },
      {
        question_id: "q-easy",
        rating: 4,
        state_before: 2,
        elapsed_days: 2,
        scheduled_days: 5,
        reviewed_at: "2026-11-12T08:00:00Z",
      },
    ];

    const analytics = computeLearnerStudyAnalytics({
      cardStates: states,
      reviewLogs: logs,
      now,
      leechThreshold: 3,
    });

    expect(analytics.streakDays).toBe(3);
    expect(analytics.retentionRate).toBe(66.7);
    expect(analytics.leechQuestionIds).toEqual(["q-leech-1", "q-leech-2"]);
    expect(analytics.forecast7Days).toHaveLength(7);
    expect(analytics.history14Days).toHaveLength(14);
  });

  it("chuẩn hóa mã khôi phục, băm SHA-256 và chuyển pha Pomodoro / nhắc ngủ muộn", () => {
    const rec = generateLearnerRecoveryCode();
    expect(rec.normalized).toHaveLength(12);
    expect(normalizeRecoveryCode(` ${rec.formatted.toLowerCase()} `)).toBe(
      rec.normalized
    );
    expect(hashLearnerTokenSha256(rec.normalized)).toHaveLength(64);

    // Sau vòng học thứ 4 -> chuyển sang nghỉ dài (long_break)
    const after4thWork = getNextPomodoroPhase({
      currentPhase: "work",
      completedWorkCycles: 3,
      settings: STANDARD_POMODORO_SETTINGS,
    });
    expect(after4thWork.nextPhase).toBe("long_break");
    expect(after4thWork.nextCompletedWorkCycles).toBe(4);
    expect(after4thWork.durationSeconds).toBe(15 * 60);

    // 22:30 giờ Việt Nam (15:30 UTC) -> nhắc ngủ đủ giấc
    expect(isLateNightStudyTime(new Date("2026-11-12T15:30:00Z"), 22)).toBe(
      true
    );
    // 14:00 giờ Việt Nam (07:00 UTC) -> không nhắc
    expect(isLateNightStudyTime(new Date("2026-11-12T07:00:00Z"), 22)).toBe(
      false
    );
  });
});

