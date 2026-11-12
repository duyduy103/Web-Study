"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExamQuestionSnapshot } from "@/lib/grading/types";
import type { AttemptStatus } from "@/lib/supabase/types";

export interface TeacherExamQuestionItem {
  examQuestionId: string;
  questionId: string | null;
  points: number;
  position: number;
  snapshot: ExamQuestionSnapshot;
}

export interface TeacherAttemptAnswerItem {
  examQuestionId: string | null;
  questionId: string | null;
  response: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  needsReview: boolean;
}

export interface TeacherAttemptItem {
  id: string;
  studentName: string;
  studentClass: string | null;
  startedAt: string;
  submittedAt: string | null;
  status: AttemptStatus;
  score: number | null;
  needsManualReview: boolean;
  answers: TeacherAttemptAnswerItem[];
}

interface AttemptGradingModalProps {
  open: boolean;
  examId: string;
  totalPoints: number;
  questions: TeacherExamQuestionItem[];
  attempt: TeacherAttemptItem | null;
  onClose: () => void;
  onGradeUpdated: (payload: {
    attemptId: string;
    examQuestionId: string;
    pointsAwarded: number;
    isCorrect: boolean;
    newTotalScore: number;
    needsManualReview: boolean;
  }) => void;
}

export function AttemptGradingModal({
  open,
  examId,
  totalPoints,
  questions,
  attempt,
  onClose,
  onGradeUpdated,
}: AttemptGradingModalProps) {
  const [savingQuestionId, setSavingQuestionId] = React.useState<string | null>(
    null
  );
  const [customPointsByEqId, setCustomPointsByEqId] = React.useState<
    Record<string, string>
  >({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (attempt) {
      const nextMap: Record<string, string> = {};
      for (const q of questions) {
        const ans = attempt.answers.find(
          (a) => a.examQuestionId === q.examQuestionId
        );
        nextMap[q.examQuestionId] = String(ans?.pointsAwarded ?? 0);
      }
      setCustomPointsByEqId(nextMap);
      setNotice(null);
      setErrorMsg(null);
    }
  }, [attempt, questions]);

  if (!open || !attempt) return null;

  async function submitManualGrade(
    examQuestionId: string,
    pointsAwarded: number,
    isCorrect: boolean
  ) {
    if (!attempt) return;
    setSavingQuestionId(examQuestionId);
    setNotice(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_grade",
          attemptId: attempt.id,
          examQuestionId,
          pointsAwarded,
          isCorrect,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.review.editor.errorStatus);
      }

      const payload = data as {
        attemptId: string;
        examQuestionId: string;
        pointsAwarded: number;
        isCorrect: boolean;
        newTotalScore: number;
        needsManualReview: boolean;
      };

      setCustomPointsByEqId((prev) => ({
        ...prev,
        [examQuestionId]: String(payload.pointsAwarded),
      }));
      onGradeUpdated(payload);
      setNotice(vi.exams.results.gradeSavedNotice);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
    } finally {
      setSavingQuestionId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {vi.exams.results.attemptModalTitlePrefix} {attempt.studentName}
              {attempt.studentClass ? ` (${attempt.studentClass})` : ""}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {vi.exams.results.colScore}:{" "}
              <strong className="text-teal-800">
                {attempt.score ?? 0}/{totalPoints}
              </strong>
              {attempt.needsManualReview ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  {vi.exams.results.provisionalBadge}
                </span>
              ) : null}
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

        {notice ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900">
            {notice}
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800">
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {questions.map((q, index) => {
            const ans = attempt.answers.find(
              (a) => a.examQuestionId === q.examQuestionId
            );
            const snap = q.snapshot;
            const rawResponse = ans?.response ?? "";

            let formattedStudentAnswer = rawResponse.trim();
            let formattedExpectedAnswer = snap.answer_text ?? "";

            if (snap.type === "mcq" || snap.type === "true_false") {
              const chosenChoice = snap.choices.find(
                (c) => c.id === rawResponse.trim()
              );
              if (chosenChoice) {
                formattedStudentAnswer = chosenChoice.text;
              }
              const correctChoice = snap.choices.find((c) => c.is_correct);
              if (correctChoice) {
                formattedExpectedAnswer = correctChoice.text;
              }
            }

            const isSavingThis = savingQuestionId === q.examQuestionId;

            return (
              <div
                key={q.examQuestionId}
                className={`rounded-2xl border p-4 ${
                  ans?.needsReview
                    ? "border-amber-300 bg-amber-50/40"
                    : ans?.isCorrect
                      ? "border-emerald-200 bg-emerald-50/20"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                      {vi.setDetails.questionNumberPrefix} {index + 1}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      ({q.points} điểm)
                    </span>
                    {ans?.needsReview ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        {vi.studentExam.result.statusNeedsTeacherReview}
                      </span>
                    ) : ans?.isCorrect ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {vi.studentExam.result.statusCorrect} (+
                        {ans.pointsAwarded ?? q.points})
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        {vi.studentExam.result.statusIncorrect} (
                        {ans?.pointsAwarded ?? 0})
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-2.5 text-sm font-medium whitespace-pre-wrap text-slate-900">
                  {snap.stem}
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-slate-600">
                      {vi.exams.results.studentAnswerLabel}
                    </span>
                    <p className="mt-0.5 font-medium text-slate-900">
                      {formattedStudentAnswer ||
                        vi.exams.results.noStudentAnswer}
                    </p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-600">
                      {vi.exams.results.expectedAnswerLabel}
                    </span>
                    <p className="mt-0.5 font-semibold text-emerald-800">
                      {formattedExpectedAnswer}
                    </p>
                  </div>
                </div>

                {(snap.type === "short_answer" ||
                  snap.type === "cloze" ||
                  ans?.needsReview) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
                    <span className="text-xs font-semibold text-slate-700">
                      {vi.exams.results.manualGradeSectionTitle}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingThis}
                      onClick={() =>
                        void submitManualGrade(q.examQuestionId, q.points, true)
                      }
                      className="h-9 px-3 text-xs"
                    >
                      ✓ {vi.exams.results.markCorrectButton} ({q.points})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSavingThis}
                      onClick={() =>
                        void submitManualGrade(q.examQuestionId, 0, false)
                      }
                      className="h-9 px-3 text-xs"
                    >
                      ✕ {vi.exams.results.markWrongButton}
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-600">
                        {vi.exams.results.customPointsLabel}
                      </span>
                      <Input
                        type="number"
                        step="0.25"
                        min={0}
                        max={q.points}
                        value={customPointsByEqId[q.examQuestionId] ?? "0"}
                        onChange={(e) =>
                          setCustomPointsByEqId((prev) => ({
                            ...prev,
                            [q.examQuestionId]: e.target.value,
                          }))
                        }
                        className="h-9 w-20 px-2 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isSavingThis}
                        onClick={() => {
                          const pts =
                            Number.parseFloat(
                              customPointsByEqId[q.examQuestionId] ?? "0"
                            ) || 0;
                          void submitManualGrade(
                            q.examQuestionId,
                            pts,
                            pts > 0
                          );
                        }}
                        className="h-9 px-3 text-xs"
                      >
                        {isSavingThis
                          ? vi.exams.results.savingGradeButton
                          : vi.exams.results.saveGradeButton}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

