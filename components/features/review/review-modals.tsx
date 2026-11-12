"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import type { GreenBulkEvaluation } from "@/lib/review/types";

interface ConfirmGreenBulkModalProps {
  open: boolean;
  evaluation: GreenBulkEvaluation;
  isMutating: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmGreenBulkModal({
  open,
  evaluation,
  isMutating,
  onConfirm,
  onClose,
}: ConfirmGreenBulkModalProps) {
  if (!open) return null;

  const { eligibleIds, skippedBreakdown } = evaluation;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="green-bulk-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <h3 id="green-bulk-title" className="text-lg font-bold text-slate-900">
          {vi.review.confirmGreenModal.title}
        </h3>

        {eligibleIds.length > 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-950">
            {vi.review.confirmGreenModal.eligibleSummaryPrefix}{" "}
            <strong className="text-base font-bold text-emerald-800">
              {eligibleIds.length}
            </strong>{" "}
            {vi.review.confirmGreenModal.eligibleSummarySuffix}
          </p>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950">
            {vi.review.confirmGreenModal.noEligibleMessage}
          </p>
        )}

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
          <div className="font-bold text-slate-900">
            {vi.review.confirmGreenModal.skippedTitle}
          </div>
          <ul className="space-y-1 pl-4 list-disc">
            <li>
              <strong>{skippedBreakdown.aiGenerated}</strong>{" "}
              {vi.review.confirmGreenModal.skipReasonAi}
            </li>
            <li>
              <strong>{skippedBreakdown.mediumOrLowConfidence}</strong>{" "}
              {vi.review.confirmGreenModal.skipReasonMediumLow}
            </li>
            <li>
              <strong>{skippedBreakdown.hasWarnings}</strong>{" "}
              {vi.review.confirmGreenModal.skipReasonWarnings}
            </li>
            <li>
              <strong>{skippedBreakdown.invalid}</strong>{" "}
              {vi.review.confirmGreenModal.skipReasonInvalid}
            </li>
            <li>
              <strong>{skippedBreakdown.alreadyProcessed}</strong>{" "}
              {vi.review.confirmGreenModal.skipReasonAlreadyProcessed}
            </li>
          </ul>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {vi.common.cancel}
          </Button>
          {eligibleIds.length > 0 ? (
            <Button
              type="button"
              disabled={isMutating}
              onClick={onConfirm}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              ✓ {vi.review.confirmGreenModal.confirmButton} ({eligibleIds.length})
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ConfirmManualBulkModalProps {
  open: boolean;
  totalSelectedValid: number;
  aiOrWarningCount: number;
  isMutating: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmManualBulkModal({
  open,
  totalSelectedValid,
  aiOrWarningCount,
  isMutating,
  onConfirm,
  onClose,
}: ConfirmManualBulkModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-bulk-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <h3 id="manual-bulk-title" className="text-lg font-bold text-slate-900">
          {vi.review.confirmManualBulkModal.title}
        </h3>

        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-950">
          {vi.review.confirmManualBulkModal.warningDescriptionPrefix}{" "}
          <strong>{totalSelectedValid}</strong>{" "}
          {vi.review.confirmManualBulkModal.warningDescriptionMiddle}{" "}
          <strong>{aiOrWarningCount}</strong>{" "}
          {vi.review.confirmManualBulkModal.warningDescriptionSuffix}
        </p>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {vi.common.cancel}
          </Button>
          <Button type="button" disabled={isMutating} onClick={onConfirm}>
            ✓ {vi.review.confirmManualBulkModal.confirmButton} (
            {totalSelectedValid})
          </Button>
        </div>
      </div>
    </div>
  );
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
        <div className="space-y-1">
          <h3
            id="shortcuts-modal-title"
            className="text-lg font-bold text-slate-900"
          >
            {vi.review.shortcutsModal.title}
          </h3>
          <p className="text-xs text-slate-600">
            {vi.review.shortcutsModal.subtitle}
          </p>
        </div>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
          {vi.review.shortcutsModal.items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs sm:text-sm"
            >
              <span className="text-slate-700">{item.description}</span>
              <kbd className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-900 shadow-2xs">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose}>
            {vi.common.closeNotification}
          </Button>
        </div>
      </div>
    </div>
  );
}

