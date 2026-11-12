"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import {
  computeReviewSummaryStats,
  evaluateGreenBulkApproval,
  filterReviewQuestions,
  getInitialReviewFilterState,
} from "@/lib/review/filters";
import {
  applySnapshotsToQuestions,
  createEmptyUndoRedoState,
  createSnapshotFromQuestion,
  popRedoStep,
  popUndoStep,
  pushUndoStep,
  type UndoRedoState,
} from "@/lib/review/undo-stack";
import {
  convertAnswerDataForNewType,
  validateQuestionForReview,
} from "@/lib/review/validation";
import type {
  QuestionSnapshot,
  ReviewFilterState,
  ReviewQuestionItem,
} from "@/lib/review/types";
import type { QuestionStatus, QuestionType } from "@/lib/supabase/types";
import { ReviewHeaderStats } from "@/components/features/review/review-header-stats";
import { ReviewFilterBar } from "@/components/features/review/review-filter-bar";
import { BulkActionBar } from "@/components/features/review/bulk-action-bar";
import {
  QuestionInlineEditor,
  type InlineEditDraftPayload,
} from "@/components/features/review/question-inline-editor";
import { QuestionReviewCard } from "@/components/features/review/question-review-card";
import {
  ConfirmGreenBulkModal,
  ConfirmManualBulkModal,
  KeyboardShortcutsModal,
} from "@/components/features/review/review-modals";
import {
  DistractorGeneratorPanel,
  type ShortAnswerQuestionCandidate,
} from "@/components/features/sets/distractor-generator-panel";
import {
  CreateExamModal,
  CreatePrintExamModal,
} from "@/components/features/exams/create-exam-modal";
import type { PrintExamHeaderInfo } from "@/lib/export/types";
import { TeacherStudyPanel } from "@/components/features/study/teacher-study-panel";

const PAGE_SIZE = 25;

interface ReviewWorkspaceProps {
  setId: string;
  title: string;
  subject: string | null;
  grade: string | null;
  createdAt: string;
  initialQuestions: ReviewQuestionItem[];
  initialRemainingAiQuota: number;
  initialStudyEnabled?: boolean;
  initialStudyCode?: string | null;
  defaultPrintHeader?: Partial<PrintExamHeaderInfo> | null;
}

