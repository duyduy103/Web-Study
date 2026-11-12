"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";

export interface ShortAnswerQuestionCandidate {
  id: string;
  orderNumber: number;
  stem: string;
  hasAnswer: boolean;
}

interface UndoSnapshotItem {
  questionId: string;
  previousExplanation: string | null;
  answerText: string;
}

interface SkippedItem {
  questionId: string;
  stem: string;
  reason: string;
}

interface DistractorGeneratorPanelProps {
  setId: string;
  candidates: ShortAnswerQuestionCandidate[];
  initialRemainingQuota: number;
}

const DISTRACTOR_BATCH_SIZE = 25;

export function DistractorGeneratorPanel({
  setId,
  candidates,
  initialRemainingQuota,
}: DistractorGeneratorPanelProps) {
  const router = useRouter();

  const validCandidates = React.useMemo(
    () => candidates.filter((c) => c.hasAnswer),
    [candidates]
  );
  const missingAnswerCandidates = React.useMemo(
    () => candidates.filter((c) => !c.hasAnswer),
    [candidates]
  );

  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    validCandidates.map((c) => c.id)
  );
  const [remainingQuota, setRemainingQuota] = React.useState(
    initialRemainingQuota
  );
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isUndoing, setIsUndoing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [undoSnapshots, setUndoSnapshots] = React.useState<UndoSnapshotItem[]>(
    []
  );
  const [serverSkipped, setServerSkipped] = React.useState<SkippedItem[]>([]);

  React.useEffect(() => {
    setSelectedIds(validCandidates.map((c) => c.id));
  }, [validCandidates]);

  if (candidates.length === 0 && undoSnapshots.length === 0) {
    return null;
  }

  const estimatedCalls =
    selectedIds.length > 0
      ? Math.ceil(selectedIds.length / DISTRACTOR_BATCH_SIZE)
      : 0;

  function toggleQuestion(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === validCandidates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(validCandidates.map((c) => c.id));
    }
  }

  async function handleGenerate() {
    if (selectedIds.length === 0) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setServerSkipped([]);

    const collectedSnapshots: UndoSnapshotItem[] = [];
    const collectedSkipped: SkippedItem[] = [];
    let totalUpdated = 0;

    try {
      for (
        let i = 0;
        i < selectedIds.length;
        i += DISTRACTOR_BATCH_SIZE
      ) {
        const chunkIds = selectedIds.slice(i, i + DISTRACTOR_BATCH_SIZE);
        const res = await fetch("/api/ai/distractors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            setId,
            questionIds: chunkIds,
          }),
        });

        const data: unknown = await res.json();
        if (!res.ok) {
          const errObj = data as { error?: string };
          throw new Error(errObj.error ?? vi.ai.callFailed);
        }

        const payload = data as {
          updatedCount: number;
          skipped: SkippedItem[];
          undoSnapshots: UndoSnapshotItem[];
          remainingQuota?: number;
        };

        totalUpdated += payload.updatedCount;
        collectedSnapshots.push(...payload.undoSnapshots);
        collectedSkipped.push(...payload.skipped);
        if (typeof payload.remainingQuota === "number") {
          setRemainingQuota(payload.remainingQuota);
        }
      }

      setUndoSnapshots(collectedSnapshots);
      setServerSkipped(collectedSkipped);
      setStatusMessage(
        `${vi.ai.distractors.successPrefix} ${totalUpdated} ${vi.ai.distractors.successSuffix}`
      );
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : vi.ai.callFailed
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleUndo() {
    if (undoSnapshots.length === 0) return;

    setIsUndoing(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/ai/distractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo",
          setId,
          snapshots: undoSnapshots,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.ai.callFailed);
      }

      setUndoSnapshots([]);
      setStatusMessage(vi.ai.distractors.undoSuccessNotice);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : vi.ai.callFailed
      );
    } finally {
      setIsUndoing(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/50 p-5 shadow-2xs">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-bold text-white">
              {vi.app.aiBadge}
            </span>
            <h2 className="text-base font-bold text-slate-900">
              {vi.ai.distractors.panelTitle}
            </h2>
          </div>
          <p className="text-xs text-slate-700">
            {vi.ai.distractors.panelSubtitle}
          </p>
        </div>

        <div className="text-xs font-medium text-teal-900">
          {vi.ai.distractors.estimatedCostPrefix}{" "}
          <strong>{estimatedCalls}</strong> {vi.ai.suggestion.estimatedCallsUnit}{" "}
          {vi.ai.suggestion.remainingTodayPrefix}{" "}
          <strong>{remainingQuota}</strong> {vi.dashboard.aiQuotaUnit}
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800"
        >
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900"
        >
          <span>{statusMessage}</span>
          {undoSnapshots.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUndoing}
              onClick={() => void handleUndo()}
            >
              {isUndoing
                ? vi.ai.distractors.undoingButton
                : vi.ai.distractors.undoButton}
            </Button>
          ) : null}
        </div>
      ) : null}

      {validCandidates.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={
                  validCandidates.length > 0 &&
                  selectedIds.length === validCandidates.length
                }
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span>{vi.ai.distractors.selectAllShortAnswers}</span>
            </label>

            <span className="text-xs text-slate-600">
              {vi.ai.distractors.selectedCountPrefix}{" "}
              <strong>{selectedIds.length}</strong> / {validCandidates.length}{" "}
              {vi.ai.distractors.selectedCountSuffix}
            </span>
          </div>

          <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {validCandidates.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 text-xs hover:border-teal-300"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleQuestion(item.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="line-clamp-2 text-slate-800">
                  <strong>
                    {vi.setDetails.questionNumberPrefix} {item.orderNumber}:
                  </strong>{" "}
                  {item.stem}
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={isGenerating || selectedIds.length === 0}
              onClick={() => void handleGenerate()}
            >
              {isGenerating
                ? vi.ai.distractors.generatingButton
                : `${vi.ai.distractors.generateButton} (${selectedIds.length})`}
            </Button>
          </div>
        </div>
      ) : null}

      {missingAnswerCandidates.length > 0 || serverSkipped.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
          <p className="font-semibold">{vi.ai.distractors.skippedTitle}</p>
          {missingAnswerCandidates.map((item) => (
            <p key={item.id}>
              • {vi.setDetails.questionNumberPrefix} {item.orderNumber}:{" "}
              {vi.ai.distractors.skippedReasonMissingAnswer}
            </p>
          ))}
          {serverSkipped.map((item) => (
            <p key={item.questionId}>
              • {item.stem.slice(0, 60)}: {item.reason}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

