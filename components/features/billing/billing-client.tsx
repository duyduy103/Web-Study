"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_PREMIUM_PERIOD_DAYS,
  DEFAULT_PREMIUM_PRICES,
  getRemainingSubscriptionDays,
} from "@/lib/entitlements";
import {
  calculateYearlySavings,
  formatVnd,
} from "@/components/features/pricing/pricing-client";
import { vi } from "@/lib/i18n/vi";
import type {
  OrderPeriod,
  OrderStatus,
  PaymentOrder,
  PlanCatalogItem,
  UserEntitlements,
} from "@/lib/supabase/types";

interface BillingClientProps {
  entitlements: UserEntitlements;
  premiumPlan: PlanCatalogItem;
  initialOrders: PaymentOrder[];
  initialCycle?: OrderPeriod;
}

function getStatusBadgeVariant(status: OrderStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "paid":
      return {
        label: vi.billing.statusLabels.paid,
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "pending":
      return {
        label: vi.billing.statusLabels.pending,
        className: "border-amber-300 bg-amber-50 text-amber-900",
      };
    case "expired":
      return {
        label: vi.billing.statusLabels.expired,
        className: "border-slate-200 bg-slate-100 text-slate-600",
      };
    case "cancelled":
      return {
        label: vi.billing.statusLabels.cancelled,
        className: "border-slate-200 bg-slate-100 text-slate-500",
      };
    case "refunded":
      return {
        label: vi.billing.statusLabels.refunded,
        className: "border-rose-200 bg-rose-50 text-rose-800",
      };
  }
}

