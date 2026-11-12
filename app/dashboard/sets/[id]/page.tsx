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
import { ReviewWorkspace } from "@/components/features/review/review-workspace";
import type { ReviewQuestionItem } from "@/lib/review/types";

interface SetDetailPageProps {
  params: Promise<{ id: string }>;
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

  const [{ data: questionSet }, quotaStatus, { data: setExams }] =
    await Promise.all([
      supabase
        .from("question_sets")
        .select("id, title, subject, grade, study_enabled, study_code, created_at")
        .eq("id", id)
        .eq("owner_id", user.id)
        .maybeSingle(),
      getUserAiQuotaStatus(supabase, user.id),
      supabase
        .from("exams")
        .select("id, title, code, is_open, created_at")
        .eq("set_id", id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  if (!questionSet) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
        <Card className="w-full max-w-md p-6">
          <CardHeader>
            <CardTitle>{vi.setDetails.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.setDetails.notFoundDescription}
            </CardDescription>
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

  const { data: fullQuestionsData, error: fullQueryError } = await supabase
    .from("questions")
    .select(
      "id, set_id, type, stem, explanation, source_ref, raw_source_text, topic, difficulty, confidence, status, warnings, ai_generated, reviewed_by_human, reviewed_at, created_at, updated_at"
    )
    .eq("set_id", questionSet.id)
    .order("created_at", { ascending: true });

  let rawQuestions = fullQuestionsData ?? [];

  if (fullQueryError) {
    const { data: fallbackData } = await supabase
      .from("questions")
      .select(
        "id, set_id, type, stem, explanation, source_ref, topic, difficulty, confidence, status, warnings, ai_generated, created_at"
      )
      .eq("set_id", questionSet.id)
      .order("created_at", { ascending: true });

    rawQuestions = (fallbackData ?? []).map((q) => ({
      ...q,
      raw_source_text: null,
      reviewed_by_human: false,
      reviewed_at: null,
      updated_at: q.created_at,
    }));
  }

  const questionIds = rawQuestions.map((q) => q.id);

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

  const initialQuestions: ReviewQuestionItem[] = rawQuestions.map((q, idx) => ({
    id: q.id,
    set_id: q.set_id,
    orderNumber: idx + 1,
    type: q.type,
    stem: q.stem,
    explanation: q.explanation,
    source_ref: q.source_ref,
    raw_source_text: q.raw_source_text,
    topic: q.topic,
    difficulty: q.difficulty,
    confidence: q.confidence,
    status: q.status,
    warnings: Array.isArray(q.warnings) ? q.warnings : [],
    ai_generated: q.ai_generated,
    reviewed_by_human: Boolean(q.reviewed_by_human),
    reviewed_at: q.reviewed_at,
    created_at: q.created_at,
    updated_at: q.updated_at ?? q.created_at,
    choices: choicesByQuestion.get(q.id) ?? [],
    answer_text: answersByQuestion.get(q.id) ?? null,
  }));

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

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        {setExams && setExams.length > 0 ? (
          <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
            <h2 className="text-xs font-bold tracking-wide text-teal-900 uppercase">
              {vi.exams.setExamsBannerTitle} ({setExams.length})
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {setExams.map((ex) => (
                <Link
                  key={ex.id}
                  href={`/dashboard/exams/${ex.id}`}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-teal-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:border-teal-600 hover:text-teal-800"
                >
                  <span>{ex.title}</span>
                  {ex.code ? (
                    <span className="rounded-md bg-teal-100 px-1.5 py-0.5 font-mono text-teal-900">
                      {ex.code}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      ex.is_open
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {ex.is_open
                      ? vi.dashboard.examCard.statusOpen
                      : vi.dashboard.examCard.statusClosed}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <ReviewWorkspace
          setId={questionSet.id}
          title={questionSet.title}
          subject={questionSet.subject}
          grade={questionSet.grade}
          createdAt={questionSet.created_at}
          initialQuestions={initialQuestions}
          initialRemainingAiQuota={quotaStatus.remainingToday}
          initialStudyEnabled={Boolean(questionSet.study_enabled)}
          initialStudyCode={questionSet.study_code ?? null}
        />
      </main>
    </div>
  );
}
