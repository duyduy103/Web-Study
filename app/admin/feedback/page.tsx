import { requireAdmin } from "@/lib/admin/guard";
import {
  AdminFeedbackWorkspace,
  type AdminFeedbackRecord,
} from "@/components/features/admin/admin-feedback-workspace";
import type { FeedbackType, FeedbackStatus, FeedbackPriority } from "@/lib/supabase/types";

export const metadata = {
  title: "Hộp thư góp ý & Phản hồi — Quản trị MemoQuiz",
};

export default async function AdminFeedbackPage() {
  const { supabase } = await requireAdmin();

  const { data: rawList } = await supabase
    .from("feedback")
    .select(
      "id, user_id, type, content, contact_email, context_meta, admin_notes, public_response, public_response_at, user_read_at, status, priority, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  const feedbackList: AdminFeedbackRecord[] = (rawList ?? []).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    type: item.type as FeedbackType,
    content: item.content,
    contact_email: item.contact_email,
    context_meta: (item.context_meta ?? {}) as AdminFeedbackRecord["context_meta"],
    admin_notes: item.admin_notes,
    public_response: item.public_response,
    public_response_at: item.public_response_at,
    user_read_at: item.user_read_at,
    status: item.status as FeedbackStatus,
    priority: item.priority as FeedbackPriority,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));

  return <AdminFeedbackWorkspace initialFeedback={feedbackList} />;
}
