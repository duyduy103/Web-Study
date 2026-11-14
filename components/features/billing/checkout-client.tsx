"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatVnd } from "@/components/features/pricing/pricing-client";
import { vi } from "@/lib/i18n/vi";
import type { BankTransferConfig } from "@/lib/payments/sepay";
import type { PaymentOrder } from "@/lib/supabase/types";

interface CheckoutClientProps {
  initialOrder: PaymentOrder;
  bankConfig: BankTransferConfig;
  qrUrl: string | null;
}

function formatRemainingDuration(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function CheckoutClient({
  initialOrder,
  bankConfig,
  qrUrl,
}: CheckoutClientProps) {
  const [order, setOrder] = React.useState<PaymentOrder>(initialOrder);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [remainingMs, setRemainingMs] = React.useState<number>(() =>
    Math.max(0, new Date(initialOrder.expires_at).getTime() - Date.now())
  );

  // Đồng hồ đếm ngược thời gian hết hạn đơn (48 giờ)
  React.useEffect(() => {
    if (order.status !== "pending") return;

    const timer = window.setInterval(() => {
      const diff = new Date(order.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setRemainingMs(0);
        setOrder((prev) =>
          prev.status === "pending" ? { ...prev, status: "expired" } : prev
        );
        window.clearInterval(timer);
      } else {
        setRemainingMs(diff);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [order.expires_at, order.status]);

  // Tự kiểm tra trạng thái đơn nhẹ nhàng mỗi 4 giây (dừng khi rời trang, ẩn tab, hết hạn hoặc đã paid)
  React.useEffect(() => {
    if (order.status !== "pending") return;

    let isCancelled = false;

    const pollStatus = async () => {
      if (
        isCancelled ||
        typeof document === "undefined" ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      try {
        const res = await fetch(`/api/payments/orders/${order.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as {
          order?: PaymentOrder;
        };
        if (!isCancelled && json.order) {
          setOrder(json.order);
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời khi polling
      }
    };

    const interval = window.setInterval(pollStatus, 4000);
    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [order.id, order.status]);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      // Fallback
    }
  };

  // Màn hình Thanh toán thành công
  if (order.status === "paid") {
    return (
      <Card className="mx-auto max-w-xl border-2 border-emerald-400 bg-white p-8 text-center shadow-lg space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✓
        </div>
        <div className="space-y-2">
          <Badge variant="success">ĐÃ XÁC NHẬN THANH TOÁN</Badge>
          <h1 className="text-2xl font-black text-slate-900">
            {vi.billing.checkout.successTitle}
          </h1>
          <p className="text-sm font-medium text-slate-600">
            {vi.billing.checkout.successSubtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Mã đơn hàng:</span>
            <span className="font-mono font-extrabold text-slate-900">
              {order.payment_code}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Gói dịch vụ:</span>
            <span className="font-bold text-slate-900">
              Premium ({order.period === "year" ? vi.plans.periodYearLabel : vi.plans.periodMonthLabel})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Số tiền đã thanh toán:</span>
            <span className="font-extrabold text-emerald-700">
              {formatVnd(order.amount)}
            </span>
          </div>
          {order.paid_at ? (
            <div className="flex justify-between">
              <span className="text-slate-500">Thời gian xác nhận:</span>
              <span className="font-semibold text-slate-700">
                {new Date(order.paid_at).toLocaleString("vi-VN")}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-extrabold text-white shadow hover:bg-teal-700"
          >
            {vi.billing.checkout.goToDashboardBtn}
          </Link>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Xem lịch sử đơn hàng
          </Link>
        </div>
      </Card>
    );
  }

  // Màn hình đơn đã hủy hoặc hoàn tiền
  if (order.status === "cancelled" || order.status === "refunded") {
    return (
      <Card className="mx-auto max-w-xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <Badge variant="default">
          {order.status === "refunded"
            ? vi.billing.statusLabels.refunded
            : vi.billing.statusLabels.cancelled}
        </Badge>
        <h1 className="text-xl font-black text-slate-900">
          {vi.billing.checkout.cancelledTitle}
        </h1>
        <p className="text-xs font-medium text-slate-600">
          {vi.billing.checkout.cancelledDesc}
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-teal-700"
          >
            {vi.billing.checkout.backToBilling}
          </Link>
        </div>
      </Card>
    );
  }

  const copyItems = [
    {
      key: "bankName",
      label: vi.billing.checkout.bankNameLabel,
      value: bankConfig.bankName || bankConfig.bankCode || "Chưa cấu hình",
      highlight: false,
    },
    {
      key: "accountNumber",
      label: vi.billing.checkout.accountNumberLabel,
      value: bankConfig.bankAccountNumber || "Chưa cấu hình",
      highlight: false,
    },
    {
      key: "accountName",
      label: vi.billing.checkout.accountNameLabel,
      value: bankConfig.bankAccountName || "Chưa cấu hình",
      highlight: false,
    },
    {
      key: "amount",
      label: vi.billing.checkout.amountLabel,
      value: String(order.amount),
      displayValue: formatVnd(order.amount),
      highlight: true,
    },
    {
      key: "paymentCode",
      label: vi.billing.checkout.transferContentLabel,
      value: order.payment_code,
      highlight: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banner trạng thái hết hạn (nếu quá 48h) */}
      {order.status === "expired" ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-1"
        >
          <p className="font-extrabold">{vi.billing.checkout.expiredTitle}</p>
          <p>{vi.billing.checkout.expiredDesc}</p>
        </div>
      ) : null}

      {!bankConfig.isConfigured ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-900"
        >
          {vi.billing.checkout.bankConfigMissingWarning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cột trái: Ảnh QR VietQR từ qr.sepay.vn */}
        <Card className="lg:col-span-5 flex flex-col items-center justify-between border-2 border-teal-500/80 bg-white p-6 text-center shadow-md space-y-4">
          <div className="space-y-1">
            <Badge variant="secondary">VietQR • Tự động 24/7</Badge>
            <h1 className="text-base font-extrabold text-slate-900">
              {vi.billing.checkout.scanQrTitle}
            </h1>
            <p className="text-xs text-slate-500">
              Gói Premium (
              {order.period === "year"
                ? vi.plans.periodYearLabel
                : vi.plans.periodMonthLabel}
              ) — <strong>{formatVnd(order.amount)}</strong>
            </p>
          </div>

          {qrUrl ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt={`Mã VietQR thanh toán đơn ${order.payment_code}`}
                className="h-64 w-64 object-contain sm:h-72 sm:w-72"
              />
            </div>
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
              Chưa có cấu hình BANK_CODE & BANK_ACCOUNT_NUMBER để tạo ảnh QR
            </div>
          )}

          {/* Trạng thái tự động kiểm tra & đồng hồ đếm ngược */}
          <div className="w-full space-y-2 rounded-2xl bg-slate-50 p-3.5 text-xs">
            {order.status === "pending" ? (
              <div className="flex items-center justify-center gap-2 font-bold text-teal-700">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-ping" />
                <span>{vi.billing.checkout.pollingStatusLabel}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px] text-slate-600">
              <span>{vi.billing.checkout.countdownLabel}</span>
              <span className="font-mono font-extrabold text-slate-900">
                {formatRemainingDuration(remainingMs)}
              </span>
            </div>
          </div>
        </Card>

        {/* Cột phải: Thông tin chuyển khoản thủ công & nút sao chép từng mục */}
        <Card className="lg:col-span-7 border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {vi.billing.checkout.manualTransferTitle}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bấm nút Sao chép ở từng mục nếu bạn nhập tay trong ứng dụng ngân
              hàng.
            </p>
          </div>

          <div className="space-y-3">
            {copyItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 ${
                  item.highlight
                    ? "border-amber-300 bg-amber-50/60"
                    : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-slate-500">
                    {item.label}
                  </span>
                  <span
                    className={`mt-0.5 block truncate font-mono text-sm font-black ${
                      item.highlight ? "text-amber-950" : "text-slate-900"
                    }`}
                  >
                    {item.displayValue ?? item.value}
                  </span>
                </div>

                <Button
                  type="button"
                  variant={copiedKey === item.key ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleCopy(item.key, item.value)}
                >
                  {copiedKey === item.key
                    ? vi.billing.checkout.copiedBtn
                    : vi.billing.checkout.copyBtn}
                </Button>
              </div>
            ))}
          </div>

          {/* Nhắc nhở quan trọng */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs space-y-1">
              <p className="font-extrabold text-amber-950">
                {vi.billing.checkout.keepContentReminder}
              </p>
              <p className="text-[11px] leading-relaxed text-amber-900">
                {vi.billing.checkout.keepContentDesc}
              </p>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs space-y-1">
              <p className="font-extrabold text-teal-950">
                {vi.billing.checkout.waitInstruction}
              </p>
              <p className="text-[11px] leading-relaxed text-teal-900">
                {vi.billing.checkout.waitInstructionDesc}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
