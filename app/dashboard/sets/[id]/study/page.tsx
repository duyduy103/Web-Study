import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { StudySetOverviewClient } from "@/components/features/study/study-set-overview-client";

export const dynamic = "force-dynamic";

interface AccountSetStudyPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountSetStudyPage({
  params,
}: AccountSetStudyPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <StudySetOverviewClient
        code={id}
        accountMode={true}
        displayName={authProfile.displayName}
      />
    </main>
  );
}

