"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { vi } from "@/lib/i18n/vi";

export function CreateSetButton() {
  const [showNotice, setShowNotice] = React.useState(false);

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        type="button"
        size="lg"
        onClick={() => setShowNotice(true)}
        className="w-full sm:w-auto"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
        <span>{vi.dashboard.createSetButton}</span>
      </Button>

      {showNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900 shadow-2xs"
        >
          <span>{vi.dashboard.comingSoonToast}</span>
          <button
            type="button"
            onClick={() => setShowNotice(false)}
            aria-label={vi.common.closeNotification}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg text-teal-700 hover:bg-teal-100"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

