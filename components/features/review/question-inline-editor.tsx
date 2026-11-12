"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  convertAnswerDataForNewType,
  validateQuestionForReview,
} from "@/lib/review/validation";
import type { ReviewChoiceItem, ReviewQuestionItem } from "@/lib/review/types";
import type { QuestionType } from "@/lib/supabase/types";

export interface InlineEditDraftPayload {
  type: QuestionType;
  stem: string;
  explanation: string | null;
  topic: string | null;
  difficulty: string | null;
  choices: ReviewChoiceItem[];
  answer_text: string | null;
}

interface QuestionInlineEditorProps {
  question: ReviewQuestionItem;
  saveStatus: "idle" | "saving" | "saved" | "error" | "conflict";
  errorMessage: string | null;
  onSave: (draft: InlineEditDraftPayload, moveNext: boolean) => void;
  onCancel: () => void;
  onReloadConflict: () => void;
}

export function QuestionInlineEditor({
  question,
  saveStatus,
  errorMessage,
  onSave,
  onCancel,
  onReloadConflict,
}: QuestionInlineEditorProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const stemRef = React.useRef<HTMLTextAreaElement | null>(null);

  const [type, setType] = React.useState<QuestionType>(question.type);
  const [stem, setStem] = React.useState(question.stem);
  const [explanation, setExplanation] = React.useState(
    question.explanation ?? ""
  );
  const [topic, setTopic] = React.useState(question.topic ?? "");
  const [difficulty, setDifficulty] = React.useState(question.difficulty ?? "");
  const [choices, setChoices] = React.useState<ReviewChoiceItem[]>(() =>
    question.choices.map((c, idx) => ({ ...c, position: idx }))
  );
  const [answerText, setAnswerText] = React.useState(
    question.answer_text ?? ""
  );
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    stemRef.current?.focus();
  }, []);

  const validation = React.useMemo(
    () =>
      validateQuestionForReview({
        type,
        stem,
        choices,
        answer_text: answerText,
      }),
    [type, stem, choices, answerText]
  );

  function buildPayload(): InlineEditDraftPayload {
    return {
      type,
      stem: stem.trim(),
      explanation: explanation.trim() || null,
      topic: topic.trim() || null,
      difficulty: difficulty.trim() || null,
      choices:
        type === "mcq" || type === "true_false"
          ? choices.map((c, idx) => ({
              ...c,
              text: c.text.trim(),
              position: idx,
            }))
          : [],
      answer_text:
        type === "cloze" || type === "short_answer"
          ? answerText.trim() || null
          : null,
    };
  }

  function handleTypeChange(nextType: QuestionType) {
    const converted = convertAnswerDataForNewType({
      currentType: type,
      nextType,
      choices,
      answerText,
    });
    setType(nextType);
    setChoices(converted.choices);
    setAnswerText(converted.answerText ?? "");
    setIsDirty(true);
  }

  function handleSelectCorrectChoice(targetIdx: number) {
    setChoices((prev) =>
      prev.map((c, idx) => ({
        ...c,
        is_correct: idx === targetIdx,
      }))
    );
    setIsDirty(true);
  }

  function handleChoiceTextChange(targetIdx: number, nextText: string) {
    setChoices((prev) =>
      prev.map((c, idx) =>
        idx === targetIdx ? { ...c, text: nextText, ai_generated: false } : c
      )
    );
    setIsDirty(true);
  }

  function handleAddChoice() {
    setChoices((prev) => [
      ...prev,
      {
        text: "",
        is_correct: prev.length === 0,
        position: prev.length,
        ai_generated: false,
      },
    ]);
    setIsDirty(true);
  }

  function handleRemoveChoice(targetIdx: number) {
    setChoices((prev) =>
      prev
        .filter((_, idx) => idx !== targetIdx)
        .map((c, idx) => ({ ...c, position: idx }))
    );
    setIsDirty(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (validation.valid) {
        onSave(buildPayload(), true);
      }
    }
  }

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    const nextFocused = e.relatedTarget as Node | null;
    if (
      containerRef.current &&
      nextFocused &&
      containerRef.current.contains(nextFocused)
    ) {
      return;
    }
    if (isDirty && validation.valid && saveStatus !== "conflict") {
      onSave(buildPayload(), false);
      setIsDirty(false);
    }
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onBlur={handleContainerBlur}
      className="space-y-4 rounded-2xl border-2 border-teal-600 bg-white p-4 shadow-md sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white">
            {vi.setDetails.questionNumberPrefix} {question.orderNumber}
          </span>
          <span className="text-sm font-bold text-slate-900">
            {vi.review.editor.title}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {saveStatus === "saving" ? (
            <span className="font-semibold text-teal-700">
              {vi.review.editor.savingStatus}
            </span>
          ) : saveStatus === "saved" ? (
            <span className="font-semibold text-emerald-700">
              {vi.review.editor.savedStatus}
            </span>
          ) : saveStatus === "error" ? (
            <span className="font-semibold text-red-600">
              {errorMessage ?? vi.review.editor.errorStatus}
            </span>
          ) : null}
        </div>
      </div>

      {saveStatus === "conflict" ? (
        <div
          role="alert"
          className="flex flex-col justify-between gap-3 rounded-xl border border-amber-400 bg-amber-50 p-3.5 sm:flex-row sm:items-center"
        >
          <div className="space-y-0.5 text-xs text-amber-950">
            <div className="font-bold">{vi.review.editor.conflictTitle}</div>
            <p>{vi.review.editor.conflictDescription}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onReloadConflict}
            className="shrink-0"
          >
            {vi.review.editor.reloadQuestionButton}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">{vi.review.editor.typeLabel}</Label>
              <select
                value={type}
                onChange={(e) =>
                  handleTypeChange(e.target.value as QuestionType)
                }
                className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
              >
                <option value="mcq">{vi.parsing.questionTypes.mcq}</option>
                <option value="true_false">
                  {vi.parsing.questionTypes.true_false}
                </option>
                <option value="cloze">{vi.parsing.questionTypes.cloze}</option>
                <option value="short_answer">
                  {vi.parsing.questionTypes.short_answer}
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{vi.review.editor.topicLabel}</Label>
              <Input
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  setIsDirty(true);
                }}
                placeholder={vi.review.editor.topicPlaceholder}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                {vi.review.editor.difficultyLabel}
              </Label>
              <select
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  setIsDirty(true);
                }}
                className="flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="">{vi.review.difficulties.none}</option>
                <option value="easy">{vi.review.difficulties.easy}</option>
                <option value="medium">{vi.review.difficulties.medium}</option>
                <option value="hard">{vi.review.difficulties.hard}</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{vi.review.editor.stemLabel}</Label>
            <textarea
              ref={stemRef}
              rows={3}
              value={stem}
              onChange={(e) => {
                setStem(e.target.value);
                setIsDirty(true);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none"
            />
          </div>

          {type === "mcq" || type === "true_false" ? (
            <div className="space-y-2">
              <Label className="text-xs">{vi.review.editor.choicesLabel}</Label>
              <div className="space-y-2">
                {choices.map((c, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectCorrectChoice(idx)}
                        title={vi.review.editor.markCorrectTitle}
                        className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border text-xs font-bold transition-colors ${
                          c.is_correct
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:border-teal-500"
                        }`}
                      >
                        {letter} {c.is_correct ? "✓" : ""}
                      </button>

                      <Input
                        value={c.text}
                        onChange={(e) =>
                          handleChoiceTextChange(idx, e.target.value)
                        }
                        disabled={type === "true_false"}
                        className={`text-sm ${
                          c.is_correct
                            ? "border-emerald-400 bg-emerald-50/40 font-semibold"
                            : ""
                        }`}
                      />

                      {type === "mcq" && choices.length > 2 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveChoice(idx)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          {vi.review.editor.removeChoice}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {type === "mcq" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddChoice}
                >
                  {vi.review.editor.addChoice}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {vi.review.editor.answerTextLabel}
              </Label>
              <Input
                value={answerText}
                onChange={(e) => {
                  setAnswerText(e.target.value);
                  setIsDirty(true);
                }}
              />
              {type === "cloze" ? (
                <p className="text-xs text-slate-500">
                  {vi.review.editor.clozeHint}
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {vi.review.editor.explanationLabel}
            </Label>
            <Input
              value={explanation}
              onChange={(e) => {
                setExplanation(e.target.value);
                setIsDirty(true);
              }}
              placeholder={vi.review.editor.explanationPlaceholder}
              className="text-sm"
            />
          </div>

          {!validation.valid ? (
            <div
              role="alert"
              className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
            >
              {validation.errors.map((err, i) => (
                <p key={i}>• {err}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                {vi.review.editor.sourcePanelTitle}
              </h4>
              {question.source_ref ? (
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {question.source_ref}
                </span>
              ) : null}
            </div>
            <pre className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
              {question.raw_source_text ||
                question.source_ref ||
                vi.review.editor.noSourceAvailable}
            </pre>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              {vi.review.editor.cancel}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!validation.valid || saveStatus === "saving"}
              onClick={() => onSave(buildPayload(), false)}
            >
              {vi.review.editor.saveOnly}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={!validation.valid || saveStatus === "saving"}
              onClick={() => onSave(buildPayload(), true)}
            >
              {vi.review.editor.saveAndNext}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

