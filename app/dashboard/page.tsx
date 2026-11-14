import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { getUserEntitlements } from "@/lib/entitlements";
import { getUserAiQuotaStatus } from "@/lib/ai/quota-and-cache";
import {
  buildDailyStudyQueue,
  computeLearnerStudyAnalytics,
} from "@/lib/srs";
import type {
  SrsCardStateRecord,
  SrsReviewLogRecord,
} from "@/lib/srs/types";
import { logoutAction } from "@/lib/auth/actions";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateSetButton } from "@/components/features/dashboard/create-set-button";
import { PlanBadge } from "@/components/features/dashboard/plan-badge";
import { NotificationBell } from "@/components/features/dashboard/notification-bell";
import { DashboardUsageBar } from "@/components/features/dashboard/dashboard-usage-bar";

export default async function DashboardPage(props: {
  searchParams?: Promise<{ confirmed?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const isConfirmed = searchParams.confirmed === "true";

  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  const { user, role, displayName } = authProfile;
  const isTeacher = isTeacherRole(role);

  const [
    entitlements,
    quotaStatus,
    { data: questionSets, error: setsError },
    { data: examsDataRaw },
    studySummaryRes,
    selfAttemptsRes,
  ] = await Promise.all([
    getUserEntitlements(supabase, user.id),
    getUserAiQuotaStatus(supabase, user.id, role),
    supabase
      .from("question_sets")
      .select("id, title, subject, grade, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    isTeacher
      ? supabase
          .from("exams")
          .select(
            "id, title, code, duration_min, is_open, exam_mode, version_count, created_at"
          )
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    !isTeacher
      ? supabase.rpc("get_account_study_summary")
      : Promise.resolve({ data: null }),
    !isTeacher
      ? supabase
          .from("attempts")
          .select("id, exam_id, set_id, attempt_token, status, score, started_at, submitted_at")
          .eq("student_id", user.id)
          .not("attempt_token", "is", null)
          .order("started_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  let examsData = (examsDataRaw ?? []) as Array<{
    id: string;
    title: string;
    code: string | null;
    duration_min: number | null;
    is_open: boolean;
    exam_mode: "online" | "print" | "self";
    version_count: number;
    created_at: string;
  }>;
  if (isTeacher && !examsDataRaw) {
    const { data: fallbackExams } = await supabase
      .from("exams")
      .select("id, title, code, duration_min, is_open, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    examsData = (fallbackExams ?? []).map((e) => ({
      ...e,
      exam_mode: "online" as const,
      version_count: 1,
    }));
  }

  const sets = questionSets ?? [];
  const setIds = sets.map((s) => s.id);
  const exams = isTeacher
    ? examsData.filter((e) => e.exam_mode === "online")
    : [];
  const printExams = isTeacher
    ? examsData.filter((e) => e.exam_mode === "print")
    : [];
  const examIds = exams.map((e) => e.id);

  // Dữ liệu "Hôm nay cần ôn" cho học sinh trên toàn bộ các bộ câu hỏi của mình
  let studentTodayDueCount = 0;
  let studentStreakDays = 0;
  let studentRetentionRate = 0;
  let studentFirstStudySetId: string | null = null;
  let studentHistory14Days: Array<{
    dateKey: string;
    label: string;
    totalReviews: number;
  }> = [];

  if (!isTeacher && studySummaryRes?.data) {
    const summary = studySummaryRes.data as {
      questions?: Array<{ id: string; set_id: string }>;
      card_states?: SrsCardStateRecord[];
      review_logs?: SrsReviewLogRecord[];
      server_now?: string;
    };
    const allQuestions = summary.questions ?? [];
    const allStates = summary.card_states ?? [];
    const allLogs = summary.review_logs ?? [];
    const now = summary.server_now ? new Date(summary.server_now) : new Date();

    const analytics = computeLearnerStudyAnalytics({
      cardStates: allStates,
      reviewLogs: allLogs,
      now,
    });
    studentStreakDays = analytics.streakDays;
    studentRetentionRate = analytics.retentionRate;
    studentHistory14Days = analytics.history14Days;

    const queue = buildDailyStudyQueue({
      approvedQuestionIds: allQuestions.map((q) => q.id),
      cardStates: allStates,
      reviewLogs: allLogs,
      dailyNewLimit: 20,
      now,
    });
    studentTodayDueCount = queue.queueQuestionIds.length;
    const firstQId = queue.queueQuestionIds[0];
    if (firstQId) {
      studentFirstStudySetId =
        allQuestions.find((q) => q.id === firstQId)?.set_id ?? null;
    } else if (sets.length > 0) {
      studentFirstStudySetId = sets[0]?.id ?? null;
    }
  }

  const selfAttempts = (selfAttemptsRes?.data ?? []) as Array<{
    id: string;
    exam_id: string | null;
    set_id: string | null;
    attempt_token: string | null;
    status: string;
    score: number | null;
    started_at: string;
    submitted_at: string | null;
  }>;
  const setTitleById = new Map(sets.map((s) => [s.id, s.title]));

  const attemptStatsByExamId = new Map<
    string,
    { submitted: number; inProgress: number; needsReview: number }
  >();

  if (examIds.length > 0) {
    const { data: attemptsMeta } = await supabase
      .from("attempts")
      .select("exam_id, status, needs_manual_review")
      .in("exam_id", examIds);

    for (const att of attemptsMeta ?? []) {
      if (!att.exam_id) continue;
      const curr = attemptStatsByExamId.get(att.exam_id) ?? {
        submitted: 0,
        inProgress: 0,
        needsReview: 0,
      };
      if (att.status === "submitted" || att.status === "expired") {
        curr.submitted += 1;
        if (att.needs_manual_review) {
          curr.needsReview += 1;
        }
      } else {
        curr.inProgress += 1;
      }
      attemptStatsByExamId.set(att.exam_id, curr);
    }
  }

  const statsBySetId = new Map<
    string,
    { total: number; approved: number; needsReview: number }
  >();

  let storageBytesUsed = 0;

  if (setIds.length > 0) {
    const [{ data: questionsMeta }, { data: sourceFilesMeta }] = await Promise.all([
      supabase
        .from("questions")
        .select("set_id, status, confidence, warnings, ai_generated")
        .in("set_id", setIds),
      supabase
        .from("source_files")
        .select("file_size_bytes")
        .in("set_id", setIds),
    ]);

    for (const sf of sourceFilesMeta ?? []) {
      storageBytesUsed += Number(sf.file_size_bytes ?? 0);
    }

    for (const q of questionsMeta ?? []) {
      const current = statsBySetId.get(q.set_id) ?? {
        total: 0,
        approved: 0,
        needsReview: 0,
      };
      if (q.status !== "archived") {
        current.total += 1;
      }
      if (q.status === "approved") {
        current.approved += 1;
      }
      const conf = q.confidence ?? 0;
      const hasWarnings = Array.isArray(q.warnings) && q.warnings.length > 0;
      if (q.status === "draft" && (conf < 0.8 || hasWarnings || q.ai_generated)) {
        current.needsReview += 1;
      }
      statsBySetId.set(q.set_id, current);
    }
  }

  return (
    <div data-space={isTeacher ? "workspace" : "study"} className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-200">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-base font-bold text-white shadow-2xs">
              MQ
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900">
                {vi.app.name}
              </span>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                {isTeacher ? vi.roles.teacherLabel : vi.roles.studentLabel}
              </span>
              <PlanBadge entitlements={entitlements} showRemainingDays />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link
              href="/dashboard/account"
              className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              ⚙ {vi.nav.settings}
            </Link>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                {vi.nav.logout}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {isConfirmed ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3.5 text-sm font-semibold text-teal-900 shadow-2xs"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs text-white">
              ✓
            </span>
            <span>{vi.auth.emailConfirmedBanner}</span>
          </div>
        ) : null}

        <section
          style={{
            backgroundColor: "var(--space-primary)",
            backgroundImage: "var(--space-hero-bg)",
          }}
          className="space-hero-banner relative overflow-hidden flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:p-7 shadow-md"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-xl" />
          <div className="relative space-y-1">
            <h1 className="text-xl font-black sm:text-2xl tracking-tight text-white">
              {vi.dashboard.greetingPrefix} {displayName}!
            </h1>
            <p className="text-sm text-white/90 font-medium">
              {isTeacher ? vi.dashboard.subtitle : vi.studentDashboard.subtitle}
            </p>
            <p className="pt-1 text-xs font-semibold text-white/95">
              {vi.dashboard.aiQuotaRemainingPrefix}{" "}
              <strong className="underline underline-offset-2">
                {quotaStatus.remainingToday}/{quotaStatus.dailyLimit}
              </strong>{" "}
              {vi.dashboard.aiQuotaUnit} ({vi.plans.usageBar.aiResetNote})
            </p>
          </div>

          <div className="relative">
            <CreateSetButton />
          </div>
        </section>

        <DashboardUsageBar
          entitlements={entitlements}
          aiRemainingToday={quotaStatus.remainingToday}
          aiDailyLimit={quotaStatus.dailyLimit}
          setCount={sets.length}
          storageBytes={storageBytesUsed}
        />

        {!isTeacher ? (
          <section className="rounded-3xl border-2 border-[var(--space-border-strong)] bg-[var(--space-surface)] p-5 shadow-sm transition-all sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--space-surface-muted)] px-3 py-0.5 text-xs font-extrabold text-[var(--space-primary)]">
                  <span>✨ {vi.studentDashboard.todayStudyTitle}</span>
                </div>
                <h2 className="text-lg font-black text-[var(--heading)] sm:text-xl">
                  {studentTodayDueCount > 0
                    ? `Hôm nay bạn có ${studentTodayDueCount} thẻ đến hạn ôn`
                    : vi.studentDashboard.allCaughtUpNotice}
                </h2>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-xl border border-[var(--space-reward-border)] bg-[var(--space-reward-bg)] px-2.5 py-1 font-black text-[var(--space-reward-fg)] shadow-2xs">
                    🔥 {studentStreakDays} {vi.study.overview.daysUnit} streak
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-black text-emerald-900 shadow-2xs">
                    🎯 {studentRetentionRate}% ghi nhớ
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[110px] rounded-2xl border-2 border-[var(--space-reward-border)] bg-[var(--space-reward-bg)] px-4 py-2.5 text-center shadow-xs">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--space-reward-fg)]">
                    {vi.studentDashboard.dueCardsLabel}
                  </span>
                  <span className="text-2xl font-black text-[var(--space-reward-fg)] sm:text-3xl">
                    {studentTodayDueCount}
                  </span>
                </div>

                {studentFirstStudySetId && studentTodayDueCount > 0 ? (
                  <Link
                    href={`/dashboard/sets/${studentFirstStudySetId}/study/review`}
                    className="inline-flex min-h-[50px] items-center justify-center rounded-2xl bg-[var(--space-accent)] text-[var(--space-accent-fg)] px-6 py-2.5 text-base font-extrabold shadow-md transition-transform hover:brightness-110 active:brightness-95 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    🚀 {vi.studentDashboard.startReviewSetPrefix}{" "}
                    {setTitleById.get(studentFirstStudySetId) ??
                      vi.study.overview.startReviewButton}
                  </Link>
                ) : sets.length > 0 ? (
                  <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-2xs">
                    🎉 {vi.studentDashboard.allCaughtUpNotice}
                  </span>
                ) : null}
              </div>
            </div>

            {studentHistory14Days.some((d) => d.totalReviews > 0) ? (
              <div
                role="region"
                aria-label="Biểu đồ lịch sử ôn tập 14 ngày qua"
                className="mt-5 flex h-24 items-end justify-between gap-1.5 border-t border-teal-100/70 pt-4"
              >
                {studentHistory14Days.map((day) => {
                  const maxRev = Math.max(
                    1,
                    ...studentHistory14Days.map((x) => x.totalReviews)
                  );
                  const pct =
                    day.totalReviews === 0
                      ? 8
                      : Math.max(15, Math.round((day.totalReviews / maxRev) * 100));
                  return (
                    <div
                      key={day.dateKey}
                      aria-label={`${day.label}: ${day.totalReviews} lượt ôn`}
                      className="flex flex-1 flex-col items-center gap-1.5"
                    >
                      <div className="flex h-14 w-full items-end rounded-lg bg-teal-50/80 p-0.5">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-md transition-all motion-reduce:transition-none ${
                            day.totalReviews > 0
                              ? "bg-teal-600"
                              : "bg-slate-200"
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-slate-500">
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {vi.dashboard.myQuestionSetsTitle}
            </h2>
            <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs font-medium text-slate-700">
              {sets.length} {vi.dashboard.setsCountUnit}
            </span>
          </div>

          {setsError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {vi.dashboard.errors.loadFailed}
            </div>
          ) : null}

          {sets.length === 0 ? (
            <Card className="border-dashed border-slate-300 bg-white/80">
              <CardContent className="flex flex-col items-center justify-center space-y-3 py-12 text-center">
                <div
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl text-teal-700 shadow-2xs"
                >
                  📚
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">
                    {vi.dashboard.emptyState.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {isTeacher
                      ? vi.dashboard.emptyState.description
                      : vi.studentDashboard.emptySetsDescription}
                  </p>
                  <p className="pt-1 text-xs font-medium text-teal-700">
                    {vi.dashboard.emptyState.hint}
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/dashboard/sets/new"
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                  >
                    + {vi.dashboard.createSetButton}
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((setItem) => {
                const stat = statsBySetId.get(setItem.id) ?? {
                  total: 0,
                  approved: 0,
                  needsReview: 0,
                };
                return (
                  <Link
                    key={setItem.id}
                    href={`/dashboard/sets/${setItem.id}`}
                    className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    <Card className="h-full rounded-3xl border-slate-200/90 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="line-clamp-2 text-base">
                          {setItem.title}
                        </CardTitle>
                        <CardDescription>
                          {setItem.subject ??
                            vi.dashboard.setCard.subjectFallback}{" "}
                          • {vi.dashboard.setCard.gradePrefix}{" "}
                          {setItem.grade ?? vi.dashboard.setCard.gradeFallback}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-900">
                            {vi.dashboard.setCard.approvedCountPrefix}{" "}
                            {stat.approved}/{stat.total}{" "}
                            {vi.dashboard.setCard.questionCountSuffix}
                          </span>
                          {stat.needsReview > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                              {stat.needsReview}{" "}
                              {vi.dashboard.setCard.needsReviewSuffix}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                              {vi.dashboard.setCard.allGoodBadge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>
                            {vi.dashboard.setCard.createdAtPrefix}{" "}
                            {new Date(setItem.created_at).toLocaleDateString(
                              "vi-VN"
                            )}
                          </span>
                          <span className="font-medium text-teal-700">
                            {vi.dashboard.setCard.viewDetails} →
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {exams.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {vi.dashboard.myExamsTitle}
              </h2>
              <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs font-medium text-slate-700">
                {exams.length} {vi.dashboard.examsCountUnit}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exams.map((exam) => {
                const stat = attemptStatsByExamId.get(exam.id) ?? {
                  submitted: 0,
                  inProgress: 0,
                  needsReview: 0,
                };
                return (
                  <Link
                    key={exam.id}
                    href={`/dashboard/exams/${exam.id}`}
                    className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    <Card className="h-full rounded-3xl border-slate-200/90 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="line-clamp-2 text-base">
                            {exam.title}
                          </CardTitle>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              exam.is_open
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {exam.is_open
                              ? vi.dashboard.examCard.statusOpen
                              : vi.dashboard.examCard.statusClosed}
                          </span>
                        </div>
                        <CardDescription>
                          {vi.dashboard.examCard.codeLabel}{" "}
                          <strong className="font-mono text-slate-900">
                            {exam.code ?? "---"}
                          </strong>{" "}
                          •{" "}
                          {exam.duration_min
                            ? `${exam.duration_min} ${vi.dashboard.examCard.durationUnit}`
                            : vi.dashboard.examCard.noDurationLimit}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-900">
                            {stat.submitted}{" "}
                            {vi.dashboard.examCard.submittedCountSuffix}
                          </span>
                          {stat.inProgress > 0 ? (
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-800">
                              {stat.inProgress}{" "}
                              {vi.dashboard.examCard.inProgressCountSuffix}
                            </span>
                          ) : null}
                          {stat.needsReview > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                              {stat.needsReview}{" "}
                              {vi.dashboard.examCard.needsManualReviewSuffix}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>
                            {new Date(exam.created_at).toLocaleDateString(
                              "vi-VN"
                            )}
                          </span>
                          <span className="font-medium text-teal-700">
                            {vi.dashboard.examCard.viewResults} →
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {printExams.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {vi.printExam.savedPrintExamsTitle}
              </h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                {printExams.length} {vi.dashboard.examsCountUnit}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {printExams.map((pExam) => (
                <Link
                  key={pExam.id}
                  href={`/dashboard/print/${pExam.id}`}
                  className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  <Card className="h-full transition-shadow hover:border-amber-400 hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-2 text-base">
                          🖨️ {pExam.title}
                        </CardTitle>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-950">
                          {pExam.version_count ?? 1}{" "}
                          {vi.printExam.versionCountBadgeSuffix}
                        </span>
                      </div>
                      <CardDescription>
                        {pExam.duration_min
                          ? `${pExam.duration_min} ${vi.dashboard.examCard.durationUnit}`
                          : vi.dashboard.examCard.noDurationLimit}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {new Date(pExam.created_at).toLocaleDateString(
                            "vi-VN"
                          )}
                        </span>
                        <span className="font-semibold text-teal-700">
                          {vi.printExam.openPrintViewButton}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {!isTeacher && selfAttempts.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {vi.studentDashboard.selfQuizHistoryTitle}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selfAttempts.map((att) => (
                <Link
                  key={att.id}
                  href={`/dashboard/self-quiz/${att.attempt_token}`}
                  className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  <Card className="h-full transition-shadow hover:border-teal-300 hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="line-clamp-2 text-base">
                        {(att.set_id && setTitleById.get(att.set_id)) ||
                          vi.studentSet.selfQuizButton}
                      </CardTitle>
                      <CardDescription>
                        {new Date(att.started_at).toLocaleString("vi-VN")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between text-xs">
                      {att.status === "in_progress" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                          {vi.studentDashboard.selfQuizInProgress}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-900">
                          {vi.studentDashboard.selfQuizScorePrefix}{" "}
                          {att.score ?? 0}
                        </span>
                      )}
                      <span className="font-semibold text-teal-700">
                        {vi.studentDashboard.selfQuizViewResult}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
