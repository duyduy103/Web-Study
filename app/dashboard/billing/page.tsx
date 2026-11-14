import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPlansCatalog, getUserEntitlements } from "@/lib/entitlements";
import { PlanBadge } from "@/components/features/dashboard/plan-badge";
import { NotificationBell } from "@/components/features/dashboard/notification-bell";
import { BillingClient } from "@/components/features/billing/billing-client";
import { vi } from "@/lib/i18n/vi";
import type { NotificationItem, OrderPeriod, PaymentOrder } from "@/lib/supabase/types";

export const metadata = {
  title: `${vi.billing.pageTitle} — ${vi.app.name}`,
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const params = await searchParams;
  const initialCycle: OrderPeriod = params.cycle === "year" ? "year" : "month";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const [entitlements, plansCatalog, ordersRes, notifRes] = await Promise.all([
    getUserEntitlements(supabase, user.id),
    getPlansCatalog(supabase),
    supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const nowMs = Date.now();
  const orders: PaymentOrder[] = ((ordersRes.data ?? []) as PaymentOrder[]).map(
    (o) => {
      if (o.status === "pending" && new Date(o.expires_at).getTime() <= nowMs) {
        return { ...o, status: "expired" };
      }
      return o;
    }
  );

  const notifications = (notifRes.data ?? []) as NotificationItem[];

  return (
    <div className="min-h-screen bg-amber-50/40 pb-16">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-100"
            >
              ← Bảng điều khiển
            </Link>
            <h1 className="text-base font-extrabold text-slate-900 sm:text-lg">
              {vi.billing.pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <PlanBadge entitlements={entitlements} showRemainingDays />
            <NotificationBell initialNotifications={notifications} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        <BillingClient
          entitlements={entitlements}
          premiumPlan={plansCatalog.premium}
          initialOrders={orders}
          initialCycle={initialCycle}
        />
      </main>
    </div>
  );
}
