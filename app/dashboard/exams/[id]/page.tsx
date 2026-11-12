import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExamResultsWorkspace } from "@/components/features/exams/exam-results-workspace";
import type {
  TeacherAttemptAnswerItem,
  TeacherAttemptItem,
  TeacherExamQuestionItem,
} from "@/components/features/exams/attempt-grading-modal";
import type { ExamQuestionSnapshot } from "@/lib/grading/types";

interface ExamDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TeacherExamDetailPage({
  params,
}: ExamDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: exam } = await supabase
    .from("exams")
    .select(
      "id, owner_id, set_id, title, code, duration_min, is_open, show_answers, opens_at, closes_at, max_attempts, total_points, created_at"
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!exam) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
        <Card className="w-full max-w-md p-6">
          <CardHeader>
            <CardTitle>{vi.exams.results.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.exams.results.notFoundDescription}
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

  const [{ data: eqRows }, { data: attemptRows }] = await Promise.all([
    supabase
      .from("exam_questions")
      .select("id, question_id, points, position, question_snapshot")
      .eq("exam_id", exam.id)
      .order("position", { ascending: true }),
    supabase
      .from("attempts")
      .select(
        "id, student_name, student_class, started_at, submitted_at, status, score, needs_manual_review"
      )
      .eq("exam_id", exam.id)
      .order("started_at", { ascending: false }),
  ]);

  const questions: TeacherExamQuestionItem[] = (eqRows ?? []).map((eq) => ({
    examQuestionId: eq.id,
    questionId: eq.question_id,
    points: Number(eq.points) || 0,
    position: eq.position,
    snapshot: eq.question_snapshot as unknown as ExamQuestionSnapshot,
  }));

  const attemptIds = (attemptRows ?? []).map((a) => a.id);
  const answersByAttemptId = new Map<string, TeacherAttemptAnswerItem[]>();

  if (attemptIds.length > 0) {
    const { data: ansRows } = await supabase
      .from("attempt_answers")
      .select(
        "attempt_id, exam_question_id, question_id, response, is_correct, points_awarded, needs_review"
      )
      .in("attempt_id", attemptIds);

    for (const ans of ansRows ?? []) {
      const list = answersByAttemptId.get(ans.attempt_id) ?? [];
      list.push({
        examQuestionId: ans.exam_question_id,
        questionId: ans.question_id,
        response: ans.response,
        isCorrect: ans.is_correct,
        pointsAwarded:
          ans.points_awarded !== null ? Number(ans.points_awarded) : null,
        needsReview: Boolean(ans.needs_review),
      });
      answersByAttemptId.set(ans.attempt_id, list);
    }
  }

  const initialAttempts: TeacherAttemptItem[] = (attemptRows ?? []).map(
    (a) => ({
      id: a.id,
      studentName: a.student_name || "Học sinh",
      studentClass: a.student_class,
      startedAt: a.started_at,
      submittedAt: a.submitted_at,
      status: a.status,
      score: a.score !== null ? Number(a.score) : null,
      needsManualReview: Boolean(a.needs_manual_review),
      answers: answersByAttemptId.get(a.id) ?? [],
    })
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-700"
            >
              <span aria-hidden="true">←</span>
              <span>{vi.nav.backToDashboard}</span>
            </Link>
            {exam.set_id ? (
              <Link
                href={`/dashboard/sets/${exam.set_id}`}
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-teal-700 hover:underline"
              >
                {vi.exams.results.backToSet}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <ExamResultsWorkspace
          exam={{
            id: exam.id,
            setId: exam.set_id,
            title: exam.title,
            code: exam.code ?? "---",
            durationMin: exam.duration_min,
            isOpen: exam.is_open,
            showAnswers: exam.show_answers,
            opensAt: exam.opens_at,
            closesAt: exam.closes_at,
            maxAttempts: exam.max_attempts,
            totalPoints: Number(exam.total_points) || 10,
            createdAt: exam.created_at,
          }}
          questions={questions}
          initialAttempts={initialAttempts}
        />
      </main>
    </div>
  );
}

