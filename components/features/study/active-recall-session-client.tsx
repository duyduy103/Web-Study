"use client";

import * as React from "react";
import Link from "next/link";
import { LearnerOnboardingGate } from "./learner-onboarding-gate";
import { PomodoroWidget } from "./pomodoro-widget";
import type {
  SrsCardStateRecord,
  SrsPreviewIntervals,
  SrsStudyQueueResult,
  StudyRatingButton,
} from "@/lib/srs/types";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";

interface StudyQuestionItem {
  id: string;
  type: "mcq" | "true_false" | "cloze" | "short_answer" | string;
  stem: string;
  topic: string | null;
  difficulty: string | null;
}

interface ChoiceHintItem {
  id: string;
  position: number;
  text: string;
}

interface RevealedAnswerChoice {
  id: string;
  position: number;
  text: string;
  is_correct: boolean;
}

interface RevealedAnswerPayload {
  question_id: string;
  type: string;
  answer_text: string | null;
  accepted_answers: string[];
  explanation: string | null;
  choices: RevealedAnswerChoice[];
}

interface LastRatedSnapshot {
  questionId: string;
  reviewLogId: string;
  previousCardState: SrsCardStateRecord | null;
  wasRemembered: boolean;
  previousIndex: number;
}

export function ActiveRecallSessionClient({
  code,
  leechOnly,
  accountMode = false,
}: {
  code: string;
  leechOnly: boolean;
  accountMode?: boolean;
}) {
  if (accountMode) {
    return (
      <ActiveRecallInner
        code={code}
        leechOnly={leechOnly}
        learnerSecret=""
        accountMode={true}
        resetLearnerSession={() => {}}
      />
    );
  }

  return (
    <LearnerOnboardingGate>
      {({ learnerSecret, resetLearnerSession }) => (
        <ActiveRecallInner
          code={code}
          leechOnly={leechOnly}
          learnerSecret={learnerSecret}
          accountMode={false}
          resetLearnerSession={resetLearnerSession}
        />
      )}
    </LearnerOnboardingGate>
  );
}

