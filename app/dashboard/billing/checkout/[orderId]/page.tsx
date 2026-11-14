import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildSepayQrUrl, getBankConfigFromEnv } from "@/lib/payments/sepay";
import { CheckoutClient } from "@/components/features/billing/checkout-client";
import { vi } from "@/lib/i18n/vi";
import type { PaymentOrder } from "@/lib/supabase/types";

export const metadata = {
  title: `${vi.billing.checkout.pageTitle} — ${vi.app.name}`,
};

export default async function CheckoutOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  let order: PaymentOrder | null = null;
  const { data: rpcOrder, error: rpcError } = await supabase.rpc(
    "get_my_order_status",
    {
      p_order_id: orderId,
    }
  );

  if (!rpcError && rpcOrder) {
    order = rpcOrder as unknown as PaymentOrder;
  } else {
    const { data: rowOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (rowOrder) {
      order = rowOrder as PaymentOrder;
      if (
        order.status === "pending" &&
        new Date(order.expires_at).getTime() <= Date.now()
      ) {
        order = { ...order, status: "expired" };
      }
    }
  }

  if (!order) {
    notFound();
  }

  const bankConfig = getBankConfigFromEnv();
  const qrUrl = bankConfig.isConfigured
    ? buildSepayQrUrl({
        bankAccountNumber: bankConfig.bankAccountNumber,
        bankCode: bankConfig.bankCode,
        amount: order.amount,
        paymentCode: order.payment_code,
      })
    : null;

  return (
    <div className="min-h-screen bg-amber-50/40 pb-16">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard/billing"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-100"
          >
            {vi.billing.checkout.backToBilling}
          </Link>
          <span className="font-mono text-xs font-bold text-slate-500">
            Mã đơn: {order.payment_code}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        <CheckoutClient
          initialOrder={order}
          bankConfig={bankConfig}
          qrUrl={qrUrl}
        />
      </main>
    </div>
  );
}
