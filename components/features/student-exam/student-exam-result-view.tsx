"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import type { AttemptStatus, QuestionType } from "@/lib/supabase/types";

export interface StudentQuestionPayload {
  exam_question_id: string;
  question_id: string | null;
  points: number;
  position: number;
  type: QuestionType;
  stem: string;
  choices: Array<{
    id: string;
    text: string;
    position: number;
    is_correct?: boolean;
  }>;
  answer_text: string | null;
  explanation: string | null;
}

export interface StudentAnswerPayload {
  exam_question_id: string;
  question_id: string | null;
  response: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
  needs_review: boolean;
}

export interface StudentAttemptState {
  exam: {
    id: string;
    code: string;
    title: string;
    duration_min: number | null;
    is_open: boolean;
    show_answers: boolean;
    opens_at: string | null;
    closes_at: string | null;
    total_points: number;
  };
  attempt: {
    id: string;
    student_name: string;
    student_class: string | null;
    started_at: string;
    submitted_at: string | null;
    deadline_at: string | null;
    status: AttemptStatus;
    score: number | null;
    needs_manual_review: boolean;
    question_order: string[];
    choice_orders: Record<string, string[]>;
    flagged_questions: string[];
  };
  questions: StudentQuestionPayload[];
  answers: StudentAnswerPayload[];
  server_now: string;
}

interface StudentExamResultViewProps {
  state: StudentAttemptState;
  orderedQuestions: StudentQuestionPayload[];
  maxAttempts: number;
  onStartNewAttempt: () => void;
}

export function StudentExamResultView({
  state,
  orderedQuestions,
  maxAttempts,
  onStartNewAttempt,
}: StudentExamResultViewProps) {
  const { exam, attempt, answers } = state;

  const answerByEqId = React.useMemo(() => {
    const map = new Map<string, StudentAnswerPayload>();
    for (const a of answers) {
      map.set(a.exam_question_id, a);
    }
    return map;
  }, [answers]);

  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const pendingReviewCount = answers.filter((a) => a.needs_review).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:py-10">
      <section className="rounded-3xl border border-teal-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span
          className={`inline-block rounded-full px-3.5 py-1 text-xs font-bold ${
            attempt.status === "expired"
              ? "bg-amber-100 text-amber-900"
              : "bg-emerald-100 text-emerald-900"
          }`}
        >
          {attempt.status === "expired"
            ? vi.studentExam.result.expiredBadge
            : vi.studentExam.result.submittedBadge}
        </span>

        <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
          {exam.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {attempt.student_name}
          {attempt.student_class ? ` • Lớp ${attempt.student_class}` : ""}
        </p>

        <div className="my-6 inline-flex flex-col items-center rounded-2xl border border-teal-200 bg-teal-50/70 px-8 py-5">
          <span className="text-xs font-semibold text-teal-800">
            {attempt.needs_manual_review
              ? vi.studentExam.result.provisionalScoreLabel
              : vi.studentExam.result.scoreLabel}
          </span>
          <div className="mt-1 text-4xl font-extrabold text-teal-950 sm:text-5xl">
            {attempt.score ?? 0}
            <span className="text-xl font-bold text-teal-700">
              /{exam.total_points}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <div className="text-lg font-bold text-emerald-900">
              {correctCount}/{orderedQuestions.length}
            </div>
            <div className="text-xs text-emerald-800">
              {vi.studentExam.result.correctCountLabel}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
            <div className="text-lg font-bold text-amber-900">
              {pendingReviewCount}
            </div>
            <div className="text-xs text-amber-800">
              {vi.studentExam.result.pendingReviewCountLabel}
            </div>
          </div>
        </div>

        {attempt.needs_manual_review ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-left text-xs leading-relaxed text-amber-950">
            💡 {vi.studentExam.result.provisionalNotice}
          </div>
        ) : null}

        {maxAttempts > 1 ? (
          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={onStartNewAttempt}
              className="min-h-[44px]"
            >
              Làm lại lượt mới (tối đa {maxAttempts} lượt)
            </Button>
          </div>
        ) : null}
      </section>

      {!exam.show_answers ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">
          {vi.studentExam.result.answersHiddenNotice}
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 sm:text-lg">
            {vi.studentExam.result.reviewDetailsTitle}
          </h2>

          {orderedQuestions.map((q, idx) => {
            const ans = answerByEqId.get(q.exam_question_id);
            const rawResp = (ans?.response ?? "").trim();

            let studentAnswerDisplay = rawResp;
            let correctAnswerDisplay = q.answer_text ?? "";

            if (q.type === "mcq" || q.type === "true_false") {
              const selectedChoice = q.choices.find((c) => c.id === rawResp);
              if (selectedChoice) {
                studentAnswerDisplay = selectedChoice.text;
              }
              const correctChoice = q.choices.find((c) => c.is_correct);
              if (correctChoice) {
                correctAnswerDisplay = correctChoice.text;
              }
            }

            return (
              <div
                key={q.exam_question_id}
                className={`rounded-2xl border bg-white p-4 shadow-2xs sm:p-5 ${
                  ans?.needs_review
                    ? "border-amber-300"
                    : ans?.is_correct
                      ? "border-emerald-200"
                      : "border-red-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                    {vi.studentExam.runner.questionPrefix} {idx + 1} ({q.points}{" "}
                    {vi.studentExam.runner.pointsSuffix})
                  </span>

                  {ans?.needs_review ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                      ⏳ {vi.studentExam.result.statusNeedsTeacherReview}
                    </span>
                  ) : ans?.is_correct ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
                      ✓ {vi.studentExam.result.statusCorrect} (+
                      {ans.points_awarded ?? q.points})
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-900">
                      ✕ {vi.studentExam.result.statusIncorrect} (0)
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm font-semibold whitespace-pre-wrap text-slate-900 sm:text-base">
                  {q.stem}
                </p>

                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs sm:text-sm">
                  <div>
                    <span className="font-semibold text-slate-600">
                      {vi.studentExam.result.yourAnswerLabel}{" "}
                    </span>
                    <span className="font-bold text-slate-900">
                      {studentAnswerDisplay ||
                        vi.studentExam.result.unansweredLabel}
                    </span>
                  </div>

                  {correctAnswerDisplay ? (
                    <div>
                      <span className="font-semibold text-slate-600">
                        {vi.studentExam.result.correctAnswerLabel}{" "}
                      </span>
                      <span className="font-bold text-emerald-800">
                        {correctAnswerDisplay}
                      </span>
                    </div>
                  ) : null}

                  {q.explanation ? (
                    <div className="border-t border-slate-200 pt-2 text-slate-700">
                      <span className="font-semibold text-teal-900">
                        {vi.studentExam.result.explanationLabel}{" "}
                      </span>
                      <span>{q.explanation}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

