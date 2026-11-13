import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-teal-600 text-white",
  secondary: "bg-teal-50 text-teal-900 border border-teal-200/60",
  success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border border-amber-200",
  destructive: "bg-red-50 text-red-800 border border-red-200",
  outline: "border border-slate-300 text-slate-700 bg-white",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

