import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { ActiveRecallSessionClient } from "@/components/features/study/active-recall-session-client";

export const dynamic = "force-dynamic";

interface AccountSetStudyReviewPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function AccountSetStudyReviewPage({
  params,
  searchParams,
}: AccountSetStudyReviewPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <ActiveRecallSessionClient
        code={id}
        leechOnly={sp.mode === "leech"}
        accountMode={true}
      />
    </main>
  );
}

