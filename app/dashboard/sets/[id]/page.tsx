import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAiQuotaStatus } from "@/lib/ai/quota-and-cache";
import { vi } from "@/lib/i18n/vi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DistractorGeneratorPanel,
  type ShortAnswerQuestionCandidate,
} from "@/components/features/sets/distractor-generator-panel";

interface SetDetailPageProps {
  params: Promise<{ id: string }>;
}

function getConfidenceBadge(confidence: number | null) {
  const val = confidence ?? 0.5;
  if (val >= 0.8) {
    return {
      label: vi.setDetails.confidenceBadges.high,
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (val >= 0.5) {
    return {
      label: vi.setDetails.confidenceBadges.medium,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: vi.setDetails.confidenceBadges.low,
    className: "border-red-200 bg-red-50 text-red-800",
  };
}

export default async function QuestionSetDetailPage({
  params,
}: SetDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: questionSet }, quotaStatus] = await Promise.all([
    supabase
      .from("question_sets")
      .select("id, title, subject, grade, created_at")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    getUserAiQuotaStatus(supabase, user.id),
  ]);

  if (!questionSet) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
        <Card className="w-full max-w-md p-6">
          <CardHeader>
            <CardTitle>{vi.setDetails.notFoundTitle}</CardTitle>
            <CardDescription>{vi.setDetails.notFoundDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              {vi.nav.backToDashboard}
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { data: questionsData } = await supabase
    .from("questions")
    .select(
      "id, type, stem, explanation, source_ref, confidence, status, warnings, ai_generated, created_at"
    )
    .eq("set_id", questionSet.id)
    .order("created_at", { ascending: true });

  const questions = questionsData ?? [];
  const questionIds = questions.map((q) => q.id);

  const choicesByQuestion = new Map<
    string,
    Array<{
      id: string;
      text: string;
      is_correct: boolean;
      position: number;
      ai_generated: boolean;
    }>
  >();
  const answersByQuestion = new Map<string, string>();

  if (questionIds.length > 0) {
    const [{ data: choicesData }, { data: answersData }] = await Promise.all([
      supabase
        .from("choices")
        .select("id, question_id, text, is_correct, position, ai_generated")
        .in("question_id", questionIds)
        .order("position", { ascending: true }),
      supabase
        .from("answers")
        .select("question_id, answer_text")
        .in("question_id", questionIds),
    ]);

    for (const c of choicesData ?? []) {
      const list = choicesByQuestion.get(c.question_id) ?? [];
      list.push(c);
      choicesByQuestion.set(c.question_id, list);
    }

    for (const a of answersData ?? []) {
      answersByQuestion.set(a.question_id, a.answer_text);
    }
  }

  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  const shortAnswerCandidates: ShortAnswerQuestionCandidate[] = [];

  questions.forEach((q, idx) => {
    const conf = q.confidence ?? 0;
    if (conf >= 0.8) highCount++;
    else if (conf >= 0.5) mediumCount++;
    else lowCount++;

    if (q.type === "short_answer") {
      const ans = answersByQuestion.get(q.id);
      shortAnswerCandidates.push({
        id: q.id,
        orderNumber: idx + 1,
        stem: q.stem,
        hasAnswer: Boolean(ans && ans.trim().length > 0),
      });
    }
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-700"
          >
            <span aria-hidden="true">←</span>
            <span>{vi.setDetails.backToList}</span>
          </Link>

          <Link
            href="/dashboard/sets/new"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            + {vi.dashboard.createSetButton}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {questionSet.title}
            </h1>
            <p className="text-sm text-slate-600">
              {questionSet.subject ?? vi.dashboard.setCard.subjectFallback} •{" "}
              {vi.dashboard.setCard.gradePrefix}{" "}
              {questionSet.grade ?? vi.dashboard.setCard.gradeFallback} •{" "}
              {vi.dashboard.setCard.createdAtPrefix}{" "}
              {new Date(questionSet.created_at).toLocaleDateString("vi-VN")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="text-lg font-bold text-slate-900">
                {questions.length}
              </div>
              <div className="text-xs text-slate-600">
                {vi.setDetails.totalQuestionsLabel}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
              <div className="text-lg font-bold text-emerald-800">
                {highCount}
              </div>
              <div className="text-xs text-emerald-700">
                {vi.setDetails.highConfidenceLabel}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
              <div className="text-lg font-bold text-amber-800">
                {mediumCount}
              </div>
              <div className="text-xs text-amber-700">
                {vi.setDetails.mediumConfidenceLabel}
              </div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2.5">
              <div className="text-lg font-bold text-red-800">{lowCount}</div>
              <div className="text-xs text-red-700">
                {vi.setDetails.lowConfidenceLabel}
              </div>
            </div>
          </div>

          <p className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-2.5 text-xs text-teal-900">
            {vi.setDetails.draftNotice}
          </p>
        </section>

        <DistractorGeneratorPanel
          setId={questionSet.id}
          candidates={shortAnswerCandidates}
          initialRemainingQuota={quotaStatus.remainingToday}
        />

        <section className="space-y-4">
          {questions.map((q, index) => {
            const choices = choicesByQuestion.get(q.id) ?? [];
            const answerText = answersByQuestion.get(q.id);
            const badge = getConfidenceBadge(q.confidence);
            const warningList = Array.isArray(q.warnings) ? q.warnings : [];

            return (
              <Card key={q.id} className="border-slate-200">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white">
                        {vi.setDetails.questionNumberPrefix} {index + 1}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {vi.parsing.questionTypes[q.type]}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                        {vi.setDetails.statusBadges[q.status]}
                      </span>
                      {q.ai_generated ? (
                        <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">
                          {vi.app.aiBadge}
                        </span>
                      ) : null}
                      {q.source_ref ? (
                        <span className="text-xs text-slate-500">
                          {vi.setDetails.sourceRefLabel} {q.source_ref}
                        </span>
                      ) : null}
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}{" "}
                      {q.confidence !== null
                        ? `(${Math.round(q.confidence * 100)}%)`
                        : ""}
                    </span>
                  </div>

                  <p className="text-base font-medium text-slate-900">
                    {q.stem}
                  </p>

                  {choices.length > 0 ? (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {choices.map((c, cIdx) => {
                        const letter = String.fromCharCode(65 + cIdx);
                        return (
                          <li
                            key={c.id}
                            className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
                              c.is_correct
                                ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-900"
                                : "border-slate-200 bg-slate-50/60 text-slate-700"
                            }`}
                          >
                            <span>
                              <span className="font-bold">{letter}.</span>{" "}
                              {c.text} {c.is_correct ? "✓" : ""}
                            </span>
                            {c.ai_generated ? (
                              <span className="shrink-0 rounded-full bg-teal-700/90 px-2 py-0.5 text-[10px] font-bold text-white">
                                {vi.app.aiBadge}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
                      <span className="font-semibold text-slate-700">
                        {vi.setDetails.correctAnswerLabel}
                      </span>{" "}
                      {answerText ? (
                        <span className="font-semibold text-emerald-800">
                          {answerText}
                        </span>
                      ) : (
                        <span className="font-medium text-red-600">
                          {vi.setDetails.noAnswerFound}
                        </span>
                      )}
                    </div>
                  )}

                  {q.explanation ? (
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold">
                        {vi.setDetails.explanationLabel}
                      </span>{" "}
                      {q.explanation}
                    </p>
                  ) : null}

                  {warningList.length > 0 ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
                    >
                      <span className="font-semibold">
                        {vi.setDetails.warningsTitle}
                      </span>{" "}
                      {warningList.join(" • ")}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
}
