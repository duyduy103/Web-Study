"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const LEARNER_SECRET_STORAGE_KEY = "memoquiz_learner_secret";
export const LEARNER_NICKNAME_STORAGE_KEY = "memoquiz_learner_nickname";

interface LearnerOnboardingGateProps {
  children: (props: {
    learnerSecret: string;
    nickname: string;
    resetLearnerSession: () => void;
  }) => React.ReactNode;
}

export function LearnerOnboardingGate({
  children,
}: LearnerOnboardingGateProps) {
  const [learnerSecret, setLearnerSecret] = React.useState<string | null>(null);
  const [nickname, setNickname] = React.useState<string>("");
  const [isInitializing, setIsInitializing] = React.useState(true);

  const [mode, setMode] = React.useState<"create" | "recover">("create");
  const [nicknameInput, setNicknameInput] = React.useState("");
  const [recoveryInput, setRecoveryInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Khi vừa tạo hồ sơ mới, hiển thị mã khôi phục 1 lần duy nhất trước khi vào học
  const [pendingRecoveryCode, setPendingRecoveryCode] = React.useState<
    string | null
  >(null);
  const [pendingSecret, setPendingSecret] = React.useState<string | null>(null);
  const [pendingNick, setPendingNick] = React.useState<string>("");
  const [copiedRecovery, setCopiedRecovery] = React.useState(false);

  React.useEffect(() => {
    try {
      const savedSecret = window.localStorage.getItem(
        LEARNER_SECRET_STORAGE_KEY
      );
      const savedNick =
        window.localStorage.getItem(LEARNER_NICKNAME_STORAGE_KEY) ?? "Học sinh";
      if (savedSecret && savedSecret.length >= 32) {
        setLearnerSecret(savedSecret);
        setNickname(savedNick);
      }
    } catch {
      // Bỏ qua nếu localStorage bị chặn
    } finally {
      setIsInitializing(false);
    }
  }, []);

  function resetLearnerSession() {
    try {
      window.localStorage.removeItem(LEARNER_SECRET_STORAGE_KEY);
      window.localStorage.removeItem(LEARNER_NICKNAME_STORAGE_KEY);
    } catch {
      // Bỏ qua
    }
    setLearnerSecret(null);
    setNickname("");
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    const cleanNick = nicknameInput.trim();
    if (!cleanNick) {
      setErrorMsg(vi.study.profile.nicknameRequiredError);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/public/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_profile",
          nickname: cleanNick,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(
          errObj.error ?? vi.study.profile.nicknameRequiredError
        );
      }

      const payload = data as {
        learner: { nickname: string };
        learnerSecret: string;
        recoveryCode: string;
      };

      try {
        window.localStorage.setItem(
          LEARNER_SECRET_STORAGE_KEY,
          payload.learnerSecret
        );
        window.localStorage.setItem(
          LEARNER_NICKNAME_STORAGE_KEY,
          payload.learner.nickname
        );
      } catch {
        // Bỏ qua
      }

      setPendingSecret(payload.learnerSecret);
      setPendingNick(payload.learner.nickname);
      setPendingRecoveryCode(payload.recoveryCode);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : vi.study.profile.nicknameRequiredError
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecoverProfile(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = recoveryInput.trim();
    if (!cleanCode) {
      setErrorMsg(vi.study.profile.invalidRecoveryError);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/public/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recover_profile",
          recoveryCode: cleanCode,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.study.profile.invalidRecoveryError);
      }

      const payload = data as {
        learner: { nickname: string };
        learnerSecret: string;
      };

      try {
        window.localStorage.setItem(
          LEARNER_SECRET_STORAGE_KEY,
          payload.learnerSecret
        );
        window.localStorage.setItem(
          LEARNER_NICKNAME_STORAGE_KEY,
          payload.learner.nickname
        );
      } catch {
        // Bỏ qua
      }

      setNickname(payload.learner.nickname);
      setLearnerSecret(payload.learnerSecret);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : vi.study.profile.invalidRecoveryError
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isInitializing) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 text-sm text-slate-600">
        {vi.common.loading}
      </div>
    );
  }

  if (pendingRecoveryCode && pendingSecret) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          className="rounded-3xl border border-teal-300 bg-white p-6 shadow-md sm:p-8"
        >
          <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            🔑 Quan trọng
          </span>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            {vi.study.profile.recoveryModalTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {vi.study.profile.recoveryModalWarning}
          </p>

          <div className="my-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/70 p-5 text-center">
            <span className="font-mono text-2xl font-extrabold tracking-widest text-teal-950 sm:text-3xl">
              {pendingRecoveryCode}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(pendingRecoveryCode);
                setCopiedRecovery(true);
                window.setTimeout(() => setCopiedRecovery(false), 2000);
              }}
              className="mt-3 min-h-[44px]"
            >
              {copiedRecovery
                ? vi.exams.share.copiedNotice
                : vi.study.profile.recoveryCodeCopyButton}
            </Button>
          </div>

          <Button
            type="button"
            onClick={() => {
              setNickname(pendingNick);
              setLearnerSecret(pendingSecret);
              setPendingRecoveryCode(null);
            }}
            className="min-h-[48px] w-full text-base font-bold"
          >
            {vi.study.profile.recoverySavedConfirmButton}
          </Button>
        </div>
      </div>
    );
  }

  if (!learnerSecret) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-4 py-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {vi.study.profile.welcomeBadge}
          </span>

          {mode === "create" ? (
            <>
              <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
                {vi.study.profile.createTitle}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {vi.study.profile.createSubtitle}
              </p>

              <form
                onSubmit={(e) => void handleCreateProfile(e)}
                className="mt-5 space-y-4"
              >
                {errorMsg ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                  >
                    {errorMsg}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="learner-nickname">
                    {vi.study.profile.nicknameLabel}
                  </Label>
                  <Input
                    id="learner-nickname"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder={vi.study.profile.nicknamePlaceholder}
                    required
                    maxLength={60}
                    className="min-h-[48px] text-base"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full text-base font-bold"
                >
                  {isSubmitting
                    ? vi.study.profile.creatingButton
                    : vi.study.profile.createButton}
                </Button>
              </form>

              <div className="mt-5 border-t border-slate-100 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("recover");
                    setErrorMsg(null);
                  }}
                  className="min-h-[44px] cursor-pointer text-xs font-semibold text-teal-700 hover:underline sm:text-sm"
                >
                  🔑 {vi.study.profile.switchToRecoveryButton}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
                {vi.study.profile.recoveryTitle}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {vi.study.profile.recoverySubtitle}
              </p>

              <form
                onSubmit={(e) => void handleRecoverProfile(e)}
                className="mt-5 space-y-4"
              >
                {errorMsg ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                  >
                    {errorMsg}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="learner-recovery-code">
                    {vi.study.profile.recoveryInputLabel}
                  </Label>
                  <Input
                    id="learner-recovery-code"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder={vi.study.profile.recoveryInputPlaceholder}
                    required
                    maxLength={24}
                    className="min-h-[48px] font-mono text-base uppercase"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[48px] w-full text-base font-bold"
                >
                  {isSubmitting
                    ? vi.study.profile.recoveringButton
                    : vi.study.profile.recoverButton}
                </Button>
              </form>

              <div className="mt-5 border-t border-slate-100 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("create");
                    setErrorMsg(null);
                  }}
                  className="min-h-[44px] cursor-pointer text-xs font-semibold text-slate-600 hover:text-teal-700 sm:text-sm"
                >
                  {vi.study.profile.switchToCreateButton}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  return <>{children({ learnerSecret, nickname, resetLearnerSession })}</>;
}

