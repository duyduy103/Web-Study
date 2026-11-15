#!/usr/bin/env node
/**
 * Script chẩn đoán trực tiếp trên cơ sở dữ liệu thật (không in secret/key):
 * Cách dùng:
 *   npm run db:check -- <email_hoac_user_id>
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const targetInput = args[0] || "";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
  console.error(
    "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc key kết nối Supabase trong .env"
  );
  process.exit(1);
}

const activeKey = serviceRoleKey || anonKey;
const keyMode = serviceRoleKey ? "service_role" : "anon";
const supabase = createClient(supabaseUrl, activeKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function formatPgError(err) {
  if (!err) return null;
  return {
    code: err.code || "UNKNOWN",
    message: err.message || String(err),
    details: err.details || null,
    hint: err.hint || null,
  };
}

async function main() {
  console.log(
    `=== CHẨN ĐOÁN DB THẬT (mode=${keyMode}, target=${targetInput || "auto"}) ===`
  );

  // 1. Kiểm tra bảng plans (limits, prices, period_days)
  const { data: plans, error: plansErr } = await supabase
    .from("plans")
    .select("code, name, active, limits, prices, period_days")
    .order("code", { ascending: true });

  if (plansErr) {
    console.log("[1. plans] MÃ LỖI GỐC POSTGRES:", formatPgError(plansErr));
  } else {
    console.log("[1. plans] Dữ liệu:", JSON.stringify(plans, null, 2));
  }

  // 2. Thử gọi RPC debug_check_user_entitlements (từ migration 20261115000016)
  let userId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      targetInput
    )
      ? targetInput
      : null;
  let userEmail = targetInput.includes("@") ? targetInput : null;

  const { data: debugSnapshot, error: debugErr } = await supabase.rpc(
    "debug_check_user_entitlements",
    { p_email_or_id: targetInput || null }
  );

  if (debugErr) {
    console.log(
      "[2. RPC debug_check_user_entitlements] Chưa chạy migration 16 hoặc lỗi:",
      formatPgError(debugErr)
    );
  } else if (debugSnapshot && debugSnapshot.found) {
    userId = debugSnapshot.user_id;
    userEmail = debugSnapshot.email;
    console.log(
      `[2. Người dùng mục tiêu] id=${userId}, email=${userEmail}`
    );
    console.log(
      "[2a. Đơn hàng gần nhất (orders)]:",
      JSON.stringify(debugSnapshot.latest_order, null, 2)
    );
    console.log(
      "[2b. Dòng subscriptions hiệu lực]:",
      JSON.stringify(debugSnapshot.active_subscription, null, 2)
    );
    if (debugSnapshot.all_subscriptions) {
      console.log(
        "[2b-all. Toàn bộ các dòng subscriptions của người dùng]:",
        JSON.stringify(debugSnapshot.all_subscriptions, null, 2)
      );
    }
    if (debugSnapshot.profile) {
      console.log(
        "[2c-profile. Hồ sơ & custom_ai_daily_limit]:",
        JSON.stringify(debugSnapshot.profile, null, 2)
      );
    }
    console.log(
      "[2c. Thống kê sử dụng]:",
      JSON.stringify(debugSnapshot.usage, null, 2)
    );
  } else {
    console.log("[2. debug_check_user_entitlements] Kết quả:", debugSnapshot);
  }

  // Nếu dùng service_role và chưa có userId từ debug RPC
  if (!userId && serviceRoleKey && targetInput) {
    const { data: usersList, error: listErr } =
      await supabase.auth.admin.listUsers();
    if (!listErr && usersList?.users) {
      const found = usersList.users.find(
        (u) => u.email?.toLowerCase() === targetInput.toLowerCase()
      );
      if (found) {
        userId = found.id;
        userEmail = found.email;
      }
    }
  }

  // Kiểm tra trực tiếp bảng orders và subscriptions
  if (!debugSnapshot?.found) {
    const { data: recentOrders, error: ordersErr } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(3);
    if (ordersErr) {
      console.log("[2a. orders] MÃ LỖI GỐC POSTGRES:", formatPgError(ordersErr));
    } else {
      console.log(
        "[2a. Đơn gần nhất đọc trực tiếp]:",
        JSON.stringify(recentOrders?.[0] ?? null, null, 2)
      );
      if (!userId && recentOrders?.[0]?.user_id) {
        userId = recentOrders[0].user_id;
      }
    }

    const { data: activeSubs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3);
    if (subsErr) {
      console.log(
        "[2b. subscriptions] MÃ LỖI GỐC POSTGRES:",
        formatPgError(subsErr)
      );
    } else {
      console.log(
        "[2b. Dòng subscriptions hiệu lực đọc trực tiếp]:",
        JSON.stringify(activeSubs?.[0] ?? null, null, 2)
      );
    }
  }

  const probeUserId = userId || "00000000-0000-0000-0000-000000000001";

  // 3. Gọi trực tiếp RPC get_entitlements(p_user_id)
  const { data: entData, error: entErr } = await supabase.rpc(
    "get_entitlements",
    { p_user_id: probeUserId }
  );
  if (entErr) {
    console.log(
      "[3. RPC get_entitlements(p_user_id)] MÃ LỖI GỐC POSTGRES:",
      formatPgError(entErr)
    );
  } else {
    console.log(
      "[3. RPC get_entitlements(p_user_id)] KẾT QUẢ:",
      JSON.stringify(entData, null, 2)
    );
  }

  // 4. Kiểm tra giới hạn tạo bộ / nạp file (question_sets & source_files.file_size_bytes)
  const { data: setsData, error: setsErr } = await supabase
    .from("question_sets")
    .select("id")
    .eq("owner_id", probeUserId);

  const { error: filesErr } = await supabase
    .from("source_files")
    .select("file_size_bytes")
    .limit(5);

  if (setsErr || filesErr) {
    console.log("[4. Kiểm tra giới hạn tạo bộ/nạp file] MÃ LỖI GỐC POSTGRES:", {
      question_sets: formatPgError(setsErr),
      source_files: formatPgError(filesErr),
    });
  } else {
    const limits = entData?.limits || {};
    console.log("[4. Kiểm tra giới hạn tạo bộ/nạp file] OK:", {
      current_sets: debugSnapshot?.usage?.set_count ?? setsData?.length ?? 0,
      max_sets: limits.max_sets ?? null,
      max_file_mb: limits.max_file_mb ?? null,
      max_pdf_pages: limits.max_pdf_pages ?? null,
      storage_mb: limits.storage_mb ?? null,
    });
  }

  // 5. Kiểm tra hàm hạn mức AI (ai_usage & consume_ai_quota_v2)
  const { data: aiUsageData, error: aiUsageErr } = await supabase
    .from("ai_usage")
    .select("user_id, date, calls, tokens, updated_at")
    .eq("user_id", probeUserId)
    .limit(1);

  if (aiUsageErr) {
    console.log(
      "[5. Bảng ai_usage] MÃ LỖI GỐC POSTGRES:",
      formatPgError(aiUsageErr)
    );
  } else {
    console.log("[5. Bảng ai_usage & Hạn mức AI] OK:", {
      ai_daily_from_entitlements: entData?.limits?.ai_daily ?? null,
      ai_usage_rows: aiUsageData?.length ?? 0,
    });
  }
}

main().catch((err) => {
  console.error("Lỗi thực thi db:check:", err);
  process.exit(1);
});
