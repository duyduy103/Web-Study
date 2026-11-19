"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CreateExamModal } from "@/components/features/exams/create-exam-modal";
import type { TeacherClassAssignmentItem } from "@/lib/classes/assignments";
import type { ReviewQuestionItem } from "@/lib/review/types";

export interface TeacherOwnedExamOption {
  id: string;
  title: string;
  duration_min: number | null;
  max_attempts: number;
  access_mode?: string;
}

export interface TeacherOwnedSetOption {
  id: string;
  title: string;
  approved_count: number;
}

interface ClassAssignmentsTabProps {
  classId: string;
  initialAssignments: TeacherClassAssignmentItem[];
  ownedExams: TeacherOwnedExamOption[];
  ownedSets: TeacherOwnedSetOption[];
}

export function ClassAssignmentsTab({
  classId,
  initialAssignments,
  ownedExams,
  ownedSets,
}: ClassAssignmentsTabProps) {
  const router = useRouter();
  const [assignments, setAssignments] =
    React.useState<TeacherClassAssignmentItem[]>(initialAssignments);
  const [examsList, setExamsList] =
    React.useState<TeacherOwnedExamOption[]>(ownedExams);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"exam" | "study">("exam");
  const [selectedExamId, setSelectedExamId] = React.useState<string>(
    ownedExams[0]?.id ?? ""
  );
  const [selectedSetId, setSelectedSetId] = React.useState<string>(
    ownedSets.find((s) => s.approved_count > 0)?.id ?? ownedSets[0]?.id ?? ""
  );
  const [title, setTitle] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [lockAfterDue, setLockAfterDue] = React.useState(false);
  const [setExamClassOnly, setSetExamClassOnly] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Tạo nhanh bài kiểm tra ngay trong luồng giao bài
  const [quickSetId, setQuickSetId] = React.useState<string>(
    ownedSets.find((s) => s.approved_count > 0)?.id ?? ""
  );
  const [quickExamOpen, setQuickExamOpen] = React.useState(false);
  const [quickSetTitle, setQuickSetTitle] = React.useState("");
  const [quickSetQuestions, setQuickSetQuestions] = React.useState<
    ReviewQuestionItem[]
  >([]);
  const [loadingQuickSet, setLoadingQuickSet] = React.useState(false);

  async function reloadAssignments() {
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`);
      const data = (await res.json()) as {
        assignments?: TeacherClassAssignmentItem[];
      };
      if (res.ok && Array.isArray(data.assignments)) {
        setAssignments(data.assignments);
      }
    } catch {
      // ignore
    }
  }

  async function openQuickCreateExam() {
    if (!quickSetId) {
      setErrorMsg(vi.classes.assignments.noSetsHint);
      return;
    }
    setLoadingQuickSet(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/sets/${quickSetId}/approved-questions`);
      const data = (await res.json()) as {
        error?: string;
        set?: { id: string; title: string };
        questions?: ReviewQuestionItem[];
      };
      if (!res.ok || !data.set || !data.questions?.length) {
        setErrorMsg(
          data.error ?? vi.classes.assignments.errors.noApprovedQuestions
        );
        return;
      }
      setQuickSetTitle(data.set.title);
      setQuickSetQuestions(data.questions);
      setQuickExamOpen(true);
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setLoadingQuickSet(false);
    }
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          examId: kind === "exam" ? selectedExamId || null : null,
          setId: kind === "study" ? selectedSetId || null : null,
          title,
          instructions: instructions.trim() || null,
          dueAt: dueAtIso,
          lockAfterDue,
          setExamClassOnly: kind === "exam" ? setExamClassOnly : false,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }

      setModalOpen(false);
      setTitle("");
      setInstructions("");
      setDueAt("");
      setLockAfterDue(false);
      await reloadAssignments();
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleClose(item: TeacherClassAssignmentItem) {
    setBusyId(item.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: item.id,
          closed: !item.closed_at,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      await reloadAssignments();
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: TeacherClassAssignmentItem) {
    if (!window.confirm(vi.classes.assignments.deleteConfirm)) return;
    setBusyId(item.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: item.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== item.id));
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Tổng số bài đã giao: <strong>{assignments.length}</strong>
        </p>
        <Button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            if (!title) {
              if (kind === "exam" && selectedExamId) {
                const ex = examsList.find((x) => x.id === selectedExamId);
                if (ex) setTitle(ex.title);
              } else if (kind === "study" && selectedSetId) {
                const st = ownedSets.find((x) => x.id === selectedSetId);
                if (st) setTitle(st.title);
              }
            }
            setModalOpen(true);
          }}
          className="min-h-[44px]"
        >
          + {vi.classes.assignments.assignButton}
        </Button>
      </div>

      {errorMsg && !modalOpen ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {assignments.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="py-10 text-center text-sm text-slate-600">
            {vi.classes.assignments.emptyTeacherList}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <Card key={item.id} className="border-slate-200 bg-white">
                <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.kind === "exam"
                            ? "bg-teal-50 text-teal-800 border border-teal-200"
                            : "bg-sky-50 text-sky-800 border border-sky-200"
                        }`}
                      >
                        {item.kind === "exam"
                          ? vi.classes.assignments.kindExamBadge
                          : vi.classes.assignments.kindStudyBadge}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.closed_at
                            ? "bg-slate-200 text-slate-700"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {item.closed_at
                          ? vi.classes.assignments.closedBadge
                          : vi.classes.assignments.openBadge}
                      </span>
                      {item.exam_access_mode === "class_only" ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                          {vi.classes.assignments.classOnlyBadge}
                        </span>
                      ) : null}
                      {item.lock_after_due ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {vi.classes.assignments.lockAfterDueBadge}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {item.title}
                    </h3>
                    {item.instructions ? (
                      <p className="text-xs text-slate-600">
                        {item.instructions}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                      <span className="font-semibold text-teal-800">
                        {item.completed_count}/{item.total_active_students}{" "}
                        {vi.classes.assignments.progressSuffix}
                      </span>
                      {item.in_progress_count > 0 ? (
                        <span>
                          • {item.in_progress_count}{" "}
                          {vi.classes.assignments.inProgressSuffix}
                        </span>
                      ) : null}
                      <span>
                        •{" "}
                        {item.due_at
                          ? `${vi.classes.assignments.duePrefix} ${new Date(
                              item.due_at
                            ).toLocaleString("vi-VN")}`
                          : vi.classes.assignments.noDueLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void handleToggleClose(item)}
                      className="min-h-[44px]"
                    >
                      {item.closed_at
                        ? vi.classes.assignments.reopenButton
                        : vi.classes.assignments.closeButton}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void handleDelete(item)}
                      className="min-h-[44px] border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {vi.classes.assignments.deleteButton}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto"
        >
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {vi.classes.assignments.modalTitle}
            </h2>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label>{vi.classes.assignments.kindLabel}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["exam", "study"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        if (k === "exam" && selectedExamId) {
                          const ex = examsList.find(
                            (x) => x.id === selectedExamId
                          );
                          if (ex) setTitle(ex.title);
                        } else if (k === "study" && selectedSetId) {
                          const st = ownedSets.find(
                            (x) => x.id === selectedSetId
                          );
                          if (st) setTitle(st.title);
                        }
                      }}
                      className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        kind === k
                          ? "border-teal-600 bg-teal-50 text-teal-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {k === "exam"
                        ? vi.classes.assignments.kindExam
                        : vi.classes.assignments.kindStudy}
                    </button>
                  ))}
                </div>
              </div>

              {kind === "exam" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-exam-select">
                      {vi.classes.assignments.selectExamLabel}
                    </Label>
                    <select
                      id="assign-exam-select"
                      value={selectedExamId}
                      onChange={(e) => {
                        setSelectedExamId(e.target.value);
                        const found = examsList.find(
                          (x) => x.id === e.target.value
                        );
                        if (found) setTitle(found.title);
                      }}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      <option value="">
                        {vi.classes.assignments.selectExamPlaceholder}
                      </option>
                      {examsList.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title}
                        </option>
                      ))}
                    </select>
                    {examsList.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {vi.classes.assignments.noExamsHint}
                      </p>
                    ) : null}
                  </div>

                  {/* Tạo nhanh bài kiểm tra mới bằng CreateExamModal hiện có */}
                  {ownedSets.some((s) => s.approved_count > 0) ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <Label
                        htmlFor="quick-set-select"
                        className="text-xs text-slate-700"
                      >
                        {vi.classes.assignments.quickCreateSelectSetLabel}
                      </Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          id="quick-set-select"
                          value={quickSetId}
                          onChange={(e) => setQuickSetId(e.target.value)}
                          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900"
                        >
                          {ownedSets
                            .filter((s) => s.approved_count > 0)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title} ({s.approved_count} câu đã duyệt)
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={loadingQuickSet || !quickSetId}
                          onClick={() => void openQuickCreateExam()}
                          className="min-h-[44px] shrink-0 text-xs"
                        >
                          {vi.classes.assignments.quickCreateExamButton}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="assign-set-select">
                    {vi.classes.assignments.selectSetLabel}
                  </Label>
                  <select
                    id="assign-set-select"
                    value={selectedSetId}
                    onChange={(e) => {
                      setSelectedSetId(e.target.value);
                      const found = ownedSets.find(
                        (x) => x.id === e.target.value
                      );
                      if (found) setTitle(found.title);
                    }}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="">
                      {vi.classes.assignments.selectSetPlaceholder}
                    </option>
                    {ownedSets
                      .filter((s) => s.approved_count > 0)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} ({s.approved_count} câu đã duyệt)
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="assign-title">
                  {vi.classes.assignments.titleLabel}
                </Label>
                <Input
                  id="assign-title"
                  required
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={vi.classes.assignments.titlePlaceholder}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assign-instructions">
                  {vi.classes.assignments.instructionsLabel}
                </Label>
                <textarea
                  id="assign-instructions"
                  rows={2}
                  maxLength={1000}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={vi.classes.assignments.instructionsPlaceholder}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assign-due-at">
                  {vi.classes.assignments.dueAtLabel}
                </Label>
                <Input
                  id="assign-due-at"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={lockAfterDue}
                  onChange={(e) => setLockAfterDue(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="text-xs leading-relaxed text-slate-700">
                  <strong className="block text-sm text-slate-900">
                    {vi.classes.assignments.lockAfterDueLabel}
                  </strong>
                  {vi.classes.assignments.lockAfterDueHint}
                </span>
              </label>

              {kind === "exam" ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="checkbox"
                    checked={setExamClassOnly}
                    onChange={(e) => setSetExamClassOnly(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="text-xs leading-relaxed text-slate-700">
                    <strong className="block text-sm text-slate-900">
                      {vi.classes.assignments.classOnlyLabel}
                    </strong>
                    {vi.classes.assignments.classOnlyHint}
                  </span>
                </label>
              ) : null}

              {errorMsg ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                >
                  {errorMsg}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px]"
                >
                  {vi.classes.cancelButton}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    submitting ||
                    title.trim().length === 0 ||
                    (kind === "exam" ? !selectedExamId : !selectedSetId)
                  }
                  className="min-h-[44px]"
                >
                  {submitting
                    ? vi.classes.assignments.assigningButton
                    : vi.classes.assignments.assignButton}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <CreateExamModal
        open={quickExamOpen}
        setId={quickSetId}
        setTitle={quickSetTitle}
        questions={quickSetQuestions}
        onClose={() => setQuickExamOpen(false)}
        onExamCreated={(created) => {
          setExamsList((prev) => [
            {
              id: created.id,
              title: created.title,
              duration_min: null,
              max_attempts: 1,
            },
            ...prev,
          ]);
          setSelectedExamId(created.id);
          setTitle(created.title);
        }}
      />
    </div>
  );
}

