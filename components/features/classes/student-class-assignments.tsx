"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import {
  isAssignmentDueSoon,
  type StudentAssignmentStatus,
  type StudentClassAssignmentItem,
} from "@/lib/classes/assignments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface StudentClassAssignmentsProps {
  assignments: StudentClassAssignmentItem[];
  showClassName?: boolean;
  emptyMessage?: string;
}

function getStatusBadgeClass(status: StudentAssignmentStatus): string {
  switch (status) {
    case "submitted":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "in_progress":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "overdue":
      return "bg-red-50 text-red-700 border-red-200";
    case "not_started":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function StudentClassAssignments({
  assignments,
  showClassName = false,
  emptyMessage = vi.classes.assignments.emptyStudentList,
}: StudentClassAssignmentsProps) {
  const router = useRouter();
  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  async function handleStartExam(item: StudentClassAssignmentItem) {
    setStartingId(item.id);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/classes/${item.class_id}/assignments/${item.id}/start-exam`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        error?: string;
        attemptToken?: string;
      };
      if (!res.ok || !data.attemptToken) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }

      router.push(
        `/dashboard/classes/${item.class_id}/assignments/${item.id}/exam/${encodeURIComponent(
          data.attemptToken
        )}`
      );
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setStartingId(null);
    }
  }

  if (assignments.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-white">
        <CardContent className="py-10 text-center text-sm text-slate-600">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {assignments.map((item) => {
        const dueSoon = isAssignmentDueSoon(item.due_at, item.student_status);
        const canStartNewAttempt =
          item.kind === "exam" &&
          !item.is_locked_now &&
          (item.max_attempts === null ||
            item.max_attempts <= 0 ||
            item.attempts_used < item.max_attempts ||
            Boolean(item.active_attempt_token));
        const hasResultToView =
          item.kind === "exam" &&
          Boolean(item.latest_attempt_token) &&
          (item.latest_attempt_status === "submitted" ||
            item.latest_attempt_status === "expired");

        return (
          <Card key={item.id} className="border-slate-200 bg-white">
            <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      item.kind === "exam"
                        ? "bg-teal-50 text-teal-800 border-teal-200"
                        : "bg-sky-50 text-sky-800 border-sky-200"
                    }`}
                  >
                    {item.kind === "exam"
                      ? vi.classes.assignments.kindExamBadge
                      : vi.classes.assignments.kindStudyBadge}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeClass(
                      item.student_status
                    )}`}
                  >
                    {vi.classes.assignments.studentStatus[item.student_status]}
                  </span>
                  {dueSoon ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                      ⏰ {vi.classes.assignments.dueSoonBadge}
                    </span>
                  ) : null}
                  {showClassName ? (
                    <Link
                      href={`/dashboard/classes/${item.class_id}`}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {item.class_name}
                    </Link>
                  ) : null}
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {item.title}
                </h3>
                {item.instructions ? (
                  <p className="text-xs text-slate-600">{item.instructions}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                  <span>
                    {item.due_at
                      ? `${vi.classes.assignments.duePrefix} ${new Date(
                          item.due_at
                        ).toLocaleString("vi-VN")}`
                      : vi.classes.assignments.noDueLabel}
                  </span>

                  {item.kind === "exam" ? (
                    <>
                      {item.duration_min ? (
                        <span>• {item.duration_min} phút</span>
                      ) : null}
                      <span>
                        • {vi.classes.assignments.attemptsLabelPrefix}{" "}
                        <strong>
                          {item.attempts_used}/{item.max_attempts ?? "∞"}
                        </strong>
                      </span>
                      {item.latest_score !== null ? (
                        <span className="font-bold text-emerald-700">
                          • {vi.classes.assignments.scoreLabelPrefix}{" "}
                          {item.latest_score}/{item.total_points ?? 10}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span>
                      • {vi.classes.assignments.cardsReviewedPrefix}{" "}
                      <strong>
                        {item.reviewed_card_count}/{item.approved_card_count}
                      </strong>{" "}
                      {vi.classes.assignments.cardsUnit}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {item.kind === "exam" ? (
                  <>
                    {hasResultToView && item.latest_attempt_token ? (
                      <Link
                        href={`/dashboard/classes/${item.class_id}/assignments/${item.id}/exam/${encodeURIComponent(
                          item.latest_attempt_token
                        )}`}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {vi.classes.assignments.viewResultButton}
                      </Link>
                    ) : null}

                    {canStartNewAttempt ? (
                      <Button
                        type="button"
                        disabled={startingId === item.id}
                        onClick={() => void handleStartExam(item)}
                        className="min-h-[44px]"
                      >
                        {item.active_attempt_token
                          ? vi.classes.assignments.continueExamButton
                          : item.attempts_used > 0
                            ? vi.classes.assignments.retakeExamButton
                            : vi.classes.assignments.startExamButton}
                      </Button>
                    ) : !hasResultToView ? (
                      <span className="text-xs font-medium text-slate-500">
                        {vi.classes.assignments.lockedNotice}
                      </span>
                    ) : null}
                  </>
                ) : item.is_locked_now ? (
                  <span className="text-xs font-medium text-slate-500">
                    {vi.classes.assignments.lockedNotice}
                  </span>
                ) : (
                  <Link
                    href={`/dashboard/classes/${item.class_id}/assignments/${item.id}/study`}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    {vi.classes.assignments.studyButton} →
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

