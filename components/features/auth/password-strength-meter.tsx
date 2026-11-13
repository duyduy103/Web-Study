"use client";

import * as React from "react";
import { calculatePasswordStrength } from "@/lib/auth/password-rules";
import { vi } from "@/lib/i18n/vi";

interface PasswordStrengthMeterProps {
  password: string;
  email?: string;
}

export function PasswordStrengthMeter({
  password,
  email,
}: PasswordStrengthMeterProps) {
  const result = React.useMemo(() => {
    return calculatePasswordStrength(password, email);
  }, [password, email]);

  if (!password) {
    return null;
  }

  const { score, level, criteria } = result;

  const levelColor =
    level === "strong"
      ? "bg-emerald-500 text-emerald-700"
      : level === "medium"
        ? "bg-amber-500 text-amber-700"
        : "bg-red-500 text-red-700";

  const levelText =
    level === "strong"
      ? vi.auth.passwordStrength.strong
      : level === "medium"
        ? vi.auth.passwordStrength.medium
        : vi.auth.passwordStrength.weak;

  return (
    <div
      role="region"
      aria-label={vi.auth.passwordChecklist.title}
      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">
          {vi.auth.passwordStrengthLabel}
        </span>
        <span
          className={`font-bold ${
            level === "strong"
              ? "text-emerald-700"
              : level === "medium"
                ? "text-amber-700"
                : "text-red-700"
          }`}
        >
          {levelText}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${vi.auth.passwordStrengthLabel} ${levelText}`}
      >
        <div
          className={`h-full transition-all duration-300 ${levelColor.split(" ")[0]} motion-reduce:transition-none`}
          style={{ width: `${Math.max(10, score)}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="pt-1">
        <p className="mb-1.5 font-semibold text-slate-800">
          {vi.auth.passwordChecklist.title}
        </p>
        <ul className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
          <li
            className={`flex items-center gap-1.5 ${
              criteria.length ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.length ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.length}</span>
          </li>
          <li
            className={`flex items-center gap-1.5 ${
              criteria.hasUpper ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.hasUpper ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.upper}</span>
          </li>
          <li
            className={`flex items-center gap-1.5 ${
              criteria.hasLower ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.hasLower ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.lower}</span>
          </li>
          <li
            className={`flex items-center gap-1.5 ${
              criteria.hasNumber ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.hasNumber ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.number}</span>
          </li>
          <li
            className={`flex items-center gap-1.5 ${
              criteria.notEmail ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.notEmail ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.notEmail}</span>
          </li>
          <li
            className={`flex items-center gap-1.5 ${
              criteria.notCommon ? "font-semibold text-emerald-700" : "text-slate-500"
            }`}
          >
            <span aria-hidden="true">{criteria.notCommon ? "✓" : "○"}</span>
            <span>{vi.auth.passwordChecklist.notCommon}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
