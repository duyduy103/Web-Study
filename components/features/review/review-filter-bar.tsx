"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConfidenceTier, ReviewFilterState } from "@/lib/review/types";
import type { QuestionStatus } from "@/lib/supabase/types";

interface ReviewFilterBarProps {
  filter: ReviewFilterState;
  needsCheckCount: number;
  greenEligibleCount: number;
  undoCount: number;
  redoCount: number;
  isMutating: boolean;
  onFilterChange: (next: ReviewFilterState) => void;
  onOpenGreenModal: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenShortcuts: () => void;
}

export function ReviewFilterBar({
  filter,
  needsCheckCount,
  greenEligibleCount,
  undoCount,
  redoCount,
  isMutating,
  onFilterChange,
  onOpenGreenModal,
  onUndo,
  onRedo,
  onOpenShortcuts,
}: ReviewFilterBarProps) {
  function toggleConfidence(tier: ConfidenceTier) {
    const exists = filter.confidenceTiers.includes(tier);
    const nextTiers = exists
      ? filter.confidenceTiers.filter((t) => t !== tier)
      : [...filter.confidenceTiers, tier];
    onFilterChange({
      ...filter,
      needsCheckPreset: false,
      confidenceTiers: nextTiers,
    });
  }

  function toggleStatus(status: QuestionStatus) {
    const exists = filter.statuses.includes(status);
    const nextStatuses = exists
      ? filter.statuses.filter((s) => s !== status)
      : [...filter.statuses, status];
    onFilterChange({
      ...filter,
      needsCheckPreset: false,
      statuses: nextStatuses,
    });
  }

  function resetToAll() {
    onFilterChange({
      needsCheckPreset: false,
      confidenceTiers: [],
      statuses: [],
      aiOnly: false,
      warningsOnly: false,
      searchQuery: "",
    });
  }

  function activateNeedsCheck() {
    onFilterChange({
      needsCheckPreset: true,
      confidenceTiers: [],
      statuses: [],
      aiOnly: false,
      warningsOnly: false,
      searchQuery: filter.searchQuery,
    });
  }

  const isAllActive =
    !filter.needsCheckPreset &&
    filter.confidenceTiers.length === 0 &&
    filter.statuses.length === 0 &&
    !filter.aiOnly &&
    !filter.warningsOnly &&
    filter.searchQuery.trim() === "";

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={activateNeedsCheck}
            className={`min-h-[44px] cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
              filter.needsCheckPreset
                ? "border-amber-500 bg-amber-500 text-white shadow-2xs"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
          >
            {vi.review.filters.needsCheck} ({needsCheckCount})
          </button>

          <button
            type="button"
            onClick={resetToAll}
            className={`min-h-[44px] cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
              isAllActive
                ? "border-teal-600 bg-teal-600 text-white shadow-2xs"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {vi.review.filters.all}
          </button>

          <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" />

          {(["high", "medium", "low"] as const).map((tier) => {
            const active = filter.confidenceTiers.includes(tier);
            const label = vi.review.filters[tier];
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={active}
                onClick={() => toggleConfidence(tier)}
                className={`min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
                  active
                    ? "border-teal-600 bg-teal-50 font-bold text-teal-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            );
          })}

          <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" />

          {(["draft", "approved", "archived"] as const).map((st) => {
            const active = filter.statuses.includes(st);
            const label = vi.review.filters[st];
            return (
              <button
                key={st}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(st)}
                className={`min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
                  active
                    ? "border-teal-600 bg-teal-50 font-bold text-teal-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            aria-pressed={filter.aiOnly}
            onClick={() =>
              onFilterChange({
                ...filter,
                needsCheckPreset: false,
                aiOnly: !filter.aiOnly,
              })
            }
            className={`min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
              filter.aiOnly
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {vi.review.filters.aiOnly}
          </button>

          <button
            type="button"
            aria-pressed={filter.warningsOnly}
            onClick={() =>
              onFilterChange({
                ...filter,
                needsCheckPreset: false,
                warningsOnly: !filter.warningsOnly,
              })
            }
            className={`min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
              filter.warningsOnly
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {vi.review.filters.warningsOnly}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isMutating}
            onClick={onOpenGreenModal}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            ✓ {vi.review.actions.bulkApproveGreen} ({greenEligibleCount})
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={undoCount === 0 || isMutating}
            onClick={onUndo}
            title="Ctrl+Z"
          >
            ↶ {vi.review.actions.undo} {undoCount > 0 ? `(${undoCount})` : ""}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={redoCount === 0 || isMutating}
            onClick={onRedo}
            title="Ctrl+Y"
          >
            ↷ {vi.review.actions.redo} {redoCount > 0 ? `(${redoCount})` : ""}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenShortcuts}
            aria-label={vi.review.actions.shortcutsHelpButton}
          >
            {vi.review.actions.shortcutsHelpButton}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            type="search"
            value={filter.searchQuery}
            onChange={(e) =>
              onFilterChange({ ...filter, searchQuery: e.target.value })
            }
            placeholder={vi.review.filters.searchPlaceholder}
            aria-label={vi.review.filters.searchPlaceholder}
          />
        </div>
        {!isAllActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetToAll}
            className="shrink-0"
          >
            {vi.review.filters.clearFilters}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

