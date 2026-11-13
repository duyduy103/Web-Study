"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "accent"
  | "outline"
  | "ghost"
  | "secondary"
  | "destructive";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  accent:
    "bg-[var(--space-accent)] text-[var(--space-accent-fg)] shadow-sm hover:brightness-110 active:brightness-95 active:scale-[0.98] focus-visible:ring-[var(--space-accent)] transition-all",
  default:
    "bg-[var(--space-primary)] text-[var(--space-primary-fg)] shadow-xs hover:brightness-110 active:brightness-95 active:scale-[0.98] focus-visible:ring-[var(--space-primary)] transition-all",
  secondary:
    "bg-[var(--space-surface-muted)] text-[var(--foreground)] border border-[var(--space-border)] hover:brightness-95 active:brightness-90 active:scale-[0.98] focus-visible:ring-[var(--space-primary)] transition-all",
  outline:
    "border-2 border-[var(--space-border)] bg-[var(--space-surface)] text-[var(--foreground)] hover:bg-[var(--space-surface-muted)] active:scale-[0.98] focus-visible:ring-[var(--space-primary)] transition-all",
  ghost:
    "text-[var(--foreground)] hover:bg-[var(--space-surface-muted)] active:bg-[var(--space-surface-muted)] focus-visible:ring-[var(--space-primary)] transition-colors",
  destructive:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800 active:scale-[0.98] focus-visible:ring-red-600 transition-all",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-[44px] px-4 py-2.5 text-sm",
  sm: "min-h-[40px] px-3 py-1.5 text-xs sm:text-sm",
  lg: "min-h-[48px] px-6 py-3 text-base sm:text-lg font-semibold",
  icon: "h-11 w-11 p-0 flex items-center justify-center",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        className={cn(
          "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
