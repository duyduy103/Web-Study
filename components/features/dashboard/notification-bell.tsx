"use client";

import * as React from "react";
import Link from "next/link";
import type { NotificationItem } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

interface NotificationBellProps {
  initialNotifications?: NotificationItem[];
  initialUnreadCount?: number;
}

export function NotificationBell({
  initialNotifications = [],
  initialUnreadCount = 0,
}: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] =
    React.useState<NotificationItem[]>(initialNotifications);
  const [unreadCount, setUnreadCount] =
    React.useState<number>(initialUnreadCount);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const fetchLatest = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: NotificationItem[];
        unreadCount?: number;
      };
      if (Array.isArray(data.notifications)) {
        setItems(data.notifications);
        setUnreadCount(
          typeof data.unreadCount === "number"
            ? data.unreadCount
            : data.notifications.filter((n) => !n.read_at).length
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialNotifications.length === 0) {
      void fetchLatest();
    }
  }, [fetchLatest, initialNotifications.length]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleMarkRead(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore
    }
  }

  async function handleMarkAllRead() {
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? nowIso })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      // ignore
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void fetchLatest();
        }}
        aria-label={`${vi.notifications.bellLabel}${unreadCount > 0 ? ` (${unreadCount} ${vi.notifications.unreadBadgeSuffix})` : ""}`}
        aria-expanded={open}
        className="relative inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <span aria-hidden="true" className="text-base leading-none">
          🔔
        </span>
        {unreadCount > 0 ? (
          <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={vi.notifications.title}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-sm font-extrabold text-slate-900">
              {vi.notifications.title}
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="cursor-pointer text-xs font-bold text-teal-700 hover:underline"
              >
                {vi.notifications.markAllRead}
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-0.5">
            {loading && items.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                {vi.common.loading}
              </p>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                {vi.notifications.empty}
              </p>
            ) : (
              items.map((item) => {
                const isUnread = !item.read_at;
                const meta =
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as Record<string, unknown>)
                    : {};
                const actionHref =
                  typeof meta.href === "string"
                    ? meta.href
                    : item.type === "feedback_reply"
                    ? "/dashboard/feedback"
                    : item.type === "plan_expiring_soon" ||
                      item.type === "plan_expired"
                    ? "/pricing"
                    : null;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 text-xs transition-colors ${
                      isUnread
                        ? "border-teal-200 bg-teal-50/50"
                        : "border-slate-100 bg-slate-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-900">{item.title}</p>
                      {isUnread ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(item.id)}
                          className="shrink-0 cursor-pointer rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200 hover:bg-teal-50"
                        >
                          {vi.notifications.markRead}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 leading-relaxed text-slate-700">
                      {item.body}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {new Date(item.created_at).toLocaleString("vi-VN")}
                      </span>
                      {actionHref ? (
                        <Link
                          href={actionHref}
                          onClick={() => {
                            if (isUnread) void handleMarkRead(item.id);
                            setOpen(false);
                          }}
                          className="font-bold text-teal-700 hover:underline"
                        >
                          Xem chi tiết →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

