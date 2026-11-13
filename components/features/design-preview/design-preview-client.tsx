"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

type PaletteId = "a" | "b";

export function DesignPreviewClient() {
  const [activePalette, setActivePalette] = React.useState<PaletteId>("a");
  const [simulatedFlip, setSimulatedFlip] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("memoquiz_palette") as PaletteId | null;
      if (stored === "a" || stored === "b") {
        setActivePalette(stored);
        document.documentElement.setAttribute("data-palette", stored);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleSelectPalette(id: PaletteId) {
    setActivePalette(id);
    document.documentElement.setAttribute("data-palette", id);
    try {
      localStorage.setItem("memoquiz_palette", id);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-24">
      {/* Top Bar Switcher */}
      <header className="sticky top-4 z-40 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] p-4 sm:p-5 shadow-lg backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--space-primary)] text-xs font-black text-white">
              MQ
            </span>
            <h1 className="text-lg font-black tracking-tight text-[var(--heading)] sm:text-xl">
              MemoQuiz Design Studio: Bước 11b
            </h1>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            So sánh bảng màu 60-30-10 & Thứ bậc thị giác tương phản cao
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSelectPalette("a")}
            aria-pressed={activePalette === "a"}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all ${
              activePalette === "a"
                ? "bg-[#0A4F43] text-white shadow-md ring-2 ring-offset-2 ring-[#0A4F43]"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span className="h-3 w-3 rounded-full bg-[#C2410C]" />
            <span>Bảng A (Spruce & Amber)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPalette("b")}
            aria-pressed={activePalette === "b"}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all ${
              activePalette === "b"
                ? "bg-[#4338CA] text-white shadow-md ring-2 ring-offset-2 ring-[#4338CA]"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span className="h-3 w-3 rounded-full bg-[#BE123C]" />
            <span>Bảng B (Indigo & Coral)</span>
          </button>
        </div>
      </header>

      {/* 1. Giải thích nguyên tắc 60-30-10 & Bảng tính độ tương phản WCAG AA */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[var(--heading)]">
          1. Phân bổ Bảng màu 60-30-10 & Kiểm định Tương phản WCAG AA
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--space-border)] bg-[var(--space-surface)] p-4 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              60% Nền Canvas
            </span>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl border border-slate-300 bg-[var(--background)] shadow-2xs" />
              <div>
                <p className="font-mono text-xs font-bold text-[var(--heading)]">
                  {activePalette === "a" ? "#F4F7F5 (Ấm Spruce)" : "#F4F3FB (Sắc Chàm tím)"}
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  Nền có sắc nhẹ, không phẳng, chống mỏi mắt
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--space-border)] bg-[var(--space-surface)] p-4 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              30% Màu Chủ đạo (Primary)
            </span>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--space-primary)] shadow-2xs" />
              <div>
                <p className="font-mono text-xs font-bold text-[var(--heading)]">
                  {activePalette === "a" ? "#0A4F43 (Deep Spruce Teal)" : "#4338CA (Royal Indigo)"}
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  Tiêu đề, header, nhận diện cốt lõi
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--space-border)] bg-[var(--space-surface)] p-4 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--space-accent)]">
              10% Màu Nhấn (Standout Accent)
            </span>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--space-accent)] shadow-2xs" />
              <div>
                <p className="font-mono text-xs font-bold text-[var(--heading)]">
                  {activePalette === "a" ? "#C2410C (Warm Rust Amber)" : "#BE123C (Vibrant Coral)"}
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  Hành động chính duy nhất & Phần thưởng
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bảng đối soát tỷ lệ tương phản WCAG AA */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--space-border)] bg-[var(--space-surface)] p-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--space-border)] pb-2 text-[var(--muted)]">
                <th className="py-2">Cặp màu (Chữ / Nền)</th>
                <th>Bảng A (Spruce & Amber)</th>
                <th>Bảng B (Indigo & Coral)</th>
                <th>Tiêu chuẩn WCAG AA</th>
                <th>Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--space-border)]/60 font-medium">
              <tr>
                <td className="py-2.5">Chữ văn bản / Nền Canvas</td>
                <td className="font-mono font-bold">16.74 : 1</td>
                <td className="font-mono font-bold">16.28 : 1</td>
                <td>Tối thiểu 4.5 : 1</td>
                <td><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">ĐẠT AAA</span></td>
              </tr>
              <tr>
                <td className="py-2.5">Chữ trắng / Nút Chủ đạo (Primary)</td>
                <td className="font-mono font-bold">9.48 : 1</td>
                <td className="font-mono font-bold">7.90 : 1</td>
                <td>Tối thiểu 4.5 : 1</td>
                <td><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">ĐẠT AAA</span></td>
              </tr>
              <tr>
                <td className="py-2.5">Chữ trắng / Nút Nhấn (Accent CTA)</td>
                <td className="font-mono font-bold">5.18 : 1</td>
                <td className="font-mono font-bold">6.29 : 1</td>
                <td>Tối thiểu 4.5 : 1</td>
                <td><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">ĐẠT AA</span></td>
              </tr>
              <tr>
                <td className="py-2.5">Thẻ phần thưởng Streak / Khung viền</td>
                <td className="font-mono font-bold">6.56 : 1</td>
                <td className="font-mono font-bold">6.29 : 1</td>
                <td>Tối thiểu 3.0 : 1</td>
                <td><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">ĐẠT AAA</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Thành phần dùng chung & Thứ bậc nút bấm */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[var(--heading)]">
          2. Thứ bậc nút bấm (Nút Nhấn 10% vs Nút Phụ) & Thành phần dùng chung
        </h2>

        <div className="rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] p-6 shadow-sm space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider">
              Thứ bậc nút bấm (Button Hierarchy)
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="accent" size="lg" className="shadow-md">
                ★ Nút Nhấn Chính (10% Standout Accent)
              </Button>
              <Button variant="default" size="default">
                Nút Phụ Nhóm 1 (Primary Brand)
              </Button>
              <Button variant="secondary" size="default">
                Nút Phụ Nhóm 2 (Secondary)
              </Button>
              <Button variant="outline" size="default">
                Nút Đường viền (Outline)
              </Button>
              <Button variant="destructive" size="default">
                Nút Xóa (Destructive)
              </Button>
            </div>
            <p className="text-xs text-[var(--muted)] pt-1">
              Mỗi màn hình chỉ có duy nhất 1 nút &apos;variant=&quot;accent&quot;&apos; nổi bật vượt trội để dẫn dắt hành động của người dùng mà không gây phân tâm.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--space-border)]">
            <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider">
              4 Nút FSRS Tự Chấm Xúc Giác (Không Gian Học)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-2xl">
              <button
                type="button"
                className="flex min-h-[66px] flex-col items-center justify-center rounded-2xl border-2 border-b-4 border-rose-400 bg-rose-50 px-3 py-2 text-rose-950 active:border-b-2 active:translate-y-0.5 shadow-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-rose-600">✕</span>
                  <span className="text-sm font-black">Quên</span>
                  <kbd className="rounded bg-rose-200/80 px-1 text-[10px] font-bold text-rose-900">1</kbd>
                </div>
                <span className="mt-0.5 text-[11px] font-semibold text-rose-800">1 phút</span>
              </button>

              <button
                type="button"
                className="flex min-h-[66px] flex-col items-center justify-center rounded-2xl border-2 border-b-4 border-amber-400 bg-amber-50 px-3 py-2 text-amber-950 active:border-b-2 active:translate-y-0.5 shadow-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-amber-600">⚡</span>
                  <span className="text-sm font-black">Khó</span>
                  <kbd className="rounded bg-amber-200/80 px-1 text-[10px] font-bold text-amber-900">2</kbd>
                </div>
                <span className="mt-0.5 text-[11px] font-semibold text-amber-800">5 phút</span>
              </button>

              <button
                type="button"
                className="flex min-h-[66px] flex-col items-center justify-center rounded-2xl border-2 border-b-4 border-sky-400 bg-sky-50 px-3 py-2 text-sky-950 active:border-b-2 active:translate-y-0.5 shadow-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-sky-600">✓</span>
                  <span className="text-sm font-black">Tốt</span>
                  <kbd className="rounded bg-sky-200/80 px-1 text-[10px] font-bold text-sky-900">3</kbd>
                </div>
                <span className="mt-0.5 text-[11px] font-semibold text-sky-800">10 phút</span>
              </button>

              <button
                type="button"
                className="flex min-h-[66px] flex-col items-center justify-center rounded-2xl border-2 border-b-4 border-emerald-500 bg-emerald-50 px-3 py-2 text-emerald-950 active:border-b-2 active:translate-y-0.5 shadow-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-emerald-600">★</span>
                  <span className="text-sm font-black">Dễ</span>
                  <kbd className="rounded bg-emerald-200/80 px-1 text-[10px] font-bold text-emerald-900">4</kbd>
                </div>
                <span className="mt-0.5 text-[11px] font-semibold text-emerald-800">4 ngày</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Mô phỏng 3 Màn Mẫu Thật trực tiếp dưới Bảng màu hiện tại */}
      <section className="space-y-6">
        <h2 className="text-xl font-black text-[var(--heading)]">
          3. Bản Mẫu 3 Màn Hình Thật Dưới Bảng Màu Đang Chọn ({activePalette.toUpperCase()})
        </h2>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Màn Mẫu 1: Đăng nhập */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Màn 1: Đăng nhập (/login)
            </h4>
            <Card className="p-2 sm:p-3 shadow-md">
              <CardHeader className="text-center pb-3 space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--space-primary)] text-white shadow-xs">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <CardTitle className="text-lg">Đăng nhập MemoQuiz</CardTitle>
                <CardDescription className="text-xs">
                  Khoa học trí nhớ & Active Recall
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="demo-email" className="text-xs">Email</Label>
                  <Input id="demo-email" defaultValue="giaovien@memoquiz.vn" readOnly className="text-xs h-10" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="demo-pass" className="text-xs">Mật khẩu</Label>
                  <Input id="demo-pass" type="password" defaultValue="••••••••••" readOnly className="text-xs h-10" />
                </div>
                <Button variant="accent" size="default" className="w-full text-xs font-bold shadow-md">
                  Đăng nhập ngay →
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Màn Mẫu 2: Dashboard Học sinh */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Màn 2: Dashboard Học sinh (/dashboard)
            </h4>
            <div data-space="learn" className="space-y-3 rounded-3xl bg-[var(--background)] p-3 border border-[var(--space-border)]">
              {/* Hero Banner */}
              <div
                style={{
                  backgroundColor: "var(--space-primary)",
                  backgroundImage: "var(--space-hero-bg)",
                }}
                className="space-hero-banner relative overflow-hidden rounded-2xl p-4 shadow-sm"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">Hôm nay cần ôn</span>
                <p className="text-base font-black mt-0.5">Chào mừng Minh Anh!</p>
                <p className="text-xs opacity-90 mt-0.5">8 thẻ đang chờ bạn ôn lại</p>
              </div>

              {/* Due Cards Block */}
              <div className="rounded-2xl border-2 border-[var(--space-border-strong)] bg-white p-3 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg border border-[var(--space-reward-border)] bg-[var(--space-reward-bg)] px-2 py-0.5 text-[11px] font-black text-[var(--space-reward-fg)]">
                    🔥 5 ngày streak
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    🎯 92% nhớ
                  </span>
                </div>
                <Button variant="accent" size="sm" className="w-full font-bold shadow-sm">
                  🚀 Bắt đầu ôn tập (8 thẻ)
                </Button>
              </div>
            </div>
          </div>

          {/* Màn Mẫu 3: Thẻ ôn Gấp sách Active Recall */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Màn 3: Thẻ Gấp Sách (/study)
            </h4>
            <div data-space="learn" className="rounded-3xl bg-[var(--background)] p-3 border border-[var(--space-border)] space-y-2.5">
              <ProgressBar value={4} max={10} showPercent variant="study" size="sm" label="Thẻ 4/10" />

              <article className="relative overflow-hidden rounded-2xl border-2 border-[var(--space-border-strong)] bg-white p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="rounded-full bg-[var(--space-surface-muted)] px-2 py-0.5 font-bold text-[var(--space-primary)]">
                    Active Recall
                  </span>
                  <span className="font-semibold text-slate-500">Mạng máy tính</span>
                </div>

                <p className="text-xs font-extrabold text-[var(--heading)] leading-snug">
                  Giao thức nào cung cấp kết nối tin cậy và kiểm soát luồng dữ liệu ở Tầng Giao vận?
                </p>

                {!simulatedFlip ? (
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setSimulatedFlip(true)}
                    className="w-full font-black shadow-md mt-1"
                  >
                    Hiện đáp án [Space]
                  </Button>
                ) : (
                  <div className="space-y-2 border-t border-slate-100 pt-2 text-xs">
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2 text-emerald-950 font-bold">
                      ✓ Đáp án: TCP (Transmission Control Protocol)
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimulatedFlip(false)}
                      className="text-[11px] font-semibold text-[var(--space-primary)] underline"
                    >
                      ↺ Ẩn lại đáp án để xem lại
                    </button>
                  </div>
                )}
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
