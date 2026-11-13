import { requireAdmin } from "@/lib/admin/guard";
import {
  AdminAuditWorkspace,
  type AuditRecord,
} from "@/components/features/admin/admin-audit-workspace";

export const metadata = {
  title: "Nhật ký thao tác quản trị — Quản trị MemoQuiz",
};

export default async function AdminAuditPage() {
  const { supabase } = await requireAdmin();

  const { data: rawLogs } = await supabase
    .from("admin_audit_log")
    .select(
      "id, admin_id, action, target_type, target_id, before_state, after_state, reason, ip_address, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const logs: AuditRecord[] = (rawLogs ?? []).map((l) => ({
    id: l.id,
    admin_id: l.admin_id,
    action: l.action,
    target_type: l.target_type,
    target_id: l.target_id,
    before_state: l.before_state,
    after_state: l.after_state,
    reason: l.reason,
    ip_address: l.ip_address,
    created_at: l.created_at,
  }));

  return <AdminAuditWorkspace initialLogs={logs} />;
}
