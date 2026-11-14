"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  variant?: "default" | "study" | "amber" | "emerald" | "danger";
  size?: "sm" | "default" | "lg";
}

const variantTrackClasses = {
  default: "bg-[var(--space-surface-muted,#f1f5f9)]",
  study: "bg-[var(--space-surface-muted,#dcf0ea)] border border-[var(--space-border,#cad9d2)]",
  amber: "bg-[var(--space-reward-bg,#fffbeb)] border border-[var(--space-reward-border,#fcd34d)]",
  emerald: "bg-emerald-100",
  danger: "bg-red-100",
};

const variantFillClasses = {
  default: "bg-[var(--space-primary,#0a4f43)]",
  study: "bg-gradient-to-r from-[var(--space-primary,#0a4f43)] to-[var(--space-accent,#c2410c)] shadow-xs",
  amber: "bg-[var(--space-accent,#c2410c)]",
  emerald: "bg-emerald-600",
  danger: "bg-red-600",
};

const sizeClasses = {
  sm: "h-2",
  default: "h-3",
  lg: "h-4 rounded-full",
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercent = false,
  variant = "default",
  size = "default",
  className,
  ...props
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clampedValue = Math.min(Math.max(value, 0), safeMax);
  const percentage = Math.round((clampedValue / safeMax) * 100);

  return (
    <div className={cn("w-full space-y-1.5", className)} {...props}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-700">
          {label ? <span>{label}</span> : <span />}
          {showPercent && (
            <span className="font-semibold text-slate-900">{percentage}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label ?? "Tiến độ"}
        className={cn(
          "w-full overflow-hidden rounded-full transition-all",
          variantTrackClasses[variant],
          sizeClasses[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
            variantFillClasses[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

