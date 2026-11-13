import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/guard";

const manageUserSchema = z.object({
  target_user_id: z.string().uuid(),
  action: z.enum([
    "block",
    "unblock",
    "reset_ai_quota",
    "set_custom_ai_limit",
    "delete_user",
  ]),
  reason: z.string().trim().optional(),
  custom_limit: z.number().int().min(0).max(10000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { supabase } = await requireAdmin();

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const role = searchParams.get("role") || "all";
  const status = searchParams.get("status") || "all";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const { data, error } = await supabase.rpc("get_admin_users_list", {
    p_search: search,
    p_role: role,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { user, supabase } = await requireAdmin();

  try {
    const json = await request.json();
    const parsed = manageUserSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu thao tác không hợp lệ." },
        { status: 400 }
      );
    }

    const { target_user_id, action, reason, custom_limit } = parsed.data;

    // Chặn admin tự khóa hoặc xóa chính mình
    if (target_user_id === user.id && (action === "block" || action === "delete_user")) {
      return NextResponse.json(
        { error: "Bạn không thể tự khóa hoặc xóa tài khoản của chính mình." },
        { status: 400 }
      );
    }

    if ((action === "block" || action === "delete_user") && (!reason || reason.trim().length === 0)) {
      return NextResponse.json(
        { error: "Bắt buộc phải nhập lý do khi khóa hoặc xóa tài khoản." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("admin_manage_user", {
      p_target_user_id: target_user_id,
      p_action: action,
      p_reason: reason || "",
      p_custom_limit: custom_limit ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Lỗi hệ thống khi xử lý thao tác người dùng." },
      { status: 500 }
    );
  }
}
