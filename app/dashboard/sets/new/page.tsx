import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import { ImportSetForm } from "@/components/features/import/import-set-form";

export default async function NewQuestionSetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-700 hover:text-teal-700"
          >
            <span aria-hidden="true">←</span>
            <span>{vi.nav.backToDashboard}</span>
          </Link>

          <span className="text-sm font-bold text-slate-900">
            {vi.app.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {vi.importSet.pageTitle}
          </h1>
          <p className="text-sm text-slate-600">{vi.importSet.pageSubtitle}</p>
        </div>

        <ImportSetForm />
      </main>
    </div>
  );
}

