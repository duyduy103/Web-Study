import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { getUserEntitlements } from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";
import { ClassDetailWorkspace } from "@/components/features/classes/class-detail-workspace";
import { StudentClassAssignments } from "@/components/features/classes/student-class-assignments";
import type {
  ClassMemberItem,
  StudentClassSummary,
} from "@/lib/classes/schemas";
import type {
  StudentClassAssignmentItem,
  TeacherClassAssignmentItem,
} from "@/lib/classes/assignments";
import type { ClassRecordDetail } from "@/components/features/classes/class-settings-tab";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

async function resolveOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl && envUrl.startsWith("http")) {
    return envUrl.replace(/\/+$/, "");
  }
  try {
    const hdrs = await headers();
    const host = hdrs.get("host");
    if (host) {
      const proto = hdrs.get("x-forwarded-proto") || "http";
      return `${proto}://${host}`;
    }
  } catch {
    // ignore
  }
  return "";
}

export default async function ClassDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/classes/${id}`)}`);
  }

  const isTeacher = isTeacherRole(authProfile.role);

  // 1. Nhánh Giáo viên chủ lớp
  if (isTeacher) {
    const { data: classRow, error: classErr } = await supabase
      .from("classes")
      .select(
        "id, teacher_id, name, description, join_code, require_approval, is_open, archived_at, created_at"
      )
      .eq("id", id)
      .eq("teacher_id", authProfile.user.id)
      .maybeSingle();

    if (!classErr && classRow) {
      const [
        { data: membersPayload },
        { data: assignmentsPayload },
        { data: ownedExamsData },
        { data: ownedSetsData },
        entitlements,
        appOrigin,
      ] = await Promise.all([
        supabase.rpc("get_class_members_for_teacher", { p_class_id: id }),
        supabase.rpc("get_teacher_class_assignments", { p_class_id: id }),
        supabase
          .from("exams")
          .select("id, title, duration_min, max_attempts, access_mode")
          .eq("owner_id", authProfile.user.id)
          .eq("exam_mode", "online")
          .order("created_at", { ascending: false }),
        supabase
          .from("question_sets")
          .select("id, title")
          .eq("owner_id", authProfile.user.id)
          .order("created_at", { ascending: false }),
        getUserEntitlements(supabase, authProfile.user.id),
        resolveOrigin(),
      ]);

      const setIds = (ownedSetsData ?? []).map((s) => s.id);
      const approvedCountBySet = new Map<string, number>();
      if (setIds.length > 0) {
        const { data: approvedRows } = await supabase
          .from("questions")
          .select("set_id")
          .in("set_id", setIds)
          .eq("status", "approved");
        for (const r of approvedRows ?? []) {
          approvedCountBySet.set(
            r.set_id,
            (approvedCountBySet.get(r.set_id) ?? 0) + 1
          );
        }
      }

      const ownedSets = (ownedSetsData ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        approved_count: approvedCountBySet.get(s.id) ?? 0,
      }));

      const parsedMembers = membersPayload as {
        members?: ClassMemberItem[];
      } | null;
      const parsedAssignments = assignmentsPayload as {
        assignments?: TeacherClassAssignmentItem[];
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
            <ClassDetailWorkspace
              initialClass={classRow as ClassRecordDetail}
              initialMembers={parsedMembers?.members ?? []}
              initialAssignments={parsedAssignments?.assignments ?? []}
              ownedExams={(ownedExamsData ?? []).map((e) => ({
                id: e.id,
                title: e.title,
                duration_min: e.duration_min,
                max_attempts: e.max_attempts,
                access_mode: e.access_mode,
              }))}
              ownedSets={ownedSets}
              maxStudentsPerClass={entitlements.limits.max_students_per_class}
              appOrigin={appOrigin}
            />
          </main>
        </div>
      );
    }
  }

  // 2. Nhánh Học sinh (hoặc GV đang là thành viên active của lớp khác)
  const [{ data: studentClassesRaw }, { data: assignmentsRaw }] =
    await Promise.all([
      supabase.rpc("get_student_classes"),
      supabase.rpc("get_student_class_assignments", { p_class_id: id }),
    ]);

  const studentClasses =
    (studentClassesRaw as { classes?: StudentClassSummary[] } | null)
      ?.classes ?? [];
  const currentClass = studentClasses.find(
    (c) => c.class_id === id && c.status === "active"
  );

  const assignmentsPayload = assignmentsRaw as {
    error?: string | null;
    assignments?: StudentClassAssignmentItem[];
  } | null;

  if (!currentClass || assignmentsPayload?.error) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/dashboard/classes"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-slate-700 hover:text-teal-700"
          >
            {vi.classes.backToClasses}
          </Link>
          <span className="text-sm font-bold text-slate-900">
            {vi.app.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {currentClass.name}
          </h1>
          <p className="text-sm text-slate-600">
            {vi.classes.join.teacherLabel}{" "}
            <strong>{currentClass.teacher_name}</strong>
          </p>
          {currentClass.description ? (
            <p className="text-xs text-slate-500">{currentClass.description}</p>
          ) : null}
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">
            {vi.classes.tabs.assignments}
          </h2>
          <StudentClassAssignments
            assignments={assignmentsPayload?.assignments ?? []}
          />
        </section>
      </main>
    </div>
  );
}
