import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { vi } from "@/lib/i18n/vi";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StudentExamClient,
  type PublicExamMeta,
} from "@/components/features/student-exam/student-exam-client";

export const dynamic = "force-dynamic";

interface SelfQuizPageProps {
  params: Promise<{ token: string }>;
}

export default async function SelfQuizAttemptPage({
  params,
}: SelfQuizPageProps) {
  const { token } = await params;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, exam_id, set_id, student_id")
    .eq("attempt_token", token)
    .eq("student_id", authProfile.user.id)
    .maybeSingle();

  if (!attempt || !attempt.exam_id) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-4 py-12 text-center">
        <Card className="w-full p-6">
          <CardHeader>
            <CardTitle>{vi.studentExam.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.studentExam.notFoundDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {vi.nav.backToDashboard}
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { data: exam } = await supabase
    .from("exams")
    .select(
      "id, title, duration_min, is_open, show_answers, opens_at, closes_at, max_attempts, total_points"
    )
    .eq("id", attempt.exam_id)
    .maybeSingle();

  if (!exam) {
    redirect("/dashboard");
  }

  const { count: questionCount } = await supabase
    .from("exam_questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", exam.id);

  const examMeta: PublicExamMeta = {
    id: exam.id,
    code: exam.id,
    title: exam.title,
    duration_min: exam.duration_min,
    is_open: exam.is_open,
    show_answers: exam.show_answers,
    opens_at: exam.opens_at,
    closes_at: exam.closes_at,
    max_attempts: exam.max_attempts,
    total_points: Number(exam.total_points) || 10,
    question_count: questionCount ?? 0,
    server_now: new Date().toISOString(),
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href={
              attempt.set_id
                ? `/dashboard/sets/${attempt.set_id}`
                : "/dashboard"
            }
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
          >
            {vi.studentSet.backToSet}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {vi.nav.backToDashboard}
          </Link>
        </div>
      </div>

      <StudentExamClient examMeta={examMeta} initialAttemptToken={token} />
    </main>
  );
}

