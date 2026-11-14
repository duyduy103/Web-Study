import Link from "next/link";
import type { UserEntitlements } from "@/lib/supabase/types";
import { getRemainingSubscriptionDays } from "@/lib/entitlements";
import { ProgressBar } from "@/components/ui/progress-bar";
import { vi } from "@/lib/i18n/vi";

interface DashboardUsageBarProps {
  entitlements: UserEntitlements;
  aiRemainingToday: number;
  aiDailyLimit: number;
  setCount: number;
  storageBytes: number;
}

export function DashboardUsageBar({
  entitlements,
  aiRemainingToday,
  aiDailyLimit,
  setCount,
  storageBytes,
}: DashboardUsageBarProps) {
  const { limits, is_premium } = entitlements;
  const aiUsedToday = Math.max(0, aiDailyLimit - aiRemainingToday);
  const aiRatio = aiDailyLimit > 0 ? aiUsedToday / aiDailyLimit : 1;

  const setsRatio = limits.max_sets > 0 ? setCount / limits.max_sets : 0;

  const storageMbUsed = storageBytes / (1024 * 1024);
  const storageRatio =
    limits.storage_mb > 0 ? storageMbUsed / limits.storage_mb : 0;

  const maxRatio = Math.max(aiRatio, setsRatio, storageRatio);
  const isAt100 =
    aiRatio >= 1 || setsRatio >= 1 || storageRatio >= 1;
  const isAt80 = !isAt100 && maxRatio >= 0.8;

  const remainingDays = is_premium
    ? getRemainingSubscriptionDays(entitlements.period_end)
    : null;
  const isExpiringSoon =
    is_premium && remainingDays !== null && remainingDays <= 7;

  return (
    <section
      aria-label="Thanh mức sử dụng theo gói"
      className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5"
    >
      {/* Dải nhắc nhẹ khi gói Premium sắp hết hạn (<= 7 ngày) */}
      {isExpiringSoon ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950"
        >
          <div>
            <strong className="font-extrabold">
              ⏳ {vi.plans.expiringBanner.titlePrefix} {remainingDays}{" "}
              {vi.plans.expiringBanner.titleSuffix}.
            </strong>{" "}
            <span>{vi.plans.expiringBanner.description}</span>
          </div>
          <Link
            href="/pricing"
            className="inline-flex min-h-[34px] items-center justify-center rounded-xl bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700"
          >
            {vi.plans.renewButton}
          </Link>
        </div>
      ) : null}

      {/* Cảnh báo vàng (>= 80%) hoặc đỏ (100% + nút Nâng cấp Premium) */}
      {isAt100 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-900"
        >
          <div className="space-y-0.5">
            <p className="font-extrabold">
              🚨 {vi.plans.usageBar.limit100Notice}
            </p>
            <p className="text-red-800">
              {setsRatio >= 1
                ? `${is_premium ? "Gói Premium" : "Gói miễn phí"} được lưu tối đa ${limits.max_sets} bộ câu hỏi. Bạn đã dùng ${setCount}/${limits.max_sets}.`
                : aiRatio >= 1
                ? `Bạn đã dùng hết ${aiUsedToday}/${aiDailyLimit} lượt AI hôm nay (làm mới lúc 0:00 giờ Việt Nam).`
                : `Dung lượng lưu trữ đã đạt ${storageMbUsed.toFixed(1)}/${limits.storage_mb} MB.`}
            </p>
          </div>
          {!is_premium ? (
            <Link
              href="/pricing"
              className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-2xs hover:bg-red-700"
            >
              ★ {vi.plans.upgradePremiumButton}
            </Link>
          ) : null}
        </div>
      ) : isAt80 ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-950"
        >
          <span>⚠️ {vi.plans.usageBar.warning80Notice}</span>
          {!is_premium ? (
            <Link
              href="/pricing"
              className="inline-flex min-h-[34px] items-center justify-center rounded-xl border border-amber-400 bg-white px-3 py-1 font-bold text-amber-900 hover:bg-amber-100"
            >
              {vi.plans.upgradePremiumButton}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* 3 chỉ số mức sử dụng luôn hiển thị */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 1. Lượt AI hôm nay */}
        <div
          className={`rounded-2xl border p-3.5 space-y-1.5 ${
            aiRatio >= 1
              ? "border-red-200 bg-red-50/40"
              : aiRatio >= 0.8
              ? "border-amber-200 bg-amber-50/40"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-700">
              {vi.plans.usageBar.aiRemainingPrefix}{" "}
              <strong className="text-slate-900">
                {aiRemainingToday}/{aiDailyLimit}
              </strong>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                aiRatio >= 1
                  ? "bg-red-100 text-red-800"
                  : aiRatio >= 0.8
                  ? "bg-amber-100 text-amber-900"
                  : "bg-teal-100 text-teal-900"
              }`}
            >
              Đã dùng {aiUsedToday}/{aiDailyLimit}
            </span>
          </div>
          <ProgressBar
            value={aiUsedToday}
            max={Math.max(1, aiDailyLimit)}
            variant={
              aiRatio >= 1 ? "danger" : aiRatio >= 0.8 ? "amber" : "default"
            }
            size="sm"
          />
          <p className="text-[11px] text-slate-500">
            {vi.plans.usageBar.aiResetNote}
          </p>
        </div>

        {/* 2. Bộ câu hỏi x/N */}
        <div
          className={`rounded-2xl border p-3.5 space-y-1.5 ${
            setsRatio >= 1
              ? "border-red-200 bg-red-50/40"
              : setsRatio >= 0.8
              ? "border-amber-200 bg-amber-50/40"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-700">
              {vi.plans.usageBar.questionSetsPrefix}{" "}
              <strong className="text-slate-900">
                {setCount}/{limits.max_sets}
              </strong>
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Tối đa {limits.max_sets} bộ
            </span>
          </div>
          <ProgressBar
            value={Math.min(setCount, limits.max_sets)}
            max={Math.max(1, limits.max_sets)}
            variant={
              setsRatio >= 1
                ? "danger"
                : setsRatio >= 0.8
                ? "amber"
                : "default"
            }
            size="sm"
          />
          <p className="text-[11px] text-slate-500">
            {setCount > limits.max_sets
              ? vi.plans.usageBar.overMaxSetsKeptNotice
              : `Còn tạo thêm được ${Math.max(0, limits.max_sets - setCount)} bộ mới`}
          </p>
        </div>

        {/* 3. Dung lượng lưu trữ */}
        <div
          className={`rounded-2xl border p-3.5 space-y-1.5 ${
            storageRatio >= 1
              ? "border-red-200 bg-red-50/40"
              : storageRatio >= 0.8
              ? "border-amber-200 bg-amber-50/40"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-700">
              {vi.plans.usageBar.storagePrefix}{" "}
              <strong className="text-slate-900">
                {storageMbUsed.toFixed(1)}/{limits.storage_mb} MB
              </strong>
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              ≤ {limits.max_file_mb} MB/tệp
            </span>
          </div>
          <ProgressBar
            value={Math.min(storageMbUsed, limits.storage_mb)}
            max={Math.max(1, limits.storage_mb)}
            variant={
              storageRatio >= 1
                ? "danger"
                : storageRatio >= 0.8
                ? "amber"
                : "default"
            }
            size="sm"
          />
          <p className="text-[11px] text-slate-500">
            PDF tối đa {limits.max_pdf_pages} trang • In tối đa{" "}
            {limits.max_print_versions} mã đề
          </p>
        </div>
      </div>
    </section>
  );
}
