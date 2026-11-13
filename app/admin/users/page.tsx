import { requireAdmin } from "@/lib/admin/guard";
import {
  AdminUsersWorkspace,
  type AdminUserItem,
} from "@/components/features/admin/admin-users-workspace";

export const metadata = {
  title: "Quản lý người dùng — Quản trị MemoQuiz",
};

export default async function AdminUsersPage() {
  const { user, supabase } = await requireAdmin();

  const { data: rawData } = await supabase.rpc("get_admin_users_list", {
    p_limit: 50,
    p_offset: 0,
  });

  const parsedData = rawData as { users?: AdminUserItem[]; total?: number } | null;

  return (
    <AdminUsersWorkspace
      initialUsers={parsedData?.users ?? []}
      initialTotal={parsedData?.total ?? 0}
      currentAdminId={user.id}
    />
  );
}

