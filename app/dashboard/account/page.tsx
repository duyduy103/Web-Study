import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { getUserEntitlements, getVietnamDateString } from "@/lib/entitlements";
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

  // Lấy quyền lợi tài khoản (Entitlements: Free vs Premium + Custom AI Limit)
  const entitlements = await getUserEntitlements(supabase, userId);
  const effectiveLimit = entitlements.limits.ai_daily ?? entitlements.limits.ai_daily_limit;

  // Đọc lượt gọi AI hôm nay theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
  const todayStr = getVietnamDateString();
  const { data: usageRow } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", userId)
    .eq("date", todayStr)
    .maybeSingle();

  const callsToday = usageRow?.calls ?? 0;
  const remainingToday = Math.max(0, effectiveLimit - callsToday);

  // Đọc số bộ câu hỏi
  const { data: sets, count: setCount } = await supabase
    .from("question_sets")
    .select("id", { count: "exact" })
    .eq("owner_id", userId);

  const setIds = (sets ?? []).map((s) => s.id);
  let storageBytes = 0;

  if (setIds.length > 0) {
    const { data: sourceFiles } = await supabase
      .from("source_files")
      .select("file_size_bytes")
      .in("set_id", setIds);
    for (const sf of sourceFiles ?? []) {
      storageBytes += Number(sf.file_size_bytes ?? 0);
    }
  }

  return (
    <AccountClient
      initialDisplayName={authProfile.displayName}
      initialRole={authProfile.role}
      email={authProfile.user.email ?? ""}
      entitlements={entitlements}
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
