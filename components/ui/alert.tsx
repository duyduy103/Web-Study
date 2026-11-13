import * as React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "default" | "info" | "success" | "warning" | "destructive";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  icon?: React.ReactNode;
  title?: string;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string }> = {
  default: {
    container: "border-slate-200 bg-slate-50 text-slate-900",
    icon: "ℹ",
  },
  info: {
    container: "border-teal-200 bg-teal-50/80 text-teal-950",
    icon: "ℹ",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50/80 text-emerald-950",
    icon: "✓",
  },
  warning: {
    container: "border-amber-300 bg-amber-50 text-amber-950",
    icon: "⚠",
  },
  destructive: {
    container: "border-red-200 bg-red-50 text-red-950",
    icon: "✕",
  },
};

export function Alert({
  className,
  variant = "default",
  icon,
  title,
  children,
  role = variant === "destructive" ? "alert" : "status",
  ...props
}: AlertProps) {
  const current = variantStyles[variant];

  return (
    <div
      role={role}
      aria-live={variant === "destructive" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed shadow-2xs",
        current.container,
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-full text-xs font-bold"
      >
        {icon ?? current.icon}
      </span>
      <div className="flex-1 space-y-1">
        {title ? <h4 className="font-bold leading-tight">{title}</h4> : null}
        {children ? <div className="text-xs sm:text-sm">{children}</div> : null}
      </div>
    </div>
  );
}

