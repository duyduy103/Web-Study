"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TeacherClassSummary } from "@/lib/classes/schemas";

interface TeacherClassesListProps {
  initialClasses: TeacherClassSummary[];
  maxClasses: number;
  maxStudentsPerClass: number;
  isPremium: boolean;
}

export function TeacherClassesList({
  initialClasses,
  maxClasses,
  maxStudentsPerClass,
  isPremium,
}: TeacherClassesListProps) {
  const router = useRouter();
  const [classes, setClasses] =
    React.useState<TeacherClassSummary[]>(initialClasses);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requireApproval, setRequireApproval] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const activeCount = classes.filter((c) => !c.archived_at).length;
  const reachedLimit = activeCount >= maxClasses;

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          requireApproval,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        class?: TeacherClassSummary;
      };

      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }

      if (data.class) {
        const created: TeacherClassSummary = {
          ...data.class,
          active_student_count: 0,
          pending_count: 0,
          open_assignment_count: 0,
        };
        setClasses((prev) => [created, ...prev]);
        setModalOpen(false);
        setName("");
        setDescription("");
        setRequireApproval(false);
        router.push(`/dashboard/classes/${created.id}`);
        router.refresh();
      }
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {vi.classes.teacherPageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {vi.classes.teacherPageSubtitle}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Lớp đang hoạt động: <strong>{activeCount}/{maxClasses}</strong> • Sĩ số tối đa:{" "}
            <strong>{maxStudentsPerClass} {vi.classes.statsStudentsUnit}/lớp</strong>
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setModalOpen(true);
          }}
          className="min-h-[44px]"
        >
          + {vi.classes.createClassButton}
        </Button>
      </div>

      {reachedLimit ? (
        <div
          role="status"
          className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center"
        >
          <div>
            {isPremium ? (
              <p>
                Gói Premium cho phép tối đa <strong>{maxClasses} lớp</strong> đang hoạt động (hiện tại {activeCount}/{maxClasses}). Thầy/cô có thể lưu trữ lớp cũ trước khi tạo thêm lớp mới.
              </p>
            ) : (
              <p>
                Gói miễn phí được tạo tối đa <strong>{maxClasses} lớp</strong> đang hoạt động (hiện tại {activeCount}/{maxClasses}). Nâng cấp gói <strong>Premium</strong> để tạo tới <strong>10 lớp</strong> và tối đa <strong>200 học sinh/lớp</strong>.
              </p>
            )}
          </div>
          {!isPremium ? (
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Nâng cấp Premium
            </Link>
          ) : null}
        </div>
      ) : null}

      {classes.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-base font-semibold text-slate-900">
              {vi.classes.emptyTeacherTitle}
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-600">
              {vi.classes.emptyTeacherDesc}
            </p>
            <Button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 min-h-[44px]"
            >
              + {vi.classes.createClassButton}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {classes.map((cls) => (
            <Card
              key={cls.id}
              className={`border-slate-200 bg-white transition-shadow hover:shadow-md ${
                cls.archived_at ? "opacity-75" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold text-slate-900">
                    {cls.name}
                  </CardTitle>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      cls.archived_at
                        ? "bg-slate-200 text-slate-700"
                        : cls.is_open
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {cls.archived_at
                      ? vi.classes.statusArchivedBadge
                      : cls.is_open
                        ? vi.classes.statusOpenBadge
                        : vi.classes.statusClosedBadge}
                  </span>
                </div>
                {cls.description ? (
                  <CardDescription className="line-clamp-2 text-xs text-slate-600">
                    {cls.description}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono font-bold tracking-wider text-slate-900">
                    Mã: {cls.join_code}
                  </span>
                  <span className="rounded-lg bg-teal-50 px-2.5 py-1 font-medium text-teal-800">
                    {cls.active_student_count} {vi.classes.statsStudentsUnit}
                  </span>
                  {cls.pending_count > 0 ? (
                    <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                      {cls.pending_count} {vi.classes.statsPendingUnit}
                    </span>
                  ) : null}
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">
                    {cls.open_assignment_count} {vi.classes.statsOpenAssignmentsUnit}
                  </span>
                </div>

                <Link
                  href={`/dashboard/classes/${cls.id}`}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-teal-600 bg-teal-50/40 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                >
                  {vi.classes.manageClassButton} →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-class-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2
              id="create-class-title"
              className="text-lg font-bold text-slate-900"
            >
              {vi.classes.createModalTitle}
            </h2>

            <form onSubmit={handleCreateClass} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="class-name">{vi.classes.classNameLabel}</Label>
                <Input
                  id="class-name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={vi.classes.classNamePlaceholder}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="class-desc">{vi.classes.classDescLabel}</Label>
                <textarea
                  id="class-desc"
                  rows={3}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={vi.classes.classDescPlaceholder}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="text-xs leading-relaxed text-slate-700">
                  <strong className="block text-sm text-slate-900">
                    {vi.classes.requireApprovalLabel}
                  </strong>
                  {vi.classes.requireApprovalHint}
                </span>
              </label>

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
                  disabled={submitting || name.trim().length === 0}
                  className="min-h-[44px]"
                >
                  {submitting
                    ? vi.classes.creatingClassButton
                    : vi.classes.createClassButton}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

