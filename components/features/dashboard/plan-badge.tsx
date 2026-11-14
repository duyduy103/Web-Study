import Link from "next/link";
import type { UserEntitlements } from "@/lib/supabase/types";
import { getRemainingSubscriptionDays } from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";

interface PlanBadgeProps {
  entitlements?: UserEntitlements | null;
  href?: string;
  showRemainingDays?: boolean;
}

export function PlanBadge({
  entitlements,
  href = "/pricing",
  showRemainingDays = true,
}: PlanBadgeProps) {
  const isPremium = Boolean(entitlements?.is_premium);
  const remainingDays =
    isPremium && showRemainingDays
      ? getRemainingSubscriptionDays(entitlements?.period_end)
      : null;

  if (isPremium) {
    return (
      <Link
        href={href}
        title="Xem chi tiết gói dịch vụ"
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1 text-xs font-extrabold text-amber-900 shadow-2xs transition-colors hover:from-amber-100 hover:to-orange-100"
      >
        <span aria-hidden="true" className="text-amber-600">
          ★
        </span>
        <span>{vi.plans.badgePremium}</span>
        {remainingDays !== null ? (
          <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">
            {vi.plans.daysRemainingPrefix} {remainingDays}{" "}
            {vi.plans.daysRemainingSuffix}
          </span>
        ) : (
          <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">
            Vĩnh viễn
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      title="Xem bảng giá & nâng cấp gói"
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-bold text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
    >
      <span>{vi.plans.badgeFree}</span>
      <span className="text-[11px] font-semibold text-teal-700 underline underline-offset-2">
        {vi.plans.upgradeButton}
      </span>
    </Link>
  );
}
