"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { normalizeJoinCode } from "@/lib/classes/constants";
import type { ClassJoinPreview } from "@/lib/classes/schemas";
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

interface JoinClassClientProps {
  initialCode?: string;
  initialPreview?: ClassJoinPreview | null;
  initialError?: string | null;
  isLoggedIn: boolean;
}

export function JoinClassClient({
  initialCode = "",
  initialPreview = null,
  initialError = null,
  isLoggedIn,
}: JoinClassClientProps) {
  const router = useRouter();
  const [codeInput, setCodeInput] = React.useState(
    normalizeJoinCode(initialCode)
  );
  const [preview, setPreview] = React.useState<ClassJoinPreview | null>(
    initialPreview
  );
  const [lookupError, setLookupError] = React.useState<string | null>(
    initialError
  );
  const [lookingUp, setLookingUp] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const [joinResult, setJoinResult] = React.useState<{
    status: "active" | "pending";
    alreadyMember: boolean;
    className: string;
  } | null>(null);
  const [joinError, setJoinError] = React.useState<string | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normalizeJoinCode(codeInput);
    setLookingUp(true);
    setLookupError(null);
    setJoinError(null);
    setJoinResult(null);
    setPreview(null);

    try {
      const res = await fetch(
        `/api/classes/join?code=${encodeURIComponent(cleaned)}`
      );
      const data = (await res.json()) as {
        error?: string;
        class?: ClassJoinPreview;
      };
      if (!res.ok || !data.class) {
        setLookupError(data.error ?? vi.classes.errors.invalidCode);
        return;
      }
      setPreview(data.class);
      if (cleaned !== normalizeJoinCode(initialCode)) {
        router.replace(`/join/${encodeURIComponent(cleaned)}`);
      }
    } catch {
      setLookupError(vi.classes.errors.systemError);
    } finally {
      setLookingUp(false);
    }
  }

  async function handleConfirmJoin() {
    const cleaned = normalizeJoinCode(codeInput);
    setJoining(true);
    setJoinError(null);
    setJoinResult(null);

    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: cleaned }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: "active" | "pending";
        alreadyMember?: boolean;
        className?: string;
      };

      if (!res.ok || !data.status) {
        setJoinError(data.error ?? vi.classes.errors.systemError);
        return;
      }

      setJoinResult({
        status: data.status,
        alreadyMember: Boolean(data.alreadyMember),
        className: data.className ?? preview?.name ?? "",
      });
      router.refresh();
    } catch {
      setJoinError(vi.classes.errors.systemError);
    } finally {
      setJoining(false);
    }
  }

  const nextUrl = `/join/${encodeURIComponent(normalizeJoinCode(codeInput))}`;

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">
            {vi.classes.join.pageTitle}
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {vi.classes.join.pageSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleLookup} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="join-code-input">
                {vi.classes.join.codeInputLabel}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="join-code-input"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder={vi.classes.join.codeInputPlaceholder}
                  maxLength={8}
                  className="min-h-[44px] flex-1 font-mono text-base font-bold uppercase tracking-widest"
                />
                <Button
                  type="submit"
                  disabled={lookingUp || codeInput.trim().length === 0}
                  className="min-h-[44px] shrink-0"
                >
                  {lookingUp
                    ? vi.classes.join.lookingUpButton
                    : vi.classes.join.lookupButton}
                </Button>
              </div>
            </div>
          </form>

          {lookupError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {lookupError}
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {preview.name}
                </h2>
                <p className="mt-0.5 text-sm text-slate-700">
                  {vi.classes.join.teacherLabel}{" "}
                  <strong>{preview.teacher_name}</strong>
                </p>
                {preview.description ? (
                  <p className="mt-1.5 text-xs text-slate-600">
                    {preview.description}
                  </p>
                ) : null}
              </div>

              {/* Thông báo quyền riêng tư bắt buộc */}
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs leading-relaxed text-sky-950">
                <p className="font-bold">
                  {vi.classes.join.privacyNoticeTitle}
                </p>
                <p className="mt-0.5">{vi.classes.join.privacyNoticeBody}</p>
              </div>

              {preview.require_approval ? (
                <p className="text-xs font-medium text-amber-800">
                  ℹ️ {vi.classes.join.approvalNotice}
                </p>
              ) : null}

              {joinError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                >
                  {joinError}
                </div>
              ) : null}

              {joinResult ? (
                <div
                  role="status"
                  className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900"
                >
                  <p className="font-semibold">
                    {joinResult.status === "active"
                      ? joinResult.alreadyMember
                        ? vi.classes.join.alreadyActiveNotice
                        : vi.classes.join.joinedActiveSuccess
                      : joinResult.alreadyMember
                        ? vi.classes.join.alreadyPendingNotice
                        : vi.classes.join.joinedPendingSuccess}
                  </p>
                  <Link
                    href="/dashboard/classes"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    {vi.classes.join.goToMyClassesButton} →
                  </Link>
                </div>
              ) : !isLoggedIn ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-700">
                    {vi.classes.join.loginToJoinNotice}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/login?next=${encodeURIComponent(nextUrl)}`}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                    >
                      {vi.classes.join.loginToJoinButton}
                    </Link>
                    <Link
                      href={`/signup?next=${encodeURIComponent(nextUrl)}`}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {vi.classes.join.signupToJoinButton}
                    </Link>
                  </div>
                </div>
              ) : preview.is_own_class ? (
                <div className="space-y-2 text-xs text-slate-700">
                  <p className="font-medium">{vi.classes.join.ownClassNotice}</p>
                  <Link
                    href={`/dashboard/classes/${preview.id}`}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-teal-600 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    {vi.classes.manageClassButton} →
                  </Link>
                </div>
              ) : preview.my_status === "active" ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-800">
                    {vi.classes.join.alreadyActiveNotice}
                  </p>
                  <Link
                    href="/dashboard/classes"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                  >
                    {vi.classes.join.goToMyClassesButton} →
                  </Link>
                </div>
              ) : preview.my_status === "pending" ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-900">
                    {vi.classes.join.alreadyPendingNotice}
                  </p>
                  <Link
                    href="/dashboard/classes"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {vi.classes.join.goToMyClassesButton} →
                  </Link>
                </div>
              ) : preview.my_status === "rejected" ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                  {vi.classes.errors.memberRejected}
                </p>
              ) : preview.my_status === "removed" ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                  {vi.classes.errors.memberRemoved}
                </p>
              ) : !preview.is_open ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">
                  {vi.classes.errors.classClosed}
                </p>
              ) : preview.is_full ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">
                  {vi.classes.errors.classFull}
                </p>
              ) : (
                <Button
                  type="button"
                  disabled={joining}
                  onClick={() => void handleConfirmJoin()}
                  className="min-h-[44px] w-full text-sm font-bold"
                >
                  {joining
                    ? vi.classes.join.joiningButton
                    : vi.classes.join.confirmJoinButton}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="text-center">
        <Link
          href={isLoggedIn ? "/dashboard" : "/"}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-600 hover:text-teal-700"
        >
          {vi.classes.backToDashboard}
        </Link>
      </div>
    </div>
  );
}

