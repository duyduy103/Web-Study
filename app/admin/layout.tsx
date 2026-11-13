import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { vi } from "@/lib/i18n/vi";

export const metadata = {
  title: "Quản trị hệ thống — MemoQuiz",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bắt buộc quyền Admin, người dùng thường hoặc khách sẽ nhận HTTP 404
  const { user, supabase } = await requireAdmin();

  // Đếm phản hồi mới
  let newFeedbackCount = 0;
  try {
    const { data: counts } = await supabase.rpc("get_admin_feedback_counts");
    if (counts && typeof counts === "object" && "new_count" in counts) {
      newFeedbackCount = Number(counts.new_count) || 0;
    }
  } catch {
    // Dự phòng truy vấn bảng
    const { count } = await supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    newFeedbackCount = count ?? 0;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Thanh điều hướng Admin */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="flex items-center gap-2 font-black text-white hover:text-teal-400 transition-colors"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-xs font-black text-slate-950">
                ⚡
              </span>
              <span className="text-sm font-bold tracking-tight">
                {vi.admin.title}
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1 text-xs font-bold">
              <Link
                href="/admin"
                className="rounded-xl px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                {vi.admin.nav.overview}
              </Link>
              <Link
                href="/admin/feedback"
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <span>{vi.admin.nav.feedback}</span>
                {newFeedbackCount > 0 ? (
                  <span className="rounded-full bg-teal-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                    {newFeedbackCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/admin/users"
                className="rounded-xl px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                {vi.admin.nav.users}
              </Link>
              <Link
                href="/admin/audit"
                className="rounded-xl px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                {vi.admin.nav.audit}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400">
              {user.email}
            </span>
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              {vi.admin.nav.backToApp}
            </Link>
          </div>
        </div>
      </header>

      {/* Nội dung trang admin */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

