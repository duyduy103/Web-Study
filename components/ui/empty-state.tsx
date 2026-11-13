import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center sm:p-12",
        className
      )}
      {...props}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl text-teal-700 shadow-2xs">
        {icon ?? "📚"}
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 sm:text-sm">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

