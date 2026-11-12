import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StudentExamClient,
  type PublicExamMeta,
} from "@/components/features/student-exam/student-exam-client";

interface StudentExamPageProps {
  params: Promise<{ code: string }>;
}

export default async function StudentExamPage({
  params,
}: StudentExamPageProps) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: examRaw } = await supabase.rpc("get_public_exam_by_code", {
    p_code: code.trim().toUpperCase(),
  });

  if (!examRaw) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-4 py-12 text-center">
        <Card className="w-full p-6">
          <CardHeader>
            <CardTitle>{vi.studentExam.notFoundTitle}</CardTitle>
            <CardDescription>
              {vi.studentExam.notFoundDescription}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const examMeta = examRaw as unknown as PublicExamMeta;

  return (
    <main className="min-h-screen bg-slate-50">
      <StudentExamClient examMeta={examMeta} />
    </main>
  );
}

