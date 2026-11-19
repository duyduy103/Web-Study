"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AttemptGradingModal,
  type TeacherAttemptItem,
} from "@/components/features/exams/attempt-grading-modal";
import {
  computeClassExamAssignmentAnalytics,
  generateClassGradebookCsv,
  type ClassExamCell,
  type ClassStudyCell,
  type TeacherClassResultsPayload,
} from "@/lib/classes/results";

interface ClassResultsTabProps {
  classId: string;
  initialData?: TeacherClassResultsPayload | null;
}

type SortMode = "name_asc" | "score_desc" | "score_asc" | "missing_first";

function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "---";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}p ${String(secs).padStart(2, "0")}s`;
}

export function ClassResultsTab({
  classId,
  initialData = null,
}: ClassResultsTabProps) {
  const [data, setData] = React.useState<TeacherClassResultsPayload | null>(
    initialData
  );
  const [isLoading, setIsLoading] = React.useState(!initialData);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] =
    React.useState<string>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("name_asc");
  const [onlyMissing, setOnlyMissing] = React.useState(false);

  // Trạng thái mở modal chấm bài chi tiết Bước 5
  const [gradingContext, setGradingContext] = React.useState<{
    assignmentId: string;
    attemptId: string;
  } | null>(null);

  const fetchResults = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classId}/results`, {
        cache: "no-store",
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const errObj = json as { error?: string };
        throw new Error(errObj.error ?? vi.classes.errors.systemError);
      }
      setData(json as TeacherClassResultsPayload);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : vi.classes.errors.systemError
      );
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    if (!initialData) {
      void fetchResults();
    }
  }, [initialData, fetchResults]);

  const students = React.useMemo(() => data?.students ?? [], [data]);
  const assignments = React.useMemo(() => data?.assignments ?? [], [data]);
  const examCells = React.useMemo(() => data?.exam_cells ?? [], [data]);
  const studyCells = React.useMemo(() => data?.study_cells ?? [], [data]);

  const selectedAssignment = React.useMemo(
    () =>
      selectedAssignmentId === "all"
        ? null
        : assignments.find((a) => a.id === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId]
  );

  // Map nhanh tra cứu cell
  const examCellMap = React.useMemo(() => {
    const map = new Map<string, ClassExamCell>();
    for (const c of examCells) {
      map.set(`${c.assignment_id}:${c.student_id}`, c);
    }
    return map;
  }, [examCells]);

  const studyCellMap = React.useMemo(() => {
    const map = new Map<string, ClassStudyCell>();
    for (const c of studyCells) {
      map.set(`${c.assignment_id}:${c.student_id}`, c);
    }
    return map;
  }, [studyCells]);

  // Tính dữ liệu hàng học sinh kèm điểm/tiến độ và trạng thái chưa nộp để lọc & sắp xếp
  const studentRows = React.useMemo(() => {
    const list = students.map((student) => {
      let missingCount = 0;
      for (const a of assignments) {
        if (a.kind === "exam") {
          const cell = examCellMap.get(`${a.id}:${student.user_id}`);
          if (
            !cell ||
            cell.status === "not_submitted" ||
            cell.status === "in_progress"
          ) {
            missingCount += 1;
          }
        } else {
          const stCell = studyCellMap.get(`${a.id}:${student.user_id}`);
          if (!stCell || stCell.cards_reviewed === 0) {
            missingCount += 1;
          }
        }
      }

      const activeExamCell =
        selectedAssignment?.kind === "exam"
          ? examCellMap.get(`${selectedAssignment.id}:${student.user_id}`) ??
            null
          : null;
      const activeStudyCell =
        selectedAssignment?.kind === "study"
          ? studyCellMap.get(`${selectedAssignment.id}:${student.user_id}`) ??
            null
          : null;

      const isMissingSelected = selectedAssignment
        ? selectedAssignment.kind === "exam"
          ? !activeExamCell ||
            activeExamCell.status === "not_submitted" ||
            activeExamCell.status === "in_progress"
          : !activeStudyCell || activeStudyCell.cards_reviewed === 0
        : missingCount > 0;

      const numericMetric = selectedAssignment
        ? selectedAssignment.kind === "exam"
          ? activeExamCell?.score ?? -1
          : activeStudyCell?.cards_reviewed ?? -1
        : assignments.length - missingCount;

      return {
        student,
        missingCount,
        isMissingSelected,
        numericMetric,
        activeExamCell,
        activeStudyCell,
      };
    });

    const filtered = onlyMissing
      ? list.filter((r) => r.isMissingSelected)
      : list;

    return [...filtered].sort((a, b) => {
      if (sortMode === "missing_first") {
        if (a.isMissingSelected !== b.isMissingSelected) {
          return a.isMissingSelected ? -1 : 1;
        }
      } else if (sortMode === "score_desc") {
        if (b.numericMetric !== a.numericMetric) {
          return b.numericMetric - a.numericMetric;
        }
      } else if (sortMode === "score_asc") {
        if (a.numericMetric !== b.numericMetric) {
          return a.numericMetric - b.numericMetric;
        }
      }
      return a.student.display_name.localeCompare(
        b.student.display_name,
        "vi"
      );
    });
  }, [
    students,
    assignments,
    examCellMap,
    studyCellMap,
    selectedAssignment,
    onlyMissing,
    sortMode,
  ]);

  // Thống kê chi tiết nếu đang chọn 1 bài kiểm tra
  const selectedExamAnalytics = React.useMemo(() => {
    if (!selectedAssignment || selectedAssignment.kind !== "exam" || !data) {
      return null;
    }
    const cellsForAssignment = examCells.filter(
      (c) => c.assignment_id === selectedAssignment.id
    );
    const detail = data.exam_details[selectedAssignment.id];
    return computeClassExamAssignmentAnalytics({
      studentsCount: students.length,
      cells: cellsForAssignment,
      detail,
    });
  }, [selectedAssignment, data, examCells, students.length]);

  // Thống kê chi tiết nếu đang chọn 1 bộ ôn tập
  const selectedStudyAnalytics = React.useMemo(() => {
    if (!selectedAssignment || selectedAssignment.kind !== "study" || !data) {
      return null;
    }
    const cellsForAssignment = studyCells.filter(
      (c) => c.assignment_id === selectedAssignment.id
    );
    const studiedCells = cellsForAssignment.filter(
      (c) => c.cards_reviewed > 0
    );
    const avgRetention =
      studiedCells.length > 0
        ? Math.round(
            (studiedCells.reduce((acc, c) => acc + c.retention_rate, 0) /
              studiedCells.length) *
              10
          ) / 10
        : 0;
    const totalLeech = cellsForAssignment.reduce(
      (acc, c) => acc + c.leech_count,
      0
    );
    const detail = data.study_details[selectedAssignment.id];
    return {
      reviewedStudentsCount: studiedCells.length,
      averageRetention: avgRetention,
      totalLeech,
      questions: detail?.questions ?? [],
    };
  }, [selectedAssignment, data, studyCells]);

  function handleExportCsv() {
    if (!data) return;
    const csvContent = generateClassGradebookCsv({
      className: data.class_name,
      students: data.students,
      assignments: data.assignments,
      examCells: data.exam_cells,
      studyCells: data.study_cells,
      selectedAssignmentId:
        selectedAssignmentId === "all" ? null : selectedAssignmentId,
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const suffix =
      selectedAssignmentId === "all"
        ? "toan-lop"
        : selectedAssignmentId.slice(0, 8);
    link.download = `bang-diem-${suffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Lấy thông tin attempt đang mở modal chấm tự luận
  const activeGradingDetail =
    gradingContext && data
      ? data.exam_details[gradingContext.assignmentId] ?? null
      : null;
  const activeGradingAttempt: TeacherAttemptItem | null =
    activeGradingDetail && gradingContext
      ? activeGradingDetail.attempts.find(
          (a) => a.id === gradingContext.attemptId
        ) ?? null
      : null;

  if (isLoading) {
    return (
      <Card className="border-slate-200 bg-white">
        <CardContent className="py-12 text-center text-sm text-slate-600">
          {vi.classes.results.loadingText}
        </CardContent>
      </Card>
    );
  }

  if (errorMsg) {
    return (
      <Card className="border-red-200 bg-red-50/40">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm font-semibold text-red-800">{errorMsg}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchResults()}
          >
            {vi.classes.results.refreshButton}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-white">
        <CardContent className="py-12 text-center text-sm text-slate-600">
          {vi.classes.results.emptyStudents}
        </CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-white">
        <CardContent className="py-12 text-center text-sm text-slate-600">
          {vi.classes.results.emptyAssignments}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Thanh công cụ lọc theo bài, sắp xếp, đánh dấu chưa nộp và xuất CSV */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="class-results-assignment-filter"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                {vi.classes.results.filterAssignmentLabel}
              </label>
              <select
                id="class-results-assignment-filter"
                value={selectedAssignmentId}
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="all">
                  {vi.classes.results.filterAllAssignments}
                </option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.kind === "exam"
                      ? vi.classes.assignments.kindExamBadge
                      : vi.classes.assignments.kindStudyBadge}
                    ] {a.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="class-results-sort"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                {vi.classes.results.sortByLabel}
              </label>
              <select
                id="class-results-sort"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                <option value="name_asc">
                  {vi.classes.results.sortNameAsc}
                </option>
                <option value="missing_first">
                  {vi.classes.results.sortStatusMissingFirst}
                </option>
                <option value="score_desc">
                  {vi.classes.results.sortScoreDesc}
                </option>
                <option value="score_asc">
                  {vi.classes.results.sortScoreAsc}
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              <span>{vi.classes.results.onlyMissingToggle}</span>
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchResults()}
            >
              {vi.classes.results.refreshButton}
            </Button>

            <Button type="button" onClick={handleExportCsv}>
              {vi.classes.results.exportCsvButton}
            </Button>
          </div>
        </div>
      </section>

      {/* Thống kê tổng quan nếu đang chọn 1 bài kiểm tra */}
      {selectedAssignment?.kind === "exam" && selectedExamAnalytics ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="text-2xl font-bold text-emerald-900">
                {selectedExamAnalytics.averageScore}/
                {selectedExamAnalytics.totalPoints}
              </div>
              <div className="text-xs font-medium text-emerald-800">
                {vi.classes.results.examSummaryAverage}
              </div>
            </div>
            <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
              <div className="text-2xl font-bold text-teal-900">
                {selectedExamAnalytics.submittedCount}/{students.length}
              </div>
              <div className="text-xs font-medium text-teal-800">
                {vi.classes.results.examSummarySubmitted}
              </div>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="text-2xl font-bold text-rose-900">
                {selectedExamAnalytics.notSubmittedCount}
              </div>
              <div className="text-xs font-medium text-rose-800">
                {vi.classes.results.examSummaryNotSubmitted}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="text-2xl font-bold text-amber-900">
                {selectedExamAnalytics.needsReviewCount}
              </div>
              <div className="text-xs font-medium text-amber-800">
                {vi.classes.results.examSummaryNeedsReview}
              </div>
            </div>
          </section>

          {/* Phân bố điểm bằng thanh CSS */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
            <h3 className="text-sm font-bold text-slate-900">
              {vi.classes.results.scoreDistributionTitle}
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {selectedExamAnalytics.scoreDistribution.map((bucket) => (
                <div
                  key={bucket.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{bucket.label}</span>
                    <span>
                      {bucket.count} HS ({bucket.percentage}%)
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all"
                      style={{ width: `${bucket.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* Thống kê tổng quan nếu đang chọn 1 bộ ôn tập FSRS */}
      {selectedAssignment?.kind === "study" && selectedStudyAnalytics ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
            <div className="text-2xl font-bold text-teal-900">
              {selectedStudyAnalytics.reviewedStudentsCount}/{students.length}
            </div>
            <div className="text-xs font-medium text-teal-800">
              {vi.classes.results.studySummaryReviewedStudents}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="text-2xl font-bold text-emerald-900">
              {selectedStudyAnalytics.averageRetention}%
            </div>
            <div className="text-xs font-medium text-emerald-800">
              {vi.classes.results.studySummaryAverageRetention}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="text-2xl font-bold text-amber-900">
              {selectedStudyAnalytics.totalLeech}
            </div>
            <div className="text-xs font-medium text-amber-800">
              {vi.classes.results.studySummaryTotalLeech}
            </div>
          </div>
        </section>
      ) : null}

      {/* Bảng Học sinh × Bài */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
        <div className="overflow-x-auto">
          {selectedAssignment === null ? (
            /* Chế độ 1: Ma trận tổng hợp Học sinh × Tất cả Bài giao */
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pr-3">
                    {vi.classes.results.colStudent}
                  </th>
                  {assignments.map((a) => (
                    <th key={a.id} className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedAssignmentId(a.id)}
                        className="text-left font-bold text-slate-800 hover:text-teal-700 hover:underline"
                      >
                        {a.title}
                      </button>
                      <span className="block text-[11px] font-normal text-slate-500">
                        {a.kind === "exam"
                          ? `${vi.classes.assignments.kindExamBadge} (${a.exam_total_points}đ)`
                          : `${vi.classes.assignments.kindStudyBadge} (${a.set_approved_cards} ${vi.classes.assignments.cardsUnit})`}
                      </span>
                    </th>
                  ))}
                  <th className="py-3 pl-3 text-right">
                    {vi.classes.results.colMissingCount}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentRows.map(({ student, missingCount }) => (
                  <tr key={student.user_id} className="hover:bg-slate-50/80">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">
                        {student.display_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {student.email}
                      </div>
                    </td>

                    {assignments.map((a) => {
                      if (a.kind === "exam") {
                        const cell = examCellMap.get(
                          `${a.id}:${student.user_id}`
                        );
                        if (!cell || cell.status === "not_submitted") {
                          return (
                            <td key={a.id} className="px-3 py-3">
                              <span className="inline-block rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                                {vi.classes.results.statusNotSubmitted}
                              </span>
                            </td>
                          );
                        }
                        if (cell.status === "in_progress") {
                          return (
                            <td key={a.id} className="px-3 py-3">
                              <span className="inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                                {vi.classes.results.statusInProgress}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={a.id} className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-teal-900">
                                {cell.score ?? 0}/{cell.total_points}
                              </span>
                              {cell.needs_manual_review ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                  {vi.classes.results.provisionalBadge}
                                </span>
                              ) : null}
                              {cell.is_late ? (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                                  {vi.classes.results.statusSubmittedLate}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {cell.attempts_count} lần •{" "}
                              {formatDurationSeconds(cell.duration_seconds)}
                            </div>
                            {cell.latest_attempt_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setGradingContext({
                                    assignmentId: a.id,
                                    attemptId: cell.latest_attempt_id!,
                                  })
                                }
                                className="mt-1 text-xs font-semibold text-teal-700 hover:underline"
                              >
                                {vi.classes.results.viewAndGradeButton}
                              </button>
                            ) : null}
                          </td>
                        );
                      }

                      const stCell = studyCellMap.get(
                        `${a.id}:${student.user_id}`
                      );
                      if (!stCell || stCell.cards_reviewed === 0) {
                        return (
                          <td key={a.id} className="px-3 py-3">
                            <span className="inline-block rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                              {vi.classes.results.statusNotSubmitted}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={a.id} className="px-3 py-3">
                          <div className="font-bold text-indigo-900">
                            {stCell.cards_reviewed}/{stCell.total_cards}{" "}
                            {vi.classes.assignments.cardsUnit}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {stCell.retention_rate}
                            {vi.classes.results.studyRetentionSuffix} •{" "}
                            {vi.classes.results.studyLeechPrefix}{" "}
                            {stCell.leech_count}
                          </div>
                        </td>
                      );
                    })}

                    <td className="py-3 pl-3 text-right">
                      {missingCount > 0 ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-900">
                          {missingCount} bài
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                          Đủ
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selectedAssignment.kind === "exam" ? (
            /* Chế độ 2: Bảng chi tiết 1 bài kiểm tra */
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pr-3">
                    {vi.classes.results.colStudent}
                  </th>
                  <th className="px-3 py-3">
                    {vi.classes.results.colScoreOrProgress}
                  </th>
                  <th className="px-3 py-3">{vi.classes.results.colStatus}</th>
                  <th className="px-3 py-3">
                    {vi.classes.results.colAttempts}
                  </th>
                  <th className="px-3 py-3">
                    {vi.classes.results.colDuration}
                  </th>
                  <th className="py-3 pl-3 text-right">
                    {vi.classes.results.colActions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentRows.map(({ student, activeExamCell }) => {
                  const status = activeExamCell?.status ?? "not_submitted";
                  return (
                    <tr key={student.user_id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900">
                          {student.display_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {student.email}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {status === "not_submitted" ||
                        status === "in_progress" ? (
                          <span className="text-xs text-slate-400">---</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-teal-900">
                              {activeExamCell?.score ?? 0}/
                              {activeExamCell?.total_points ??
                                selectedAssignment.exam_total_points}
                            </span>
                            {activeExamCell?.needs_manual_review ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                {vi.classes.results.provisionalBadge}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {status === "not_submitted" ? (
                          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                            {vi.classes.results.statusNotSubmitted}
                          </span>
                        ) : status === "in_progress" ? (
                          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                            {vi.classes.results.statusInProgress}
                          </span>
                        ) : status === "expired" ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            {vi.classes.results.statusExpired}
                          </span>
                        ) : activeExamCell?.is_late ? (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-900">
                            {vi.classes.results.statusSubmittedLate}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            {vi.classes.results.statusSubmitted}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700">
                        {activeExamCell?.attempts_count ?? 0}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {formatDurationSeconds(
                          activeExamCell?.duration_seconds ?? null
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {activeExamCell?.latest_attempt_id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setGradingContext({
                                assignmentId: selectedAssignment.id,
                                attemptId: activeExamCell.latest_attempt_id!,
                              })
                            }
                          >
                            {vi.classes.results.viewAndGradeButton}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">---</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* Chế độ 3: Bảng chi tiết 1 bộ ôn tập FSRS */
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pr-3">
                    {vi.classes.results.colStudent}
                  </th>
                  <th className="px-3 py-3">
                    {vi.classes.results.colScoreOrProgress}
                  </th>
                  <th className="px-3 py-3">{vi.classes.results.colStatus}</th>
                  <th className="px-3 py-3">
                    {vi.classes.results.studySummaryAverageRetention}
                  </th>
                  <th className="py-3 pl-3 text-right">
                    {vi.classes.results.studyLeechPrefix}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentRows.map(({ student, activeStudyCell }) => {
                  const cardsReviewed = activeStudyCell?.cards_reviewed ?? 0;
                  const totalCards =
                    activeStudyCell?.total_cards ??
                    selectedAssignment.set_approved_cards;
                  return (
                    <tr key={student.user_id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900">
                          {student.display_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {student.email}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-indigo-900">
                        {cardsReviewed}/{totalCards}{" "}
                        {vi.classes.assignments.cardsUnit}
                      </td>
                      <td className="px-3 py-3">
                        {cardsReviewed === 0 ? (
                          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                            {vi.classes.results.statusNotSubmitted}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            {vi.classes.results.statusStudied}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-teal-800">
                        {activeStudyCell?.retention_rate ?? 0}%
                      </td>
                      <td className="py-3 pl-3 text-right text-xs font-semibold text-amber-800">
                        {activeStudyCell?.leech_count ?? 0} câu
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Thống kê câu hỏi sai nhiều nhất khi chọn 1 bài kiểm tra */}
      {selectedAssignment?.kind === "exam" &&
      selectedExamAnalytics &&
      selectedExamAnalytics.questionStats.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
          <h3 className="text-base font-bold text-slate-900">
            {vi.classes.results.mostMissedQuestionsTitle}
          </h3>
          <div className="space-y-2.5">
            {selectedExamAnalytics.questionStats.map((q) => (
              <div
                key={q.examQuestionId}
                className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center ${
                  q.isMostMissed
                    ? "border-red-200 bg-red-50/40"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                      {vi.setDetails.questionNumberPrefix} {q.orderNumber}
                    </span>
                    <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {vi.parsing.questionTypes[q.snapshot.type]} • {q.points}đ
                    </span>
                    {q.isMostMissed ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
                        ⚠ {vi.exams.results.mostMissedBadge}
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">
                    {q.snapshot.stem}
                  </p>
                </div>

                <div className="w-full shrink-0 sm:w-48">
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-600">
                      {vi.exams.results.correctRateLabel}
                    </span>
                    <span
                      className={
                        q.isMostMissed ? "text-red-700" : "text-teal-800"
                      }
                    >
                      {q.correctRate}% ({q.correctCount}/
                      {selectedExamAnalytics.submittedCount})
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${
                        q.isMostMissed ? "bg-red-500" : "bg-teal-600"
                      }`}
                      style={{ width: `${q.correctRate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Thống kê câu hay quên nhất cả lớp khi chọn 1 bộ ôn tập FSRS */}
      {selectedAssignment?.kind === "study" &&
      selectedStudyAnalytics &&
      selectedStudyAnalytics.questions.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
          <h3 className="text-base font-bold text-slate-900">
            {vi.classes.results.studyMostForgottenTitle}
          </h3>
          <div className="space-y-2.5">
            {selectedStudyAnalytics.questions.slice(0, 15).map((q, idx) => (
              <div
                key={q.question_id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                      #{idx + 1}
                    </span>
                    {q.topic ? (
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        {q.topic}
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">
                    {q.stem}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
                    {q.total_lapses} {vi.classes.results.studyLapsesUnit}
                  </span>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-900">
                    {q.again_reviews_count} {vi.classes.results.studyAgainUnit}
                  </span>
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-800">
                    {q.leech_learners_count}{" "}
                    {vi.classes.results.studyLeechStudentsUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Modal xem chi tiết bài làm & chấm câu tự luận như Bước 5 */}
      <AttemptGradingModal
        open={Boolean(activeGradingAttempt && activeGradingDetail)}
        examId={activeGradingDetail?.exam_id ?? ""}
        totalPoints={activeGradingDetail?.total_points ?? 0}
        questions={activeGradingDetail?.questions ?? []}
        attempt={activeGradingAttempt}
        onClose={() => setGradingContext(null)}
        onGradeUpdated={() => {
          void fetchResults();
        }}
      />
    </div>
  );
}

