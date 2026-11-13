import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, logAdminAudit } from "@/lib/admin/guard";
import type {
  Database,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
  Json,
} from "@/lib/supabase/types";

type FeedbackUpdateRow = Database["public"]["Tables"]["feedback"]["Update"];

const updateFeedbackSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "in_progress", "resolved", "ignored"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  admin_notes: z.string().optional(),
  public_response: z.string().optional(),
});

const batchUpdateFeedbackSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["new", "in_progress", "resolved", "ignored"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export async function GET(request: NextRequest) {
  // Yêu cầu quyền Admin, không phải admin sẽ nhận 404
  const { supabase } = await requireAdmin();

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const priority = searchParams.get("priority");
  const search = searchParams.get("search");

  let query = supabase
    .from("feedback")
    .select(
      "id, user_id, type, content, contact_email, context_meta, admin_notes, public_response, public_response_at, user_read_at, status, priority, created_at, updated_at",
      { count: "exact" }
    );

  if (status && status !== "all") {
    query = query.eq("status", status as FeedbackStatus);
  }
  if (type && type !== "all") {
    query = query.eq("type", type as FeedbackType);
  }
  if (priority && priority !== "all") {
    query = query.eq("priority", priority as FeedbackPriority);
  }
  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    query = query.or(`content.ilike.${term},contact_email.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false });

  const { data: feedbackList, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    feedback: feedbackList ?? [],
    total: count ?? 0,
  });
}

export async function PATCH(request: NextRequest) {
  const { user, supabase } = await requireAdmin();

  try {
    const json = await request.json();
    const parsed = updateFeedbackSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật không hợp lệ." },
        { status: 400 }
      );
    }

    const { id, status, priority, admin_notes, public_response } = parsed.data;

    // Lấy trạng thái trước khi cập nhật để ghi audit log
    const { data: beforeItem } = await supabase
      .from("feedback")
      .select("*")
      .eq("id", id)
      .single();

    const updates: FeedbackUpdateRow = {
      updated_at: new Date().toISOString(),
    };
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (public_response !== undefined) {
      updates.public_response = public_response;
      updates.public_response_at = public_response ? new Date().toISOString() : null;
      // Reset user_read_at để người dùng thấy chấm đỏ khi có phản hồi mới
      if (public_response && public_response !== beforeItem?.public_response) {
        updates.user_read_at = null;
      }
    }

    const { data: updated, error } = await supabase
      .from("feedback")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message || "Không thể cập nhật phản hồi." },
        { status: 500 }
      );
    }

    // Ghi audit log
    await logAdminAudit(supabase, user.id, {
      action: "feedback_update",
      targetType: "feedback",
      targetId: id,
      beforeState: beforeItem ? (JSON.parse(JSON.stringify(beforeItem)) as Json) : null,
      afterState: JSON.parse(JSON.stringify(updated)) as Json,
      reason: "Admin updated feedback status/response",
    });

    return NextResponse.json({ ok: true, feedback: updated });
  } catch {
    return NextResponse.json(
      { error: "Lỗi hệ thống khi cập nhật phản hồi." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, supabase } = await requireAdmin();

  try {
    const json = await request.json();
    const parsed = batchUpdateFeedbackSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật hàng loạt không hợp lệ." },
        { status: 400 }
      );
    }

    const { ids, status, priority } = parsed.data;
    const updates: FeedbackUpdateRow = {
      updated_at: new Date().toISOString(),
    };
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;

    const { error } = await supabase
      .from("feedback")
      .update(updates)
      .in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ghi audit log thao tác hàng loạt
    await logAdminAudit(supabase, user.id, {
      action: "feedback_batch_update",
      targetType: "feedback_batch",
      targetId: ids.join(","),
      afterState: updates as unknown as Json,
      reason: `Batch update ${ids.length} feedback items`,
    });

    return NextResponse.json({ ok: true, count: ids.length });
  } catch {
    return NextResponse.json(
      { error: "Lỗi hệ thống khi cập nhật hàng loạt." },
      { status: 500 }
    );
  }
}
