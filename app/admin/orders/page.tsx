import { requireAdmin } from "@/lib/admin/guard";
import {
  AdminOrdersWorkspace,
  type AdminOrdersInitialData,
} from "@/components/features/admin/admin-orders-workspace";
import { vi } from "@/lib/i18n/vi";

export const metadata = {
  title: `${vi.admin.orders.pageTitle} — Quản trị MemoQuiz`,
};

export default async function AdminOrdersPage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("get_admin_orders_and_events", {
    p_status: "all",
    p_search: "",
    p_limit: 80,
    p_offset: 0,
  });

  const initialData: AdminOrdersInitialData =
    !error && data && typeof data === "object"
      ? (data as unknown as AdminOrdersInitialData)
      : {
          orders: [],
          total_orders: 0,
          payment_events: [],
          needs_review_count: 0,
          plans: [],
        };

  return <AdminOrdersWorkspace initialData={initialData} />;
}

