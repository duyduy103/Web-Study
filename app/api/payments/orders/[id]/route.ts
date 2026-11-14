import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("get_my_order_status", {
      p_order_id: id,
    });

    if (error) {
      return NextResponse.json(
        { error: vi.limits.systemErrorFailClosed },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Không tìm thấy đơn hàng." },
        { status: 404 }
      );
    }

    return NextResponse.json({ order: data });
  } catch {
    return NextResponse.json(
      { error: vi.limits.systemErrorFailClosed },
      { status: 500 }
    );
  }
}

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("cancel_my_pending_order", {
      p_order_id: id,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Không thể hủy đơn hàng này." },
        { status: 400 }
      );
    }

    return NextResponse.json({ order: data });
  } catch {
    return NextResponse.json(
      { error: vi.limits.systemErrorFailClosed },
      { status: 500 }
    );
  }
}
