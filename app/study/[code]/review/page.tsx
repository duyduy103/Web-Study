import { ActiveRecallSessionClient } from "@/components/features/study/active-recall-session-client";

export const dynamic = "force-dynamic";

interface StudyReviewPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function StudyReviewPage({
  params,
  searchParams,
}: StudyReviewPageProps) {
  const { code } = await params;
  const sp = await searchParams;
  const leechOnly = sp.mode === "leech";

  return (
    <main className="min-h-screen bg-slate-50">
      <ActiveRecallSessionClient
        code={code.trim().toUpperCase()}
        leechOnly={leechOnly}
      />
    </main>
  );
}

