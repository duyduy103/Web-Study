import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "outline" | "ghost" | "secondary";
export type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-teal-600 text-white shadow-xs hover:bg-teal-700 focus-visible:ring-teal-600",
  secondary:
    "bg-teal-50 text-teal-800 hover:bg-teal-100 focus-visible:ring-teal-600",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-teal-600",
  ghost:
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-teal-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-[44px] px-4 py-2.5 text-sm",
  sm: "min-h-[44px] px-3.5 py-2 text-sm",
  lg: "min-h-[48px] px-6 py-3 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

