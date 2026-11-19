import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
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

const uuidSchema = z.string().uuid();

interface ClassAttemptPayload {
  exam?: {
    id: string;
    code: string | null;
    title: string;
    duration_min: number | null;
    is_open: boolean;
    show_answers: boolean;
    opens_at: string | null;
    closes_at: string | null;
    total_points: number;
  };
  attempt?: {
    id: string;
    assignment_id?: string | null;
  };
  questions?: unknown[];
  server_now?: string;
}

export default async function ClassAssignmentExamPage(props: {
  params: Promise<{ id: string; assignmentId: string; token: string }>;
}) {
  const { id, assignmentId, token } = await props.params;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/classes/${id}/assignments/${assignmentId}/exam/${token}`
      )}`
    );
  }

  const validParams =
    uuidSchema.safeParse(id).success &&
    uuidSchema.safeParse(assignmentId).success &&
    token.length >= 32;

  let attemptPayload: ClassAttemptPayload | null = null;

  if (validParams) {
    const { data } = await supabase.rpc("get_student_attempt_by_token", {
      p_attempt_token: token,
    });
    if (data && typeof data === "object" && !Array.isArray(data)) {
      attemptPayload = data as unknown as ClassAttemptPayload;
    }
  }

  if (
    !attemptPayload ||
    !attemptPayload.exam ||
    !attemptPayload.attempt ||
    attemptPayload.attempt.assignment_id !== assignmentId
  ) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-4 py-12 text-center">
        <Card className="w-full p-6">
          <CardHeader>
            <CardTitle>{vi.studentExam.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.classes.assignments.errors.classAccessRevoked}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/classes"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {vi.classes.backToClasses}
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const exam = attemptPayload.exam;
  const examMeta: PublicExamMeta = {
    id: exam.id,
    code: exam.code ?? exam.id,
    title: exam.title,
    duration_min: exam.duration_min,
    is_open: exam.is_open,
    show_answers: exam.show_answers,
    opens_at: exam.opens_at,
    closes_at: exam.closes_at,
    max_attempts: 1,
    total_points: Number(exam.total_points) || 10,
    question_count: Array.isArray(attemptPayload.questions)
      ? attemptPayload.questions.length
      : 0,
    server_now: attemptPayload.server_now ?? new Date().toISOString(),
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href={`/dashboard/classes/${id}`}
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 hover:underline"
          >
            {vi.classes.assignments.backToClass}
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
