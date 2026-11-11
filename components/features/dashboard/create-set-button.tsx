import Link from "next/link";
import { vi } from "@/lib/i18n/vi";

export function CreateSetButton() {
  return (
    <Link
      href="/dashboard/sets/new"
      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-base font-medium text-white shadow-xs transition-colors hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        +
      </span>
      <span>{vi.dashboard.createSetButton}</span>
    </Link>
  );
}
