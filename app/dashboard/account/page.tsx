import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { getAiDailyLimitForRole } from "@/lib/ai/limits";
import { AccountClient } from "@/components/features/account/account-client";

export const metadata = {
  title: "Tài khoản của tôi — MemoQuiz",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const authProfile = await getAuthenticatedProfile(supabase);

  if (!authProfile) {
    redirect("/login");
  }

  const userId = authProfile.user.id;

  // Lấy thông tin hạn mức AI của người dùng
  const defaultLimit = getAiDailyLimitForRole(authProfile.role);
  const { data: profile } = await supabase
    .from("profiles")
    .select("custom_ai_daily_limit")
    .eq("id", userId)
    .maybeSingle();

  const effectiveLimit = profile?.custom_ai_daily_limit ?? defaultLimit;

  // Đọc lượt gọi AI hôm nay
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("date", todayStr)
    .maybeSingle();

  const callsToday = usageRow?.calls ?? 0;
  const remainingToday = Math.max(0, effectiveLimit - callsToday);

  // Đọc số bộ câu hỏi
  const { count: setCount } = await supabase
    .from("question_sets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  // Đọc dung lượng lưu trữ ước tính
  const { data: sets } = await supabase
    .from("question_sets")
    .select("id")
    .eq("owner_id", userId);

  const setIds = (sets ?? []).map((s) => s.id);
  let storageBytes = 0;

  if (setIds.length > 0) {
    const { count: fileCount } = await supabase
      .from("source_files")
      .select("id", { count: "exact", head: true })
      .in("set_id", setIds);
    storageBytes = (fileCount ?? 0) * 256000;
  }

  return (
    <AccountClient
      initialDisplayName={authProfile.displayName}
      initialRole={authProfile.role}
      email={authProfile.user.email ?? ""}
      quotaStatus={{
        remainingToday,
        dailyLimit: effectiveLimit,
      }}
      usageStats={{
        setCount: setCount ?? 0,
        storageMb: storageBytes / (1024 * 1024),
      }}
    />
  );
}
