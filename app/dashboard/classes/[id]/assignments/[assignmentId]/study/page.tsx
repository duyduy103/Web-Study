import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { vi } from "@/lib/i18n/vi";
import { StudySetOverviewClient } from "@/components/features/study/study-set-overview-client";

export const dynamic = "force-dynamic";

export default async function ClassAssignmentStudyOverviewPage(props: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = await props.params;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/classes/${id}/assignments/${assignmentId}/study`
      )}`
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <StudySetOverviewClient
        code={`class_assignment:${assignmentId}`}
        accountMode={true}
        displayName={authProfile.displayName}
        backHrefOverride={`/dashboard/classes/${id}`}
        backLabelOverride={vi.classes.assignments.backToClass}
        reviewBaseHrefOverride={`/dashboard/classes/${id}/assignments/${assignmentId}/study/review`}
      />
    </main>
  );
}

