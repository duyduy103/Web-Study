import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { DesignPreviewClient } from "@/components/features/design-preview/design-preview-client";

export const dynamic = "force-dynamic";

export default async function DesignPreviewPage() {
  const isDev = process.env.NODE_ENV !== "production";

  if (!isDev) {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile || !isTeacherRole(authProfile.role)) {
      redirect("/login");
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 lg:px-8 transition-colors duration-200">
      <DesignPreviewClient />
    </main>
  );
}

