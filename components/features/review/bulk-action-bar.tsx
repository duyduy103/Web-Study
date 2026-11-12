"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuestionType } from "@/lib/supabase/types";

interface BulkActionBarProps {
  filteredTotal: number;
  selectedCount: number;
  allFilteredSelected: boolean;
  isMutating: boolean;
  onToggleSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onBulkApproveSelected: () => void;
  onBulkArchiveSelected: () => void;
  onBulkAssignTopic: (topic: string) => void;
  onBulkAssignDifficulty: (difficulty: string | null) => void;
  onBulkChangeType: (nextType: QuestionType) => void;
}

export function BulkActionBar({
  filteredTotal,
  selectedCount,
  allFilteredSelected,
  isMutating,
  onToggleSelectAllFiltered,
  onClearSelection,
  onBulkApproveSelected,
  onBulkArchiveSelected,
  onBulkAssignTopic,
  onBulkAssignDifficulty,
  onBulkChangeType,
}: BulkActionBarProps) {
  const [topicInput, setTopicInput] = React.useState("");
  const [difficultySelect, setDifficultySelect] = React.useState<string>("");
  const [typeSelect, setTypeSelect] = React.useState<string>("");

  if (filteredTotal === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs font-semibold text-slate-800 sm:text-sm">
          <input
            type="checkbox"
            checked={allFilteredSelected && filteredTotal > 0}
            onChange={onToggleSelectAllFiltered}
            className="h-4 w-4 rounded border-slate-300 text-teal-600"
          />
          <span>
            {vi.review.actions.selectAllInFilter} ({filteredTotal})
          </span>
        </label>

        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-900">
              {vi.review.actions.selectedCountPrefix} {selectedCount}{" "}
              {vi.review.actions.selectedCountUnit}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              {vi.review.actions.clearSelection}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 sm:hidden">
            {vi.review.mobileSwipe.hint}
          </p>
        )}
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isMutating}
              onClick={onBulkApproveSelected}
            >
              ✓ {vi.review.actions.bulkApproveSelected} ({selectedCount})
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={onBulkArchiveSelected}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              ✕ {vi.review.actions.bulkArchiveSelected}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder={vi.review.actions.bulkTopicPlaceholder}
                className="h-11 w-40 text-xs sm:w-44"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isMutating || !topicInput.trim()}
                onClick={() => {
                  onBulkAssignTopic(topicInput.trim());
                  setTopicInput("");
                }}
              >
                {vi.review.actions.bulkApplyTopic}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={difficultySelect}
                onChange={(e) => setDifficultySelect(e.target.value)}
                aria-label={vi.review.actions.bulkDifficultyPlaceholder}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="">
                  {vi.review.actions.bulkDifficultyPlaceholder}
                </option>
                <option value="easy">{vi.review.difficulties.easy}</option>
                <option value="medium">{vi.review.difficulties.medium}</option>
                <option value="hard">{vi.review.difficulties.hard}</option>
                <option value="none">{vi.review.difficulties.none}</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isMutating || !difficultySelect}
                onClick={() => {
                  onBulkAssignDifficulty(
                    difficultySelect === "none" ? null : difficultySelect
                  );
                  setDifficultySelect("");
                }}
              >
                {vi.review.actions.bulkApplyDifficulty}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={typeSelect}
                onChange={(e) => setTypeSelect(e.target.value)}
                aria-label={vi.review.actions.bulkChangeTypePlaceholder}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="">
                  {vi.review.actions.bulkChangeTypePlaceholder}
                </option>
                <option value="mcq">{vi.parsing.questionTypes.mcq}</option>
                <option value="true_false">
                  {vi.parsing.questionTypes.true_false}
                </option>
                <option value="cloze">{vi.parsing.questionTypes.cloze}</option>
                <option value="short_answer">
                  {vi.parsing.questionTypes.short_answer}
                </option>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isMutating || !typeSelect}
                onClick={() => {
                  onBulkChangeType(typeSelect as QuestionType);
                  setTypeSelect("");
                }}
              >
                {vi.review.actions.bulkApplyChangeType}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

