import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Tài khoản bị khóa — MemoQuiz",
};

export default async function BlockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_blocked, blocked_reason, blocked_at")
    .eq("id", user.id)
    .single();

  if (!profile?.is_blocked) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-3xl border border-red-200 bg-[var(--space-surface)] p-8 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-3xl text-red-600">
          🔒
        </div>

        <h1 className="mt-4 text-xl font-black text-slate-900 sm:text-2xl">
          {vi.blocked.pageTitle}
        </h1>
        <p className="mt-2 text-xs font-medium text-slate-600">
          {vi.blocked.pageSubtitle}
        </p>

        <div className="my-5 rounded-2xl border border-red-100 bg-red-50/70 p-4 text-left">
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">
            {vi.blocked.reasonTitle}
          </span>
          <p className="mt-1 text-xs font-semibold text-red-950">
            {profile.blocked_reason || vi.blocked.defaultReason}
          </p>
          {profile.blocked_at ? (
            <span className="mt-2 block text-[10px] text-red-700">
              Thời điểm khóa:{" "}
              {new Date(profile.blocked_at).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">
          {vi.blocked.appealInstructions}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="outline"
              className="w-full min-h-[44px] font-bold"
            >
              {vi.blocked.logoutButton}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

