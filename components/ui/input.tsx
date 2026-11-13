import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-2xs transition-colors placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600/25 focus-visible:outline-none aria-invalid:border-red-500 aria-invalid:focus-visible:border-red-600 aria-invalid:focus-visible:ring-red-500/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50 motion-reduce:transition-none",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
