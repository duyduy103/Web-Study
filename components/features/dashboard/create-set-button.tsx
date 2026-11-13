import Link from "next/link";
import { vi } from "@/lib/i18n/vi";

export function CreateSetButton() {
  return (
    <Link
      href="/dashboard/sets/new"
      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--space-accent)] text-[var(--space-accent-fg)] px-6 py-3 text-base font-bold shadow-md transition-transform hover:brightness-110 active:brightness-95 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--space-accent)] focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        +
      </span>
      <span>{vi.dashboard.createSetButton}</span>
    </Link>
  );
}
