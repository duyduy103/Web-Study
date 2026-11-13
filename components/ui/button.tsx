import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
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
  default:
    "bg-teal-600 text-white shadow-xs hover:bg-teal-700 active:bg-teal-800 focus-visible:ring-teal-600",
  secondary:
    "bg-teal-50 text-teal-900 hover:bg-teal-100 active:bg-teal-200 focus-visible:ring-teal-600",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-teal-600",
  ghost:
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-teal-600",
  destructive:
    "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-600",
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
