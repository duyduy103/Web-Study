"use client";

import * as React from "react";
import Link from "next/link";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FeedbackType, FeedbackStatus, FeedbackPriority } from "@/lib/supabase/types";

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  public_response: string | null;
  public_response_at: string | null;
  user_read_at: string | null;
  created_at: string;
}

export function MyFeedbackClient({ initialFeedback }: { initialFeedback: FeedbackItem[] }) {
  const [items, setItems] = React.useState<FeedbackItem[]>(initialFeedback);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/feedback/${id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, user_read_at: new Date().toISOString() } : item
        )
      );
    } catch {
      // Bỏ qua lỗi mạng
    }
  };

  const getStatusBadge = (status: FeedbackStatus) => {
    switch (status) {
      case "new":
        return <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">Mới gửi</span>;
      case "in_progress":
        return <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Đang xử lý</span>;
      case "resolved":
        return <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Đã xong</span>;
      case "ignored":
        return <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">Đã ghi nhận</span>;
    }
  };

  const getTypeLabel = (type: FeedbackType) => {
    return vi.feedback.types[type] ?? type;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Bảng điều khiển
          </Link>
          <h1 className="mt-1 text-2xl font-black text-[var(--heading)] sm:text-3xl">
            {vi.feedback.myFeedbackTitle}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {vi.feedback.myFeedbackSubtitle}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="rounded-3xl border-dashed border-2 border-slate-300 p-8 text-center">
          <p className="text-sm font-semibold text-slate-500">
            {vi.feedback.noFeedback}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Bấm nút &quot;Góp ý&quot; ở góc phải màn hình bất cứ lúc nào để gửi phản hồi.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const hasUnread = Boolean(item.public_response && !item.user_read_at);

            return (
              <Card
                key={item.id}
                className={`rounded-3xl transition-all shadow-sm ${
                  hasUnread
                    ? "border-2 border-amber-400 bg-amber-50/20"
                    : "border-[var(--space-border)] bg-[var(--space-surface)]"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[var(--space-surface-muted)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--space-primary)]">
                        {getTypeLabel(item.type)}
                      </span>
                      {getStatusBadge(item.status)}
                      {hasUnread ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white animate-pulse">
                          ● {vi.feedback.unreadResponseBadge}
                        </span>
                      ) : null}
                    </div>

                    <span className="text-[11px] font-medium text-slate-400">
                      {new Date(item.created_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Nội dung người dùng gửi: Render text thuần túy để chống XSS */}
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-800 whitespace-pre-wrap break-words border border-slate-100">
                    {item.content}
                  </div>

                  {/* Phản hồi công khai từ admin nếu có */}
                  {item.public_response ? (
                    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-teal-900">
                          🛡️ {vi.feedback.adminResponseTitle}
                        </span>
                        {hasUnread ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markRead(item.id)}
                            className="h-7 text-[11px] font-bold"
                          >
                            ✓ {vi.feedback.markAsRead}
                          </Button>
                        ) : (
                          <span className="text-[11px] font-semibold text-teal-700">
                            ✓ {vi.feedback.markAsRead}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-teal-950 whitespace-pre-wrap break-words">
                        {item.public_response}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Đang chờ ban quản trị tiếp nhận và phản hồi...
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
