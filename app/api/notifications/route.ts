import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";

const markReadSchema = z.object({
  id: z.string().uuid().optional(),
  markAll: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const { data: items, error } = await supabase
      .from("notifications")
      .select(
        "id, user_id, type, title, body, metadata, dedupe_key, read_at, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json({
        notifications: [],
        unreadCount: 0,
      });
    }

    const list = items ?? [];
    const unreadCount = list.filter((n) => !n.read_at).length;

    return NextResponse.json({
      notifications: list,
      unreadCount,
    });
  } catch {
    return NextResponse.json({
      notifications: [],
      unreadCount: 0,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const raw = await request.json();
    const parsed = markReadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu đánh dấu đã đọc không hợp lệ." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { id, markAll } = parsed.data;

    if (markAll) {
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("user_id", user.id)
        .is("read_at", null);
    } else if (id) {
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("id", id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Không thể cập nhật trạng thái thông báo." },
      { status: 500 }
    );
  }
}

