"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsClientProps {
  initialDisplayName: string;
  initialRole: UserRole;
  email: string;
}

export function SettingsClient({
  initialDisplayName,
  initialRole,
  email,
}: SettingsClientProps) {
  const router = useRouter();

  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileNotice, setProfileNotice] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const [role, setRole] = React.useState<UserRole>(initialRole);
  const [confirmRoleSwitch, setConfirmRoleSwitch] = React.useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = React.useState(false);
  const [roleNotice, setRoleNotice] = React.useState<string | null>(null);
  const [roleError, setRoleError] = React.useState<string | null>(null);

  const [recoveryCode, setRecoveryCode] = React.useState("");
  const [isMerging, setIsMerging] = React.useState(false);
  const [mergeNotice, setMergeNotice] = React.useState<string | null>(null);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

  const [deleteKeyword, setDeleteKeyword] = React.useState("");
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const clean = displayName.trim();
    if (!clean) return;
    setIsSavingProfile(true);
    setProfileNotice(null);
    setProfileError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          displayName: clean,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? vi.review.editor.errorStatus);
      }
      setProfileNotice(vi.settings.profileSavedNotice);
      router.refresh();
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSwitchRole() {
    if (!confirmRoleSwitch) return;
    const targetRole: UserRole = role === "teacher" ? "student" : "teacher";
    setIsSwitchingRole(true);
    setRoleNotice(null);
    setRoleError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "switch_role",
          targetRole,
          confirmed: true,
        }),
      });
      const data = (await res.json()) as { error?: string; role?: UserRole };
      if (!res.ok) {
        throw new Error(data.error ?? vi.review.editor.errorStatus);
      }
      setRole(data.role ?? targetRole);
      setConfirmRoleSwitch(false);
      setRoleNotice(vi.settings.roleSwitchedNotice);
      router.refresh();
    } catch (err) {
      setRoleError(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
    } finally {
      setIsSwitchingRole(false);
    }
  }

  async function handleMergeAnonymous(e: React.FormEvent) {
    e.preventDefault();
    const clean = recoveryCode.trim();
    if (!clean) return;
    setIsMerging(true);
    setMergeNotice(null);
    setMergeError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge_anonymous",
          recoveryCode: clean,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        mergedCards?: number;
        movedLogs?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? vi.settings.mergeInvalidCodeError);
      }
      setRecoveryCode("");
      setMergeNotice(
        `${vi.settings.mergeSuccessPrefix} ${data.mergedCards ?? 0} ${vi.settings.mergeSuccessMiddle} ${data.movedLogs ?? 0} ${vi.settings.mergeSuccessSuffix}`
      );
      router.refresh();
    } catch (err) {
      setMergeError(
        err instanceof Error ? err.message : vi.settings.mergeInvalidCodeError
      );
    } finally {
      setIsMerging(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteKeyword.trim() !== vi.settings.deleteConfirmKeyword) {
      setDeleteError(vi.settings.deleteKeywordMismatchError);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmKeyword: deleteKeyword.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? vi.review.editor.errorStatus);
      }
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : vi.review.editor.errorStatus
      );
      setIsDeletingAccount(false);
    }
  }

  const nextRoleLabel =
    role === "teacher"
      ? vi.settings.switchToStudentTitle
      : vi.settings.switchToTeacherTitle;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
        >
          ← {vi.nav.backToDashboard}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          {vi.settings.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{vi.settings.pageSubtitle}</p>
      </div>

      {/* 1. Tên hiển thị */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          {vi.settings.profileSectionTitle}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{email}</p>

        <form
          onSubmit={(e) => void handleSaveProfile(e)}
          className="mt-4 space-y-3"
        >
          {profileNotice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
              {profileNotice}
            </div>
          ) : null}
          {profileError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {profileError}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="settings-display-name">
              {vi.settings.displayNameLabel}
            </Label>
            <Input
              id="settings-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              required
              className="min-h-[44px]"
            />
          </div>

          <Button
            type="submit"
            disabled={isSavingProfile}
            className="min-h-[44px]"
          >
            {isSavingProfile
              ? vi.settings.savingProfileButton
              : vi.settings.saveProfileButton}
          </Button>
        </form>
      </section>

      {/* 2. Chuyển đổi vai trò */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            {vi.settings.roleSectionTitle}
          </h2>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-900">
            {vi.settings.currentRolePrefix}{" "}
            {role === "teacher"
              ? vi.roles.teacherLabel
              : vi.roles.studentLabel}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {role === "teacher"
            ? vi.settings.switchToStudentWarning
            : vi.settings.switchToTeacherWarning}
        </p>

        {roleNotice ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
            {roleNotice}
          </div>
        ) : null}
        {roleError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
            {roleError}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs font-medium text-slate-800 sm:text-sm">
            <input
              type="checkbox"
              checked={confirmRoleSwitch}
              onChange={(e) => setConfirmRoleSwitch(e.target.checked)}
              className="h-4 w-4 rounded accent-teal-600"
            />
            <span>{vi.settings.confirmSwitchCheckbox}</span>
          </label>

          <Button
            type="button"
            variant="secondary"
            disabled={!confirmRoleSwitch || isSwitchingRole}
            onClick={() => void handleSwitchRole()}
            className="min-h-[44px]"
          >
            {isSwitchingRole ? vi.settings.switchingRoleButton : nextRoleLabel}
          </Button>
        </div>
      </section>

      {/* 3. Gộp hồ sơ ẩn danh cũ bằng mã khôi phục 12 ký tự */}
      <section className="rounded-3xl border border-teal-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          🔑 {vi.settings.mergeSectionTitle}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {vi.settings.mergeSectionDesc}
        </p>

        <form
          onSubmit={(e) => void handleMergeAnonymous(e)}
          className="mt-4 space-y-3"
        >
          {mergeNotice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
              {mergeNotice}
            </div>
          ) : null}
          {mergeError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
              {mergeError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="merge-recovery-code">
                {vi.settings.mergeCodeLabel}
              </Label>
              <Input
                id="merge-recovery-code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder={vi.settings.mergeCodePlaceholder}
                maxLength={24}
                className="min-h-[44px] font-mono uppercase"
              />
            </div>
            <Button
              type="submit"
              disabled={isMerging || !recoveryCode.trim()}
              className="min-h-[44px]"
            >
              {isMerging ? vi.settings.mergingButton : vi.settings.mergeButton}
            </Button>
          </div>
        </form>
      </section>

      {/* 4. Xóa tài khoản & toàn bộ dữ liệu */}
      <section className="rounded-3xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
        <h2 className="text-base font-bold text-red-900">
          {vi.settings.dangerSectionTitle}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-red-800 sm:text-sm">
          {vi.settings.dangerSectionDesc}
        </p>

        <form
          onSubmit={(e) => void handleDeleteAccount(e)}
          className="mt-4 space-y-3"
        >
          {deleteError ? (
            <div className="rounded-xl border border-red-300 bg-red-100 px-3.5 py-2.5 text-xs font-medium text-red-900">
              {deleteError}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm-keyword" className="text-red-950">
              {vi.settings.deleteConfirmPromptPrefix}{" "}
              <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono font-bold">
                {vi.settings.deleteConfirmKeyword}
              </code>
            </Label>
            <Input
              id="delete-confirm-keyword"
              value={deleteKeyword}
              onChange={(e) => setDeleteKeyword(e.target.value)}
              placeholder={vi.settings.deleteConfirmKeyword}
              className="min-h-[44px] border-red-300 bg-white font-mono"
            />
          </div>

          <Button
            type="submit"
            disabled={isDeletingAccount}
            className="min-h-[44px] bg-red-600 text-white hover:bg-red-700"
          >
            {isDeletingAccount
              ? vi.settings.deletingAccountButton
              : vi.settings.deleteAccountButton}
          </Button>
        </form>
      </section>
    </div>
  );
}

