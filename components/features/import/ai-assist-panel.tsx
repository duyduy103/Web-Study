"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import type { ParsedQuestion } from "@/lib/parsing/types";
import type { PreviewResponsePayload } from "@/lib/sets/import-service";

const BATCH_SIZE_QUESTIONS = 25;
const PAGES_PER_BATCH = 3;
const TEXT_CHARS_PER_BATCH = 5000;

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
  errorCode?: string;
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
  const [isGeneratingDistractors, setIsGeneratingDistractors] =
    React.useState(false);
  const [distractorUndoQuestions, setDistractorUndoQuestions] = React.useState<
    ParsedQuestion[] | null
  >(null);
  const [distractorError, setDistractorError] = React.useState<string | null>(
    null
  );
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

    // Chế độ whole cho văn bản dài: chia theo cụm 25 câu hoặc theo đoạn ~5000 ký tự
    if (!preview.isMultimodal) {
      if (preview.allQuestions.length > BATCH_SIZE_QUESTIONS) {
        const items: BatchTaskItem[] = [];
        const totalBatches = Math.ceil(
          preview.allQuestions.length / BATCH_SIZE_QUESTIONS
        );
        for (
          let i = 0;
          i < preview.allQuestions.length;
          i += BATCH_SIZE_QUESTIONS
        ) {
          const chunk = preview.allQuestions.slice(i, i + BATCH_SIZE_QUESTIONS);
          const batchNumber = items.length + 1;
          const combinedText = chunk
            .map(
              (q, idx) =>
                `--- CÂU #${i + idx + 1} (${q.sourceRef}) ---\n${
                  q.rawBlockText ?? q.stem
                }`
            )
            .join("\n\n");
          items.push({
            id: batchNumber,
            label: `${vi.ai.suggestion.progressProcessingBatchPrefix} ${batchNumber}/${totalBatches}...`,
            mode: "whole",
            contextHint: `Lô câu hỏi ${batchNumber}/${totalBatches} (từ câu ${
              i + 1
            } đến câu ${i + chunk.length})`,
            batchText: combinedText,
            status: "pending",
          });
        }
        return items;
      }

      const fullText = (preview.rawExtractedText || pastedText).trim();
      if (fullText.length > TEXT_CHARS_PER_BATCH) {
        const paragraphs = fullText.split(/\n{2,}/);
        const chunks: string[] = [];
        let currentChunk = "";
        for (const p of paragraphs) {
          if (
            currentChunk.length + p.length + 2 > TEXT_CHARS_PER_BATCH &&
            currentChunk.length > 0
          ) {
            chunks.push(currentChunk);
            currentChunk = p;
          } else {
            currentChunk = currentChunk ? `${currentChunk}\n\n${p}` : p;
          }
        }
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        if (chunks.length > 1) {
          return chunks.map((chunkText, idx) => ({
            id: idx + 1,
            label: `${vi.ai.suggestion.progressProcessingBatchPrefix} ${
              idx + 1
            }/${chunks.length}...`,
            mode: "whole",
            contextHint: `Phần văn bản ${idx + 1}/${chunks.length}`,
            batchText: chunkText,
            status: "pending",
          }));
        }
      }
    }

    return [
      {
        id: 1,
        label: preview.isMultimodal
          ? `${vi.ai.suggestion.progressReadingPagesPrefix} 1-${preview.pageCount ?? 1}...`
          : `${vi.ai.suggestion.progressProcessingBatchPrefix} 1/1...`,
        mode: "whole",
        contextHint: preview.isMultimodal
          ? `Chỉ trích xuất các câu hỏi thuộc từ Trang 1 đến Trang ${preview.pageCount ?? 1}`
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
          const errObj = data as { error?: string; code?: string };
          const customErr = new Error(errObj.error ?? vi.ai.callFailed) as Error & {
            code?: string;
          };
          customErr.code = errObj.code;
          throw customErr;
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
        const errWithCode = err as { message?: string; code?: string };
        updatedList[i] = {
          ...updatedList[i],
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : vi.ai.callFailed,
          errorCode: errWithCode?.code,
        };
        setBatches([...updatedList]);

        if (
          errWithCode?.code === "invalid_key" ||
          errWithCode?.code === "quota" ||
          errWithCode?.code === "app_limit" ||
          errWithCode?.code === "payload_too_large"
        ) {
          break;
        }
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

  const shortAnswerIndices = React.useMemo(() => {
    const indices: number[] = [];
    preview.allQuestions.forEach((q, idx) => {
      if (q.type === "short_answer" && q.answerText && q.answerText.trim()) {
        indices.push(idx);
      }
    });
    return indices;
  }, [preview.allQuestions]);

  async function handleGenerateDistractorsInPreview() {
    if (shortAnswerIndices.length === 0) return;

    setIsGeneratingDistractors(true);
    setDistractorError(null);
    const snapshotBefore = preview.allQuestions.map((q) => ({ ...q }));

    try {
      const updatedQuestions = [...preview.allQuestions];
      let latestQuota: number | undefined;

      for (let i = 0; i < shortAnswerIndices.length; i += BATCH_SIZE_QUESTIONS) {
        const chunkIndices = shortAnswerIndices.slice(
          i,
          i + BATCH_SIZE_QUESTIONS
        );
        const items = chunkIndices.map((idx) => ({
          questionId: String(idx),
          stem: preview.allQuestions[idx].stem,
          correctAnswer: preview.allQuestions[idx].answerText ?? "",
        }));

        const res = await fetch("/api/ai/distractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview_generate",
            items,
          }),
        });

        const data: unknown = await res.json();
        if (!res.ok) {
          const errObj = data as { error?: string; code?: string };
          const customErr = new Error(errObj.error ?? vi.ai.callFailed) as Error & {
            code?: string;
          };
          customErr.code = errObj.code;
          throw customErr;
        }

        const payload = data as {
          results: Array<{
            questionId: string;
            choices: Array<{
              text: string;
              isCorrect: boolean;
              aiGenerated: boolean;
            }>;
            explanation: string;
          }>;
          remainingQuota?: number;
        };

        if (typeof payload.remainingQuota === "number") {
          latestQuota = payload.remainingQuota;
          setRemainingQuota(payload.remainingQuota);
        }

        for (const out of payload.results) {
          const qIndex = Number(out.questionId);
          const orig = updatedQuestions[qIndex];
          if (orig) {
            updatedQuestions[qIndex] = {
              ...orig,
              type: "mcq",
              choices: out.choices,
              explanation: out.explanation,
              aiGenerated: true,
            };
          }
        }
      }

      setDistractorUndoQuestions(snapshotBefore);
      onQuestionsUpdated(updatedQuestions, latestQuota);
    } catch (err) {
      setDistractorError(
        err instanceof Error ? err.message : vi.ai.callFailed
      );
    } finally {
      setIsGeneratingDistractors(false);
    }
  }

  function handleUndoDistractorsInPreview() {
    if (!distractorUndoQuestions) return;
    onQuestionsUpdated(distractorUndoQuestions, remainingQuota);
    setDistractorUndoQuestions(null);
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

      {shortAnswerIndices.length > 0 || distractorUndoQuestions ? (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-teal-950">
              {vi.ai.distractors.panelTitle} ({shortAnswerIndices.length}{" "}
              {vi.ai.distractors.selectedCountSuffix})
            </div>
            <p className="text-xs text-slate-700">
              {vi.ai.distractors.panelSubtitle}
            </p>
            {distractorError ? (
              <p className="text-xs font-medium text-red-700">
                {distractorError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {shortAnswerIndices.length > 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={isGeneratingDistractors || isRunning}
                onClick={() => void handleGenerateDistractorsInPreview()}
              >
                {isGeneratingDistractors
                  ? vi.ai.distractors.generatingButton
                  : `${vi.ai.distractors.generateButton} (${Math.ceil(
                      shortAnswerIndices.length / BATCH_SIZE_QUESTIONS
                    )} ${vi.dashboard.aiQuotaUnit})`}
              </Button>
            ) : null}

            {distractorUndoQuestions ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isGeneratingDistractors}
                onClick={handleUndoDistractorsInPreview}
              >
                {vi.ai.distractors.undoButton}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

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
                    {b.errorCode ? ` (${b.errorCode})` : ""}
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

