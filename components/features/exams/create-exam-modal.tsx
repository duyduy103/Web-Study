"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deterministicShuffle } from "@/lib/grading";
import {
  buildPrintExamPackage,
  MAX_PRINT_QUESTIONS,
  MAX_PRINT_VERSIONS,
  MIN_PRINT_VERSIONS,
} from "@/lib/export";
import type { PrintExamHeaderInfo } from "@/lib/export/types";
import type { ExamQuestionWithSnapshot } from "@/lib/grading/types";
import type { ReviewQuestionItem } from "@/lib/review/types";

type SelectionMode = "all" | "filter" | "random";

function useApprovedQuestionSelector(
  questions: ReviewQuestionItem[],
  open: boolean,
  maxCap = 300
) {
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

  const [selectionMode, setSelectionMode] =
    React.useState<SelectionMode>("all");
  const [selectedTopic, setSelectedTopic] = React.useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] =
    React.useState<string>("");
  const [randomCount, setRandomCount] = React.useState<number>(10);
  const [randomSeed, setRandomSeed] = React.useState<string>(() =>
    String(Date.now())
  );
  const [totalPoints, setTotalPoints] = React.useState<number>(10);

  React.useEffect(() => {
    if (open) {
      setRandomCount(
        Math.min(10, Math.max(1, Math.min(maxCap, approvedQuestions.length)))
      );
    }
  }, [open, approvedQuestions.length, maxCap]);

  const chosenQuestions = React.useMemo(() => {
    let list: ReviewQuestionItem[];
    if (selectionMode === "all") {
      list = approvedQuestions;
    } else if (selectionMode === "filter") {
      list = approvedQuestions.filter((q) => {
        if (selectedTopic && (q.topic ?? "").trim() !== selectedTopic) {
          return false;
        }
        if (selectedDifficulty && (q.difficulty ?? "") !== selectedDifficulty) {
          return false;
        }
        return true;
      });
    } else {
      const shuffled = deterministicShuffle(approvedQuestions, randomSeed);
      const clamped = Math.max(
        1,
        Math.min(randomCount || 1, approvedQuestions.length)
      );
      list = shuffled.slice(0, clamped);
    }
    return list.slice(0, maxCap);
  }, [
    approvedQuestions,
    selectionMode,
    selectedTopic,
    selectedDifficulty,
    randomCount,
    randomSeed,
    maxCap,
  ]);

  const pointsPerQuestion =
    chosenQuestions.length > 0
      ? Math.round((totalPoints / chosenQuestions.length) * 100) / 100
      : 0;

  return {
    approvedQuestions,
    distinctTopics,
    selectionMode,
    setSelectionMode,
    selectedTopic,
    setSelectedTopic,
    selectedDifficulty,
    setSelectedDifficulty,
    randomCount,
    setRandomCount,
    randomSeed,
    setRandomSeed,
    totalPoints,
    setTotalPoints,
    chosenQuestions,
    pointsPerQuestion,
  };
}

function ApprovedQuestionSelectorBox({
  selector,
  maxCap,
}: {
  selector: ReturnType<typeof useApprovedQuestionSelector>;
  maxCap?: number;
}) {
  const {
    approvedQuestions,
    distinctTopics,
    selectionMode,
    setSelectionMode,
    selectedTopic,
    setSelectedTopic,
    selectedDifficulty,
    setSelectedDifficulty,
    randomCount,
    setRandomCount,
    setRandomSeed,
    chosenQuestions,
    pointsPerQuestion,
  } = selector;

  const maxAllowed = Math.min(maxCap ?? 300, approvedQuestions.length);

  return (
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
            <Label className="text-xs">
              {vi.exams.create.topicFilterLabel}
            </Label>
            <select
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
            <Label className="text-xs">
              {vi.exams.create.difficultyFilterLabel}
            </Label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">{vi.exams.create.allDifficultiesOption}</option>
              <option value="easy">{vi.review.difficulties.easy}</option>
              <option value="medium">{vi.review.difficulties.medium}</option>
              <option value="hard">{vi.review.difficulties.hard}</option>
            </select>
          </div>
        </div>
      ) : null}

      {selectionMode === "random" ? (
        <div className="pt-2">
          <Label className="text-xs">
            {vi.exams.create.randomCountLabel} (1 - {maxAllowed})
          </Label>
          <Input
            type="number"
            min={1}
            max={maxAllowed}
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
          <strong>{pointsPerQuestion}</strong> {vi.exams.create.pointsUnit}
        </span>
      </div>
    </div>
  );
}

