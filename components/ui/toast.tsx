"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToastProps {
  id?: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
  onClose?: () => void;
  className?: string;
}

export function Toast({
  title,
  description,
  variant = "info",
  onClose,
  className,
}: ToastProps) {
  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lg transition-all motion-reduce:transition-none",
        variant === "success" && "border-emerald-200 bg-white text-emerald-950",
        variant === "error" && "border-red-200 bg-white text-red-950",
        variant === "info" && "border-teal-200 bg-white text-teal-950",
        className
      )}
    >
      <div className="shrink-0 pt-0.5" aria-hidden="true">
        {variant === "success" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
            ✓
          </span>
        )}
        {variant === "error" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
            !
          </span>
        )}
        {variant === "info" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
            i
          </span>
        )}
      </div>

      <div className="flex-1 space-y-0.5">
        <div className="text-sm font-semibold">{title}</div>
        {description && <div className="text-xs text-slate-600">{description}</div>}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          <span className="text-sm font-bold leading-none">×</span>
        </button>
      )}
    </div>
  );
}

