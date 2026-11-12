"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LearnerOnboardingGate } from "./learner-onboarding-gate";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EnrolledSetItem {
  set_id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  study_code: string | null;
  study_enabled: boolean;
  daily_new_limit: number;
  last_studied_at: string;
  due_count: number;
  total_approved_count: number;
}

export function StudyHubClient() {
  return (
    <LearnerOnboardingGate>
      {({ learnerSecret, nickname, resetLearnerSession }) => (
        <StudyHubInner
          learnerSecret={learnerSecret}
          nickname={nickname}
          resetLearnerSession={resetLearnerSession}
        />
      )}
    </LearnerOnboardingGate>
  );
}

function StudyHubInner({
  learnerSecret,
  nickname,
  resetLearnerSession,
}: {
  learnerSecret: string;
  nickname: string;
  resetLearnerSession: () => void;
}) {
  const router = useRouter();
  const [codeInput, setCodeInput] = React.useState("");
  const [enrolledSets, setEnrolledSets] = React.useState<EnrolledSetItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    async function loadHub() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/public/study", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "load_overview",
            learnerSecret,
            code: null,
          }),
        });

        if (res.status === 401) {
          resetLearnerSession();
          return;
        }

        const data: unknown = await res.json();
        if (!res.ok) {
          const errObj = data as { error?: string };
          throw new Error(errObj.error ?? vi.review.editor.errorStatus);
        }

        const payload = data as {
          enrolledSets?: EnrolledSetItem[];
        };
        if (active) {
          setEnrolledSets(payload.enrolledSets ?? []);
        }
      } catch (err) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : vi.review.editor.errorStatus
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadHub();
    return () => {
      active = false;
    };
  }, [learnerSecret, resetLearnerSession]);

  function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) return;
    router.push(`/study/${encodeURIComponent(clean)}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {vi.study.profile.welcomeBadge}
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {vi.study.hub.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {vi.study.hub.greetingPrefix}{" "}
            <strong className="font-bold text-teal-800">{nickname}</strong>!
          </p>
        </div>

        <button
          type="button"
          onClick={resetLearnerSession}
          className="min-h-[44px] cursor-pointer rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Đổi hồ sơ / Nhập mã khôi phục
        </button>
      </header>

      <section className="rounded-3xl border border-teal-200 bg-teal-50/50 p-6 shadow-sm">
        <form
          onSubmit={handleJoinByCode}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="study-join-code" className="text-teal-950">
              {vi.study.hub.joinByCodeLabel}
            </Label>
            <Input
              id="study-join-code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder={vi.study.hub.joinByCodePlaceholder}
              maxLength={12}
              required
              className="min-h-[48px] bg-white font-mono text-base font-bold tracking-widest uppercase"
            />
          </div>
          <Button
            type="submit"
            className="min-h-[48px] px-6 text-base font-bold"
          >
            {vi.study.hub.joinButton}
          </Button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          {vi.study.hub.enrolledSetsTitle}
        </h2>

        {errorMsg ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
          >
            {errorMsg}
          </div>
        ) : null}

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">{vi.common.loading}</p>
        ) : enrolledSets.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
            {vi.study.hub.emptyEnrolled}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {enrolledSets.map((item) => {
              const targetCode = item.study_code;
              return (
                <div
                  key={item.set_id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:border-teal-300 hover:bg-white"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-teal-100 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-900">
                        {targetCode ?? "---"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.due_count > 0
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {vi.study.hub.dueTodayBadgePrefix} {item.due_count}
                      </span>
                    </div>

                    <h3 className="mt-2.5 text-base font-bold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.total_approved_count} {vi.study.hub.totalCardsSuffix}
                      {item.subject ? ` • ${item.subject}` : ""}
                      {item.grade ? ` • Khối ${item.grade}` : ""}
                    </p>
                  </div>

                  <div className="mt-4 pt-2">
                    {targetCode && item.study_enabled ? (
                      <Link
                        href={`/study/${encodeURIComponent(targetCode)}`}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-700"
                      >
                        {vi.study.hub.studyNowButton}
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-medium text-slate-500">
                        {vi.study.overview.disabledTitle}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