export function BillingClient({
  entitlements,
  premiumPlan,
  initialOrders,
  initialCycle = "month",
}: BillingClientProps) {
  const router = useRouter();
  const [orders, setOrders] = React.useState<PaymentOrder[]>(initialOrders);
  const [selectedCycle, setSelectedCycle] =
    React.useState<OrderPeriod>(initialCycle);
  const [creatingPeriod, setCreatingPeriod] =
    React.useState<OrderPeriod | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = React.useState<
    string | null
  >(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isPremium = entitlements.is_premium;
  const remainingDays = isPremium
    ? getRemainingSubscriptionDays(entitlements.period_end)
    : null;

  const prices = premiumPlan.prices ?? DEFAULT_PREMIUM_PRICES;
  const periodDays = premiumPlan.period_days ?? DEFAULT_PREMIUM_PERIOD_DAYS;
  const monthPrice = Number(prices.month ?? DEFAULT_PREMIUM_PRICES.month ?? 39000);
  const yearPrice = Number(prices.year ?? DEFAULT_PREMIUM_PRICES.year ?? 299000);
  const monthDays = Number(periodDays.month ?? 30);
  const yearDays = Number(periodDays.year ?? 365);
  const { savedAmount, savedPercent } = calculateYearlySavings(
    monthPrice,
    yearPrice
  );

  const pendingOrders = orders.filter(
    (o) =>
      o.status === "pending" && new Date(o.expires_at).getTime() > Date.now()
  );

  const handleCreateOrReuseOrder = async (period: OrderPeriod) => {
    setErrorMsg(null);
    setCreatingPeriod(period);
    try {
      const res = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: "premium", period }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        order?: PaymentOrder;
        error?: string;
      };
      if (!res.ok || !json.order) {
        setErrorMsg(json.error || "Không thể khởi tạo đơn hàng.");
        return;
      }
      router.push(`/dashboard/billing/checkout/${json.order.id}`);
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi tạo đơn hàng.");
    } finally {
      setCreatingPeriod(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    setErrorMsg(null);
    setCancellingOrderId(orderId);
    try {
      const res = await fetch(`/api/payments/orders/${orderId}`, {
        method: "PATCH",
      });
      const json = (await res.json().catch(() => ({}))) as {
        order?: PaymentOrder;
        error?: string;
      };
      if (!res.ok || !json.order) {
        setErrorMsg(json.error || "Không thể hủy đơn hàng.");
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? json.order! : o))
      );
    } catch {
      setErrorMsg("Lỗi kết nối khi hủy đơn hàng.");
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {/* 1. Thẻ gói hiện tại */}
      <Card
        className={`p-6 ${
          isPremium
            ? "border-amber-300 bg-gradient-to-r from-amber-50/70 via-white to-orange-50/40"
            : "border-teal-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {vi.billing.currentPlanSection}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-900">
                Gói {entitlements.plan_name}
              </h2>
              <Badge variant={isPremium ? "warning" : "secondary"}>
                {isPremium ? "PRO" : "FREE"}
              </Badge>
              {isPremium && remainingDays !== null ? (
                <span className="rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900">
                  {vi.plans.daysRemainingPrefix} {remainingDays}{" "}
                  {vi.plans.daysRemainingSuffix}
                </span>
              ) : null}
            </div>
            <p className="text-xs font-medium text-slate-600">
              {isPremium
                ? entitlements.period_end
                  ? `Hiệu lực đến: ${new Date(
                      entitlements.period_end
                    ).toLocaleDateString("vi-VN")}. ${
                      vi.billing.consecutivelyExtendNote
                    }`
                  : "Gói Premium không thời hạn (Vĩnh viễn)."
                : `Lưu tối đa ${entitlements.limits.max_sets} bộ câu hỏi • ${entitlements.limits.ai_daily} lượt AI/ngày • ${entitlements.limits.storage_mb} MB lưu trữ.`}
            </p>
          </div>

          <Link
            href="/pricing"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
          >
            Xem bảng so sánh quyền lợi →
          </Link>
        </div>
      </Card>

      {/* 2. Đơn đang chờ thanh toán (nếu có) */}
      {pendingOrders.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-amber-950">
              ⏳ {vi.billing.pendingOrdersSection} ({pendingOrders.length})
            </h2>
            <span className="text-[11px] font-semibold text-amber-800">
              Đơn tự giữ trong 48 giờ khi tải lại trang
            </span>
          </div>

          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-slate-900">
                      {order.payment_code}
                    </span>
                    <Badge variant="warning">
                      {order.period === "year"
                        ? vi.plans.periodYearLabel
                        : vi.plans.periodMonthLabel}
                    </Badge>
                    <span className="text-sm font-black text-amber-700">
                      {formatVnd(order.amount)}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    Tạo lúc{" "}
                    {new Date(order.created_at).toLocaleString("vi-VN")} • Hết
                    hạn lúc{" "}
                    {new Date(order.expires_at).toLocaleString("vi-VN")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/billing/checkout/${order.id}`}
                    className="inline-flex items-center rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-2xs hover:bg-amber-700"
                  >
                    {vi.billing.viewQrBtn} →
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={cancellingOrderId === order.id}
                    onClick={() => handleCancelOrder(order.id)}
                  >
                    {cancellingOrderId === order.id
                      ? vi.billing.cancellingOrderBtn
                      : vi.billing.cancelOrderBtn}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* 3. Chọn chu kỳ Nâng cấp / Gia hạn (Tháng / Năm) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-slate-900">
            {vi.billing.chooseCycleSection}
          </h2>
          <span className="text-xs font-medium text-slate-500">
            {vi.plans.vatNote}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Gói Tháng */}
          <Card
            onClick={() => setSelectedCycle("month")}
            className={`cursor-pointer p-6 transition-all ${
              selectedCycle === "month"
                ? "border-2 border-teal-600 bg-white ring-2 ring-teal-500/15"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {vi.plans.periodMonthLabel} ({monthDays} ngày)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Linh hoạt từng tháng cho đợt ôn thi hoặc kiểm tra định kỳ.
                </p>
              </div>
              <Badge variant="secondary">{monthDays} ngày</Badge>
            </div>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">
                {formatVnd(monthPrice)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {vi.plans.perMonthSuffix}
              </span>
            </div>

            <div className="mt-5">
              <Button
                type="button"
                className="w-full"
                isLoading={creatingPeriod === "month"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateOrReuseOrder("month");
                }}
              >
                {isPremium ? vi.plans.renewButton : vi.plans.upgradeButton} —{" "}
                {vi.billing.createOrderMonthBtn} ({formatVnd(monthPrice)})
              </Button>
            </div>
          </Card>

          {/* Gói Năm */}
          <Card
            onClick={() => setSelectedCycle("year")}
            className={`cursor-pointer p-6 transition-all ${
              selectedCycle === "year"
                ? "border-2 border-amber-500 bg-gradient-to-b from-amber-50/40 to-white ring-2 ring-amber-400/20"
                : "border-amber-200 bg-white hover:border-amber-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {vi.plans.periodYearLabel} ({yearDays} ngày)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Trọn năm học không lo gián đoạn, tiết kiệm chi phí tối đa.
                </p>
              </div>
              {savedPercent > 0 ? (
                <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white">
                  {vi.plans.yearlySavingsBadgePrefix} {savedPercent}%
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">
                {formatVnd(yearPrice)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {vi.plans.perYearSuffix}
              </span>
              {savedAmount > 0 ? (
                <span className="ml-1 text-xs font-bold text-amber-800">
                  (Tiết kiệm {formatVnd(savedAmount)})
                </span>
              ) : null}
            </div>

            <div className="mt-5">
              <Button
                type="button"
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700"
                isLoading={creatingPeriod === "year"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateOrReuseOrder("year");
                }}
              >
                {isPremium ? vi.plans.renewButton : vi.plans.upgradeButton} —{" "}
                {vi.billing.createOrderYearBtn} ({formatVnd(yearPrice)})
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* 4. Lịch sử đơn hàng */}
      <Card className="border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">
          {vi.billing.orderHistorySection}
        </h2>

        {orders.length === 0 ? (
          <p className="py-6 text-center text-xs font-medium text-slate-500">
            {vi.billing.noOrdersYet}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-bold">Mã thanh toán</th>
                  <th className="py-2.5 px-3 font-bold">Gói / Chu kỳ</th>
                  <th className="py-2.5 px-3 font-bold">Số tiền</th>
                  <th className="py-2.5 px-3 font-bold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-bold">Ngày tạo</th>
                  <th className="py-2.5 px-3 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {orders.map((order) => {
                  const statusMeta = getStatusBadgeVariant(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3 font-mono font-extrabold text-slate-900">
                        {order.payment_code}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        Premium •{" "}
                        {order.period === "year"
                          ? vi.plans.periodYearLabel
                          : vi.plans.periodMonthLabel}
                      </td>
                      <td className="py-3 px-3 font-extrabold text-slate-900">
                        {formatVnd(order.amount)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(order.created_at).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          href={`/dashboard/billing/checkout/${order.id}`}
                          className="font-bold text-teal-700 hover:underline"
                        >
                          {order.status === "pending"
                            ? vi.billing.viewQrBtn
                            : "Chi tiết →"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
