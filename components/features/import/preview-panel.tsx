"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Label } from "@/components/ui/label";
import type { DocumentFormat, ParsedQuestion } from "@/lib/parsing/types";
import type { PreviewResponsePayload } from "@/lib/sets/import-service";

interface PreviewPanelProps {
  preview: PreviewResponsePayload;
  selectedFormat: DocumentFormat;
  onFormatChange: (format: DocumentFormat) => void;
}

const FORMAT_OPTIONS: DocumentFormat[] = [
  "mcq_inline",
  "mcq_with_key_table",
  "qa_pairs",
  "true_false",
  "cloze",
  "spreadsheet",
];

function getConfidenceBadgeProps(confidence: number) {
  if (confidence >= 0.8) {
    return {
      label: vi.setDetails.confidenceBadges.high,
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (confidence >= 0.5) {
    return {
      label: vi.setDetails.confidenceBadges.medium,
      className: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }
  return {
    label: vi.setDetails.confidenceBadges.low,
    className: "bg-red-50 text-red-800 border-red-200",
  };
}

export function PreviewPanel({
  preview,
  selectedFormat,
  onFormatChange,
}: PreviewPanelProps) {
  const formatName = vi.parsing.formats[selectedFormat];

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900">
            {vi.importSet.previewSectionTitle}
          </h3>
          <p className="text-sm text-slate-700">
            {vi.importSet.detectedSummaryPrefix}{" "}
            <strong className="font-bold text-teal-700">
              {preview.totalQuestions}
            </strong>{" "}
            {vi.importSet.detectedSummaryUnit}{" "}
            <span className="font-semibold text-slate-900">{formatName}</span>
          </p>
        </div>

        {!preview.isSpreadsheet ? (
          <div className="w-full sm:w-72">
            <Label htmlFor="override-format" className="mb-1.5 text-xs">
              {vi.importSet.changeFormatLabel}
            </Label>
            <select
              id="override-format"
              value={selectedFormat}
              onChange={(e) =>
                onFormatChange(e.target.value as DocumentFormat)
              }
              className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:outline-none"
            >
              {FORMAT_OPTIONS.filter((f) => f !== "spreadsheet").map((fmt) => (
                <option key={fmt} value={fmt}>
                  {vi.parsing.formats[fmt]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
          <div className="text-lg font-bold text-emerald-800">
            {preview.confidenceCounts.high}
          </div>
          <div className="text-xs text-emerald-700">
            {vi.importSet.confidenceStatsHigh}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
          <div className="text-lg font-bold text-amber-800">
            {preview.confidenceCounts.medium}
          </div>
          <div className="text-xs text-amber-700">
            {vi.importSet.confidenceStatsMedium}
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2">
          <div className="text-lg font-bold text-red-800">
            {preview.confidenceCounts.low}
          </div>
          <div className="text-xs text-red-700">
            {vi.importSet.confidenceStatsLow}
          </div>
        </div>
      </div>

      {preview.globalWarnings.length > 0 ? (
        <div
          role="alert"
          className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          {preview.globalWarnings.map((w, idx) => (
            <p key={idx}>• {w}</p>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {vi.importSet.previewFirstQuestionsTitle}
        </h4>

        {preview.previewQuestions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
            {vi.importSet.previewNoQuestions}
          </p>
        ) : (
          <div className="space-y-3">
            {preview.previewQuestions.map((q: ParsedQuestion, idx: number) => {
              const badge = getConfidenceBadgeProps(q.confidence);
              return (
                <div
                  key={idx}
                  className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-teal-800">
                      {vi.setDetails.questionNumberPrefix} {idx + 1} •{" "}
                      {vi.parsing.questionTypes[q.type]}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label} ({Math.round(q.confidence * 100)}%)
                    </span>
                  </div>

                  <p className="text-sm font-medium text-slate-900">{q.stem}</p>

                  {q.choices && q.choices.length > 0 ? (
                    <ul className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                      {q.choices.map((c, cIdx) => {
                        const letter = String.fromCharCode(65 + cIdx);
                        return (
                          <li
                            key={cIdx}
                            className={`rounded-lg border px-2.5 py-1.5 ${
                              c.isCorrect
                                ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-900"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {letter}. {c.text}{" "}
                            {c.isCorrect ? "✓" : ""}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold">
                        {vi.setDetails.correctAnswerLabel}
                      </span>{" "}
                      {q.answerText ? (
                        <span className="font-medium text-emerald-800">
                          {q.answerText}
                        </span>
                      ) : (
                        <span className="text-red-600">
                          {vi.setDetails.noAnswerFound}
                        </span>
                      )}
                    </p>
                  )}

                  {q.warnings.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs text-amber-900">
                      {q.warnings.join(" • ")}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

