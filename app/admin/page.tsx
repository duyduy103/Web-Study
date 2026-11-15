import { requireAdmin } from "@/lib/admin/guard";
import {
  AdminOverviewDashboard,
  type SystemOverviewData,
} from "@/components/features/admin/admin-overview-dashboard";

export const metadata = {
  title: "Thống kê hệ thống — Quản trị MemoQuiz",
};

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();

  // Đọc giới hạn toàn hệ thống & đơn giá token từ env nếu có
  const aiGlobalLimit = Number(process.env.AI_GLOBAL_DAILY_LIMIT) || 500;
  const tokenCost = Number(process.env.AI_COST_PER_MILLION_TOKENS) || 0.15;
  const fastModel = process.env.GEMINI_MODEL_FAST?.trim() || "";
  const strongModel = process.env.GEMINI_MODEL_STRONG?.trim() || "";
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  let modelConfigWarning: string | null = null;
  if (!hasApiKey) {
    modelConfigWarning = "Chưa cấu hình GEMINI_API_KEY trên máy chủ.";
  } else if (!fastModel || !strongModel) {
    modelConfigWarning = "Thiếu cấu hình GEMINI_MODEL_FAST hoặc GEMINI_MODEL_STRONG trong file .env.";
  }

  const { data: rawData, error } = await supabase.rpc(
    "get_admin_system_overview"
  );

  if (error || !rawData) {
    return (
      <div className="rounded-3xl border border-red-800 bg-red-950/40 p-8 text-center text-red-300">
        Không thể tải số liệu thống kê hệ thống: {error?.message || "Lỗi RPC"}
      </div>
    );
  }

  const overviewData = rawData as unknown as SystemOverviewData;

  return (
    <AdminOverviewDashboard
      data={overviewData}
      aiGlobalDailyLimit={aiGlobalLimit}
      tokenCostPerMillion={tokenCost}
      fastModel={fastModel}
      strongModel={strongModel}
      modelConfigWarning={modelConfigWarning}
    />
  );
}
