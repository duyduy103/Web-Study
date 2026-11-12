import { StudyHubClient } from "@/components/features/study/study-hub-client";

export const dynamic = "force-dynamic";

export default function StudyHubPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <StudyHubClient />
    </main>
  );
}

