"use client";

import * as React from "react";
import Link from "next/link";
import { LearnerOnboardingGate } from "./learner-onboarding-gate";
import type {
  SrsCardStateRecord,
  SrsLearnerAnalytics,
  SrsStudyQueueResult,
} from "@/lib/srs/types";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StudySetInfo {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  study_code: string;
  study_enabled: boolean;
  daily_new_limit: number;
  leech_threshold: number;
}

interface QuestionSummaryItem {
  id: string;
  type: string;
  stem: string;
  topic: string | null;
  difficulty: string | null;
}

export function StudySetOverviewClient({ code }: { code: string }) {
  return (
    <LearnerOnboardingGate>
      {({ learnerSecret, nickname, resetLearnerSession }) => (
        <StudySetOverviewInner
          code={code}
          learnerSecret={learnerSecret}
          nickname={nickname}
          resetLearnerSession={resetLearnerSession}
        />
      )}
    </LearnerOnboardingGate>
  );
}

function StudySetOverviewInner({
  code,
  learnerSecret,
  nickname,
  resetLearnerSession,
}: {
  code: string;
  learnerSecret: string;
  nickname: string;
  resetLearnerSession: () => void;
}) {
  const [setInfo, setSetInfo] = React.useState<StudySetInfo | null>(null);
  const [questions, setQuestions] = React.useState<QuestionSummaryItem[]>([]);
  const [cardStates, setCardStates] = React.useState<SrsCardStateRecord[]>([]);
  const [queue, setQueue] = React.useState<SrsStudyQueueResult | null>(null);
  const [analytics, setAnalytics] = React.useState<SrsLearnerAnalytics | null>(
    null
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isDisabled, setIsDisabled] = React.useState(false);

  const [dailyNewLimit, setDailyNewLimit] = React.useState(20);
  const [leechThreshold, setLeechThreshold] = React.useState(3);
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setIsDisabled(false);

    try {
      const res = await fetch("/api/public/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "load_overview",
          learnerSecret,
          code,
        }),
      });

      if (res.status === 401) {
        resetLearnerSession();
        return;
      }

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string; code?: string };
        if (res.status === 403 || errObj.code === "DISABLED") {
          setIsDisabled(true);
        }
        throw new Error(
          errObj.error ?? vi.study.overview.notFoundDescription
        );
      }

      const payload = data as {
        set: StudySetInfo;
        questions: QuestionSummaryItem[];
        cardStates: SrsCardStateRecord[];
        queue: SrsStudyQueueResult;
        analytics: SrsLearnerAnalytics;
      };

      setSetInfo(payload.set);
      setQuestions(payload.questions ?? []);
      setCardStates(payload.cardStates ?? []);
      setQueue(payload.queue);
      setAnalytics(payload.analytics);
      setDailyNewLimit(payload.set.daily_new_limit ?? 20);
      setLeechThreshold(payload.set.leech_threshold ?? 3);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : vi.study.overview.notFoundDescription
      );
    } finally {
      setIsLoading(false);
    }
  }, [code, learnerSecret, resetLearnerSession]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!setInfo) return;
    setIsSavingSettings(true);
    setSettingsSavedMsg(false);

    try {
      const clampedLimit = Math.max(5, Math.min(50, dailyNewLimit));
      const clampedLeech = Math.max(2, Math.min(10, leechThreshold));
      const res = await fetch("/api/public/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          learnerSecret,
          setId: setInfo.id,
          dailyNewLimit: clampedLimit,
          leechThreshold: clampedLeech,
        }),
      });

      if (res.ok) {
        setSettingsSavedMsg(true);
        window.setTimeout(() => setSettingsSavedMsg(false), 2500);
        await loadData();
      }
    } finally {
      setIsSavingSettings(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4 text-sm text-slate-600">
        {vi.common.loading}
      </div>
    );
  }

  if (errorMsg || !setInfo || !queue || !analytics) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">
            {isDisabled
              ? vi.study.overview.disabledTitle
              : vi.study.overview.notFoundTitle}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {errorMsg ?? vi.study.overview.notFoundDescription}
          </p>
          <div className="mt-6">
            <Link
              href="/study"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
            >
              {vi.study.overview.backToHub}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalToStudyNow = queue.queueQuestionIds.length;
  const newForTodayCount = queue.newQuestionIds.length;
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const stateMap = new Map(cardStates.map((s) => [s.question_id, s]));

  const leechItems = analytics.leechQuestionIds
    .map((qId) => {
      const q = questionMap.get(qId);
      const st = stateMap.get(qId);
      if (!q || !st) return null;
      return { question: q, state: st };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const maxForecastCount = Math.max(
    1,
    ...analytics.forecast7Days.map((d) => d.dueCount)
  );
  const maxHistoryCount = Math.max(
    1,
    ...analytics.history14Days.map((d) => d.totalReviews)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/study"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
        >
          {vi.study.overview.backToHub}
        </Link>
        <span className="text-xs font-medium text-slate-600">
          Học sinh: <strong className="text-slate-900">{nickname}</strong>
        </span>
      </div>

      {/* Khối chính: Hôm nay cần ôn */}
      <section className="rounded-3xl border border-teal-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-teal-100 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-900">
                {setInfo.study_code}
              </span>
              {setInfo.subject ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {setInfo.subject}
                </span>
              ) : null}
              {setInfo.grade ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  Khối {setInfo.grade}
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {setInfo.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {vi.study.overview.todayPanelTitle} • Tổng cộng{" "}
              {questions.length} thẻ đã duyệt
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <span className="text-xl" aria-hidden="true">
              🔥
            </span>
            <div>
              <p className="text-[11px] font-semibold text-amber-800">
                {vi.study.overview.streakLabel}
              </p>
              <p className="text-lg font-extrabold text-amber-950">
                {analytics.streakDays} {vi.study.overview.daysUnit}
              </p>
            </div>
          </div>
        </div>

        {/* 3 chỉ số trong ngày */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs font-semibold text-amber-900">
              {vi.study.overview.dueCardsLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-amber-950">
              {queue.totalDueCount}{" "}
              <span className="text-sm font-semibold">
                {vi.study.overview.cardsUnit}
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
            <p className="text-xs font-semibold text-teal-900">
              {vi.study.overview.newCardsAvailableLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-teal-950">
              {newForTodayCount}{" "}
              <span className="text-sm font-semibold">
                / {queue.remainingNewAllowanceToday} định mức còn lại
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600">
              {vi.study.overview.retentionRateLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold text-emerald-700">
              {analytics.retentionRate}%{" "}
              <span className="text-xs font-medium text-slate-500">
                ({analytics.totalReviews} lượt lật)
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {totalToStudyNow > 0 ? (
            <Link
              href={`/study/${encodeURIComponent(setInfo.study_code)}/review`}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-teal-600 px-6 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-teal-700 sm:flex-none"
            >
              {vi.study.overview.startReviewButton} ({totalToStudyNow}{" "}
              {vi.study.overview.cardsUnit})
            </Link>
          ) : (
            <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              {vi.study.overview.allCaughtUpNotice}
            </div>
          )}

          {leechItems.length > 0 ? (
            <Link
              href={`/study/${encodeURIComponent(setInfo.study_code)}/review?mode=leech`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-900 transition-colors hover:bg-rose-100"
            >
              🎯 {vi.study.overview.studyExtraLeechButton} ({leechItems.length})
            </Link>
          ) : null}
        </div>
      </section>

      {/* Biểu đồ dự kiến 7 ngày tới + Lịch sử 14 ngày */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">
            {vi.study.overview.forecast7DaysTitle}
          </h2>
          <div className="mt-4 flex h-40 items-end justify-between gap-2 pt-4">
            {analytics.forecast7Days.map((day, idx) => {
              const heightPct = Math.max(
                8,
                Math.round((day.dueCount / maxForecastCount) * 100)
              );
              return (
                <div
                  key={day.dateKey}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <span className="text-xs font-bold text-slate-700">
                    {day.dueCount}
                  </span>
                  <div className="flex h-24 w-full items-end justify-center rounded-xl bg-slate-100 p-1">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-lg transition-all ${
                        idx === 0 ? "bg-amber-500" : "bg-teal-500"
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">
                    {idx === 0
                      ? vi.study.overview.forecastTodayLabel
                      : day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              {vi.study.overview.stats14DaysTitle}
            </h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              {vi.study.overview.retentionRateLabel} {analytics.retentionRate}%
            </span>
          </div>
          <div className="mt-4 flex h-40 items-end justify-between gap-1 pt-4">
            {analytics.history14Days.map((day) => {
              const heightPct =
                day.totalReviews === 0
                  ? 6
                  : Math.max(
                      12,
                      Math.round((day.totalReviews / maxHistoryCount) * 100)
                    );
              return (
                <div
                  key={day.dateKey}
                  title={`${day.label}: ${day.totalReviews} lượt ôn (${day.rememberedCount} nhớ)`}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-semibold text-slate-600">
                    {day.totalReviews > 0 ? day.totalReviews : ""}
                  </span>
                  <div className="flex h-24 w-full items-end justify-center rounded-lg bg-slate-100 p-0.5">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded ${
                        day.totalReviews > 0
                          ? "bg-emerald-500"
                          : "bg-slate-200"
                      }`}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Danh sách câu hay quên (Leech) */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {vi.study.overview.leechSectionTitle} ({leechItems.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              {vi.study.overview.leechSectionSubtitle}
            </p>
          </div>
          {leechItems.length > 0 ? (
            <Link
              href={`/study/${encodeURIComponent(setInfo.study_code)}/review?mode=leech`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              {vi.study.overview.studyExtraLeechButton}
            </Link>
          ) : null}
        </div>

        {leechItems.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
            {vi.study.overview.leechEmpty}
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {leechItems.map(({ question, state }) => (
              <div
                key={question.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3"
              >
                <div className="max-w-2xl">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">
                    {question.stem}
                  </p>
                  {question.topic ? (
                    <span className="mt-1 inline-block rounded bg-white px-2 py-0.5 text-[11px] text-slate-600">
                      {question.topic}
                    </span>
                  ) : null}
                </div>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-900">
                  {vi.study.overview.lapsesCountPrefix} {state.lapses}{" "}
                  {vi.study.overview.lapsesCountSuffix}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cài đặt giới hạn thẻ mới / ngày và ngưỡng Leech */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="flex flex-wrap items-end gap-4"
        >
          <div className="space-y-1">
            <Label htmlFor="daily-new-limit" className="text-xs">
              {vi.study.overview.dailyLimitSettingLabel}
            </Label>
            <Input
              id="daily-new-limit"
              type="number"
              min={5}
              max={50}
              value={dailyNewLimit}
              onChange={(e) =>
                setDailyNewLimit(Number.parseInt(e.target.value, 10) || 20)
              }
              className="min-h-[44px] w-36"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="leech-threshold" className="text-xs">
              {vi.study.overview.leechThresholdSettingLabel}
            </Label>
            <Input
              id="leech-threshold"
              type="number"
              min={2}
              max={10}
              value={leechThreshold}
              onChange={(e) =>
                setLeechThreshold(Number.parseInt(e.target.value, 10) || 3)
              }
              className="min-h-[44px] w-36"
            />
          </div>

          <Button
            type="submit"
            variant="secondary"
            disabled={isSavingSettings}
            className="min-h-[44px]"
          >
            {vi.study.overview.saveSettingsButton}
          </Button>

          {settingsSavedMsg ? (
            <span className="text-xs font-semibold text-emerald-700">
              ✓ {vi.review.editor.savedStatus}
            </span>
          ) : null}
        </form>
      </section>
    </div>
  );
}

