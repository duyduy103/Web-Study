"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import type { ReviewSummaryStats } from "@/lib/review/filters";

interface ReviewHeaderStatsProps {
  title: string;
  subject: string | null;
  grade: string | null;
  createdAt: string;
  stats: ReviewSummaryStats;
  onOpenCreateExam: () => void;
  onOpenPrintExam: () => void;
}

export function ReviewHeaderStats({
  title,
  subject,
  grade,
  createdAt,
  stats,
  onOpenCreateExam,
  onOpenPrintExam,
}: ReviewHeaderStatsProps) {
  const approvedCount = stats.byStatus.approved;
  const activeTotal = Math.max(1, stats.total - stats.byStatus.archived);
  const progressPercent =
    stats.total > 0
      ? Math.min(100, Math.round((approvedCount / activeTotal) * 100))
      : 0;

  const isAllReviewed =
    stats.total > 0 &&
    stats.needsCheckCount === 0 &&
    stats.byStatus.draft === 0 &&
    approvedCount > 0;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {title}
          </h1>
          <p className="text-xs text-slate-600 sm:text-sm">
            {subject ?? vi.dashboard.setCard.subjectFallback} •{" "}
            {vi.dashboard.setCard.gradePrefix}{" "}
            {grade ?? vi.dashboard.setCard.gradeFallback} •{" "}
            {vi.dashboard.setCard.createdAtPrefix}{" "}
            {new Date(createdAt).toLocaleDateString("vi-VN")}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2.5 sm:w-96 sm:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onOpenPrintExam}
              className="flex-1 sm:flex-none"
            >
              {vi.printExam.openModalButton}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onOpenCreateExam}
              className="flex-1 sm:flex-none"
            >
              {vi.review.createExamButton}
            </Button>
          </div>

          <div className="w-full">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
              <span className="text-teal-900">
                {vi.review.progressApprovedPrefix} {approvedCount}/{activeTotal}{" "}
                {vi.review.progressApprovedUnit}
              </span>
              <span className="text-teal-700">{progressPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-center">
          <div className="text-base font-bold text-emerald-800 sm:text-lg">
            {stats.byConfidence.high}
          </div>
          <div className="text-[11px] font-medium text-emerald-700">
            {vi.review.filters.high}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-center">
          <div className="text-base font-bold text-amber-800 sm:text-lg">
            {stats.byConfidence.medium}
          </div>
          <div className="text-[11px] font-medium text-amber-700">
            {vi.review.filters.medium}
          </div>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-center">
          <div className="text-base font-bold text-red-800 sm:text-lg">
            {stats.byConfidence.low}
          </div>
          <div className="text-[11px] font-medium text-red-700">
            {vi.review.filters.low}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
          <div className="text-base font-bold text-slate-800 sm:text-lg">
            {stats.byStatus.draft}
          </div>
          <div className="text-[11px] font-medium text-slate-600">
            {vi.review.statusDraftLabel}
          </div>
        </div>

        <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-center">
          <div className="text-base font-bold text-teal-800 sm:text-lg">
            {stats.byStatus.approved}
          </div>
          <div className="text-[11px] font-medium text-teal-700">
            {vi.review.statusApprovedLabel}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2 text-center">
          <div className="text-base font-bold text-slate-700 sm:text-lg">
            {stats.byStatus.archived}
          </div>
          <div className="text-[11px] font-medium text-slate-600">
            {vi.review.statusArchivedLabel}
          </div>
        </div>
      </div>

      {isAllReviewed ? (
        <div
          role="status"
          className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 p-4 sm:flex-row sm:items-center"
        >
          <div className="space-y-1">
            <h2 className="text-base font-bold text-emerald-950">
              🎉 {vi.review.allReviewedBannerTitle}
            </h2>
            <p className="text-xs text-emerald-900 sm:text-sm">
              {vi.review.allReviewedBannerDescription}
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={onOpenCreateExam}
            className="shrink-0"
          >
            {vi.review.createExamButton}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

