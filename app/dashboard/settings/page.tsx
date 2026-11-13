import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { SettingsClient } from "@/components/features/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <SettingsClient
        initialDisplayName={authProfile.displayName}
        initialRole={authProfile.role}
        email={authProfile.user.email ?? ""}
      />
    </main>
  );
}

