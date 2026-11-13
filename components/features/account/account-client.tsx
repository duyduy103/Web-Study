"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  calculatePasswordStrength,
} from "@/lib/auth/password-rules";

interface AccountClientProps {
  initialDisplayName: string;
  initialRole: UserRole;
  email: string;
  quotaStatus: {
    remainingToday: number;
    dailyLimit: number;
  };
  usageStats: {
    setCount: number;
    storageMb: number;
  };
}

export function AccountClient({
  initialDisplayName,
  initialRole,
  email,
  quotaStatus,
  usageStats,
}: AccountClientProps) {
  const router = useRouter();

  // 1. Tên hiển thị
  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileNotice, setProfileNotice] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  // 2. Đổi email
  const [newEmail, setNewEmail] = React.useState("");
  const [isChangingEmail, setIsChangingEmail] = React.useState(false);
  const [emailNotice, setEmailNotice] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);

  // 3. Đổi mật khẩu
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [passwordNotice, setPasswordNotice] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  // 4. Đăng xuất thiết bị khác
  const [isLoggingOutAll, setIsLoggingOutAll] = React.useState(false);
  const [logoutAllNotice, setLogoutAllNotice] = React.useState<string | null>(null);

  // 5. Tải dữ liệu cá nhân
  const [isExporting, setIsExporting] = React.useState(false);

  // 6. Giảm chuyển động
  const [reduceMotion, setReduceMotion] = React.useState(false);

  // 7. Vai trò
  const [role, setRole] = React.useState<UserRole>(initialRole);
  const [confirmRoleSwitch, setConfirmRoleSwitch] = React.useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = React.useState(false);
  const [roleNotice, setRoleNotice] = React.useState<string | null>(null);
  const [roleError, setRoleError] = React.useState<string | null>(null);

  // 8. Gộp lịch ôn
  const [recoveryCode, setRecoveryCode] = React.useState("");
  const [isMerging, setIsMerging] = React.useState(false);
  const [mergeNotice, setMergeNotice] = React.useState<string | null>(null);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

  // 9. Xóa tài khoản
  const [deleteKeyword, setDeleteKeyword] = React.useState("");
  const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Đánh giá mật khẩu thời gian thực
  const strengthResult = React.useMemo(() => {
    return calculatePasswordStrength(newPassword, email);
  }, [newPassword, email]);

  const criteria = strengthResult.criteria;

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("memoquiz_reduce_motion");
      if (stored === "true") {
        setReduceMotion(true);
        document.documentElement.setAttribute("data-reduce-motion", "true");
      }
    } catch {
      // ignore
    }
  }, []);

  function handleToggleReduceMotion(checked: boolean) {
    setReduceMotion(checked);
    try {
      if (checked) {
        localStorage.setItem("memoquiz_reduce_motion", "true");
        document.documentElement.setAttribute("data-reduce-motion", "true");
      } else {
        localStorage.removeItem("memoquiz_reduce_motion");
        document.documentElement.removeAttribute("data-reduce-motion");
      }
    } catch {
      // ignore
    }
  }

  // Xử lý đổi tên hiển thị
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
      if (!res.ok) throw new Error(data.error ?? "Cập nhật thất bại");
      setProfileNotice(vi.settings.profileSavedNotice);
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Cập nhật thất bại");
    } finally {
      setIsSavingProfile(false);
    }
  }

  // Xử lý đổi email
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const clean = newEmail.trim();
    if (!clean || !clean.includes("@")) return;
    setIsChangingEmail(true);
    setEmailNotice(null);
    setEmailError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_email",
          newEmail: clean,
        }),
      });
      const data = (await res.json()) as { error?: string; notice?: string };
      if (!res.ok) throw new Error(data.error ?? "Đổi email thất bại");
      setEmailNotice(data.notice ?? vi.settings.emailChangeSentNotice);
      setNewEmail("");
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Đổi email thất bại");
    } finally {
      setIsChangingEmail(false);
    }
  }

  // Xử lý đổi mật khẩu
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError(vi.auth.validation.passwordMismatch);
      return;
    }
    setIsChangingPassword(true);
    setPasswordNotice(null);
    setPasswordError(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await res.json()) as { error?: string; notice?: string };
      if (!res.ok) throw new Error(data.error ?? "Đổi mật khẩu thất bại");
      setPasswordNotice(data.notice ?? vi.settings.passwordChangedNotice);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Đổi mật khẩu thất bại");
    } finally {
      setIsChangingPassword(false);
    }
  }

  // Xử lý đăng xuất mọi thiết bị khác
  async function handleLogoutAllDevices() {
    setIsLoggingOutAll(true);
    setLogoutAllNotice(null);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout_all" }),
      });
      const data = (await res.json()) as { error?: string; notice?: string };
      if (!res.ok) throw new Error(data.error ?? "Đăng xuất thất bại");
      setLogoutAllNotice(data.notice ?? vi.settings.logoutAllNotice);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsLoggingOutAll(false);
    }
  }

  // Xử lý tải file dữ liệu JSON
  async function handleExportPersonalData() {
    setIsExporting(true);
    try {
      window.location.href = "/api/account/export";
    } finally {
      setTimeout(() => setIsExporting(false), 2000);
    }
  }

  // Xử lý đổi vai trò
  async function handleSwitchRole(e: React.FormEvent) {
    e.preventDefault();
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
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Đổi vai trò thất bại");
      setRole(targetRole);
      setConfirmRoleSwitch(false);
      setRoleNotice(vi.settings.roleSwitchedNotice);
      router.refresh();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Đổi vai trò thất bại");
    } finally {
      setIsSwitchingRole(false);
    }
  }

  // Xử lý gộp lịch ôn
  async function handleMerge(e: React.FormEvent) {
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
      if (!res.ok) throw new Error(data.error ?? vi.settings.mergeInvalidCodeError);
      setMergeNotice(
        `${vi.settings.mergeSuccessPrefix} ${data.mergedCards ?? 0} ${vi.settings.mergeSuccessMiddle} ${data.movedLogs ?? 0} ${vi.settings.mergeSuccessSuffix}`
      );
      setRecoveryCode("");
      router.refresh();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : vi.settings.mergeInvalidCodeError);
    } finally {
      setIsMerging(false);
    }
  }

  // Xử lý xóa tài khoản
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
        body: JSON.stringify({ confirmKeyword: deleteKeyword.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Không thể xóa tài khoản");
      router.push("/login?deleted=1");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Xóa tài khoản thất bại");
      setIsDeletingAccount(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Bảng điều khiển
          </Link>
          <h1 className="mt-1 text-2xl font-black text-[var(--heading)] sm:text-3xl">
            {vi.settings.pageTitle}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {vi.settings.pageSubtitle}
          </p>
        </div>

        {/* Khối 1: Gói và mức sử dụng */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-[var(--heading)]">
                  {vi.settings.planSectionTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  {vi.settings.currentPlan}{" "}
                  <strong className="font-extrabold text-[var(--space-primary)]">
                    {vi.settings.planFree}
                  </strong>{" "}
                  • {vi.settings.planExpiry} {vi.settings.planLifetime}
                </CardDescription>
              </div>
              <span className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                Miễn phí
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {vi.settings.aiUsageToday}
                </span>
                <p className="text-lg font-black text-slate-900">
                  {quotaStatus.remainingToday}
                  <span className="text-xs font-normal text-slate-500">
                    /{quotaStatus.dailyLimit} lượt
                  </span>
                </p>
                <ProgressBar
                  value={quotaStatus.remainingToday}
                  max={quotaStatus.dailyLimit}
                  className="h-1.5"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {vi.settings.setsUsage}
                </span>
                <p className="text-lg font-black text-slate-900">
                  {usageStats.setCount} bộ
                </p>
                <span className="text-[10px] text-slate-500 block">
                  Không giới hạn trong phiên bản hiện tại
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {vi.settings.storageUsage}
                </span>
                <p className="text-lg font-black text-slate-900">
                  {usageStats.storageMb.toFixed(1)} MB
                </p>
                <span className="text-[10px] text-slate-500 block">
                  Giới hạn 20 MB/tệp tải lên
                </span>
              </div>
            </div>

            <div className="pt-1">
              <Link
                href="/dashboard/feedback"
                className="text-xs font-bold text-[var(--space-primary)] hover:underline flex items-center gap-1"
              >
                <span>✨ {vi.settings.upgradePrompt}</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Khối 2: Thông tin cá nhân & Tên hiển thị */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.profileSectionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-display-name">
                  {vi.settings.displayNameLabel}
                </Label>
                <Input
                  id="account-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  required
                  className="min-h-[44px]"
                />
              </div>

              {profileNotice ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  ✓ {profileNotice}
                </div>
              ) : null}
              {profileError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {profileError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingProfile || !displayName.trim()}
                  className="min-h-[40px] px-5"
                >
                  {isSavingProfile ? vi.settings.savingProfileButton : vi.settings.saveProfileButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Khối 3: Đổi địa chỉ email */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.emailSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {vi.settings.currentEmailPrefix} <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangeEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-new-email">
                  {vi.settings.newEmailLabel}
                </Label>
                <Input
                  id="account-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={vi.settings.newEmailPlaceholder}
                  required
                  className="min-h-[44px]"
                />
              </div>

              {emailNotice ? (
                <div className="rounded-xl border border-teal-300 bg-teal-50 p-3 text-xs font-semibold text-teal-900">
                  📩 {emailNotice}
                </div>
              ) : null}
              {emailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {emailError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isChangingEmail || !newEmail.trim()}
                  variant="outline"
                  className="min-h-[40px] px-5"
                >
                  {isChangingEmail ? vi.settings.changingEmailButton : vi.settings.changeEmailButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Khối 4: Đổi mật khẩu mạnh */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.passwordSectionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-current-password">
                  {vi.settings.currentPasswordLabel}
                </Label>
                <Input
                  id="account-current-password"
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={vi.settings.currentPasswordPlaceholder}
                  required
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-new-password">
                  {vi.settings.newPasswordLabel}
                </Label>
                <Input
                  id="account-new-password"
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={vi.settings.newPasswordPlaceholder}
                  required
                  className="min-h-[44px]"
                />

                {/* Thanh đo độ mạnh mật khẩu thời gian thực */}
                {newPassword.length > 0 ? (
                  <div className="space-y-2 pt-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">Độ mạnh mật khẩu:</span>
                      <span
                        className={`font-black ${
                          strengthResult.level === "strong"
                            ? "text-emerald-600"
                            : strengthResult.level === "medium"
                            ? "text-amber-600"
                            : "text-red-500"
                        }`}
                      >
                        {strengthResult.level === "strong"
                          ? "Mạnh"
                          : strengthResult.level === "medium"
                          ? "Trung bình"
                          : "Yếu"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${strengthResult.score}%` }}
                        className={`h-full transition-all ${
                          strengthResult.level === "strong"
                            ? "bg-emerald-500"
                            : strengthResult.level === "medium"
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                      />
                    </div>

                    {/* Checklist điều kiện */}
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-1">
                      <span className={criteria.length ? "text-emerald-700 font-bold" : "text-slate-400"}>
                        {criteria.length ? "✓" : "○"} Tối thiểu 10 ký tự
                      </span>
                      <span className={criteria.hasUpper ? "text-emerald-700 font-bold" : "text-slate-400"}>
                        {criteria.hasUpper ? "✓" : "○"} Có chữ hoa (A-Z)
                      </span>
                      <span className={criteria.hasLower ? "text-emerald-700 font-bold" : "text-slate-400"}>
                        {criteria.hasLower ? "✓" : "○"} Có chữ thường (a-z)
                      </span>
                      <span className={criteria.hasNumber ? "text-emerald-700 font-bold" : "text-slate-400"}>
                        {criteria.hasNumber ? "✓" : "○"} Có chữ số (0-9)
                      </span>
                      <span className={criteria.notEmail ? "text-emerald-700 font-bold" : "text-red-600 font-bold"}>
                        {criteria.notEmail ? "✓" : "✕"} Không trùng email
                      </span>
                      <span className={criteria.notCommon ? "text-emerald-700 font-bold" : "text-red-600 font-bold"}>
                        {criteria.notCommon ? "✓" : "✕"} Không quá phổ biến
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="account-confirm-password">
                  {vi.settings.confirmNewPasswordLabel}
                </Label>
                <Input
                  id="account-confirm-password"
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={vi.settings.confirmNewPasswordPlaceholder}
                  required
                  className="min-h-[44px]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="account-show-passwords"
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600"
                />
                <label htmlFor="account-show-passwords" className="text-xs text-slate-600 cursor-pointer">
                  Hiện mật khẩu
                </label>
              </div>

              {passwordNotice ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  ✓ {passwordNotice}
                </div>
              ) : null}
              {passwordError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {passwordError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    isChangingPassword ||
                    !currentPassword ||
                    strengthResult.score < 50 ||
                    !confirmPassword
                  }
                  className="min-h-[40px] px-5"
                >
                  {isChangingPassword ? vi.settings.changingPasswordButton : vi.settings.changePasswordButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Khối 5: Tải dữ liệu cá nhân (JSON Export) */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.exportSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {vi.settings.exportSectionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportPersonalData}
              disabled={isExporting}
              className="min-h-[44px] font-bold"
            >
              {isExporting ? vi.settings.exportingDataButton : vi.settings.exportDataButton}
            </Button>
          </CardContent>
        </Card>

        {/* Khối 6: Phiên đăng nhập & Thiết bị */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.securitySectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              Nếu nghi ngờ tài khoản bị lộ hoặc đăng nhập trên thiết bị lạ, bạn có thể buộc đăng xuất tất cả các phiên khác.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {logoutAllNotice ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                ✓ {logoutAllNotice}
              </div>
            ) : null}
            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={handleLogoutAllDevices}
                disabled={isLoggingOutAll}
                className="min-h-[44px] font-semibold text-slate-700"
              >
                {isLoggingOutAll ? vi.settings.loggingOutAllButton : vi.settings.logoutAllDevicesButton}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Khối 7: Giao diện & Giảm chuyển động */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.motionSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {vi.settings.reduceMotionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(e) => handleToggleReduceMotion(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-semibold text-slate-800">
                {vi.settings.reduceMotionLabel}
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Khối 8: Đổi vai trò tài khoản */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.roleSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {vi.settings.currentRolePrefix}{" "}
              <strong className="text-slate-900">
                {role === "teacher" ? "Giáo viên" : "Học sinh / Tự học"}
              </strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSwitchRole} className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 space-y-1">
                <span className="font-bold">
                  {role === "teacher"
                    ? vi.settings.switchToStudentTitle
                    : vi.settings.switchToTeacherTitle}
                </span>
                <p>
                  {role === "teacher"
                    ? vi.settings.switchToStudentWarning
                    : vi.settings.switchToTeacherWarning}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmRoleSwitch}
                  onChange={(e) => setConfirmRoleSwitch(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600"
                />
                <span>{vi.settings.confirmSwitchCheckbox}</span>
              </label>

              {roleNotice ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  ✓ {roleNotice}
                </div>
              ) : null}
              {roleError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {roleError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!confirmRoleSwitch || isSwitchingRole}
                  variant="outline"
                  className="min-h-[40px] px-5"
                >
                  {isSwitchingRole ? vi.settings.switchingRoleButton : vi.settings.switchRoleButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Khối 9: Gộp hồ sơ ẩn danh */}
        <Card className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-[var(--heading)]">
              {vi.settings.mergeSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {vi.settings.mergeSectionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMerge} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-merge-code">
                  {vi.settings.mergeCodeLabel}
                </Label>
                <Input
                  id="account-merge-code"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder={vi.settings.mergeCodePlaceholder}
                  maxLength={32}
                  className="font-mono uppercase tracking-wider min-h-[44px]"
                />
              </div>

              {mergeNotice ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  ✓ {mergeNotice}
                </div>
              ) : null}
              {mergeError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {mergeError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isMerging || !recoveryCode.trim()}
                  variant="outline"
                  className="min-h-[40px] px-5"
                >
                  {isMerging ? vi.settings.mergingButton : vi.settings.mergeButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Khối 10: Xóa vĩnh viễn tài khoản */}
        <Card className="rounded-3xl border border-red-200 bg-red-50/20 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-red-700">
              {vi.settings.dangerSectionTitle}
            </CardTitle>
            <CardDescription className="text-xs text-red-800/80">
              {vi.settings.dangerSectionDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-delete-keyword" className="text-red-900">
                  {vi.settings.deleteConfirmPromptPrefix}{" "}
                  <strong className="font-mono text-red-700">
                    {vi.settings.deleteConfirmKeyword}
                  </strong>
                </Label>
                <Input
                  id="account-delete-keyword"
                  value={deleteKeyword}
                  onChange={(e) => setDeleteKeyword(e.target.value)}
                  placeholder={vi.settings.deleteConfirmKeyword}
                  className="font-mono border-red-300 focus:border-red-600 focus:ring-red-600 min-h-[44px]"
                />
              </div>

              {deleteError ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  ⚠️ {deleteError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    isDeletingAccount ||
                    deleteKeyword.trim() !== vi.settings.deleteConfirmKeyword
                  }
                  className="min-h-[40px] px-5"
                >
                  {isDeletingAccount ? vi.settings.deletingAccountButton : vi.settings.deleteAccountButton}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
