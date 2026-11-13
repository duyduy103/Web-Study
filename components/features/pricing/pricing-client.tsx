"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { vi } from "@/lib/i18n/vi";
import type { UserEntitlements } from "@/lib/supabase/types";

interface PricingClientProps {
  currentEntitlements?: UserEntitlements | null;
  isLoggedIn: boolean;
}

export function PricingClient({
  currentEntitlements,
  isLoggedIn,
}: PricingClientProps) {
  const isPremium = Boolean(currentEntitlements?.is_premium);

  const handleOpenUpgradeFeedback = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("open-feedback-modal", {
          detail: { type: "upgrade_request" },
        })
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center space-y-4 mb-12">
        <Badge variant="outline" className="text-xs font-semibold px-3 py-1">
          {vi.plans.pricingTitle}
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {vi.plans.pricingTitle}
        </h1>
        <p className="max-w-2xl mx-auto text-base text-slate-600">
          {vi.plans.pricingSubtitle}
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-16">
        {/* Free Plan Card */}
        <Card className={`relative flex flex-col justify-between border-2 transition-all duration-200 ${
          !isPremium && isLoggedIn ? "border-teal-500 shadow-md" : "border-slate-200"
        }`}>
          {!isPremium && isLoggedIn && (
            <div className="absolute -top-3 left-6">
              <Badge variant="default" className="bg-teal-600 text-white font-semibold">
                {vi.plans.currentPlanBadge}
              </Badge>
            </div>
          )}
          <div>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold text-slate-900">
                {vi.plans.freePlanTitle}
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 min-h-[40px]">
                {vi.plans.freePlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">{vi.plans.freePrice}</span>
                <span className="text-sm text-slate-500">{vi.plans.freePeriod}</span>
              </div>

              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span><strong>100 câu</strong> mỗi bộ câu hỏi</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span><strong>1 bộ/ngày</strong> tạo mới từ file/văn bản</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span><strong>30 lượt AI/ngày</strong> phân tích & sinh đề</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span><strong>1 mã đề</strong> khi xuất Word (.docx) & PDF</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>Ôn tập khoa học Active Recall & thuật toán FSRS</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-teal-600 font-bold">✓</span>
                  <span>Giao bài kiểm tra trực tuyến và nhận bảng điểm</span>
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
                Về không gian học
              </Link>
            )}
          </CardFooter>
        </Card>

        {/* Premium Plan Card */}
        <Card className={`relative flex flex-col justify-between border-2 bg-gradient-to-b from-amber-50/40 via-white to-amber-50/20 transition-all duration-200 ${
          isPremium ? "border-amber-500 shadow-lg ring-2 ring-amber-400/30" : "border-amber-300 shadow-md"
        }`}>
          {isPremium ? (
            <div className="absolute -top-3 left-6">
              <Badge variant="default" className="bg-amber-600 text-white font-semibold">
                {vi.plans.currentPlanBadge}
              </Badge>
            </div>
          ) : (
            <div className="absolute -top-3 right-6">
              <Badge variant="default" className="bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold shadow-sm">
                Được khuyên dùng
              </Badge>
            </div>
          )}

          <div>
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span>{vi.plans.premiumPlanTitle}</span>
                <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                  PRO
                </span>
              </CardTitle>
              <CardDescription className="text-sm text-slate-600 min-h-[40px]">
                {vi.plans.premiumPlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">{vi.plans.premiumPrice}</span>
                <span className="text-sm text-slate-500">{vi.plans.premiumPeriod}</span>
              </div>

              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span><strong>Không giới hạn số câu</strong> mỗi bộ câu hỏi</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span><strong>Không giới hạn số bộ</strong> tạo mới mỗi ngày</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span><strong>300 lượt AI/ngày</strong> (gấp 10 lần gói Free)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span><strong>4 mã đề trộn theo seed</strong> khi xuất Word (.docx) & PDF</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Toàn bộ quyền lợi phương pháp khoa học FSRS & Active Recall</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-600 font-bold">✓</span>
                  <span>Ưu tiên hỗ trợ kỹ thuật và xử lý yêu cầu định dạng</span>
                </li>
              </ul>
            </CardContent>
          </div>

          <CardFooter className="pt-6">
            {isPremium ? (
              <Button disabled className="w-full bg-amber-600 text-white font-semibold">
                Đang sử dụng Premium {currentEntitlements?.period_end ? `(đến ${new Date(currentEntitlements.period_end).toLocaleDateString("vi-VN")})` : "(Vĩnh viễn)"}
              </Button>
            ) : (
              <Button
                onClick={handleOpenUpgradeFeedback}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold shadow"
              >
                {vi.plans.upgradeRequestBtn}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Feature Comparison Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
        <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">
          Bảng đối chiếu quyền lợi chi tiết
        </h2>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-3 px-4 font-semibold text-slate-800">Tính năng & Hạn mức</th>
              <th className="py-3 px-4 font-semibold text-teal-700 text-center w-1/4">Miễn phí</th>
              <th className="py-3 px-4 font-semibold text-amber-700 text-center w-1/4">Cao cấp (Premium)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.questionsPerSet}</td>
              <td className="py-3 px-4 text-center">{vi.plans.features.freeQuestionsPerSet}</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">{vi.plans.features.premiumQuestionsPerSet}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.setsPerDay}</td>
              <td className="py-3 px-4 text-center">{vi.plans.features.freeSetsPerDay}</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">{vi.plans.features.premiumSetsPerDay}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.aiQuota}</td>
              <td className="py-3 px-4 text-center">{vi.plans.features.freeAiQuota}</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">{vi.plans.features.premiumAiQuota}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.exportVersions}</td>
              <td className="py-3 px-4 text-center">{vi.plans.features.freeExportVersions}</td>
              <td className="py-3 px-4 text-center font-bold text-amber-800">{vi.plans.features.premiumExportVersions}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.studyFsrs}</td>
              <td className="py-3 px-4 text-center text-teal-600 font-bold">✓ {vi.plans.features.included}</td>
              <td className="py-3 px-4 text-center text-amber-600 font-bold">✓ {vi.plans.features.included}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-medium">{vi.plans.features.examManagement}</td>
              <td className="py-3 px-4 text-center text-teal-600 font-bold">✓ {vi.plans.features.included}</td>
              <td className="py-3 px-4 text-center text-amber-600 font-bold">✓ {vi.plans.features.included}</td>
            </tr>
          </tbody>
        </table>
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
