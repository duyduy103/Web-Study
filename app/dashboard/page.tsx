import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAiQuotaStatus } from "@/lib/ai/quota-and-cache";
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, quotaStatus] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle(),
    getUserAiQuotaStatus(supabase, user.id),
  ]);

  const metadataName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : undefined;
  const emailPrefix = user.email ? user.email.split("@")[0] : undefined;
  const displayName =
    profile?.display_name ||
    metadataName ||
    emailPrefix ||
    vi.dashboard.defaultTeacherName;

  const { data: questionSets, error: setsError } = await supabase
    .from("question_sets")
    .select("id, title, subject, grade, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const sets = questionSets ?? [];
  const setIds = sets.map((s) => s.id);

  const statsBySetId = new Map<
    string,
    { total: number; needsReview: number }
  >();

  if (setIds.length > 0) {
    const { data: questionsMeta } = await supabase
      .from("questions")
      .select("set_id, confidence, warnings")
      .in("set_id", setIds);

    for (const q of questionsMeta ?? []) {
      const current = statsBySetId.get(q.set_id) ?? {
        total: 0,
        needsReview: 0,
      };
      current.total += 1;
      const conf = q.confidence ?? 0;
      const hasWarnings = Array.isArray(q.warnings) && q.warnings.length > 0;
      if (conf < 0.8 || hasWarnings) {
        current.needsReview += 1;
      }
      statsBySetId.set(q.set_id, current);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-base font-bold text-white shadow-2xs">
              MQ
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                {vi.app.name}
              </span>
              <span className="ml-2 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                {vi.app.roleBadge}
              </span>
            </div>
          </div>

          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              {vi.nav.logout}
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/80 via-white to-sky-50/60 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {vi.dashboard.greetingPrefix} {displayName}!
            </h1>
            <p className="text-sm text-slate-600">{vi.dashboard.subtitle}</p>
            <p className="pt-1 text-xs font-medium text-teal-800">
              {vi.dashboard.aiQuotaRemainingPrefix}{" "}
              <strong>
                {quotaStatus.remainingToday}/{quotaStatus.dailyLimit}
              </strong>{" "}
              {vi.dashboard.aiQuotaUnit}
            </p>
          </div>

          <CreateSetButton />
        </section>

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
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl text-teal-700"
                >
                  📚
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-semibold text-slate-900">
                    {vi.dashboard.emptyState.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {vi.dashboard.emptyState.description}
                  </p>
                  <p className="pt-1 text-xs font-medium text-teal-700">
                    {vi.dashboard.emptyState.hint}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((setItem) => {
                const stat = statsBySetId.get(setItem.id) ?? {
                  total: 0,
                  needsReview: 0,
                };
                return (
                  <Link
                    key={setItem.id}
                    href={`/dashboard/sets/${setItem.id}`}
                    className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    <Card className="h-full transition-shadow hover:border-teal-300 hover:shadow-md">
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
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">
                            {stat.total}{" "}
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
      </main>
    </div>
  );
}
