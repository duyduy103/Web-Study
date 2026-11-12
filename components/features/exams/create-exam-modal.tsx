"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deterministicShuffle } from "@/lib/grading";
import type { ReviewQuestionItem } from "@/lib/review/types";

interface CreateExamModalProps {
  open: boolean;
  setId: string;
  setTitle: string;
  questions: ReviewQuestionItem[];
  onClose: () => void;
}

type SelectionMode = "all" | "filter" | "random";

export function CreateExamModal({
  open,
  setId,
  setTitle,
  questions,
  onClose,
}: CreateExamModalProps) {
  const router = useRouter();

  const approvedQuestions = React.useMemo(
    () => questions.filter((q) => q.status === "approved"),
    [questions]
  );

  const distinctTopics = React.useMemo(() => {
    const set = new Set<string>();
    for (const q of approvedQuestions) {
      if (q.topic && q.topic.trim()) {
        set.add(q.topic.trim());
      }
    }
    return Array.from(set);
  }, [approvedQuestions]);

  const [examTitle, setExamTitle] = React.useState(
    `${setTitle} - Bài kiểm tra`
  );
  const [selectionMode, setSelectionMode] = React.useState<SelectionMode>("all");
  const [selectedTopic, setSelectedTopic] = React.useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = React.useState<string>("");
  const [randomCount, setRandomCount] = React.useState<number>(10);
  const [randomSeed, setRandomSeed] = React.useState<string>(() =>
    String(Date.now())
  );

  const [totalPoints, setTotalPoints] = React.useState<number>(10);
  const [durationMin, setDurationMin] = React.useState<string>("15");
  const [maxAttempts, setMaxAttempts] = React.useState<number>(1);
  const [opensAt, setOpensAt] = React.useState<string>("");
  const [closesAt, setClosesAt] = React.useState<string>("");

  const [shuffleQuestions, setShuffleQuestions] = React.useState(true);
  const [shuffleChoices, setShuffleChoices] = React.useState(true);
  const [showAnswers, setShowAnswers] = React.useState(true);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setExamTitle(`${setTitle} - Bài kiểm tra`);
      setRandomCount(Math.min(10, Math.max(1, approvedQuestions.length)));
      setErrorMessage(null);
    }
  }, [open, setTitle, approvedQuestions.length]);

  const chosenQuestions = React.useMemo(() => {
    if (selectionMode === "all") {
      return approvedQuestions;
    }
    if (selectionMode === "filter") {
      return approvedQuestions.filter((q) => {
        if (selectedTopic && (q.topic ?? "").trim() !== selectedTopic) {
          return false;
        }
        if (selectedDifficulty && (q.difficulty ?? "") !== selectedDifficulty) {
          return false;
        }
        return true;
      });
    }
    const shuffled = deterministicShuffle(approvedQuestions, randomSeed);
    const clamped = Math.max(
      1,
      Math.min(randomCount || 1, approvedQuestions.length)
    );
    return shuffled.slice(0, clamped);
  }, [
    approvedQuestions,
    selectionMode,
    selectedTopic,
    selectedDifficulty,
    randomCount,
    randomSeed,
  ]);

  if (!open) return null;

  const pointsPerQuestion =
    chosenQuestions.length > 0
      ? Math.round((totalPoints / chosenQuestions.length) * 100) / 100
      : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (chosenQuestions.length === 0) {
      setErrorMessage(vi.exams.create.noApprovedError);
      return;
    }

    const cleanTitle = examTitle.trim();
    if (!cleanTitle) {
      setErrorMessage(vi.importSet.validation.titleRequired);
      return;
    }

    const parsedDuration = durationMin.trim()
      ? Number.parseInt(durationMin.trim(), 10)
      : null;

    const opensAtIso = opensAt ? new Date(opensAt).toISOString() : null;
    const closesAtIso = closesAt ? new Date(closesAt).toISOString() : null;

    if (opensAtIso && closesAtIso) {
      if (new Date(closesAtIso).getTime() <= new Date(opensAtIso).getTime()) {
        setErrorMessage(vi.exams.create.invalidTimeWindowError);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId,
          title: cleanTitle,
          questionIds: chosenQuestions.map((q) => q.id),
          totalPoints: Number(totalPoints) || 10,
          durationMin:
            parsedDuration && parsedDuration > 0 ? parsedDuration : null,
          maxAttempts: Math.max(1, Number(maxAttempts) || 1),
          opensAt: opensAtIso,
          closesAt: closesAtIso,
          shuffleQuestions,
          shuffleChoices,
          showAnswers,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.importSet.errors.saveFailed);
      }

      const payload = data as { examId: string; code: string };
      onClose();
      router.push(`/dashboard/exams/${payload.examId}`);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : vi.importSet.errors.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-exam-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="create-exam-modal-title"
              className="text-lg font-bold text-slate-900"
            >
              {vi.exams.create.modalTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {vi.exams.create.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] cursor-pointer rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {approvedQuestions.length === 0 ? (
          <div className="mt-4 space-y-4">
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              {vi.review.createExamNoApprovedWarning}
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                {vi.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            {errorMessage ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="exam-title">{vi.exams.create.titleLabel}</Label>
              <Input
                id="exam-title"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder={vi.exams.create.titlePlaceholder}
                required
                maxLength={150}
              />
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <Label>{vi.exams.create.selectionModeLabel}</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["all", vi.exams.create.modeAll],
                    ["filter", vi.exams.create.modeFilter],
                    ["random", vi.exams.create.modeRandom],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSelectionMode(mode);
                      if (mode === "random") {
                        setRandomSeed(String(Date.now()));
                      }
                    }}
                    className={`min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      selectionMode === mode
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectionMode === "filter" ? (
                <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="exam-filter-topic" className="text-xs">
                      {vi.exams.create.topicFilterLabel}
                    </Label>
                    <select
                      id="exam-filter-topic"
                      value={selectedTopic}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">{vi.exams.create.allTopicsOption}</option>
                      {distinctTopics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="exam-filter-diff" className="text-xs">
                      {vi.exams.create.difficultyFilterLabel}
                    </Label>
                    <select
                      id="exam-filter-diff"
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">
                        {vi.exams.create.allDifficultiesOption}
                      </option>
                      <option value="easy">{vi.review.difficulties.easy}</option>
                      <option value="medium">
                        {vi.review.difficulties.medium}
                      </option>
                      <option value="hard">{vi.review.difficulties.hard}</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {selectionMode === "random" ? (
                <div className="pt-2">
                  <Label htmlFor="exam-random-count" className="text-xs">
                    {vi.exams.create.randomCountLabel} (1 -{" "}
                    {approvedQuestions.length})
                  </Label>
                  <Input
                    id="exam-random-count"
                    type="number"
                    min={1}
                    max={approvedQuestions.length}
                    value={randomCount}
                    onChange={(e) =>
                      setRandomCount(Number.parseInt(e.target.value, 10) || 1)
                    }
                    className="mt-1 max-w-[160px]"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                <span className="font-semibold text-teal-900">
                  {vi.exams.create.selectedQuestionsSummaryPrefix}{" "}
                  <strong>{chosenQuestions.length}</strong>{" "}
                  {vi.exams.create.selectedQuestionsSummarySuffix}
                </span>
                <span className="text-slate-600">
                  {vi.exams.create.pointsPerQuestionHintPrefix}{" "}
                  <strong>{pointsPerQuestion}</strong>{" "}
                  {vi.exams.create.pointsUnit}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="exam-total-points">
                  {vi.exams.create.totalPointsLabel}
                </Label>
                <Input
                  id="exam-total-points"
                  type="number"
                  step="0.5"
                  min={1}
                  max={100}
                  value={totalPoints}
                  onChange={(e) =>
                    setTotalPoints(Number.parseFloat(e.target.value) || 10)
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="exam-duration">
                  {vi.exams.create.durationLabel}
                </Label>
                <Input
                  id="exam-duration"
                  type="number"
                  min={1}
                  max={300}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  placeholder={vi.exams.create.durationPlaceholder}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="exam-max-attempts">
                  {vi.exams.create.maxAttemptsLabel}
                </Label>
                <Input
                  id="exam-max-attempts"
                  type="number"
                  min={1}
                  max={50}
                  value={maxAttempts}
                  onChange={(e) =>
                    setMaxAttempts(Number.parseInt(e.target.value, 10) || 1)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="exam-opens-at">
                  {vi.exams.create.opensAtLabel}
                </Label>
                <Input
                  id="exam-opens-at"
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="exam-closes-at">
                  {vi.exams.create.closesAtLabel}
                </Label>
                <Input
                  id="exam-closes-at"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3.5 text-sm">
              <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600"
                />
                <span>{vi.exams.create.shuffleQuestionsLabel}</span>
              </label>

              <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={shuffleChoices}
                  onChange={(e) => setShuffleChoices(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600"
                />
                <span>{vi.exams.create.shuffleChoicesLabel}</span>
              </label>

              <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={showAnswers}
                  onChange={(e) => setShowAnswers(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600"
                />
                <span>{vi.exams.create.showAnswersLabel}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {vi.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || chosenQuestions.length === 0}
              >
                {isSubmitting
                  ? vi.exams.create.submittingButton
                  : vi.exams.create.submitButton}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
