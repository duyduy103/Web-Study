import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { getUserEntitlements } from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";
import { TeacherClassesList } from "@/components/features/classes/teacher-classes-list";
import { StudentClassesList } from "@/components/features/classes/student-classes-list";
import type {
  StudentClassSummary,
  TeacherClassSummary,
} from "@/lib/classes/schemas";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${vi.classes.navLabel} — ${vi.app.name}`,
};

export default async function ClassesPage() {
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login?next=/dashboard/classes");
  }

  const { user, role } = authProfile;
  const isTeacher = isTeacherRole(role);

  if (isTeacher) {
    const [entitlements, { data: classesPayload, error }] = await Promise.all([
      getUserEntitlements(supabase, user.id),
      supabase.rpc("get_teacher_classes"),
    ]);

    const parsed = classesPayload as {
      error?: string | null;
      classes?: TeacherClassSummary[];
    } | null;

    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-slate-700 hover:text-teal-700"
            >
              {vi.classes.backToDashboard}
            </Link>
            <span className="text-sm font-bold text-slate-900">
              {vi.app.name}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {error || parsed?.error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {vi.classes.errors.systemError}
            </div>
          ) : (
            <TeacherClassesList
              initialClasses={parsed?.classes ?? []}
              maxClasses={entitlements.limits.max_classes}
              maxStudentsPerClass={entitlements.limits.max_students_per_class}
              isPremium={entitlements.is_premium}
            />
          )}
        </main>
      </div>
    );
  }

  const { data: studentPayload, error: studentError } = await supabase.rpc(
    "get_student_classes"
  );
  const parsedStudent = studentPayload as {
    error?: string | null;
    classes?: StudentClassSummary[];
  } | null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-slate-700 hover:text-teal-700"
          >
            {vi.classes.backToDashboard}
          </Link>
          <span className="text-sm font-bold text-slate-900">
            {vi.app.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {studentError || parsedStudent?.error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {vi.classes.errors.systemError}
          </div>
        ) : (
          <StudentClassesList initialClasses={parsedStudent?.classes ?? []} />
        )}
      </main>
    </div>
  );
}