export function ReviewWorkspace({
  setId,
  title,
  subject,
  grade,
  createdAt,
  initialQuestions,
  initialRemainingAiQuota,
  initialStudyEnabled = false,
  initialStudyCode = null,
  defaultPrintHeader = null,
}: ReviewWorkspaceProps) {
  const storageKey = `memoquiz_review_undo_${setId}`;
  const [activeTab, setActiveTab] = React.useState<"questions" | "study_stats">(
    "questions"
  );

  const [questions, setQuestions] =
    React.useState<ReviewQuestionItem[]>(initialQuestions);
  const [filter, setFilter] = React.useState<ReviewFilterState>(() =>
    getInitialReviewFilterState(initialQuestions)
  );
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [focusedId, setFocusedId] = React.useState<string | null>(
    initialQuestions[0]?.id ?? null
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [inlineSaveStatus, setInlineSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("idle");
  const [inlineErrorMessage, setInlineErrorMessage] = React.useState<
    string | null
  >(null);

  const [undoRedo, setUndoRedo] = React.useState<UndoRedoState>(() =>
    createEmptyUndoRedoState()
  );
  const [isMutating, setIsMutating] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  const [greenModalOpen, setGreenModalOpen] = React.useState(false);
  const [manualBulkModalOpen, setManualBulkModalOpen] = React.useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = React.useState(false);
  const [createExamModalOpen, setCreateExamModalOpen] = React.useState(false);
  const [printExamModalOpen, setPrintExamModalOpen] = React.useState(false);

  // Đồng bộ khi initialQuestions thay đổi (ví dụ sau khi chạy AI sinh đáp án nhiễu)
  React.useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  // Khôi phục ngăn xếp Hoàn tác từ sessionStorage trong cùng phiên mở tab
  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as UndoRedoState;
        if (
          parsed &&
          Array.isArray(parsed.undoStack) &&
          Array.isArray(parsed.redoStack)
        ) {
          setUndoRedo(parsed);
        }
      }
    } catch {
      // Bỏ qua nếu sessionStorage không khả dụng
    }
  }, [storageKey]);

  function updateUndoRedoWithStorage(nextState: UndoRedoState) {
    setUndoRedo(nextState);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch {
      // Bỏ qua nếu đầy bộ nhớ phiên
    }
  }

  const stats = React.useMemo(
    () => computeReviewSummaryStats(questions),
    [questions]
  );

  const greenEvaluation = React.useMemo(
    () => evaluateGreenBulkApproval(questions),
    [questions]
  );

  const filteredQuestions = React.useMemo(
    () => filterReviewQuestions(questions, filter),
    [questions, filter]
  );

  const visibleQuestions = React.useMemo(
    () => filteredQuestions.slice(0, visibleCount),
    [filteredQuestions, visibleCount]
  );

  const shortAnswerCandidates: ShortAnswerQuestionCandidate[] = React.useMemo(
    () =>
      questions
        .filter((q) => q.type === "short_answer" && q.status !== "archived")
        .map((q) => ({
          id: q.id,
          orderNumber: q.orderNumber,
          stem: q.stem,
          hasAnswer: Boolean(q.answer_text && q.answer_text.trim().length > 0),
        })),
    [questions]
  );

  async function commitSnapshotMutation(params: {
    beforeSnapshots: QuestionSnapshot[];
    afterSnapshots: QuestionSnapshot[];
    label: string;
    checkConflict?: boolean;
  }) {
    const prevQuestions = questions;
    const prevUndoRedo = undoRedo;

    const expectedUpdatedAtById: Record<string, string> = {};
    if (params.checkConflict !== false) {
      for (const snap of params.beforeSnapshots) {
        const q = questions.find((item) => item.id === snap.id);
        if (q) {
          expectedUpdatedAtById[snap.id] = q.updated_at;
        }
      }
    }

    // Cập nhật lạc quan (optimistic)
    setQuestions((curr) =>
      applySnapshotsToQuestions(curr, params.afterSnapshots)
    );
    const nextUndoState = pushUndoStep(undoRedo, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: params.label,
      createdAt: Date.now(),
      beforeSnapshots: params.beforeSnapshots,
      afterSnapshots: params.afterSnapshots,
    });
    updateUndoRedoWithStorage(nextUndoState);
    setToastMessage(params.label);
    setErrorBanner(null);
    setIsMutating(true);

    try {
      const res = await fetch(`/api/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_snapshots",
          snapshots: params.afterSnapshots,
          expectedUpdatedAtById:
            Object.keys(expectedUpdatedAtById).length > 0
              ? expectedUpdatedAtById
              : undefined,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.review.editor.errorStatus);
      }

      const payload = data as {
        status: "applied" | "conflict";
        updatedAtById: Record<string, string>;
      };

      if (payload.status === "conflict") {
        setQuestions(prevQuestions);
        updateUndoRedoWithStorage(prevUndoRedo);
        setToastMessage(null);
        setErrorBanner(vi.review.editor.conflictDescription);
        return;
      }

      setQuestions((curr) =>
        curr.map((q) =>
          payload.updatedAtById[q.id]
            ? { ...q, updated_at: payload.updatedAtById[q.id] }
            : q
        )
      );
    } catch (err) {
      setQuestions(prevQuestions);
      updateUndoRedoWithStorage(prevUndoRedo);
      setToastMessage(null);
      setErrorBanner(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
    } finally {
      setIsMutating(false);
    }
  }

  function mutateSingleStatus(
    question: ReviewQuestionItem,
    nextStatus: QuestionStatus,
    toastLabel: string
  ) {
    if (nextStatus === "approved") {
      const check = validateQuestionForReview(question);
      if (!check.valid) {
        setErrorBanner(
          `${vi.review.validation.cannotApprovePrefix} ${check.errors.join(" ")}`
        );
        return;
      }
    }

    const before = createSnapshotFromQuestion(question);
    const after: QuestionSnapshot = {
      ...before,
      status: nextStatus,
      reviewed_by_human:
        nextStatus === "approved" ? true : before.reviewed_by_human,
      reviewed_at:
        nextStatus === "approved"
          ? new Date().toISOString()
          : before.reviewed_at,
    };

    void commitSnapshotMutation({
      beforeSnapshots: [before],
      afterSnapshots: [after],
      label: toastLabel,
    });
  }

  async function handleSaveInline(
    question: ReviewQuestionItem,
    draft: InlineEditDraftPayload,
    moveNext: boolean
  ) {
    const before = createSnapshotFromQuestion(question);
    const after: QuestionSnapshot = {
      ...before,
      type: draft.type,
      stem: draft.stem,
      explanation: draft.explanation,
      topic: draft.topic,
      difficulty: draft.difficulty,
      choices: draft.choices,
      answer_text: draft.answer_text,
      confidence: 1.0,
      reviewed_by_human: true,
      reviewed_at: new Date().toISOString(),
    };

    const prevQuestions = questions;
    setInlineSaveStatus("saving");
    setInlineErrorMessage(null);

    // Cập nhật lạc quan
    setQuestions((curr) => applySnapshotsToQuestions(curr, [after]));

    try {
      const res = await fetch(`/api/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_inline",
          payload: {
            questionId: question.id,
            expectedUpdatedAt: question.updated_at,
            type: draft.type,
            stem: draft.stem,
            explanation: draft.explanation,
            topic: draft.topic,
            difficulty: draft.difficulty,
            status: question.status,
            choices: draft.choices,
            answer_text: draft.answer_text,
          },
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.review.editor.errorStatus);
      }

      const result = data as {
        status: "saved" | "conflict";
        updatedAt?: string;
        reviewedAt?: string;
      };

      if (result.status === "conflict") {
        setQuestions(prevQuestions);
        setInlineSaveStatus("conflict");
        return;
      }

      const finalAfter: QuestionSnapshot = {
        ...after,
        reviewed_at: result.reviewedAt ?? after.reviewed_at,
      };

      setQuestions((curr) =>
        applySnapshotsToQuestions(
          curr,
          [finalAfter],
          result.updatedAt ? { [question.id]: result.updatedAt } : undefined
        )
      );

      updateUndoRedoWithStorage(
        pushUndoStep(undoRedo, {
          id: `${Date.now()}-edit`,
          label: vi.review.toast.editedSingle,
          createdAt: Date.now(),
          beforeSnapshots: [before],
          afterSnapshots: [finalAfter],
        })
      );

      setInlineSaveStatus("saved");
      setToastMessage(vi.review.toast.editedSingle);

      if (moveNext) {
        const idx = filteredQuestions.findIndex((q) => q.id === question.id);
        const nextQ = filteredQuestions[idx + 1];
        if (nextQ) {
          setEditingId(nextQ.id);
          setFocusedId(nextQ.id);
          setInlineSaveStatus("idle");
        } else {
          setEditingId(null);
        }
      }
    } catch (err) {
      setQuestions(prevQuestions);
      setInlineSaveStatus("error");
      setInlineErrorMessage(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
    }
  }

  async function handleReloadConflictQuestion(questionId: string) {
    try {
      const res = await fetch(`/api/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch_question",
          questionId,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) return;

      const payload = data as { question: ReviewQuestionItem };
      setQuestions((curr) =>
        curr.map((q) =>
          q.id === questionId
            ? { ...payload.question, orderNumber: q.orderNumber }
            : q
        )
      );
      setInlineSaveStatus("idle");
      setEditingId(null);
    } catch {
      // Giữ trạng thái hiện tại nếu lỗi mạng
    }
  }

  async function handleUndo() {
    const { nextState, step } = popUndoStep(undoRedo);
    if (!step) return;

    const prevQuestions = questions;
    const prevUndo = undoRedo;
    setQuestions((curr) =>
      applySnapshotsToQuestions(curr, step.beforeSnapshots)
    );
    updateUndoRedoWithStorage(nextState);
    setToastMessage(vi.review.toast.undone);
    setIsMutating(true);

    try {
      const res = await fetch(`/api/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_snapshots",
          snapshots: step.beforeSnapshots,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(vi.review.editor.errorStatus);
      const payload = data as { updatedAtById: Record<string, string> };
      setQuestions((curr) =>
        curr.map((q) =>
          payload.updatedAtById?.[q.id]
            ? { ...q, updated_at: payload.updatedAtById[q.id] }
            : q
        )
      );
    } catch {
      setQuestions(prevQuestions);
      updateUndoRedoWithStorage(prevUndo);
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRedo() {
    const { nextState, step } = popRedoStep(undoRedo);
    if (!step) return;

    const prevQuestions = questions;
    const prevUndo = undoRedo;
    setQuestions((curr) =>
      applySnapshotsToQuestions(curr, step.afterSnapshots)
    );
    updateUndoRedoWithStorage(nextState);
    setToastMessage(vi.review.toast.redone);
    setIsMutating(true);

    try {
      const res = await fetch(`/api/sets/${setId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_snapshots",
          snapshots: step.afterSnapshots,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(vi.review.editor.errorStatus);
      const payload = data as { updatedAtById: Record<string, string> };
      setQuestions((curr) =>
        curr.map((q) =>
          payload.updatedAtById?.[q.id]
            ? { ...q, updated_at: payload.updatedAtById[q.id] }
            : q
        )
      );
    } catch {
      setQuestions(prevQuestions);
      updateUndoRedoWithStorage(prevUndo);
    } finally {
      setIsMutating(false);
    }
  }

  function handleConfirmGreenBulk() {
    setGreenModalOpen(false);
    const eligible = greenEvaluation.eligibleQuestions;
    if (eligible.length === 0) return;

    const beforeSnapshots = eligible.map(createSnapshotFromQuestion);
    const nowIso = new Date().toISOString();
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => ({
      ...s,
      status: "approved",
      reviewed_by_human: true,
      reviewed_at: nowIso,
    }));

    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkApprovedPrefix} ${eligible.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  const selectedValidQuestions = React.useMemo(
    () =>
      questions.filter(
        (q) =>
          selectedIds.includes(q.id) && validateQuestionForReview(q).valid
      ),
    [questions, selectedIds]
  );

  const selectedAiOrWarnCount = React.useMemo(
    () =>
      selectedValidQuestions.filter(
        (q) => q.ai_generated || q.warnings.length > 0
      ).length,
    [selectedValidQuestions]
  );

  function executeApproveSelected() {
    setManualBulkModalOpen(false);
    if (selectedValidQuestions.length === 0) {
      setErrorBanner(vi.review.validation.cannotApprovePrefix);
      return;
    }

    const beforeSnapshots = selectedValidQuestions.map(
      createSnapshotFromQuestion
    );
    const nowIso = new Date().toISOString();
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => ({
      ...s,
      status: "approved",
      reviewed_by_human: true,
      reviewed_at: nowIso,
    }));

    setSelectedIds([]);
    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkApprovedPrefix} ${afterSnapshots.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  function handleBulkApproveSelectedClick() {
    if (selectedValidQuestions.length === 0) {
      setErrorBanner(
        `${vi.review.validation.cannotApprovePrefix} ${vi.review.confirmGreenModal.skipReasonInvalid}`
      );
      return;
    }
    if (selectedAiOrWarnCount > 0) {
      setManualBulkModalOpen(true);
      return;
    }
    executeApproveSelected();
  }

  function handleBulkArchiveSelected() {
    const targets = questions.filter((q) => selectedIds.includes(q.id));
    if (targets.length === 0) return;

    const beforeSnapshots = targets.map(createSnapshotFromQuestion);
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => ({
      ...s,
      status: "archived",
    }));

    setSelectedIds([]);
    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkArchivedPrefix} ${targets.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  function handleBulkAssignTopic(topic: string) {
    const targets = questions.filter((q) => selectedIds.includes(q.id));
    if (targets.length === 0) return;

    const beforeSnapshots = targets.map(createSnapshotFromQuestion);
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => ({
      ...s,
      topic,
    }));

    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkUpdatedPrefix} ${targets.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  function handleBulkAssignDifficulty(difficulty: string | null) {
    const targets = questions.filter((q) => selectedIds.includes(q.id));
    if (targets.length === 0) return;

    const beforeSnapshots = targets.map(createSnapshotFromQuestion);
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => ({
      ...s,
      difficulty,
    }));

    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkUpdatedPrefix} ${targets.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  function handleBulkChangeType(nextType: QuestionType) {
    const targets = questions.filter((q) => selectedIds.includes(q.id));
    if (targets.length === 0) return;

    const beforeSnapshots = targets.map(createSnapshotFromQuestion);
    const afterSnapshots: QuestionSnapshot[] = beforeSnapshots.map((s) => {
      const converted = convertAnswerDataForNewType({
        currentType: s.type,
        nextType,
        choices: s.choices,
        answerText: s.answer_text,
      });
      const candidate: QuestionSnapshot = {
        ...s,
        type: nextType,
        choices: converted.choices,
        answer_text: converted.answerText,
      };
      if (
        candidate.status === "approved" &&
        !validateQuestionForReview(candidate).valid
      ) {
        candidate.status = "draft";
      }
      return candidate;
    });

    void commitSnapshotMutation({
      beforeSnapshots,
      afterSnapshots,
      label: `${vi.review.toast.bulkUpdatedPrefix} ${targets.length} ${vi.review.toast.questionsUnit}`,
    });
  }

  // Phím tắt trên máy tính (không kích hoạt khi đang gõ trong input/textarea/select)
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void handleRedo();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
        return;
      }

      if (editingId) {
        return;
      }

      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        void handleUndo();
        return;
      }

      const currentIdx = filteredQuestions.findIndex(
        (q) => q.id === focusedId
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx =
          currentIdx < filteredQuestions.length - 1 ? currentIdx + 1 : 0;
        const nextQ = filteredQuestions[nextIdx];
        if (nextQ) {
          setFocusedId(nextQ.id);
          if (nextIdx >= visibleCount) {
            setVisibleCount((c) => c + PAGE_SIZE);
          }
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx =
          currentIdx > 0 ? currentIdx - 1 : filteredQuestions.length - 1;
        const prevQ = filteredQuestions[prevIdx];
        if (prevQ) {
          setFocusedId(prevQ.id);
        }
        return;
      }

      const focusedQuestion =
        filteredQuestions[currentIdx] ?? filteredQuestions[0];
      if (!focusedQuestion) return;

      if (e.key === "Enter") {
        e.preventDefault();
        setEditingId(focusedQuestion.id);
        setInlineSaveStatus("idle");
        return;
      }

      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        mutateSingleStatus(
          focusedQuestion,
          "approved",
          vi.review.toast.approvedSingle
        );
        return;
      }

      if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        mutateSingleStatus(
          focusedQuestion,
          "archived",
          vi.review.toast.archivedSingle
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const allFilteredSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => selectedIds.includes(q.id));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredQuestions.map((q) => q.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const combined = new Set([
        ...selectedIds,
        ...filteredQuestions.map((q) => q.id),
      ]);
      setSelectedIds([...combined]);
    }
  }

  return (
    <div className="space-y-5 pb-16">
      <ReviewHeaderStats
        title={title}
        subject={subject}
        grade={grade}
        createdAt={createdAt}
        stats={stats}
        onOpenCreateExam={() => setCreateExamModalOpen(true)}
        onOpenPrintExam={() => setPrintExamModalOpen(true)}
      />

      <TeacherStudyPanel
        setId={setId}
        initialStudyEnabled={initialStudyEnabled}
        initialStudyCode={initialStudyCode}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />

      {activeTab === "questions" ? (
        <>
          <DistractorGeneratorPanel
            setId={setId}
            candidates={shortAnswerCandidates}
            initialRemainingQuota={initialRemainingAiQuota}
          />

      <ReviewFilterBar
        filter={filter}
        needsCheckCount={stats.needsCheckCount}
        greenEligibleCount={greenEvaluation.eligibleIds.length}
        undoCount={undoRedo.undoStack.length}
        redoCount={undoRedo.redoStack.length}
        isMutating={isMutating}
        onFilterChange={(next) => {
          setFilter(next);
          setVisibleCount(PAGE_SIZE);
        }}
        onOpenGreenModal={() => setGreenModalOpen(true)}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
      />

      {errorBanner ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 sm:text-sm"
        >
          <span>{errorBanner}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setErrorBanner(null)}
          >
            ✕
          </Button>
        </div>
      ) : null}

      <BulkActionBar
        filteredTotal={filteredQuestions.length}
        selectedCount={selectedIds.length}
        allFilteredSelected={allFilteredSelected}
        isMutating={isMutating}
        onToggleSelectAllFiltered={toggleSelectAllFiltered}
        onClearSelection={() => setSelectedIds([])}
        onBulkApproveSelected={handleBulkApproveSelectedClick}
        onBulkArchiveSelected={handleBulkArchiveSelected}
        onBulkAssignTopic={handleBulkAssignTopic}
        onBulkAssignDifficulty={handleBulkAssignDifficulty}
        onBulkChangeType={handleBulkChangeType}
      />

      {filteredQuestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h3 className="text-base font-bold text-slate-900">
            {vi.review.filters.emptyTitle}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {vi.review.filters.emptyDescription}
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFilter({
                  needsCheckPreset: false,
                  confidenceTiers: [],
                  statuses: [],
                  aiOnly: false,
                  warningsOnly: false,
                  searchQuery: "",
                })
              }
            >
              {vi.review.filters.showAllButton}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {visibleQuestions.map((question) => {
            if (editingId === question.id) {
              return (
                <QuestionInlineEditor
                  key={question.id}
                  question={question}
                  saveStatus={inlineSaveStatus}
                  errorMessage={inlineErrorMessage}
                  onSave={(draft, moveNext) =>
                    void handleSaveInline(question, draft, moveNext)
                  }
                  onCancel={() => {
                    setEditingId(null);
                    setInlineSaveStatus("idle");
                  }}
                  onReloadConflict={() =>
                    void handleReloadConflictQuestion(question.id)
                  }
                />
              );
            }

            return (
              <QuestionReviewCard
                key={question.id}
                question={question}
                isSelected={selectedIds.includes(question.id)}
                isFocused={focusedId === question.id}
                onToggleSelect={() =>
                  setSelectedIds((prev) =>
                    prev.includes(question.id)
                      ? prev.filter((id) => id !== question.id)
                      : [...prev, question.id]
                  )
                }
                onFocusCard={() => setFocusedId(question.id)}
                onStartEdit={() => {
                  setFocusedId(question.id);
                  setEditingId(question.id);
                  setInlineSaveStatus("idle");
                  setInlineErrorMessage(null);
                }}
                onApprove={() =>
                  mutateSingleStatus(
                    question,
                    "approved",
                    vi.review.toast.approvedSingle
                  )
                }
                onArchive={() =>
                  mutateSingleStatus(
                    question,
                    "archived",
                    vi.review.toast.archivedSingle
                  )
                }
                onRestoreToDraft={() =>
                  mutateSingleStatus(
                    question,
                    "draft",
                    vi.review.toast.restoredSingle
                  )
                }
              />
            );
          })}

          {filteredQuestions.length > visibleCount ? (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
              <span className="text-xs text-slate-600">
                {vi.review.pagination.showingPrefix} {visibleQuestions.length}{" "}
                {vi.review.pagination.ofTotalMiddle} {filteredQuestions.length}{" "}
                {vi.review.pagination.questionsSuffix}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  {vi.review.pagination.loadMoreButton}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount(filteredQuestions.length)}
                >
                  {vi.review.pagination.showAllRemainingButton}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
        </>
      ) : null}

      {toastMessage ? (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-lg sm:text-sm"
        >
          <span>{toastMessage}</span>
          {undoRedo.undoStack.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isMutating}
              onClick={() => void handleUndo()}
              className="h-9 px-3 text-xs"
            >
              ↶ {vi.review.actions.undo}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label={vi.common.closeNotification}
            className="ml-1 cursor-pointer text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}

      <ConfirmGreenBulkModal
        open={greenModalOpen}
        evaluation={greenEvaluation}
        isMutating={isMutating}
        onConfirm={handleConfirmGreenBulk}
        onClose={() => setGreenModalOpen(false)}
      />

      <ConfirmManualBulkModal
        open={manualBulkModalOpen}
        totalSelectedValid={selectedValidQuestions.length}
        aiOrWarningCount={selectedAiOrWarnCount}
        isMutating={isMutating}
        onConfirm={executeApproveSelected}
        onClose={() => setManualBulkModalOpen(false)}
      />

      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <CreateExamModal
        open={createExamModalOpen}
        setId={setId}
        setTitle={title}
        questions={questions}
        onClose={() => setCreateExamModalOpen(false)}
      />

      <CreatePrintExamModal
        open={printExamModalOpen}
        setId={setId}
        setTitle={title}
        setSubject={subject}
        setGrade={grade}
        defaultPrintHeader={defaultPrintHeader}
        questions={questions}
        onClose={() => setPrintExamModalOpen(false)}
      />
    </div>
  );
}

