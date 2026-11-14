"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import type {
  OrderPeriod,
  OrderStatus,
  PaymentEventStatus,
  PlanCatalogItem,
} from "@/lib/supabase/types";

export interface AdminOrderRow {
  id: string;
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  plan_code: string;
  period: OrderPeriod;
  amount: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  provider_ref: string | null;
  payment_code: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string;
}

export interface AdminPaymentEventRow {
  id: string;
  provider: string;
  event_id: string;
  status: PaymentEventStatus;
  reason: string | null;
  order_id: string | null;
  order_payment_code: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AdminOrdersInitialData {
  orders: AdminOrderRow[];
  total_orders: number;
  payment_events: AdminPaymentEventRow[];
  needs_review_count: number;
  plans: PlanCatalogItem[];
}

export function AdminOrdersWorkspace({
  initialData,
}: {
  initialData: AdminOrdersInitialData;
}) {
  const [data, setData] = React.useState<AdminOrdersInitialData>(initialData);
  const [activeTab, setActiveTab] = React.useState<
    "orders" | "needs_review" | "plans"
  >(initialData.needs_review_count > 0 ? "needs_review" : "orders");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Modal thao tác
  const [modalAction, setModalAction] = React.useState<{
    type:
      | "manual_confirm_order"
      | "refund_order"
      | "attach_event_to_order"
      | "ignore_payment_event";
    order?: AdminOrderRow;
    event?: AdminPaymentEventRow;
  } | null>(null);
  const [reasonInput, setReasonInput] = React.useState("");
  const [selectedOrderIdForEvent, setSelectedOrderIdForEvent] =
    React.useState("");
  const [revokePremiumOnRefund, setRevokePremiumOnRefund] =
    React.useState(true);
  const [isSubmittingAction, setIsSubmittingAction] = React.useState(false);

  // State chỉnh sửa cấu hình gói
  const [editingPlanCode, setEditingPlanCode] = React.useState<
    "free" | "premium"
  >("premium");
  const selectedPlan = React.useMemo(
    () =>
      data.plans.find((p) => p.code === editingPlanCode) ??
      data.plans[0] ??
      null,
    [data.plans, editingPlanCode]
  );

  const [priceMonth, setPriceMonth] = React.useState<number>(39000);
  const [priceYear, setPriceYear] = React.useState<number>(299000);
  const [daysMonth, setDaysMonth] = React.useState<number>(30);
  const [daysYear, setDaysYear] = React.useState<number>(365);
  const [maxSets, setMaxSets] = React.useState<number>(100);
  const [aiDaily, setAiDaily] = React.useState<number>(50);
  const [maxFileMb, setMaxFileMb] = React.useState<number>(20);
  const [maxPdfPages, setMaxPdfPages] = React.useState<number>(60);
  const [storageMb, setStorageMb] = React.useState<number>(500);
  const [maxPrintVersions, setMaxPrintVersions] = React.useState<number>(8);
  const [canExportDocx, setCanExportDocx] = React.useState<boolean>(true);
  const [planReason, setPlanReason] = React.useState<string>("");

  React.useEffect(() => {
    if (!selectedPlan) return;
    setPriceMonth(Number(selectedPlan.prices?.month ?? 39000));
    setPriceYear(Number(selectedPlan.prices?.year ?? 299000));
    setDaysMonth(Number(selectedPlan.period_days?.month ?? 30));
    setDaysYear(Number(selectedPlan.period_days?.year ?? 365));
    setMaxSets(Number(selectedPlan.limits?.max_sets ?? 3));
    setAiDaily(
      Number(
        selectedPlan.limits?.ai_daily ??
          selectedPlan.limits?.ai_daily_limit ??
          10
      )
    );
    setMaxFileMb(Number(selectedPlan.limits?.max_file_mb ?? 10));
    setMaxPdfPages(Number(selectedPlan.limits?.max_pdf_pages ?? 30));
    setStorageMb(Number(selectedPlan.limits?.storage_mb ?? 50));
    setMaxPrintVersions(
      Number(
        selectedPlan.limits?.max_print_versions ??
          selectedPlan.limits?.max_export_versions ??
          4
      )
    );
    setCanExportDocx(Boolean(selectedPlan.limits?.can_export_docx));
  }, [selectedPlan]);

  const reloadData = React.useCallback(
    async (status = statusFilter, search = searchQuery) => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({ status, search });
        const res = await fetch(`/api/admin/orders?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          setData(json as AdminOrdersInitialData);
        } else {
          setErrorMsg(json?.error || "Không thể tải danh sách đơn hàng.");
        }
      } catch {
        setErrorMsg("Lỗi kết nối khi tải dữ liệu.");
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, statusFilter]
  );

  const handleExecuteModalAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAction) return;
    if (reasonInput.trim().length < 3) {
      setErrorMsg("Vui lòng nhập lý do / ghi chú tối thiểu 3 ký tự.");
      return;
    }

    setIsSubmittingAction(true);
    setErrorMsg(null);
    setNotice(null);

    try {
      const payload: Record<string, unknown> = {
        action: modalAction.type,
        reason: reasonInput.trim(),
      };

      if (modalAction.type === "manual_confirm_order" && modalAction.order) {
        payload.order_id = modalAction.order.id;
      } else if (modalAction.type === "refund_order" && modalAction.order) {
        payload.order_id = modalAction.order.id;
        payload.revoke_premium = revokePremiumOnRefund;
      } else if (
        modalAction.type === "attach_event_to_order" &&
        modalAction.event
      ) {
        payload.event_id = modalAction.event.id;
        payload.order_id = selectedOrderIdForEvent;
      } else if (
        modalAction.type === "ignore_payment_event" &&
        modalAction.event
      ) {
        payload.event_id = modalAction.event.id;
      }

      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json.error || "Thao tác thất bại.");
        return;
      }

      setNotice("Đã thực hiện thao tác và ghi nhật ký quản trị thành công.");
      setModalAction(null);
      setReasonInput("");
      await reloadData();
    } catch {
      setErrorMsg("Lỗi kết nối khi gửi thao tác.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSavePlanConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (planReason.trim().length < 3) {
      setErrorMsg("Vui lòng nhập lý do thay đổi cấu hình gói.");
      return;
    }

    setIsSubmittingAction(true);
    setErrorMsg(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_plan_config",
          plan_code: editingPlanCode,
          prices:
            editingPlanCode === "premium"
              ? { month: priceMonth, year: priceYear }
              : {},
          period_days:
            editingPlanCode === "premium"
              ? { month: daysMonth, year: daysYear }
              : {},
          limits: {
            max_sets: maxSets,
            ai_daily: aiDaily,
            max_file_mb: maxFileMb,
            max_pdf_pages: maxPdfPages,
            storage_mb: storageMb,
            max_print_versions: maxPrintVersions,
            can_export_docx: canExportDocx,
          },
          reason: planReason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json.error || "Không thể lưu cấu hình gói.");
        return;
      }
      setNotice(`Đã cập nhật cấu hình gói ${editingPlanCode.toUpperCase()} thành công.`);
      setPlanReason("");
      await reloadData();
    } catch {
      setErrorMsg("Lỗi kết nối khi lưu cấu hình gói.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">
            {vi.admin.orders.pageTitle}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {vi.admin.orders.pageSubtitle}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "orders"
                ? "bg-teal-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {vi.admin.orders.tabOrders} ({data.total_orders})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("needs_review")}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "needs_review"
                ? "bg-amber-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <span>{vi.admin.orders.tabNeedsReview}</span>
            {data.needs_review_count > 0 ? (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                {data.needs_review_count}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("plans")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "plans"
                ? "bg-teal-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {vi.admin.orders.tabPlanConfig}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-xs font-bold text-emerald-300">
          {notice}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-2xl border border-rose-700 bg-rose-950/60 px-4 py-3 text-xs font-bold text-rose-300">
          {errorMsg}
        </div>
      ) : null}

      {/* TAB 1: DANH SÁCH ĐƠN HÀNG */}
      {activeTab === "orders" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={vi.admin.orders.searchPlaceholder}
              className="flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder:text-slate-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                void reloadData(e.target.value, searchQuery);
              }}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
            >
              <option value="all">{vi.admin.orders.filterStatusAll}</option>
              <option value="pending">pending (Chờ thanh toán)</option>
              <option value="paid">paid (Đã thanh toán)</option>
              <option value="expired">expired (Quá 48h)</option>
              <option value="cancelled">cancelled (Đã hủy)</option>
              <option value="refunded">refunded (Đã hoàn tiền)</option>
            </select>
            <button
              type="button"
              onClick={() => void reloadData(statusFilter, searchQuery)}
              disabled={isLoading}
              className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50"
            >
              {isLoading ? "Đang tải..." : "Lọc / Tìm kiếm"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-4">Người dùng</th>
                  <th className="py-3 px-4">Gói / Chu kỳ</th>
                  <th className="py-3 px-4">Số tiền</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Tạo / Thanh toán</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {data.orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-slate-500"
                    >
                      Không có đơn hàng nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  data.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-mono font-black text-teal-300">
                        {order.payment_code}
                        {order.provider_ref ? (
                          <span className="block text-[10px] font-normal text-slate-500">
                            Ref: {order.provider_ref}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">
                          {order.user_display_name || "Người dùng"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {order.user_email}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {order.plan_code.toUpperCase()} •{" "}
                        {order.period === "year" ? "Năm" : "Tháng"}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {order.amount.toLocaleString("vi-VN")}đ
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            order.status === "paid"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                              : order.status === "pending"
                              ? "bg-amber-950 text-amber-300 border border-amber-700"
                              : order.status === "refunded"
                              ? "bg-rose-950 text-rose-300 border border-rose-700"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-400">
                        <div>
                          Tạo:{" "}
                          {new Date(order.created_at).toLocaleString("vi-VN")}
                        </div>
                        {order.paid_at ? (
                          <div className="text-emerald-400">
                            Trả:{" "}
                            {new Date(order.paid_at).toLocaleString("vi-VN")}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {order.status === "pending" ||
                        order.status === "expired" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalAction({
                                type: "manual_confirm_order",
                                order,
                              });
                              setReasonInput("");
                            }}
                            className="rounded-lg bg-teal-500/20 border border-teal-500/40 px-2.5 py-1 text-[11px] font-bold text-teal-300 hover:bg-teal-500/30"
                          >
                            {vi.admin.orders.manualConfirmBtn}
                          </button>
                        ) : null}
                        {order.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalAction({
                                type: "refund_order",
                                order,
                              });
                              setRevokePremiumOnRefund(true);
                              setReasonInput("");
                            }}
                            className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30"
                          >
                            {vi.admin.orders.refundOrderBtn}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* TAB 2: GIAO DỊCH CẦN XEM (payment_events) */}
      {activeTab === "needs_review" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">Trạng thái & Lý do</th>
                <th className="py-3 px-4">Nội dung & Số tiền</th>
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4 text-right">Thao tác xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {data.payment_events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Chưa có sự kiện thanh toán nào.
                  </td>
                </tr>
              ) : (
                data.payment_events.map((ev) => {
                  const amount = Number(ev.payload?.transferAmount ?? 0);
                  const content = String(
                    ev.payload?.content ?? ev.payload?.description ?? ""
                  );
                  return (
                    <tr key={ev.id} className="hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        #{ev.event_id}
                        <span className="block text-[10px] text-slate-500">
                          {ev.provider}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            ev.status === "needs_review"
                              ? "bg-amber-950 text-amber-300 border border-amber-700"
                              : ev.status === "processed"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {ev.status}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-300">
                          {ev.reason}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-amber-300">
                          {amount.toLocaleString("vi-VN")}đ
                        </div>
                        <div className="font-mono text-[11px] text-slate-300 break-all">
                          {content || "(Trống)"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-400">
                        {new Date(ev.created_at).toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {ev.status === "needs_review" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setModalAction({
                                  type: "attach_event_to_order",
                                  event: ev,
                                });
                                setSelectedOrderIdForEvent(ev.order_id ?? "");
                                setReasonInput("");
                              }}
                              className="rounded-lg bg-teal-500/20 border border-teal-500/40 px-2.5 py-1 text-[11px] font-bold text-teal-300 hover:bg-teal-500/30"
                            >
                              {vi.admin.orders.attachOrderBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setModalAction({
                                  type: "ignore_payment_event",
                                  event: ev,
                                });
                                setReasonInput("");
                              }}
                              className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700"
                            >
                              {vi.admin.orders.ignoreEventBtn}
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* TAB 3: CẤU HÌNH GIÁ & HẠN MỨC GÓI */}
      {activeTab === "plans" ? (
        <form
          onSubmit={handleSavePlanConfig}
          className="rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white">
                Chỉnh sửa bảng plans (Giá & Hạn mức)
              </h2>
              <p className="text-xs text-amber-400 mt-0.5">
                {vi.admin.orders.priceChangeNote}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingPlanCode("free")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                  editingPlanCode === "free"
                    ? "bg-teal-500 text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Gói Free
              </button>
              <button
                type="button"
                onClick={() => setEditingPlanCode("premium")}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold ${
                  editingPlanCode === "premium"
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Gói Premium
              </button>
            </div>
          </div>

          {editingPlanCode === "premium" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400">
                  Giá Tháng (VND)
                </label>
                <input
                  type="number"
                  value={priceMonth}
                  onChange={(e) => setPriceMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400">
                  Giá Năm (VND)
                </label>
                <input
                  type="number"
                  value={priceYear}
                  onChange={(e) => setPriceYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400">
                  Số ngày chu kỳ Tháng
                </label>
                <input
                  type="number"
                  value={daysMonth}
                  onChange={(e) => setDaysMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400">
                  Số ngày chu kỳ Năm
                </label>
                <input
                  type="number"
                  value={daysYear}
                  onChange={(e) => setDaysYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                max_sets (Số bộ lưu tối đa)
              </label>
              <input
                type="number"
                value={maxSets}
                onChange={(e) => setMaxSets(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                ai_daily (Lượt AI / ngày)
              </label>
              <input
                type="number"
                value={aiDaily}
                onChange={(e) => setAiDaily(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                max_file_mb (MB / file)
              </label>
              <input
                type="number"
                value={maxFileMb}
                onChange={(e) => setMaxFileMb(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                max_pdf_pages (Số trang PDF)
              </label>
              <input
                type="number"
                value={maxPdfPages}
                onChange={(e) => setMaxPdfPages(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                storage_mb (Tổng MB lưu trữ)
              </label>
              <input
                type="number"
                value={storageMb}
                onChange={(e) => setStorageMb(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400">
                max_print_versions (Số mã đề 1..8)
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={maxPrintVersions}
                onChange={(e) => setMaxPrintVersions(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <input
              type="checkbox"
              checked={canExportDocx}
              onChange={(e) => setCanExportDocx(e.target.checked)}
            />
            <span>Cho phép tải đề thi định dạng Word (.docx) (can_export_docx)</span>
          </label>

          <div>
            <label className="block text-[11px] font-bold text-slate-400">
              {vi.admin.orders.reasonPrompt}
            </label>
            <input
              type="text"
              required
              value={planReason}
              onChange={(e) => setPlanReason(e.target.value)}
              placeholder="Ví dụ: Cập nhật chương trình ưu đãi học kỳ mới..."
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingAction}
            className="rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50"
          >
            {isSubmittingAction
              ? "Đang lưu..."
              : vi.admin.orders.savePlanConfigBtn}
          </button>
        </form>
      ) : null}

      {/* MODAL XÁC NHẬN THAO TÁC QUẢN TRỊ */}
      {modalAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleExecuteModalAction}
            className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-black text-white">
              {modalAction.type === "manual_confirm_order"
                ? `Xác nhận thủ công đơn ${modalAction.order?.payment_code}`
                : modalAction.type === "refund_order"
                ? `Đánh dấu hoàn tiền đơn ${modalAction.order?.payment_code}`
                : modalAction.type === "attach_event_to_order"
                ? `Gắn giao dịch #${modalAction.event?.event_id} vào đơn hàng`
                : `Bỏ qua giao dịch #${modalAction.event?.event_id}`}
            </h3>

            {modalAction.type === "attach_event_to_order" ? (
              <div>
                <label className="block text-xs font-bold text-slate-300">
                  Chọn đơn hàng cần kích hoạt:
                </label>
                <select
                  required
                  value={selectedOrderIdForEvent}
                  onChange={(e) => setSelectedOrderIdForEvent(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="">-- Chọn đơn hàng --</option>
                  {data.orders
                    .filter(
                      (o) => o.status === "pending" || o.status === "expired"
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.payment_code} — {o.user_email} (
                        {o.amount.toLocaleString("vi-VN")}đ • {o.status})
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            {modalAction.type === "refund_order" ? (
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={revokePremiumOnRefund}
                  onChange={(e) => setRevokePremiumOnRefund(e.target.checked)}
                />
                <span>{vi.admin.orders.revokePremiumCheckbox}</span>
              </label>
            ) : null}

            <div>
              <label className="block text-xs font-bold text-slate-300">
                {vi.admin.orders.reasonPrompt}
              </label>
              <textarea
                required
                rows={3}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Nhập mã tham chiếu ngân hàng hoặc lý do xử lý..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction}
                className="rounded-xl bg-teal-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50"
              >
                {isSubmittingAction ? "Đang xử lý..." : "Xác nhận thực hiện"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

