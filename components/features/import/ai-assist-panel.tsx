"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import type { ParsedQuestion } from "@/lib/parsing/types";
import type { PreviewResponsePayload } from "@/lib/sets/import-service";

const BATCH_SIZE_QUESTIONS = 25;
const PAGES_PER_BATCH = 10;

interface BatchTaskItem {
  id: number;
  label: string;
  mode: "whole" | "fix_low_confidence";
  contextHint: string;
  batchText?: string;
  targetIndices?: number[];
  status: "pending" | "running" | "done" | "error";
  resultQuestions?: ParsedQuestion[];
  cacheHit?: boolean;
  errorMessage?: string;
}

interface AiAssistPanelProps {
  preview: PreviewResponsePayload;
  selectedFile: File | null;
  pastedText: string;
  onQuestionsUpdated: (
    nextQuestions: ParsedQuestion[],
    nextRemainingQuota?: number
  ) => void;
}

export function AiAssistPanel({
  preview,
  selectedFile,
  pastedText,
  onQuestionsUpdated,
}: AiAssistPanelProps) {
  const [batches, setBatches] = React.useState<BatchTaskItem[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [remainingQuota, setRemainingQuota] = React.useState(
    preview.remainingAiQuota
  );
  const [lastCacheHit, setLastCacheHit] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setRemainingQuota(preview.remainingAiQuota);
  }, [preview.remainingAiQuota]);

  function buildBatches(mode: "whole" | "fix_low_confidence"): BatchTaskItem[] {
    if (mode === "fix_low_confidence") {
      const lowEntries: Array<{ index: number; q: ParsedQuestion }> = [];
      preview.allQuestions.forEach((q, index) => {
        if (q.confidence < 0.8) {
          lowEntries.push({ index, q });
        }
      });

      const items: BatchTaskItem[] = [];
      for (let i = 0; i < lowEntries.length; i += BATCH_SIZE_QUESTIONS) {
        const chunk = lowEntries.slice(i, i + BATCH_SIZE_QUESTIONS);
        const batchNumber = items.length + 1;
        const totalBatches = Math.ceil(
          lowEntries.length / BATCH_SIZE_QUESTIONS
        );
        const combinedText = chunk
          .map(
            (entry, idx) =>
              `--- CÂU #${idx + 1} (${entry.q.sourceRef}) ---\n${
                entry.q.rawBlockText ?? entry.q.stem
              }`
          )
          .join("\n\n");

        items.push({
          id: batchNumber,
          label: `${vi.ai.suggestion.progressProcessingBatchPrefix} ${batchNumber}/${totalBatches}`,
          mode: "fix_low_confidence",
          contextHint: `Lô ${batchNumber}/${totalBatches}`,
          batchText: combinedText,
          targetIndices: chunk.map((c) => c.index),
          status: "pending",
        });
      }
      return items;
    }

    // Chế độ whole
    if (preview.isMultimodal && (preview.pageCount ?? 1) > PAGES_PER_BATCH) {
      const totalPages = preview.pageCount ?? 1;
      const items: BatchTaskItem[] = [];
      for (let start = 1; start <= totalPages; start += PAGES_PER_BATCH) {
        const end = Math.min(totalPages, start + PAGES_PER_BATCH - 1);
        const batchNumber = items.length + 1;
        items.push({
          id: batchNumber,
          label: `${vi.ai.suggestion.progressReadingPagesPrefix} ${start}-${end}...`,
          mode: "whole",
          contextHint: `Chỉ trích xuất các câu hỏi thuộc từ Trang ${start} đến Trang ${end}`,
          status: "pending",
        });
      }
      return items;
    }

    return [
      {
        id: 1,
        label: preview.isMultimodal
          ? `${vi.ai.suggestion.progressReadingPagesPrefix} 1-${preview.pageCount ?? 1}...`
          : `${vi.ai.suggestion.progressProcessingBatchPrefix} 1/1...`,
        mode: "whole",
        contextHint: preview.isMultimodal
          ? `Trang 1-${preview.pageCount ?? 1}`
          : "Toàn bộ văn bản",
        batchText: preview.isMultimodal
          ? undefined
          : preview.rawExtractedText || pastedText,
        status: "pending",
      },
    ];
  }

  async function executeBatchList(taskList: BatchTaskItem[]) {
    setIsRunning(true);
    setLastCacheHit(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const updatedList = [...taskList];
    let latestQuota: number | undefined;
    let anyCacheHit = false;

    for (let i = 0; i < updatedList.length; i++) {
      if (controller.signal.aborted) {
        break;
      }
      if (updatedList[i].status === "done") {
        continue;
      }

      updatedList[i] = { ...updatedList[i], status: "running", errorMessage: undefined };
      setBatches([...updatedList]);

      try {
        const formData = new FormData();
        formData.append("mode", updatedList[i].mode);
        formData.append("contextHint", updatedList[i].contextHint);

        if (updatedList[i].batchText) {
          formData.append("batchText", updatedList[i].batchText!);
        } else if (selectedFile) {
          formData.append("file", selectedFile);
        } else if (pastedText.trim()) {
          formData.append("pastedText", pastedText.trim());
        }

        const res = await fetch("/api/ai/parse-batch", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        const data: unknown = await res.json();
        if (!res.ok) {
          const errObj = data as { error?: string };
          throw new Error(errObj.error ?? vi.ai.callFailed);
        }

        const payload = data as {
          questions: ParsedQuestion[];
          cacheHit: boolean;
          remainingQuota?: number;
        };

        if (payload.cacheHit) {
          anyCacheHit = true;
        }
        if (typeof payload.remainingQuota === "number") {
          latestQuota = payload.remainingQuota;
          setRemainingQuota(payload.remainingQuota);
        }

        updatedList[i] = {
          ...updatedList[i],
          status: "done",
          resultQuestions: payload.questions,
          cacheHit: payload.cacheHit,
        };
        setBatches([...updatedList]);
      } catch (err) {
        if (controller.signal.aborted) {
          updatedList[i] = { ...updatedList[i], status: "pending" };
          setBatches([...updatedList]);
          break;
        }
        updatedList[i] = {
          ...updatedList[i],
          status: "error",
          errorMessage: err instanceof Error ? err.message : vi.ai.callFailed,
        };
        setBatches([...updatedList]);
      }
    }

    setLastCacheHit(anyCacheHit);
    setIsRunning(false);

    // Hợp nhất kết quả các lô đã hoàn thành
    const completedBatches = updatedList.filter((b) => b.status === "done");
    if (completedBatches.length > 0) {
      const isFixMode = completedBatches[0].mode === "fix_low_confidence";
      if (isFixMode) {
        const merged = [...preview.allQuestions];
        for (const b of completedBatches) {
          const indices = b.targetIndices ?? [];
          const results = b.resultQuestions ?? [];
          indices.forEach((origIdx, k) => {
            if (results[k]) {
              merged[origIdx] = results[k];
            }
          });
        }
        onQuestionsUpdated(merged, latestQuota);
      } else {
        const combined: ParsedQuestion[] = [];
        for (const b of completedBatches) {
          combined.push(...(b.resultQuestions ?? []));
        }
        if (combined.length > 0) {
          onQuestionsUpdated(combined, latestQuota);
        }
      }
    }
  }

  function handleStart(mode: "whole" | "fix_low_confidence") {
    const newBatches = buildBatches(mode);
    setBatches(newBatches);
    void executeBatchList(newBatches);
  }

  function handleRetryFailed() {
    void executeBatchList(batches);
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  }

  const hasFailedBatches = batches.some((b) => b.status === "error");
  const canFixLow =
    !preview.isMultimodal &&
    preview.allQuestions.length > 0 &&
    preview.estimatedAiCallsFixLow > 0;

  return (
    <div
      className={`space-y-4 rounded-2xl border p-4 sm:p-5 ${
        preview.aiSuggested
          ? "border-teal-300 bg-teal-50/70"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-bold text-white">
              {vi.app.aiBadge}
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              {preview.isMultimodal
                ? vi.ai.suggestion.titlePdfOrImage
                : vi.ai.suggestion.titleLowConfidence}
            </h3>
            {lastCacheHit ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                {vi.ai.suggestion.cacheHitBadge}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-700">
            {preview.isMultimodal
              ? vi.ai.suggestion.descriptionPdf
              : vi.ai.suggestion.descriptionLowConfidence}
          </p>
          <p className="text-xs font-medium text-teal-900">
            {vi.ai.suggestion.estimatedCallsPrefix}{" "}
            <strong>
              {canFixLow
                ? `${preview.estimatedAiCallsFixLow}–${preview.estimatedAiCallsWhole}`
                : preview.estimatedAiCallsWhole}
            </strong>{" "}
            {vi.ai.suggestion.estimatedCallsUnit}{" "}
            {vi.ai.suggestion.remainingTodayPrefix}{" "}
            <strong>{remainingQuota}</strong> {vi.dashboard.aiQuotaUnit}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canFixLow ? (
            <Button
              type="button"
              size="sm"
              disabled={isRunning}
              onClick={() => handleStart("fix_low_confidence")}
            >
              {vi.ai.suggestion.runFixLowButton} (
              {preview.estimatedAiCallsFixLow} {vi.dashboard.aiQuotaUnit})
            </Button>
          ) : null}

          <Button
            type="button"
            variant={canFixLow ? "outline" : "default"}
            size="sm"
            disabled={isRunning}
            onClick={() => handleStart("whole")}
          >
            {preview.aiSuggested
              ? vi.ai.suggestion.runWholeButton
              : vi.ai.suggestion.tryAiManualButton}{" "}
            ({preview.estimatedAiCallsWhole} {vi.dashboard.aiQuotaUnit})
          </Button>

          {isRunning ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              {vi.ai.suggestion.cancelAiButton}
            </Button>
          ) : null}

          {!isRunning && hasFailedBatches ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRetryFailed}
            >
              {vi.ai.suggestion.retryFailedBatchesButton}
            </Button>
          ) : null}
        </div>
      </div>

      {batches.length > 0 ? (
        <div className="space-y-2 border-t border-teal-200/70 pt-3">
          {batches.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs"
            >
              <span className="font-medium text-slate-800">{b.label}</span>
              <div>
                {b.status === "running" ? (
                  <span className="font-semibold text-teal-700">
                    {vi.common.loading}
                  </span>
                ) : b.status === "done" ? (
                  <span className="font-semibold text-emerald-700">
                    ✓ {vi.ai.suggestion.batchCompletedPrefix} (
                    {b.resultQuestions?.length ?? 0})
                  </span>
                ) : b.status === "error" ? (
                  <span className="font-semibold text-red-600">
                    {vi.ai.suggestion.batchFailedPrefix} {b.errorMessage}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

