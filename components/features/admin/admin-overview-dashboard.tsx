"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";

export interface SystemOverviewData {
  users: {
    total: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
    teachers: number;
    students: number;
    dau: number;
    wau: number;
    mau: number;
  };
  content: {
    question_sets: number;
    questions: number;
    exams: number;
    attempts: number;
    review_logs: number;
    anonymous_learners: number;
  };
  ai: {
    today_calls: number;
    total_tokens: number;
  };
  storage: {
    estimated_bytes: number;
  };
  billing?: {
    monthly_revenue_vnd: number;
    pending_orders: number;
    active_premium_users: number;
    expiring_soon_users: number;
    needs_review_events?: number;
  };
  charts: {
    signups_30d: Array<{ date: string; label: string; count: number }>;
    reviews_30d: Array<{ date: string; label: string; count: number }>;
  };
}

export function AdminOverviewDashboard({
  data,
  aiGlobalDailyLimit = 500,
  tokenCostPerMillion = 0.15,
}: {
  data: SystemOverviewData;
  aiGlobalDailyLimit?: number;
  tokenCostPerMillion?: number;
}) {
  // Ước tính chi phí AI (USD & VND)
  const estimatedCostUsd = (data.ai.total_tokens / 1_000_000) * tokenCostPerMillion;
  const storageMb = (data.storage.estimated_bytes / (1024 * 1024)).toFixed(1);

  // Tính toán biểu đồ 30 ngày SVG
  const signupsMax = Math.max(1, ...data.charts.signups_30d.map((x) => x.count));
  const reviewsMax = Math.max(1, ...data.charts.reviews_30d.map((x) => x.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {vi.admin.overviewTitle}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {vi.admin.overviewSubtitle}
        </p>
      </div>

      {/* Nhóm 1: Người dùng & Hoạt động (DAU/WAU/MAU) */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-teal-400">
          1. Người Dùng & Tần Suất Hoạt Động (DAU / WAU / MAU)
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Tổng người dùng</span>
            <p className="mt-1 text-2xl font-black text-white">{data.users.total}</p>
            <div className="mt-2 flex gap-2 text-[10px] text-slate-500">
              <span>👨‍🏫 {data.users.teachers} GV</span>
              <span>🎓 {data.users.students} HS</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Đăng ký hôm nay</span>
            <p className="mt-1 text-2xl font-black text-teal-400">+{data.users.new_today}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              7 ngày: +{data.users.new_7d} • 30 ngày: +{data.users.new_30d}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">DAU (24 giờ qua)</span>
            <p className="mt-1 text-2xl font-black text-emerald-400">{data.users.dau}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              {data.users.total > 0
                ? `${Math.round((data.users.dau / data.users.total) * 100)}% tổng số`
                : "0%"}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">WAU (7 ngày qua)</span>
            <p className="mt-1 text-2xl font-black text-sky-400">{data.users.wau}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              {data.users.total > 0
                ? `${Math.round((data.users.wau / data.users.total) * 100)}% tổng số`
                : "0%"}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">MAU (30 ngày qua)</span>
            <p className="mt-1 text-2xl font-black text-indigo-400">{data.users.mau}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Tỷ lệ gắn bó: {data.users.mau > 0 ? `${Math.round((data.users.dau / data.users.mau) * 100)}%` : "0%"}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Học sinh ẩn danh</span>
            <p className="mt-1 text-2xl font-black text-amber-400">{data.content.anonymous_learners}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Chưa tạo tài khoản
            </span>
          </div>
        </div>
      </div>

      {/* Nhóm 2: Tài nguyên & Sử dụng AI / Storage */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-teal-400">
          2. Nội Dung Học Tập & Sử Dụng AI / Storage
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Bộ câu hỏi</span>
            <p className="mt-1 text-2xl font-black text-white">{data.content.question_sets}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              {data.content.questions} câu hỏi
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Đề thi & Lượt làm</span>
            <p className="mt-1 text-2xl font-black text-white">{data.content.exams}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              {data.content.attempts} lượt nộp bài
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Lượt ôn FSRS</span>
            <p className="mt-1 text-2xl font-black text-teal-300">{data.content.review_logs}</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Active Recall khoa học
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">AI hôm nay</span>
            <p className="mt-1 text-2xl font-black text-white">
              {data.ai.today_calls}
              <span className="text-xs font-normal text-slate-500">/{aiGlobalDailyLimit}</span>
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                style={{
                  width: `${Math.min(100, (data.ai.today_calls / aiGlobalDailyLimit) * 100)}%`,
                }}
                className="h-full bg-teal-400"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Chi phí AI ước tính</span>
            <p className="mt-1 text-2xl font-black text-rose-400">
              ${estimatedCostUsd.toFixed(3)}
            </p>
            <span className="mt-2 block text-[10px] text-slate-500 truncate" title={`${data.ai.total_tokens.toLocaleString()} tokens`}>
              {data.ai.total_tokens.toLocaleString()} tokens
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">Dung lượng Storage</span>
            <p className="mt-1 text-2xl font-black text-white">{storageMb} MB</p>
            <span className="mt-2 block text-[10px] text-slate-500">
              File đề cương & tài liệu
            </span>
          </div>
        </div>
      </div>

      {/* Nhóm 2.5: Doanh thu, Đơn hàng SePay & Gói Premium */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400">
          3. Doanh Thu Tháng, Đơn Thanh Toán & Gói Premium
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">
              {vi.admin.metrics.monthlyRevenue}
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-400">
              {(data.billing?.monthly_revenue_vnd ?? 0).toLocaleString("vi-VN")}đ
            </p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Tổng đơn paid trong tháng
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">
              {vi.admin.metrics.pendingOrders}
            </span>
            <p className="mt-1 text-2xl font-black text-amber-400">
              {data.billing?.pending_orders ?? 0}
            </p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Cần xem xét: {data.billing?.needs_review_events ?? 0} giao dịch
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">
              {vi.admin.metrics.activePremiumUsers}
            </span>
            <p className="mt-1 text-2xl font-black text-teal-400">
              {data.billing?.active_premium_users ?? 0}
            </p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Tài khoản đang hiệu lực PRO
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
            <span className="text-[11px] font-medium text-slate-400">
              {vi.admin.metrics.expiringSoonUsers}
            </span>
            <p className="mt-1 text-2xl font-black text-rose-400">
              {data.billing?.expiring_soon_users ?? 0}
            </p>
            <span className="mt-2 block text-[10px] text-slate-500">
              Sẽ hết hạn trong 7 ngày tới
            </span>
          </div>
        </div>
      </div>

      {/* Nhóm 3: Biểu đồ CSS/SVG 30 ngày (Không dùng thư viện bên ngoài) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Biểu đồ 1: Đăng ký mới 30 ngày */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                {vi.admin.metrics.signupsChart}
              </h3>
              <p className="text-[11px] text-slate-400">
                Tăng trưởng tài khoản mới theo từng ngày
              </p>
            </div>
            <span className="rounded-lg bg-teal-950 border border-teal-800 px-2 py-0.5 text-xs font-bold text-teal-400">
              +{data.users.new_30d} tài khoản
            </span>
          </div>

          {/* Biểu đồ Cột SVG Thuần */}
          <div className="h-44 w-full pt-4">
            <svg
              viewBox="0 0 600 150"
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="130" x2="600" y2="130" stroke="#334155" strokeWidth="1" />
              <line x1="0" y1="65" x2="600" y2="65" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
              {data.charts.signups_30d.map((d, idx) => {
                const barWidth = 14;
                const x = idx * 20 + 5;
                const barHeight = Math.max(3, (d.count / signupsMax) * 115);
                const y = 130 - barHeight;

                return (
                  <g key={d.date} className="group cursor-pointer">
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="3"
                      fill={d.count > 0 ? "#14b8a6" : "#1e293b"}
                      className="transition-colors hover:fill-teal-300"
                    />
                    <title>{`${d.label}: +${d.count} người dùng`}</title>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
            <span>{data.charts.signups_30d[0]?.label}</span>
            <span>30 ngày qua</span>
            <span>{data.charts.signups_30d[data.charts.signups_30d.length - 1]?.label} (Hôm nay)</span>
          </div>
        </div>

        {/* Biểu đồ 2: Hoạt động ôn FSRS 30 ngày */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                {vi.admin.metrics.reviewsChart}
              </h3>
              <p className="text-[11px] text-slate-400">
                Số lượt ôn tập thẻ ghi nhớ Active Recall
              </p>
            </div>
            <span className="rounded-lg bg-indigo-950 border border-indigo-800 px-2 py-0.5 text-xs font-bold text-indigo-400">
              {data.charts.reviews_30d.reduce((acc, curr) => acc + curr.count, 0)} lượt ôn
            </span>
          </div>

          {/* Biểu đồ Đường Area SVG Thuần */}
          <div className="h-44 w-full pt-4">
            <svg
              viewBox="0 0 600 150"
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="130" x2="600" y2="130" stroke="#334155" strokeWidth="1" />
              <line x1="0" y1="65" x2="600" y2="65" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />

              {/* Area path */}
              {(() => {
                const points = data.charts.reviews_30d.map((d, i) => {
                  const x = i * 20 + 10;
                  const y = 130 - Math.max(0, (d.count / reviewsMax) * 115);
                  return `${x},${y}`;
                });
                const dPath = `M 10,130 L ${points.join(" L ")} L ${
                  (data.charts.reviews_30d.length - 1) * 20 + 10
                },130 Z`;
                const linePath = `M ${points.join(" L ")}`;

                return (
                  <>
                    <path d={dPath} fill="url(#areaGradient)" />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {data.charts.reviews_30d.map((d, i) => {
                      const x = i * 20 + 10;
                      const y = 130 - Math.max(0, (d.count / reviewsMax) * 115);
                      return (
                        <circle
                          key={d.date}
                          cx={x}
                          cy={y}
                          r={d.count > 0 ? 3 : 1.5}
                          fill={d.count > 0 ? "#818cf8" : "#475569"}
                          className="hover:r-5 transition-all"
                        >
                          <title>{`${d.label}: ${d.count} lượt ôn`}</title>
                        </circle>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
            <span>{data.charts.reviews_30d[0]?.label}</span>
            <span>Khoa học trí nhớ FSRS</span>
            <span>{data.charts.reviews_30d[data.charts.reviews_30d.length - 1]?.label} (Hôm nay)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

