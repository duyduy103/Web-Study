import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { getUserEntitlements } from "@/lib/entitlements";
import { buildPrintExamPackage } from "@/lib/export";
import type { PrintExamHeaderInfo } from "@/lib/export/types";
import type {
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
} from "@/lib/grading/types";
import { vi } from "@/lib/i18n/vi";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintExamPreviewWorkspace } from "@/components/features/exams/print-exam-preview-workspace";

interface PrintExamPageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintExamPreviewPage({
  params,
}: PrintExamPageProps) {
  const { id: examId } = await params;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  if (!isTeacherRole(authProfile.role)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>{vi.roles.teacherLabel}</CardTitle>
            <CardDescription>{vi.roles.teacherOnlyForbidden}</CardDescription>
            <div className="pt-4">
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                {vi.nav.backToDashboard}
              </Link>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }
  const user = authProfile.user;

  // Kiểm tra quyền sở hữu đề in của giáo viên
  const { data: exam } = await supabase
    .from("exams")
    .select(
      "id, owner_id, set_id, title, duration_min, shuffle_questions, shuffle_choices, version_count, seed, header_info"
    )
    .eq("id", examId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!exam) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>{vi.setDetails.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.setDetails.notFoundDescription}
            </CardDescription>
            <div className="pt-4">
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-teal-700 hover:underline"
              >
                {vi.nav.backToDashboard}
              </Link>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [{ data: eqRows }, { data: verRows }] = await Promise.all([
    supabase
      .from("exam_questions")
      .select("id, question_id, points, position, question_snapshot")
      .eq("exam_id", exam.id)
      .order("position", { ascending: true }),
    supabase
      .from("exam_versions")
      .select("code, question_order, choice_orders")
      .eq("exam_id", exam.id)
      .order("code", { ascending: true }),
  ]);

  const questionsWithSnapshot: ExamQuestionWithSnapshot[] = (eqRows ?? []).map(
    (row) => ({
      examQuestionId: row.id,
      questionId: row.question_id,
      points: Number(row.points) || 0,
      position: row.position,
      snapshot: row.question_snapshot as unknown as ExamQuestionSnapshot,
    })
  );

  const rawHeader = (exam.header_info ?? {}) as Record<string, unknown>;
  const header: PrintExamHeaderInfo = {
    schoolName:
      typeof rawHeader.schoolName === "string" ? rawHeader.schoolName : null,
    examName:
      typeof rawHeader.examName === "string" && rawHeader.examName.trim()
        ? rawHeader.examName
        : exam.title,
    subject: typeof rawHeader.subject === "string" ? rawHeader.subject : null,
    className:
      typeof rawHeader.className === "string" ? rawHeader.className : null,
    durationMinutes:
      typeof rawHeader.durationMinutes === "number"
        ? rawHeader.durationMinutes
        : exam.duration_min,
    studentInfoLine:
      typeof rawHeader.studentInfoLine === "string"
        ? rawHeader.studentInfoLine
        : vi.printExam.studentInfoLineDefault,
  };

  const existingVersions = (verRows ?? []).map((v) => ({
    code: v.code,
    question_order: Array.isArray(v.question_order) ? v.question_order : [],
    choice_orders: (v.choice_orders ?? {}) as Record<string, string[]>,
  }));

  const pkg = buildPrintExamPackage({
    header,
    questions: questionsWithSnapshot,
    versionCount: exam.version_count ?? 4,
    seed: exam.seed || exam.id,
    shuffleQuestions: exam.shuffle_questions,
    shuffleChoices: exam.shuffle_choices,
    existingVersions:
      existingVersions.length > 0 ? existingVersions : undefined,
  });

  const entitlements = await getUserEntitlements(supabase, user.id);

  return (
    <PrintExamPreviewWorkspace
      examId={exam.id}
      setId={exam.set_id}
      pkg={pkg}
      canExportDocx={entitlements.limits.can_export_docx}
    />
  );
}
