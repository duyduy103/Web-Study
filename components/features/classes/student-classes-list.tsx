"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { normalizeJoinCode } from "@/lib/classes/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StudentClassSummary } from "@/lib/classes/schemas";

interface StudentClassesListProps {
  initialClasses: StudentClassSummary[];
}

export function StudentClassesList({
  initialClasses,
}: StudentClassesListProps) {
  const router = useRouter();
  const [classes, setClasses] =
    React.useState<StudentClassSummary[]>(initialClasses);
  const [codeInput, setCodeInput] = React.useState("");
  const [confirmLeaveTarget, setConfirmLeaveTarget] =
    React.useState<StudentClassSummary | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function handleQuickJoin(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normalizeJoinCode(codeInput);
    if (!cleaned) {
      setErrorMsg(vi.classes.errors.invalidCode);
      return;
    }
    router.push(`/join/${encodeURIComponent(cleaned)}`);
  }

  async function handleConfirmLeave() {
    if (!confirmLeaveTarget) return;
    setLeaving(true);
    setErrorMsg(null);
    setNotice(null);

    try {
      const res = await fetch("/api/classes/join", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: confirmLeaveTarget.class_id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }

      setClasses((prev) =>
        prev.filter((c) => c.class_id !== confirmLeaveTarget.class_id)
      );
      setConfirmLeaveTarget(null);
      setNotice(vi.classes.join.leftSuccessNotice);
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {vi.classes.studentPageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {vi.classes.studentPageSubtitle}
          </p>
        </div>

        <form
          onSubmit={handleQuickJoin}
          className="flex w-full items-center gap-2 sm:w-auto"
        >
          <Input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder={vi.classes.join.codeInputPlaceholder}
            maxLength={8}
            aria-label={vi.classes.join.codeInputLabel}
            className="min-h-[44px] font-mono uppercase tracking-wider sm:w-40"
          />
          <Button type="submit" className="min-h-[44px] shrink-0">
            {vi.classes.joinClassButton}
          </Button>
        </form>
      </div>

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {notice}
        </div>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {classes.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-semibold text-slate-900">
              {vi.classes.emptyStudentTitle}
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-600">
              {vi.classes.emptyStudentDesc}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {classes.map((cls) => (
            <Card key={cls.class_id} className="border-slate-200 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold text-slate-900">
                    {cls.name}
                  </CardTitle>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      cls.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {cls.status === "active"
                      ? vi.classes.statusActiveMember
                      : vi.classes.statusPendingMember}
                  </span>
                </div>
                <CardDescription className="text-xs text-slate-600">
                  {vi.classes.join.teacherLabel} <strong>{cls.teacher_name}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cls.description ? (
                  <p className="text-xs text-slate-600">{cls.description}</p>
                ) : null}
                {cls.status === "pending" ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {vi.classes.join.alreadyPendingNotice}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {cls.status === "active" ? (
                    <Link
                      href={`/dashboard/classes/${cls.class_id}`}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                    >
                      {vi.classes.viewClassButton} →
                    </Link>
                  ) : (
                    <span />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmLeaveTarget(cls)}
                    className="min-h-[44px] border-red-200 text-red-700 hover:bg-red-50"
                  >
                    {vi.classes.join.leaveClassButton}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {confirmLeaveTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {vi.classes.join.leaveClassButton}
            </h2>
            <p className="text-sm text-slate-700">
              {vi.classes.join.leaveConfirmPrefix}{" "}
              <strong>&ldquo;{confirmLeaveTarget.name}&rdquo;</strong>
              {vi.classes.join.leaveConfirmSuffix}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={leaving}
                onClick={() => setConfirmLeaveTarget(null)}
                className="min-h-[44px]"
              >
                {vi.classes.cancelButton}
              </Button>
              <Button
                type="button"
                disabled={leaving}
                onClick={handleConfirmLeave}
                className="min-h-[44px] bg-red-600 text-white hover:bg-red-700"
              >
                {leaving
                  ? vi.classes.join.leavingClassButton
                  : vi.classes.join.leaveClassButton}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

