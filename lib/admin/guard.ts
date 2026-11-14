import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export interface AdminUserContext {
  user: {
    id: string;
    email?: string;
  };
  supabase: SupabaseClient<Database>;
}

export interface AdminAuditParams {
  action: string;
  targetType: string;
  targetId: string;
  beforeState?: Json | null;
  afterState?: Json | null;
  reason?: string | null;
  ipAddress?: string | null;
}

/**
 * Kiểm tra quyền Admin ở phía Server.
 * Nếu không có phiên hoặc không thuộc danh sách admins, lập tức trả về 404 (notFound()).
 * Nguyên tắc an toàn: Người ngoài không thể biết route /admin có tồn tại hay không.
 */
export async function requireAdmin(): Promise<AdminUserContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    notFound();
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin", {
    p_user_id: user.id,
  });

  if (error || !isAdmin) {
    notFound();
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    supabase,
  };
}

/**
 * Ghi nhật ký hành động của Admin vào bảng admin_audit_log.
 */
export async function logAdminAudit(
  supabase: SupabaseClient<Database>,
  adminId: string,
  params: AdminAuditParams
): Promise<void> {
  await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    before_state: params.beforeState ?? null,
    after_state: params.afterState ?? null,
    reason: params.reason ?? null,
    ip_address: params.ipAddress ?? null,
  });
}

