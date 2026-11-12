"use client";

import * as React from "react";
import Link from "next/link";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import {
  generateExamAttemptsCsv,
  generateQrCodeSvg,
} from "@/lib/grading/qr-and-csv";
import {
  AttemptGradingModal,
  type TeacherAttemptItem,
  type TeacherExamQuestionItem,
} from "@/components/features/exams/attempt-grading-modal";

interface ExamResultsWorkspaceProps {
  exam: {
    id: string;
    setId: string | null;
    title: string;
    code: string;
    durationMin: number | null;
    isOpen: boolean;
    showAnswers: boolean;
    opensAt: string | null;
    closesAt: string | null;
    maxAttempts: number;
    totalPoints: number;
    createdAt: string;
  };
  questions: TeacherExamQuestionItem[];
  initialAttempts: TeacherAttemptItem[];
}

function formatDurationText(
  startedAt: string,
  submittedAt: string | null
): string {
  if (!submittedAt) return "---";
  const diffSec = Math.max(
    0,
    Math.floor(
      (new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )
  );
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}p ${String(secs).padStart(2, "0")}s`;
}

export function ExamResultsWorkspace({
  exam,
  questions,
  initialAttempts,
}: ExamResultsWorkspaceProps) {
  const [isOpen, setIsOpen] = React.useState(exam.isOpen);
  const [isTogglingOpen, setIsTogglingOpen] = React.useState(false);
  const [attempts, setAttempts] =
    React.useState<TeacherAttemptItem[]>(initialAttempts);
  const [selectedAttemptId, setSelectedAttemptId] = React.useState<
    string | null
  >(null);
  const [copiedType, setCopiedType] = React.useState<"code" | "link" | null>(
    null
  );

  const configuredBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? ""
  ).replace(/\/+$/, "");
  const joinPath = `/t/${exam.code}`;
  const fullJoinUrl = configuredBaseUrl
    ? `${configuredBaseUrl}${joinPath}`
    : joinPath;

  const qrSvg = React.useMemo(
    () => generateQrCodeSvg(fullJoinUrl),
    [fullJoinUrl]
  );

  const submittedAttempts = React.useMemo(
    () =>
      attempts.filter(
        (a) => a.status === "submitted" || a.status === "expired"
      ),
    [attempts]
  );

  const avgScore = React.useMemo(() => {
    if (submittedAttempts.length === 0) return 0;
    const sum = submittedAttempts.reduce((acc, a) => acc + (a.score ?? 0), 0);
    return Math.round((sum / submittedAttempts.length) * 100) / 100;
  }, [submittedAttempts]);

  const needsReviewCount = React.useMemo(
    () => submittedAttempts.filter((a) => a.needsManualReview).length,
    [submittedAttempts]
  );

  const questionStats = React.useMemo(() => {
    const totalDone = submittedAttempts.length;
    const list = questions.map((q, index) => {
      let correct = 0;
      let pendingReview = 0;
      for (const att of submittedAttempts) {
        const ans = att.answers.find(
          (a) => a.examQuestionId === q.examQuestionId
        );
        if (ans?.isCorrect) {
          correct += 1;
        }
        if (ans?.needsReview) {
          pendingReview += 1;
        }
      }
      const correctRate =
        totalDone > 0 ? Math.round((correct / totalDone) * 100) : 0;
      return {
        ...q,
        orderNumber: index + 1,
        correctCount: correct,
        pendingReviewCount: pendingReview,
        correctRate,
      };
    });

    const minRate =
      totalDone > 0 && list.length > 0
        ? Math.min(...list.map((item) => item.correctRate))
        : 100;

    return list.map((item) => ({
      ...item,
      isMostMissed:
        totalDone > 0 && item.correctRate === minRate && item.correctRate < 80,
    }));
  }, [questions, submittedAttempts]);

  async function handleToggleOpen() {
    setIsTogglingOpen(true);
    try {
      const nextVal = !isOpen;
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_open",
          isOpen: nextVal,
        }),
      });
      if (res.ok) {
        setIsOpen(nextVal);
      }
    } finally {
      setIsTogglingOpen(false);
    }
  }

  function handleCopy(text: string, type: "code" | "link") {
    void navigator.clipboard?.writeText(text);
    setCopiedType(type);
    window.setTimeout(() => setCopiedType(null), 2000);
  }

  function handleExportCsv() {
    const csvContent = generateExamAttemptsCsv(
      attempts.map((a) => ({
        studentName: a.studentName,
        studentClass: a.studentClass,
        score: a.score,
        totalPoints: exam.totalPoints,
        status: a.status,
        needsManualReview: a.needsManualReview,
        durationSeconds: a.submittedAt
          ? Math.max(
              0,
              Math.floor(
                (new Date(a.submittedAt).getTime() -
                  new Date(a.startedAt).getTime()) /
                  1000
              )
            )
          : null,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
      }))
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bang-diem-${exam.code}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const selectedAttempt =
    attempts.find((a) => a.id === selectedAttemptId) ?? null;

  return (
    <div className="space-y-6 pb-16">
      {/* Khối Chia sẻ Link, Mã 6 ký tự & QR SVG */}
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-sky-50/60 p-5 shadow-2xs sm:p-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                {exam.title}
              </h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isOpen
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {isOpen
                  ? vi.exams.share.statusOpenBadge
                  : vi.exams.share.statusClosedBadge}
              </span>
            </div>
            <p className="text-xs text-slate-600 sm:text-sm">
              {vi.exams.share.subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="rounded-xl border border-teal-300 bg-white px-4 py-2.5 shadow-2xs">
                <span className="block text-[11px] font-medium text-slate-500">
                  {vi.exams.share.codeLabel}
                </span>
                <span className="font-mono text-2xl font-extrabold tracking-widest text-teal-800">
                  {exam.code}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCopy(exam.code, "code")}
                >
                  {copiedType === "code"
                    ? vi.exams.share.copiedNotice
                    : vi.exams.share.copyCodeButton}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCopy(fullJoinUrl, "link")}
                >
                  {copiedType === "link"
                    ? vi.exams.share.copiedNotice
                    : vi.exams.share.copyLinkButton}
                </Button>
                <Link
                  href={joinPath}
                  target="_blank"
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {vi.exams.share.openStudentViewButton} ↗
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant={isOpen ? "outline" : "default"}
                  disabled={isTogglingOpen}
                  onClick={() => void handleToggleOpen()}
                >
                  {isOpen
                    ? vi.exams.share.toggleCloseButton
                    : vi.exams.share.toggleOpenButton}
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-600">
              {vi.exams.share.linkLabel}:{" "}
              <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-teal-900">
                {fullJoinUrl}
              </code>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs md:self-center">
            <div
              aria-label={vi.exams.share.qrAlt}
              className="h-36 w-36"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <span className="mt-1 font-mono text-xs font-bold text-slate-700">
              /t/{exam.code}
            </span>
          </div>
        </div>
      </section>

      {/* Khối Thống kê tổng quan */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-2xl font-bold text-slate-900">
            {attempts.length}
          </div>
          <div className="text-xs font-medium text-slate-600">
            {vi.exams.results.summaryTotalAttempts}
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
          <div className="text-2xl font-bold text-teal-900">
            {submittedAttempts.length}
          </div>
          <div className="text-xs font-medium text-teal-800">
            {vi.exams.results.summarySubmitted}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-2xl font-bold text-emerald-900">
            {avgScore}/{exam.totalPoints}
          </div>
          <div className="text-xs font-medium text-emerald-800">
            {vi.exams.results.summaryAverageScore}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="text-2xl font-bold text-amber-900">
            {needsReviewCount}
          </div>
          <div className="text-xs font-medium text-amber-800">
            {vi.exams.results.summaryNeedsReview}
          </div>
        </div>
      </section>

      {/* Bảng lượt làm của học sinh */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 sm:text-lg">
            {vi.exams.results.attemptsTableTitle} ({attempts.length})
          </h2>
          {attempts.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
            >
              ⬇ {vi.exams.results.exportCsvButton}
            </Button>
          ) : null}
        </div>

        {attempts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
            {vi.exams.results.emptyAttempts}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pr-3">{vi.exams.results.colStudentName}</th>
                  <th className="px-3 py-3">{vi.exams.results.colClass}</th>
                  <th className="px-3 py-3">{vi.exams.results.colScore}</th>
                  <th className="px-3 py-3">{vi.exams.results.colStatus}</th>
                  <th className="px-3 py-3">{vi.exams.results.colDuration}</th>
                  <th className="px-3 py-3">{vi.exams.results.colSubmittedAt}</th>
                  <th className="py-3 pl-3 text-right">
                    {vi.exams.results.colActions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((att) => {
                  const pendingQCount = att.answers.filter(
                    (a) => a.needsReview
                  ).length;

                  return (
                    <tr key={att.id} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-3 font-semibold text-slate-900">
                        {att.studentName}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {att.studentClass ?? "---"}
                      </td>
                      <td className="px-3 py-3">
                        {att.status === "in_progress" ? (
                          <span className="text-xs text-slate-400">---</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-teal-900">
                              {att.score ?? 0}/{exam.totalPoints}
                            </span>
                            {att.needsManualReview ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                {vi.exams.results.provisionalBadge} (
                                {pendingQCount}{" "}
                                {vi.exams.results.needsReviewCountSuffix})
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            att.status === "submitted"
                              ? "bg-emerald-50 text-emerald-800"
                              : att.status === "expired"
                                ? "bg-amber-50 text-amber-800"
                                : "bg-sky-50 text-sky-800"
                          }`}
                        >
                          {att.status === "submitted"
                            ? vi.exams.results.statusSubmitted
                            : att.status === "expired"
                              ? vi.exams.results.statusExpired
                              : vi.exams.results.statusInProgress}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {formatDurationText(att.startedAt, att.submittedAt)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {att.submittedAt
                          ? new Date(att.submittedAt).toLocaleString("vi-VN")
                          : "---"}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedAttemptId(att.id)}
                          className="h-9 px-3 text-xs"
                        >
                          {vi.exams.results.viewAttemptButton}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Thống kê tỉ lệ làm đúng theo từng câu */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">
          {vi.exams.results.questionStatsTitle}
        </h2>

        <div className="space-y-2.5">
          {questionStats.map((q) => (
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
                  {q.pendingReviewCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                      {vi.exams.results.pendingReviewLabel}{" "}
                      {q.pendingReviewCount}
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
                    {submittedAttempts.length})
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

      <AttemptGradingModal
        open={Boolean(selectedAttempt)}
        examId={exam.id}
        totalPoints={exam.totalPoints}
        questions={questions}
        attempt={selectedAttempt}
        onClose={() => setSelectedAttemptId(null)}
        onGradeUpdated={(payload) => {
          setAttempts((curr) =>
            curr.map((att) => {
              if (att.id !== payload.attemptId) return att;
              const existingIdx = att.answers.findIndex(
                (a) => a.examQuestionId === payload.examQuestionId
              );
              const nextAnswers = [...att.answers];
              if (existingIdx >= 0) {
                nextAnswers[existingIdx] = {
                  ...nextAnswers[existingIdx]!,
                  pointsAwarded: payload.pointsAwarded,
                  isCorrect: payload.isCorrect,
                  needsReview: false,
                };
              } else {
                nextAnswers.push({
                  examQuestionId: payload.examQuestionId,
                  questionId: null,
                  response: "",
                  pointsAwarded: payload.pointsAwarded,
                  isCorrect: payload.isCorrect,
                  needsReview: false,
                });
              }

              return {
                ...att,
                score: payload.newTotalScore,
                needsManualReview: payload.needsManualReview,
                answers: nextAnswers,
              };
            })
          );
        }}
      />
    </div>
  );
}