interface CreateExamModalProps {
  open: boolean;
  setId: string;
  setTitle: string;
  questions: ReviewQuestionItem[];
  onClose: () => void;
}

export function CreateExamModal({
  open,
  setId,
  setTitle,
  questions,
  onClose,
}: CreateExamModalProps) {
  const router = useRouter();
  const selector = useApprovedQuestionSelector(questions, open, 300);

  const [examTitle, setExamTitle] = React.useState(
    `${setTitle} - Bài kiểm tra`
  );
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
      setErrorMessage(null);
    }
  }, [open, setTitle]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selector.chosenQuestions.length === 0) {
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
          questionIds: selector.chosenQuestions.map((q) => q.id),
          totalPoints: Number(selector.totalPoints) || 10,
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

        {selector.approvedQuestions.length === 0 ? (
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
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-4 space-y-4"
          >
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

            <ApprovedQuestionSelectorBox selector={selector} maxCap={300} />

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
                  value={selector.totalPoints}
                  onChange={(e) =>
                    selector.setTotalPoints(
                      Number.parseFloat(e.target.value) || 10
                    )
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
                disabled={isSubmitting || selector.chosenQuestions.length === 0}
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

interface CreatePrintExamModalProps {
  open: boolean;
  setId: string;
  setTitle: string;
  setSubject: string | null;
  setGrade: string | null;
  defaultPrintHeader?: Partial<PrintExamHeaderInfo> | null;
  questions: ReviewQuestionItem[];
  onClose: () => void;
}

export function CreatePrintExamModal({
  open,
  setId,
  setTitle,
  setSubject,
  setGrade,
  defaultPrintHeader,
  questions,
  onClose,
}: CreatePrintExamModalProps) {
  const router = useRouter();
  const selector = useApprovedQuestionSelector(
    questions,
    open,
    MAX_PRINT_QUESTIONS
  );

  const [schoolName, setSchoolName] = React.useState(
    defaultPrintHeader?.schoolName ?? ""
  );
  const [examName, setExamName] = React.useState(
    `${setTitle} - Đề kiểm tra`
  );
  const [subject, setSubjectState] = React.useState(
    setSubject ?? defaultPrintHeader?.subject ?? ""
  );
  const [className, setClassName] = React.useState(
    setGrade ? `Khối ${setGrade}` : (defaultPrintHeader?.className ?? "")
  );
  const [durationMinutes, setDurationMinutes] = React.useState<string>(
    String(defaultPrintHeader?.durationMinutes ?? 45)
  );
  const [studentInfoLine, setStudentInfoLine] = React.useState(
    defaultPrintHeader?.studentInfoLine || vi.printExam.studentInfoLineDefault
  );

  const [versionCount, setVersionCount] = React.useState<number>(4);
  const [seed, setSeed] = React.useState<string>(
    () => `de-${setId.slice(0, 6)}`
  );
  const [shuffleQuestions, setShuffleQuestions] = React.useState(true);
  const [shuffleChoices, setShuffleChoices] = React.useState(true);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setExamName(`${setTitle} - Đề kiểm tra`);
      setErrorMessage(null);
    }
  }, [open, setTitle]);

  // Bản xem trước nhanh của Mã đề 101 ngay trong modal trước khi tải/lưu
  const previewVersion101 = React.useMemo(() => {
    if (selector.chosenQuestions.length === 0) return null;
    const sampleSource = selector.chosenQuestions;
    const count = sampleSource.length;
    const basePoint =
      Math.floor(((selector.totalPoints || 10) / count) * 100) / 100;

    const asSnapshots: ExamQuestionWithSnapshot[] = sampleSource.map(
      (q, idx) => ({
        examQuestionId: q.id,
        questionId: q.id,
        points: basePoint,
        position: idx,
        snapshot: {
          id: q.id,
          type: q.type,
          stem: q.stem,
          explanation: q.explanation,
          topic: q.topic,
          difficulty: q.difficulty,
          choices: q.choices.map((c, cIdx) => ({
            id: c.id ?? `${q.id}-c${cIdx}`,
            text: c.text,
            is_correct: c.is_correct,
            position: c.position,
          })),
          answer_text: q.answer_text ?? null,
          accepted_variants: [],
        },
      })
    );

    const pkg = buildPrintExamPackage({
      header: {
        schoolName,
        examName,
        subject,
        className,
        durationMinutes: Number.parseInt(durationMinutes, 10) || 45,
        studentInfoLine,
      },
      questions: asSnapshots,
      versionCount: 1,
      seed,
      shuffleQuestions,
      shuffleChoices,
    });

    return pkg.versions[0] ?? null;
  }, [
    selector.chosenQuestions,
    selector.totalPoints,
    schoolName,
    examName,
    subject,
    className,
    durationMinutes,
    studentInfoLine,
    seed,
    shuffleQuestions,
    shuffleChoices,
  ]);

  if (!open) return null;

  async function handleSubmitPrint(e: React.FormEvent) {
    e.preventDefault();
    if (selector.chosenQuestions.length === 0) {
      setErrorMessage(vi.exams.create.noApprovedError);
      return;
    }

    const cleanExamName = examName.trim();
    if (!cleanExamName) {
      setErrorMessage(vi.importSet.validation.titleRequired);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const parsedDuration = durationMinutes.trim()
        ? Number.parseInt(durationMinutes.trim(), 10)
        : null;

      const res = await fetch("/api/exams/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setId,
          questionIds: selector.chosenQuestions
            .slice(0, MAX_PRINT_QUESTIONS)
            .map((q) => q.id),
          totalPoints: Number(selector.totalPoints) || 10,
          versionCount: Math.max(
            MIN_PRINT_VERSIONS,
            Math.min(MAX_PRINT_VERSIONS, Number(versionCount) || 4)
          ),
          seed: seed.trim() || `de-${setId.slice(0, 6)}`,
          shuffleQuestions,
          shuffleChoices,
          header: {
            schoolName: schoolName.trim() || null,
            examName: cleanExamName,
            subject: subject.trim() || null,
            className: className.trim() || null,
            durationMinutes:
              parsedDuration && parsedDuration > 0 ? parsedDuration : null,
            studentInfoLine:
              studentInfoLine.trim() || vi.printExam.studentInfoLineDefault,
          },
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.importSet.errors.saveFailed);
      }

      const payload = data as { examId: string };
      onClose();
      router.push(`/dashboard/print/${payload.examId}`);
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
      aria-labelledby="create-print-exam-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="create-print-exam-modal-title"
              className="text-lg font-bold text-slate-900"
            >
              {vi.printExam.modalTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {vi.printExam.modalDescription}
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

        {selector.approvedQuestions.length === 0 ? (
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
          <form
            onSubmit={(e) => void handleSubmitPrint(e)}
            className="mt-4 space-y-4"
          >
            {errorMessage ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {errorMessage}
              </div>
            ) : null}

            {/* 1. Chọn câu hỏi (Tái dùng bộ chọn câu từ Bước 5) */}
            <ApprovedQuestionSelectorBox
              selector={selector}
              maxCap={MAX_PRINT_QUESTIONS}
            />
            <p className="text-[11px] text-slate-500">
              {vi.printExam.maxQuestionsLimitNotice}
            </p>

            {/* 2. Thông tin đầu đề */}
            <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs font-bold text-slate-800">
                {vi.printExam.headerSectionTitle}
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="print-school-name" className="text-xs">
                    {vi.printExam.schoolNameLabel}
                  </Label>
                  <Input
                    id="print-school-name"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder={vi.printExam.schoolNamePlaceholder}
                    maxLength={150}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-exam-name" className="text-xs">
                    {vi.printExam.examNameLabel}
                  </Label>
                  <Input
                    id="print-exam-name"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder={vi.printExam.examNamePlaceholder}
                    required
                    maxLength={150}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-subject" className="text-xs">
                    {vi.printExam.subjectLabel}
                  </Label>
                  <Input
                    id="print-subject"
                    value={subject}
                    onChange={(e) => setSubjectState(e.target.value)}
                    placeholder={vi.printExam.subjectPlaceholder}
                    maxLength={100}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-class" className="text-xs">
                    {vi.printExam.classLabel}
                  </Label>
                  <Input
                    id="print-class"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder={vi.printExam.classPlaceholder}
                    maxLength={100}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-duration" className="text-xs">
                    {vi.printExam.timeLabel}
                  </Label>
                  <Input
                    id="print-duration"
                    type="number"
                    min={1}
                    max={300}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-total-points" className="text-xs">
                    {vi.exams.create.totalPointsLabel}
                  </Label>
                  <Input
                    id="print-total-points"
                    type="number"
                    step="0.5"
                    min={1}
                    max={100}
                    value={selector.totalPoints}
                    onChange={(e) =>
                      selector.setTotalPoints(
                        Number.parseFloat(e.target.value) || 10
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="print-student-line" className="text-xs">
                  {vi.printExam.studentInfoLineLabel}
                </Label>
                <Input
                  id="print-student-line"
                  value={studentInfoLine}
                  onChange={(e) => setStudentInfoLine(e.target.value)}
                  maxLength={250}
                />
              </div>
            </div>

            {/* 3. Số lượng mã đề (1-8) & Trộn đề theo seed */}
            <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs font-bold text-slate-800">
                {vi.printExam.versionSectionTitle}
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="print-version-count" className="text-xs">
                    {vi.printExam.versionCountLabel}
                  </Label>
                  <Input
                    id="print-version-count"
                    type="number"
                    min={MIN_PRINT_VERSIONS}
                    max={MAX_PRINT_VERSIONS}
                    value={versionCount}
                    onChange={(e) =>
                      setVersionCount(
                        Math.max(
                          MIN_PRINT_VERSIONS,
                          Math.min(
                            MAX_PRINT_VERSIONS,
                            Number.parseInt(e.target.value, 10) || 1
                          )
                        )
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="print-seed" className="text-xs">
                    {vi.printExam.seedLabel}
                  </Label>
                  <Input
                    id="print-seed"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    maxLength={80}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1 text-sm sm:grid-cols-2">
                <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-600"
                  />
                  <span>{vi.printExam.shuffleQuestionsLabel}</span>
                </label>

                <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={shuffleChoices}
                    onChange={(e) => setShuffleChoices(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-600"
                  />
                  <span>{vi.printExam.shuffleChoicesLabel}</span>
                </label>
              </div>
            </div>

            {/* 4. Xem trước nhanh Mã đề 101 ngay trong modal */}
            {previewVersion101 ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-teal-950">
                    {vi.printExam.previewFirstVersionTitle}
                  </span>
                  <span className="rounded bg-teal-100 px-2 py-0.5 font-mono font-bold text-teal-900">
                    {vi.printExam.previewPage.examCodeBoxPrefix} 101
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {previewVersion101.questions.slice(0, 3).map((q) => (
                    <div
                      key={q.examQuestionId}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                    >
                      <p className="font-semibold">
                        {vi.printExam.previewPage.questionPrefix}{" "}
                        {q.displayNumber}: {q.displayStem}
                      </p>
                      {q.choices.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                          {q.choices.map((c) => (
                            <span
                              key={c.choiceId}
                              className={
                                c.isCorrect ? "font-bold text-emerald-700" : ""
                              }
                            >
                              {c.label}. {c.text}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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
                disabled={isSubmitting || selector.chosenQuestions.length === 0}
              >
                {isSubmitting
                  ? vi.printExam.creatingPrintButton
                  : vi.printExam.createAndPreviewButton}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