function ActiveRecallInner({
  code,
  leechOnly,
  learnerSecret,
  accountMode,
  resetLearnerSession,
}: {
  code: string;
  leechOnly: boolean;
  learnerSecret: string;
  accountMode: boolean;
  resetLearnerSession: () => void;
}) {
  const studyApiUrl = accountMode ? "/api/account/study" : "/api/public/study";
  const overviewHref = accountMode
    ? `/dashboard/sets/${encodeURIComponent(code)}/study`
    : `/study/${encodeURIComponent(code)}`;
  const [setTitle, setSetTitle] = React.useState("");
  const [questionsById, setQuestionsById] = React.useState<
    Record<string, StudyQuestionItem>
  >({});
  const [cardStatesById, setCardStatesById] = React.useState<
    Record<string, SrsCardStateRecord>
  >({});
  const [intervalsById, setIntervalsById] = React.useState<
    Record<string, SrsPreviewIntervals>
  >({});
  const [queueIds, setQueueIds] = React.useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Trạng thái trên thẻ hiện tại (Active Recall — Gấp sách)
  const [scratchpad, setScratchpad] = React.useState("");
  const [choicesHint, setChoicesHint] = React.useState<ChoiceHintItem[] | null>(
    null
  );
  const [selectedHintId, setSelectedHintId] = React.useState<string | null>(
    null
  );
  const [isLoadingHint, setIsLoadingHint] = React.useState(false);

  const [revealedAnswer, setRevealedAnswer] =
    React.useState<RevealedAnswerPayload | null>(null);
  const [isRevealingAnswer, setIsRevealingAnswer] = React.useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = React.useState(false);

  // Hoàn tác 1 bước
  const [lastRated, setLastRated] = React.useState<LastRatedSnapshot | null>(
    null
  );
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [undoNotice, setUndoNotice] = React.useState(false);

  // Thống kê trong phiên
  const [sessionReviewedCount, setSessionReviewedCount] = React.useState(0);
  const [sessionRememberedCount, setSessionRememberedCount] = React.useState(0);
  const [hardestQuestionId, setHardestQuestionId] = React.useState<
    string | null
  >(null);
  const [earliestNextDueIso, setEarliestNextDueIso] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    let active = true;
    async function initSession() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(studyApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "load_overview",
            ...(accountMode ? {} : { learnerSecret }),
            code,
            leechOnly,
          }),
        });

        if (res.status === 401) {
          resetLearnerSession();
          return;
        }

        const data: unknown = await res.json();
        if (!res.ok) {
          const errObj = data as { error?: string };
          throw new Error(
            errObj.error ?? vi.study.overview.notFoundDescription
          );
        }

        const payload = data as {
          set: { title: string };
          questions: StudyQuestionItem[];
          cardStates: SrsCardStateRecord[];
          queue: SrsStudyQueueResult;
          intervalsByQuestionId: Record<string, SrsPreviewIntervals>;
        };

        if (!active) return;

        const qMap: Record<string, StudyQuestionItem> = {};
        for (const q of payload.questions ?? []) {
          qMap[q.id] = q;
        }
        const csMap: Record<string, SrsCardStateRecord> = {};
        for (const cs of payload.cardStates ?? []) {
          csMap[cs.question_id] = cs;
        }

        setSetTitle(payload.set.title);
        setQuestionsById(qMap);
        setCardStatesById(csMap);
        setIntervalsById(payload.intervalsByQuestionId ?? {});
        setQueueIds(payload.queue.queueQuestionIds ?? []);
        setCurrentIndex(0);
      } catch (err) {
        if (active) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : vi.study.overview.notFoundDescription
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void initSession();
    return () => {
      active = false;
    };
  }, [
    code,
    leechOnly,
    learnerSecret,
    accountMode,
    studyApiUrl,
    resetLearnerSession,
  ]);

  const currentQuestionId = queueIds[currentIndex] ?? null;
  const currentQuestion = currentQuestionId
    ? questionsById[currentQuestionId] ?? null
    : null;

  function resetCardUiState() {
    setScratchpad("");
    setChoicesHint(null);
    setSelectedHintId(null);
    setRevealedAnswer(null);
  }

  async function handleShowChoicesHint() {
    if (!currentQuestion || isLoadingHint || choicesHint) return;
    setIsLoadingHint(true);
    try {
      const res = await fetch(studyApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reveal_choices_hint",
          ...(accountMode ? {} : { learnerSecret }),
          code,
          questionId: currentQuestion.id,
        }),
      });
      const data: unknown = await res.json();
      if (res.ok) {
        const payload = data as { choices?: ChoiceHintItem[] };
        setChoicesHint(payload.choices ?? []);
      }
    } finally {
      setIsLoadingHint(false);
    }
  }

  async function handleRevealAnswer() {
    if (!currentQuestion || isRevealingAnswer || revealedAnswer) return;
    setIsRevealingAnswer(true);
    try {
      const res = await fetch(studyApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reveal_answer",
          ...(accountMode ? {} : { learnerSecret }),
          code,
          questionId: currentQuestion.id,
        }),
      });
      const data: unknown = await res.json();
      if (res.ok) {
        setRevealedAnswer(data as RevealedAnswerPayload);
      }
    } finally {
      setIsRevealingAnswer(false);
    }
  }

  async function handleRateCard(button: StudyRatingButton) {
    if (!currentQuestion || isSubmittingRating || !revealedAnswer) return;
    setIsSubmittingRating(true);
    setUndoNotice(false);

    try {
      const currentCardState = cardStatesById[currentQuestion.id] ?? null;
      const res = await fetch(studyApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rate_card",
          ...(accountMode ? {} : { learnerSecret }),
          code,
          questionId: currentQuestion.id,
          button,
          currentCardState,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) return;

      const payload = data as {
        nextCardState: SrsCardStateRecord;
        reviewLogId: string;
        previousCardState: SrsCardStateRecord | null;
        nextIntervals: SrsPreviewIntervals;
      };

      const wasRemembered = button !== "again";
      setCardStatesById((prev) => ({
        ...prev,
        [currentQuestion.id]: payload.nextCardState,
      }));
      setIntervalsById((prev) => ({
        ...prev,
        [currentQuestion.id]: payload.nextIntervals,
      }));

      setLastRated({
        questionId: currentQuestion.id,
        reviewLogId: payload.reviewLogId,
        previousCardState: payload.previousCardState,
        wasRemembered,
        previousIndex: currentIndex,
      });

      setSessionReviewedCount((c) => c + 1);
      if (wasRemembered) {
        setSessionRememberedCount((c) => c + 1);
      } else {
        setHardestQuestionId(currentQuestion.id);
      }

      if (!hardestQuestionId && button === "hard") {
        setHardestQuestionId(currentQuestion.id);
      }

      setEarliestNextDueIso((prevIso) => {
        if (!prevIso) return payload.nextCardState.due;
        return new Date(payload.nextCardState.due).getTime() <
          new Date(prevIso).getTime()
          ? payload.nextCardState.due
          : prevIso;
      });

      resetCardUiState();
      setCurrentIndex((idx) => idx + 1);
    } finally {
      setIsSubmittingRating(false);
    }
  }

  async function handleUndoLastRating() {
    if (!lastRated || isUndoing) return;
    setIsUndoing(true);

    try {
      const res = await fetch(studyApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo_rate",
          ...(accountMode ? {} : { learnerSecret }),
          reviewLogId: lastRated.reviewLogId,
          questionId: lastRated.questionId,
          previousCardState: lastRated.previousCardState,
        }),
      });

      if (!res.ok) return;

      setCardStatesById((prev) => {
        const next = { ...prev };
        if (lastRated.previousCardState) {
          next[lastRated.questionId] = lastRated.previousCardState;
        } else {
          delete next[lastRated.questionId];
        }
        return next;
      });

      setSessionReviewedCount((c) => Math.max(0, c - 1));
      if (lastRated.wasRemembered) {
        setSessionRememberedCount((c) => Math.max(0, c - 1));
      }

      resetCardUiState();
      setCurrentIndex(lastRated.previousIndex);
      setLastRated(null);
      setUndoNotice(true);
      window.setTimeout(() => setUndoNotice(false), 2500);
    } finally {
      setIsUndoing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 text-sm text-slate-600">
        {vi.common.loading}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-red-700">{errorMsg}</p>
          <div className="mt-4">
            <Link
              href={overviewHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white"
            >
              {vi.study.review.backToOverview}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const remainingCount = Math.max(0, queueIds.length - currentIndex);
  const currentIntervals = currentQuestionId
    ? intervalsById[currentQuestionId] ?? {
        again: "1 phút",
        hard: "5 phút",
        good: "10 phút",
        easy: "4 ngày",
      }
    : null;

  // Màn hình kết thúc phiên ôn tập
  if (!currentQuestion) {
    const retentionPct =
      sessionReviewedCount > 0
        ? Math.round((sessionRememberedCount / sessionReviewedCount) * 100)
        : 100;
    const hardestQ = hardestQuestionId
      ? questionsById[hardestQuestionId]
      : null;

    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <PomodoroWidget />
        <section className="rounded-3xl border border-teal-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-2xl font-extrabold text-slate-900">
            {vi.study.review.summary.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{setTitle}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-600">
                {vi.study.review.summary.reviewedCountLabel}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900">
                {sessionReviewedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs font-semibold text-emerald-900">
                {vi.study.review.summary.retentionRateLabel}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-800">
                {retentionPct}%
              </p>
            </div>
          </div>

          {hardestQ ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-left">
              <p className="text-xs font-bold text-amber-900">
                {vi.study.review.summary.hardestCardTitle}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {hardestQ.stem}
              </p>
            </div>
          ) : null}

          {earliestNextDueIso ? (
            <p className="mt-4 text-xs text-slate-600">
              {vi.study.review.summary.nextDueTitle}{" "}
              <strong className="text-slate-900">
                {new Date(earliestNextDueIso).toLocaleString("vi-VN")}
              </strong>
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {lastRated ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isUndoing}
                onClick={() => void handleUndoLastRating()}
                className="min-h-[48px]"
              >
                {vi.study.review.undoButton}
              </Button>
            ) : null}
            <Link
              href={overviewHref}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-teal-600 px-6 py-3 text-base font-bold text-white hover:bg-teal-700"
            >
              {vi.study.review.summary.backToSetOverviewButton}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const isChoiceQuestion =
    currentQuestion.type === "mcq" || currentQuestion.type === "true_false";
  const isClozeQuestion = currentQuestion.type === "cloze";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-28">
      <PomodoroWidget />

      {/* Thanh điều hướng trên cùng */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={overviewHref}
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
        >
          {vi.study.review.backToOverview}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {lastRated ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isUndoing}
              onClick={() => void handleUndoLastRating()}
              className="min-h-[44px] text-xs font-bold"
            >
              {vi.study.review.undoButton}
            </Button>
          ) : null}

          <span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800">
            {vi.study.review.remainingQueuePrefix} {remainingCount}
          </span>
        </div>
      </div>

      {undoNotice ? (
        <div
          role="status"
          className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-900"
        >
          ✓ {vi.study.review.undoSuccessNotice}
        </div>
      ) : null}

      {/* Thẻ câu hỏi chế độ Gấp sách */}
      <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              leechOnly
                ? "bg-rose-100 text-rose-900"
                : "bg-teal-50 text-teal-800"
            }`}
          >
            {leechOnly
              ? vi.study.review.leechOnlyModeBadge
              : vi.study.review.activeRecallBadge}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            {currentQuestion.topic ? (
              <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {currentQuestion.topic}
              </span>
            ) : null}
            <span>
              Thẻ {currentIndex + 1}/{queueIds.length}
            </span>
          </div>
        </div>

        {/* Nội dung câu hỏi (Stem) */}
        <h1 className="mt-5 text-lg font-bold leading-relaxed whitespace-pre-wrap text-slate-900 sm:text-xl">
          {currentQuestion.stem}
        </h1>

        {isClozeQuestion && !revealedAnswer ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs font-medium text-amber-900">
            {vi.study.review.clozeBlankHint}
          </p>
        ) : null}

        {/* Ô gõ nháp suy nghĩ trước khi lật đáp án */}
        <div className="mt-5 space-y-2">
          <label
            htmlFor="active-recall-scratchpad"
            className="block text-xs font-semibold text-slate-600"
          >
            {vi.study.review.thinkPrompt}
          </label>
          <textarea
            id="active-recall-scratchpad"
            rows={2}
            value={scratchpad}
            onChange={(e) => setScratchpad(e.target.value)}
            placeholder={vi.study.review.scratchpadPlaceholder}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Với MCQ/True-False: mặc định ẩn lựa chọn, có nút "Hiện gợi ý lựa chọn" */}
        {isChoiceQuestion && !revealedAnswer ? (
          <div className="mt-4">
            {!choicesHint ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isLoadingHint}
                onClick={() => void handleShowChoicesHint()}
                className="min-h-[44px] text-xs font-semibold"
              >
                {isLoadingHint
                  ? vi.common.loading
                  : vi.study.review.showChoicesHintButton}
              </Button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-600">
                  {vi.study.review.choicesHintTitle}
                </p>
                <div className="grid gap-2">
                  {choicesHint.map((ch, idx) => {
                    const isSelected = selectedHintId === ch.id;
                    const choiceLetter = String.fromCharCode(65 + idx);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setSelectedHintId(ch.id)}
                        className={`flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-teal-600 bg-teal-50 font-semibold text-teal-950"
                            : "border-slate-200 bg-white text-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-800">
                          {choiceLetter}
                        </span>
                        <span>{ch.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Nút Hiện đáp án hoặc Khung Đáp án & 4 nút tự chấm FSRS */}
        {!revealedAnswer ? (
          <div className="mt-6 pt-2">
            <Button
              type="button"
              disabled={isRevealingAnswer}
              onClick={() => void handleRevealAnswer()}
              className="min-h-[52px] w-full text-base font-bold shadow-sm"
            >
              {isRevealingAnswer
                ? vi.study.review.revealingAnswerStatus
                : vi.study.review.revealAnswerButton}
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-5 border-t border-slate-200 pt-6">
            {/* Đáp án đúng */}
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                {vi.study.review.correctAnswerTitle}
              </p>

              {revealedAnswer.choices && revealedAnswer.choices.length > 0 ? (
                <div className="mt-2.5 space-y-2">
                  {revealedAnswer.choices.map((ch, idx) => (
                    <div
                      key={ch.id}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
                        ch.is_correct
                          ? "border-emerald-500 bg-emerald-100 font-bold text-emerald-950"
                          : selectedHintId === ch.id
                            ? "border-rose-300 bg-rose-50 text-rose-900 line-through"
                            : "border-slate-200 bg-white/80 text-slate-600"
                      }`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          ch.is_correct
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{ch.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-base font-bold text-emerald-950">
                  {revealedAnswer.answer_text}
                </p>
              )}

              {revealedAnswer.explanation ? (
                <div className="mt-3 border-t border-emerald-200/80 pt-3 text-xs leading-relaxed text-emerald-950">
                  <strong className="font-bold">
                    {vi.study.review.explanationTitle}
                  </strong>{" "}
                  {revealedAnswer.explanation}
                </div>
              ) : null}
            </div>

            {/* 4 nút tự chấm FSRS: Quên / Khó / Tốt / Dễ kèm khoảng lặp kế tiếp */}
            <div>
              <p className="mb-3 text-center text-xs font-bold text-slate-700">
                {vi.study.review.ratePrompt}
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={() => void handleRateCard("again")}
                  className="flex min-h-[60px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-rose-300 bg-rose-50 px-3 py-2.5 text-rose-950 transition-colors hover:bg-rose-100 disabled:opacity-50"
                >
                  <span className="text-sm font-extrabold">
                    {vi.study.review.ratings.again}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-rose-800">
                    {currentIntervals?.again}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={() => void handleRateCard("hard")}
                  className="flex min-h-[60px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-950 transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  <span className="text-sm font-extrabold">
                    {vi.study.review.ratings.hard}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-amber-800">
                    {currentIntervals?.hard}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={() => void handleRateCard("good")}
                  className="flex min-h-[60px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-teal-400 bg-teal-50 px-3 py-2.5 text-teal-950 transition-colors hover:bg-teal-100 disabled:opacity-50"
                >
                  <span className="text-sm font-extrabold">
                    {vi.study.review.ratings.good}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-teal-800">
                    {currentIntervals?.good}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={() => void handleRateCard("easy")}
                  className="flex min-h-[60px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-3 py-2.5 text-emerald-950 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  <span className="text-sm font-extrabold">
                    {vi.study.review.ratings.easy}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-emerald-800">
                    {currentIntervals?.easy}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
