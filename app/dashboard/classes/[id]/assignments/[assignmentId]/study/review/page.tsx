import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { ActiveRecallSessionClient } from "@/components/features/study/active-recall-session-client";

export const dynamic = "force-dynamic";

export default async function ClassAssignmentStudyReviewPage(props: {
  params: Promise<{ id: string; assignmentId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id, assignmentId } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/classes/${id}/assignments/${assignmentId}/study/review`
      )}`
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <ActiveRecallSessionClient
        code={`class_assignment:${assignmentId}`}
        leechOnly={sp.mode === "leech"}
        accountMode={true}
        overviewHrefOverride={`/dashboard/classes/${id}/assignments/${assignmentId}/study`}
      />
    </main>
  );
}

