"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { getConfidenceTier } from "@/lib/review/filters";
import { validateQuestionForReview } from "@/lib/review/validation";
import type { ReviewQuestionItem } from "@/lib/review/types";

interface QuestionReviewCardProps {
  question: ReviewQuestionItem;
  isSelected: boolean;
  isFocused: boolean;
  onToggleSelect: () => void;
  onFocusCard: () => void;
  onStartEdit: () => void;
  onApprove: () => void;
  onArchive: () => void;
  onRestoreToDraft: () => void;
}

const SWIPE_THRESHOLD_PX = 90;

export function QuestionReviewCard({
  question,
  isSelected,
  isFocused,
  onToggleSelect,
  onFocusCard,
  onStartEdit,
  onApprove,
  onArchive,
  onRestoreToDraft,
}: QuestionReviewCardProps) {
  const [showSource, setShowSource] = React.useState(false);
  const [dragOffsetX, setDragOffsetX] = React.useState(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const isHorizontalSwipeRef = React.useRef<boolean | null>(null);

  const validation = React.useMemo(
    () => validateQuestionForReview(question),
    [question]
  );

  const tier = getConfidenceTier(question.confidence);
  const confidenceBadge =
    tier === "high"
      ? {
          label: vi.setDetails.confidenceBadges.high,
          className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        }
      : tier === "medium"
        ? {
            label: vi.setDetails.confidenceBadges.medium,
            className: "border-amber-200 bg-amber-50 text-amber-800",
          }
        : {
            label: vi.setDetails.confidenceBadges.low,
            className: "border-red-200 bg-red-50 text-red-800",
          };

  const statusBadgeClass =
    question.status === "approved"
      ? "border-teal-300 bg-teal-50 font-semibold text-teal-900"
      : question.status === "archived"
        ? "border-slate-300 bg-slate-200 text-slate-700"
        : "border-slate-200 bg-slate-100 text-slate-700";

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    isHorizontalSwipeRef.current = null;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      // Chỉ nhận vuốt ngang khi độ lệch ngang lớn gấp đôi độ lệch dọc (tránh bấm nhầm khi cuộn)
      isHorizontalSwipeRef.current = Math.abs(dx) > Math.abs(dy) * 2;
    }

    if (isHorizontalSwipeRef.current) {
      const clamped = Math.max(-130, Math.min(130, dx));
      setDragOffsetX(clamped);
    }
  }

  function handleTouchEnd() {
    if (isHorizontalSwipeRef.current) {
      if (dragOffsetX >= SWIPE_THRESHOLD_PX && validation.valid) {
        onApprove();
      } else if (dragOffsetX <= -SWIPE_THRESHOLD_PX) {
        onArchive();
      }
    }
    setDragOffsetX(0);
    touchStartRef.current = null;
    isHorizontalSwipeRef.current = null;
  }

  const aiBadgeText =
    question.ai_generated &&
    (question.reviewed_by_human || question.status === "approved")
      ? vi.review.aiReviewedBadge
      : vi.app.aiBadge;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {dragOffsetX !== 0 ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-between px-5 text-xs font-bold ${
            dragOffsetX > 0
              ? "bg-emerald-100 text-emerald-900"
              : "bg-red-100 text-red-900"
          }`}
        >
          <span>
            {dragOffsetX >= SWIPE_THRESHOLD_PX
              ? vi.review.mobileSwipe.approveBadge
              : ""}
          </span>
          <span>
            {dragOffsetX <= -SWIPE_THRESHOLD_PX
              ? vi.review.mobileSwipe.archiveBadge
              : ""}
          </span>
        </div>
      ) : null}

      <article
        onClick={onFocusCard}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform:
            dragOffsetX !== 0 ? `translateX(${dragOffsetX}px)` : undefined,
        }}
        className={`space-y-3 rounded-2xl border bg-white p-4 transition-all sm:p-5 ${
          isFocused
            ? "border-teal-600 ring-2 ring-teal-600/20"
            : question.status === "approved"
              ? "border-emerald-200 bg-emerald-50/15"
              : question.status === "archived"
                ? "border-slate-200 bg-slate-50/70 opacity-75"
                : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                aria-label={`${vi.setDetails.questionNumberPrefix} ${question.orderNumber}`}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
            </label>

            <span className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white">
              {vi.setDetails.questionNumberPrefix} {question.orderNumber}
            </span>

            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {vi.parsing.questionTypes[question.type]}
            </span>

            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${statusBadgeClass}`}
            >
              {vi.setDetails.statusBadges[question.status]}
            </span>

            {question.ai_generated ? (
              <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-[11px] font-bold text-white">
                {aiBadgeText}
              </span>
            ) : null}

            {question.reviewed_by_human ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                ✓ {vi.review.reviewedByHumanBadge}
              </span>
            ) : (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${confidenceBadge.className}`}
              >
                {confidenceBadge.label}{" "}
                {question.confidence !== null
                  ? `(${Math.round(question.confidence * 100)}%)`
                  : ""}
              </span>
            )}

            {question.topic ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700">
                {question.topic}
              </span>
            ) : null}

            {question.difficulty &&
            question.difficulty in vi.review.difficulties ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700">
                {
                  vi.review.difficulties[
                    question.difficulty as keyof typeof vi.review.difficulties
                  ]
                }
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {question.source_ref || question.raw_source_text ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSource((prev) => !prev);
                }}
              >
                {showSource
                  ? vi.review.actions.hideSource
                  : vi.review.actions.viewSource}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
            >
              ✎ {vi.review.actions.editInline}
            </Button>

            {question.status !== "approved" ? (
              <Button
                type="button"
                size="sm"
                disabled={!validation.valid}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                ✓ {vi.review.actions.approve}
              </Button>
            ) : (
              <span className="inline-flex min-h-[44px] items-center rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800">
                {vi.review.actions.approved}
              </span>
            )}

            {question.status !== "archived" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                ✕ {vi.review.actions.archive}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreToDraft();
                }}
              >
                ↶ {vi.review.actions.restore}
              </Button>
            )}
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Bấm để chỉnh sửa câu hỏi này"
          onClick={onStartEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onStartEdit();
            }
          }}
          className="cursor-pointer space-y-2.5 rounded-xl p-1 transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
        >
          <p className="text-sm font-medium text-slate-900 sm:text-base">
            {question.stem}
          </p>

          {question.choices.length > 0 ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {question.choices.map((c, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return (
                  <li
                    key={c.id ?? idx}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm ${
                      c.is_correct
                        ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-900"
                        : "border-slate-200 bg-slate-50/60 text-slate-700"
                    }`}
                  >
                    <span>
                      <strong className="font-bold">{letter}.</strong> {c.text}{" "}
                      {c.is_correct ? "✓" : ""}
                    </span>
                    {c.ai_generated ? (
                      <span className="shrink-0 rounded-full bg-teal-700/90 px-2 py-0.5 text-[10px] font-bold text-white">
                        {vi.app.aiBadge}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs sm:text-sm">
              <span className="font-semibold text-slate-700">
                {vi.setDetails.correctAnswerLabel}{" "}
              </span>
              {question.answer_text ? (
                <span className="font-semibold text-emerald-800">
                  {question.answer_text}
                </span>
              ) : (
                <span className="font-medium text-red-600">
                  {vi.setDetails.noAnswerFound}
                </span>
              )}
            </div>
          )}

          {question.explanation ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 py-2 text-xs text-sky-950">
              <strong>{vi.setDetails.explanationLabel}</strong>{" "}
              {question.explanation}
            </p>
          ) : null}
        </div>

        {!validation.valid ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800"
          >
            <strong>{vi.review.validation.cannotApprovePrefix}</strong>{" "}
            {validation.errors.join(" • ")}
          </div>
        ) : null}

        {question.warnings.length > 0 ? (
          <div
            className={`rounded-xl border px-3.5 py-2 text-xs ${
              question.reviewed_by_human
                ? "border-slate-200 bg-slate-50 text-slate-600"
                : "border-amber-200 bg-amber-50/80 text-amber-900"
            }`}
          >
            <span className="font-semibold">
              {vi.setDetails.warningsTitle}{" "}
            </span>
            {question.warnings.join(" • ")}
          </div>
        ) : null}

        {showSource ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="mb-1 font-semibold text-slate-900">
              {vi.review.editor.sourcePanelTitle}{" "}
              {question.source_ref ? `(${question.source_ref})` : ""}
            </div>
            <pre className="font-sans whitespace-pre-wrap">
              {question.raw_source_text ||
                question.source_ref ||
                vi.review.editor.noSourceAvailable}
            </pre>
          </div>
        ) : null}
      </article>
    </div>
  );
}

