"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanBadge } from "@/components/features/dashboard/plan-badge";
import { NotificationBell } from "@/components/features/dashboard/notification-bell";
import {
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
  DEFAULT_PREMIUM_PRICES,
  DEFAULT_PREMIUM_PERIOD_DAYS,
  getRemainingSubscriptionDays,
} from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";
import type { PlanCatalogItem, UserEntitlements } from "@/lib/supabase/types";

interface PricingClientProps {
  currentEntitlements?: UserEntitlements | null;
  plansCatalog?: {
    free: PlanCatalogItem;
    premium: PlanCatalogItem;
  };
  isLoggedIn: boolean;
}

export function calculateYearlySavings(monthlyPrice: number, yearlyPrice: number) {
  const fullYearFromMonthly = monthlyPrice * 12;
  const savedAmount = Math.max(0, fullYearFromMonthly - yearlyPrice);
  const savedPercent =
    fullYearFromMonthly > 0
      ? Math.round((savedAmount / fullYearFromMonthly) * 100)
      : 0;
  return { savedAmount, savedPercent, fullYearFromMonthly };
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

export function PricingClient({
  currentEntitlements,
  plansCatalog,
  isLoggedIn,
}: PricingClientProps) {
  const [selectedCycle, setSelectedCycle] = React.useState<"month" | "year">("month");
  const isPremium = Boolean(currentEntitlements?.is_premium);
  const remainingDays = isPremium
    ? getRemainingSubscriptionDays(currentEntitlements?.period_end)
    : null;

  const freePlan = plansCatalog?.free;
  const premiumPlan = plansCatalog?.premium;

  const freeLimits = freePlan?.limits ?? DEFAULT_FREE_LIMITS;
  const premiumLimits = premiumPlan?.limits ?? DEFAULT_PREMIUM_LIMITS;
  const premiumPrices = premiumPlan?.prices ?? DEFAULT_PREMIUM_PRICES;
  const premiumPeriodDays = premiumPlan?.period_days ?? DEFAULT_PREMIUM_PERIOD_DAYS;

  const monthlyPrice = Number(premiumPrices.month ?? DEFAULT_PREMIUM_PRICES.month ?? 39000);
  const yearlyPrice = Number(premiumPrices.year ?? DEFAULT_PREMIUM_PRICES.year ?? 299000);
  const { savedAmount, savedPercent } = calculateYearlySavings(monthlyPrice, yearlyPrice);

  const displayedPrice = selectedCycle === "year" ? yearlyPrice : monthlyPrice;
  const displayedPeriodDays =
    selectedCycle === "year"
      ? Number(premiumPeriodDays.year ?? 365)
      : Number(premiumPeriodDays.month ?? 30);

  const billingHref = isLoggedIn
    ? `/dashboard/billing?cycle=${selectedCycle}`
    : "/login";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={isLoggedIn ? "/dashboard" : "/"}
          className="text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          ← {isLoggedIn ? "Về bảng điều khiển" : "Về trang chủ"}
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-2.5">
            <PlanBadge entitlements={currentEntitlements} showRemainingDays />
            <NotificationBell />
          </div>
        ) : null}
      </div>

      {/* Header */}
      <div className="text-center space-y-4 mb-10">
        <Badge variant="outline" className="text-xs font-semibold px-3 py-1">
          {vi.plans.pricingTitle}
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {vi.plans.pricingTitle}
        </h1>
        <p className="max-w-2xl mx-auto text-base text-slate-600">
          {vi.plans.pricingSubtitle}
        </p>

        {/* Billing Cycle Toggle */}
        <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setSelectedCycle("month")}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${
              selectedCycle === "month"
                ? "bg-teal-600 text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {vi.plans.periodMonthLabel} ({premiumPeriodDays.month ?? 30} ngày)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCycle("year")}
            className={`ml-1 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${
              selectedCycle === "year"
                ? "bg-amber-500 text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>{vi.plans.periodYearLabel} ({premiumPeriodDays.year ?? 365} ngày)</span>
            {savedPercent > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  selectedCycle === "year"
                    ? "bg-white text-amber-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                -{savedPercent}%
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-16">
        {/* Free Plan Card */}
        <Card
          className={`relative flex flex-col justify-between border-2 transition-all duration-200 ${
            !isPremium && isLoggedIn
              ? "border-teal-500 shadow-lg ring-2 ring-teal-500/20"
              : "border-slate-200"
          }`}
        >
          {!isPremium && isLoggedIn ? (
            <div className="absolute -top-3 left-6">
              <Badge variant="default" className="bg-teal-600 text-white font-semibold">
                {vi.plans.currentPlanBadge}
              </Badge>
            </div>
          ) : null}
          <div>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold text-slate-900">
                {freePlan?.name ?? vi.plans.freePlanTitle}
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 min-h-[40px]">
                {vi.plans.freePlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">
                  {vi.plans.freePrice}
                </span>
                <span className="text-sm text-slate-500">{vi.plans.freePeriod}</span>
              </div>

              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>
                    Lưu tối đa <strong>{freeLimits.max_sets} bộ câu hỏi</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>
                    <strong>{freeLimits.ai_daily} lượt AI/ngày</strong> (làm mới 0:00 giờ VN)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>
                    Tệp tải lên tối đa <strong>{freeLimits.max_file_mb} MB</strong> ({freeLimits.max_pdf_pages} trang PDF)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>
                    Dung lượng lưu trữ <strong>{freeLimits.storage_mb} MB</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>
                    Tối đa <strong>{freeLimits.max_print_versions} mã đề</strong> khi in PDF A4
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={freeLimits.can_export_docx ? "text-teal-600 font-bold" : "text-slate-400 font-bold"}>
                    {freeLimits.can_export_docx ? "✓" : "✕"}
                  </span>
                  <span className={freeLimits.can_export_docx ? "" : "text-slate-500"}>
                    Xuất file Word (.docx):{" "}
                    <strong>
                      {freeLimits.can_export_docx ? vi.plans.features.included : vi.plans.features.notIncluded}
                    </strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>Ôn tập khoa học Active Recall & thuật toán FSRS</span>
                </li>
              </ul>
            </CardContent>
          </div>

          <CardFooter className="pt-6">
            {!isLoggedIn ? (
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
              >
                Bắt đầu miễn phí
              </Link>
            ) : !isPremium ? (
              <Button disabled className="w-full opacity-80" variant="outline">
                {vi.plans.currentPlanBadge}
              </Button>
            ) : (
              <Link
                href="/dashboard"
                className="w-full inline-flex items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
              >
                Về bảng điều khiển
              </Link>
            )}
          </CardFooter>
        </Card>

        {/* Premium Plan Card */}
        <Card
          className={`relative flex flex-col justify-between border-2 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/20 transition-all duration-200 ${
            isPremium
              ? "border-amber-500 shadow-lg ring-2 ring-amber-400/30"
              : "border-amber-300 shadow-md"
          }`}
        >
          {isPremium ? (
            <div className="absolute -top-3 left-6">
              <Badge variant="default" className="bg-amber-600 text-white font-semibold">
                {vi.plans.currentPlanBadge}
                {remainingDays !== null
                  ? ` (${vi.plans.daysRemainingPrefix} ${remainingDays} ${vi.plans.daysRemainingSuffix})`
                  : ""}
              </Badge>
            </div>
          ) : (
            <div className="absolute -top-3 right-6">
              <Badge
                variant="default"
                className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold shadow-sm"
              >
                Được khuyên dùng
              </Badge>
            </div>
          )}

          <div>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span>{premiumPlan?.name ?? vi.plans.premiumPlanTitle}</span>
                <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                  PRO
                </span>
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 min-h-[40px]">
                {vi.plans.premiumPlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold text-slate-900">
                    {formatVnd(displayedPrice)}
                  </span>
                  <span className="text-sm text-slate-500">
                    {selectedCycle === "year" ? vi.plans.perYearSuffix : vi.plans.perMonthSuffix} ({displayedPeriodDays} ngày)
                  </span>
                </div>
                {selectedCycle === "year" && savedAmount > 0 ? (
                  <p className="text-xs font-extrabold text-amber-800">
                    🎁 {vi.plans.yearlySavingsBadgePrefix} {savedPercent}% ({formatVnd(savedAmount)}) so với trả từng tháng
                  </p>
                ) : (
                  <p className="text-xs font-medium text-slate-500">
                    Gói năm: <strong>{formatVnd(yearlyPrice)} {vi.plans.perYearSuffix}</strong> —{" "}
                    <button
                      type="button"
                      onClick={() => setSelectedCycle("year")}
                      className="font-bold text-amber-700 underline hover:text-amber-900"
                    >
                      {vi.plans.yearlySavingsBadgePrefix} {savedPercent}% ({formatVnd(savedAmount)})
                    </button>
                  </p>
                )}
                <p className="text-[11px] text-slate-500">{vi.plans.vatNote}</p>
              </div>

              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    Lưu tối đa <strong>{premiumLimits.max_sets} bộ câu hỏi</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    <strong>{premiumLimits.ai_daily} lượt AI/ngày</strong> (làm mới 0:00 giờ VN)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    Tệp tải lên tối đa <strong>{premiumLimits.max_file_mb} MB</strong> ({premiumLimits.max_pdf_pages} trang PDF)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    Dung lượng lưu trữ <strong>{premiumLimits.storage_mb} MB</strong>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    Trộn tối đa <strong>{premiumLimits.max_print_versions} mã đề</strong> theo seed
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>
                    <strong>Xuất file Word (.docx)</strong> & PDF A4 chuẩn in ấn
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Toàn bộ quyền lợi FSRS, Active Recall & giao đề trực tuyến</span>
                </li>
              </ul>
            </CardContent>
          </div>

          <CardFooter className="pt-6 flex flex-col gap-2">
            <Link
              href={billingHref}
              className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 px-4 py-2.5 text-sm text-white font-bold shadow transition-colors"
            >
              {isPremium ? vi.plans.renewButton : vi.plans.upgradePremiumButton} ({selectedCycle === "year" ? vi.plans.periodYearLabel : vi.plans.periodMonthLabel})
            </Link>
            {isPremium && currentEntitlements?.period_end ? (
              <span className="text-[11px] font-medium text-amber-800 text-center">
                Hạn hiện tại đến {new Date(currentEntitlements.period_end).toLocaleDateString("vi-VN")} (gia hạn sẽ cộng nối tiếp số ngày)
              </span>
            ) : null}
          </CardFooter>
        </Card>
      </div>

      {/* Feature Comparison Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
        <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">
          Bảng đối chiếu quyền lợi chi tiết từ hệ thống
        </h2>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-3 px-4 font-semibold text-slate-800">Tính năng & Hạn mức</th>
              <th className="py-3 px-4 font-semibold text-teal-700 text-center w-1/4">
                {freePlan?.name ?? vi.plans.freePlanTitle}
              </th>
              <th className="py-3 px-4 font-semibold text-amber-700 text-center w-1/4">
                {premiumPlan?.name ?? vi.plans.premiumPlanTitle}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.maxSets}</td>
              <td className="py-3 px-4 text-center">{freeLimits.max_sets} bộ</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.max_sets} bộ
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.aiQuota}</td>
              <td className="py-3 px-4 text-center">{freeLimits.ai_daily} lượt/ngày</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.ai_daily} lượt/ngày
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.maxFileMb}</td>
              <td className="py-3 px-4 text-center">{freeLimits.max_file_mb} MB</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.max_file_mb} MB
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.maxPdfPages}</td>
              <td className="py-3 px-4 text-center">{freeLimits.max_pdf_pages} trang</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.max_pdf_pages} trang
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.storageMb}</td>
              <td className="py-3 px-4 text-center">{freeLimits.storage_mb} MB</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.storage_mb} MB
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.printVersions}</td>
              <td className="py-3 px-4 text-center">{freeLimits.max_print_versions} mã đề</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.max_print_versions} mã đề
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.docxExport}</td>
              <td className="py-3 px-4 text-center text-slate-500">
                {freeLimits.can_export_docx ? `✓ ${vi.plans.features.included}` : `✕ ${vi.plans.features.notIncluded}`}
              </td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">
                {premiumLimits.can_export_docx ? `✓ ${vi.plans.features.included}` : `✕ ${vi.plans.features.notIncluded}`}
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.studyFsrs}</td>
              <td className="py-3 px-4 text-center text-teal-600 font-bold">
                ✓ {vi.plans.features.included}
              </td>
              <td className="py-3 px-4 text-center text-amber-600 font-bold">
                ✓ {vi.plans.features.included}
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.examManagement}</td>
              <td className="py-3 px-4 text-center text-teal-600 font-bold">
                ✓ {vi.plans.features.included}
              </td>
              <td className="py-3 px-4 text-center text-amber-600 font-bold">
                ✓ {vi.plans.features.included}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-center text-xs text-slate-500">{vi.plans.vatNote}</p>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 text-center text-sm text-slate-500 space-x-6">
        <Link href="/terms" className="hover:text-slate-800 underline">
          Điều khoản dịch vụ & Chính sách hoàn tiền
        </Link>
        <Link href="/privacy" className="hover:text-slate-800 underline">
          Chính sách bảo mật
        </Link>
      </div>
    </div>
  );
}
