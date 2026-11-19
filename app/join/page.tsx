import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import { JoinClassClient } from "@/components/features/classes/join-class-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${vi.classes.join.pageTitle} — ${vi.app.name}`,
};

export default async function JoinClassIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
      <JoinClassClient isLoggedIn={Boolean(user)} />
    </main>
  );
}

