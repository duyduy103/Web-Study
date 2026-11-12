import { StudySetOverviewClient } from "@/components/features/study/study-set-overview-client";

export const dynamic = "force-dynamic";

interface StudySetPageProps {
  params: Promise<{ code: string }>;
}

export default async function StudySetOverviewPage({
  params,
}: StudySetPageProps) {
  const { code } = await params;

  return (
    <main className="min-h-screen bg-slate-50">
      <StudySetOverviewClient code={code.trim().toUpperCase()} />
    </main>
  );
}

