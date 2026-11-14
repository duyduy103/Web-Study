import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const manageActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("manual_confirm_order"),
    order_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("attach_event_to_order"),
    event_id: z.string().uuid(),
    order_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("ignore_payment_event"),
    event_id: z.string().uuid(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("refund_order"),
    order_id: z.string().uuid(),
    revoke_premium: z.boolean().default(false),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal("update_plan_config"),
    plan_code: z.enum(["free", "premium"]),
    prices: z.record(z.string(), z.number().nonnegative()),
    period_days: z.record(z.string(), z.number().int().positive()),
    limits: z.object({
      max_sets: z.number().int().positive(),
      ai_daily: z.number().int().nonnegative(),
      max_file_mb: z.number().int().positive(),
      max_pdf_pages: z.number().int().positive(),
      storage_mb: z.number().int().positive(),
      max_print_versions: z.number().int().min(1).max(8),
      can_export_docx: z.boolean(),
    }),
    reason: z.string().min(3),
  }),
]);

async function verifyAdminCaller() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, isAdmin: false };
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  return { supabase, user, isAdmin: Boolean(isAdmin) };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, isAdmin } = await verifyAdminCaller();
    if (!isAdmin) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";

    const { data, error } = await supabase.rpc("get_admin_orders_and_events", {
      p_status: status,
      p_search: search,
      p_limit: 80,
      p_offset: 0,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Lỗi máy chủ khi tải danh sách đơn hàng." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, isAdmin } = await verifyAdminCaller();
    if (!isAdmin) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = manageActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu thao tác không hợp lệ (cần nhập đủ lý do tối thiểu 3 ký tự)." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === "update_plan_config") {
      const mergedLimits = {
        ...data.limits,
        ai_daily_limit: data.limits.ai_daily,
        max_export_versions: data.limits.max_print_versions,
        max_questions_per_set: null,
        max_sets_per_day: null,
      };

      const { data: resData, error } = await supabase.rpc(
        "admin_update_plan_config",
        {
          p_plan_code: data.plan_code,
          p_prices: data.prices,
          p_limits: mergedLimits,
          p_period_days: data.period_days,
          p_reason: data.reason,
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(resData);
    }

    const { data: resData, error } = await supabase.rpc(
      "admin_manage_payment_order",
      {
        p_action: data.action,
        p_order_id: "order_id" in data ? data.order_id : null,
        p_event_id: "event_id" in data ? data.event_id : null,
        p_reason: data.reason,
        p_revoke_premium:
          "revoke_premium" in data ? data.revoke_premium : false,
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(resData);
  } catch {
    return NextResponse.json(
      { error: "Lỗi máy chủ khi thực hiện thao tác quản trị đơn hàng." },
      { status: 500 }
    );
  }
}
