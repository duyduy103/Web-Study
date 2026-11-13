import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { vi } from "@/lib/i18n/vi";

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();

  // Đếm phản hồi
  let feedbackCount = 0;
  let newFeedbackCount = 0;
  try {
    const { data: counts } = await supabase.rpc("get_admin_feedback_counts");
    if (counts && typeof counts === "object") {
      feedbackCount = Number((counts as { total?: number }).total) || 0;
      newFeedbackCount = Number((counts as { new_count?: number }).new_count) || 0;
    }
  } catch {
    // Dự phòng
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {vi.admin.title}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Hệ thống giám sát và quản trị vận hành MemoQuiz (Giai đoạn D: Hộp thư phản hồi).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/feedback"
          className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-sm hover:border-teal-500/50 transition-all block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {vi.admin.nav.feedback}
            </span>
            {newFeedbackCount > 0 ? (
              <span className="rounded-full bg-teal-400 px-2 py-0.5 text-xs font-black text-slate-950">
                {newFeedbackCount} mới
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{feedbackCount}</span>
            <span className="text-xs text-slate-400">tổng số góp ý</span>
          </div>
          <p className="mt-2 text-xs font-bold text-teal-400">
            Xem hộp thư góp ý & trả lời →
          </p>
        </Link>
      </div>
    </div>
  );
}
