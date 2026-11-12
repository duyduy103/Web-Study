"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColumnMappingEditor } from "@/components/features/import/column-mapping-editor";
import { PreviewPanel } from "@/components/features/import/preview-panel";
import { AiAssistPanel } from "@/components/features/import/ai-assist-panel";
import type {
  DocumentFormat,
  ParsedQuestion,
  SpreadsheetColumnMapping,
} from "@/lib/parsing/types";
import type {
  ImportSetResult,
  PreviewResponsePayload,
} from "@/lib/sets/import-service";

export function ImportSetForm() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [grade, setGrade] = React.useState("");

  const [activeTab, setActiveTab] = React.useState<"upload" | "paste">("upload");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [pastedText, setPastedText] = React.useState("");

  const [preview, setPreview] = React.useState<PreviewResponsePayload | null>(
    null
  );
  const [selectedFormat, setSelectedFormat] =
    React.useState<DocumentFormat>("mcq_inline");
  const [columnMapping, setColumnMapping] = React.useState<
    SpreadsheetColumnMapping | undefined
  >(undefined);

  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [duplicateSet, setDuplicateSet] = React.useState<{
    id: string;
    title: string;
    createdAt: string;
  } | null>(null);

  const runPreview = React.useCallback(
    async (params: {
      file: File | null;
      text: string;
      overrideFormat?: DocumentFormat;
      mapping?: SpreadsheetColumnMapping;
    }) => {
      if (!params.file && !params.text.trim()) {
        setPreview(null);
        return;
      }

      setIsAnalyzing(true);
      setErrorMessage(null);

      try {
        const formData = new FormData();
        if (params.file) {
          formData.append("file", params.file);
        } else {
          formData.append("pastedText", params.text);
        }
        if (params.overrideFormat) {
          formData.append("overrideFormat", params.overrideFormat);
        }
        if (params.mapping) {
          formData.append("columnMapping", JSON.stringify(params.mapping));
        }

        const res = await fetch("/api/sets/preview", {
          method: "POST",
          body: formData,
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          const errObj = data as { error?: string };
          throw new Error(errObj.error ?? vi.importSet.errors.previewFailed);
        }

        const payload = data as PreviewResponsePayload;
        setPreview(payload);
        setSelectedFormat(payload.detectedFormat.format);
        if (payload.spreadsheetMapping) {
          setColumnMapping(payload.spreadsheetMapping);
        }
      } catch (err) {
        setPreview(null);
        setErrorMessage(
          err instanceof Error ? err.message : vi.importSet.errors.previewFailed
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    []
  );

  function handleFileSelected(file: File | null) {
    setSelectedFile(file);
    setDuplicateSet(null);
    setColumnMapping(undefined);
    if (file) {
      if (!title.trim()) {
        const defaultName = file.name.replace(/\.[^/.]+$/, "");
        setTitle(defaultName);
      }
      void runPreview({ file, text: "" });
    } else {
      setPreview(null);
    }
  }

  function handleFormatOverride(nextFormat: DocumentFormat) {
    setSelectedFormat(nextFormat);
    void runPreview({
      file: activeTab === "upload" ? selectedFile : null,
      text: activeTab === "paste" ? pastedText : "",
      overrideFormat: nextFormat,
      mapping: columnMapping,
    });
  }

  function handleMappingChange(nextMapping: SpreadsheetColumnMapping) {
    setColumnMapping(nextMapping);
    void runPreview({
      file: activeTab === "upload" ? selectedFile : null,
      text: activeTab === "paste" ? pastedText : "",
      overrideFormat: selectedFormat,
      mapping: nextMapping,
    });
  }

  function handleAiQuestionsUpdated(
    nextQuestions: ParsedQuestion[],
    nextRemainingQuota?: number
  ) {
    if (!preview) return;
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const q of nextQuestions) {
      if (q.confidence >= 0.8) high++;
      else if (q.confidence >= 0.5) medium++;
      else low++;
    }

    setPreview({
      ...preview,
      totalQuestions: nextQuestions.length,
      confidenceCounts: { high, medium, low },
      previewQuestions: nextQuestions.slice(0, 3),
      allQuestions: nextQuestions,
      aiSuggested: false,
      estimatedAiCallsFixLow: Math.ceil((medium + low) / 25),
      remainingAiQuota: nextRemainingQuota ?? preview.remainingAiQuota,
    });
  }

  async function submitImport(forceDuplicate = false) {
    if (!title.trim()) {
      setErrorMessage(vi.importSet.validation.titleRequired);
      return;
    }

    const fileToUse = activeTab === "upload" ? selectedFile : null;
    const textToUse = activeTab === "paste" ? pastedText : "";

    if (!fileToUse && !textToUse.trim()) {
      setErrorMessage(vi.importSet.validation.sourceRequired);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      if (subject.trim()) formData.append("subject", subject.trim());
      if (grade.trim()) formData.append("grade", grade.trim());
      if (selectedFormat) formData.append("overrideFormat", selectedFormat);
      if (columnMapping) {
        formData.append("columnMapping", JSON.stringify(columnMapping));
      }
      if (preview && preview.allQuestions.length > 0) {
        formData.append(
          "preParsedQuestions",
          JSON.stringify(preview.allQuestions)
        );
      }
      if (forceDuplicate) {
        formData.append("forceDuplicate", "true");
      }
      if (fileToUse) {
        formData.append("file", fileToUse);
      } else {
        formData.append("pastedText", textToUse);
      }

      const res = await fetch("/api/sets/import", {
        method: "POST",
        body: formData,
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.importSet.errors.saveFailed);
      }

      const result = data as ImportSetResult;
      if (result.status === "duplicate") {
        setDuplicateSet(result.existingSet);
        setIsSubmitting(false);
        return;
      }

      router.push(`/dashboard/sets/${result.setId}`);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : vi.importSet.errors.saveFailed
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMessage}
        </div>
      ) : null}

      {duplicateSet ? (
        <div
          role="dialog"
          aria-labelledby="dup-title"
          className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-xs"
        >
          <h3 id="dup-title" className="text-base font-bold text-amber-950">
            {vi.importSet.duplicateModal.title}
          </h3>
          <p className="text-sm text-amber-900">
            {vi.importSet.duplicateModal.descriptionPrefix}{" "}
            <strong>&ldquo;{duplicateSet.title}&rdquo;</strong>.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              onClick={() => router.push(`/dashboard/sets/${duplicateSet.id}`)}
            >
              {vi.importSet.duplicateModal.openExistingButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => void submitImport(true)}
            >
              {vi.importSet.duplicateModal.createCopyButton}
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {vi.importSet.metadataSectionTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="set-title">{vi.importSet.titleLabel}</Label>
            <Input
              id="set-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={vi.importSet.titlePlaceholder}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="set-subject">{vi.importSet.subjectLabel}</Label>
            <Input
              id="set-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={vi.importSet.subjectPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-grade">{vi.importSet.gradeLabel}</Label>
            <Input
              id="set-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder={vi.importSet.gradePlaceholder}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-lg">
            {vi.importSet.sourceSectionTitle}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeTab === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("upload");
                setPreview(null);
              }}
            >
              {vi.importSet.tabUploadFile}
            </Button>
            <Button
              type="button"
              variant={activeTab === "paste" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("paste");
                setPreview(null);
              }}
            >
              {vi.importSet.tabPasteText}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {activeTab === "upload" ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFileSelected(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/30 px-4 py-10 text-center transition-colors hover:bg-teal-50/60"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) =>
                  handleFileSelected(e.target.files?.[0] ?? null)
                }
              />
              <p className="text-sm font-semibold text-slate-900">
                {selectedFile
                  ? `${vi.importSet.selectedFilePrefix} ${selectedFile.name}`
                  : vi.importSet.dropzoneTitle}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {vi.importSet.dropzoneSubtitle}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="paste-area">{vi.importSet.pasteLabel}</Label>
              <textarea
                id="paste-area"
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={vi.importSet.pastePlaceholder}
                className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 focus-visible:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={isAnalyzing || !pastedText.trim()}
                onClick={() =>
                  void runPreview({ file: null, text: pastedText })
                }
              >
                {isAnalyzing
                  ? vi.importSet.analyzingStatus
                  : vi.importSet.analyzeTextButton}
              </Button>
            </div>
          )}

          <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-800">
                {vi.importSet.templatesTitle}
              </p>
              <p className="text-slate-600">{vi.importSet.templateHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/templates/mau-de-cuong.docx"
                download
                className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-teal-700 hover:bg-slate-50"
              >
                {vi.importSet.templateWordLink}
              </a>
              <a
                href="/templates/mau-cau-hoi.xlsx"
                download
                className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-teal-700 hover:bg-slate-50"
              >
                {vi.importSet.templateExcelLink}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAnalyzing ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          {vi.importSet.analyzingStatus}
        </div>
      ) : null}

      {preview?.isSpreadsheet &&
      preview.spreadsheetHeaders &&
      columnMapping ? (
        <ColumnMappingEditor
          headers={preview.spreadsheetHeaders}
          mapping={columnMapping}
          onChange={handleMappingChange}
        />
      ) : null}

      {preview && !preview.isSpreadsheet ? (
        <AiAssistPanel
          preview={preview}
          selectedFile={activeTab === "upload" ? selectedFile : null}
          pastedText={activeTab === "paste" ? pastedText : ""}
          onQuestionsUpdated={handleAiQuestionsUpdated}
        />
      ) : null}

      {preview ? (
        <PreviewPanel
          preview={preview}
          selectedFormat={selectedFormat}
          onFormatChange={handleFormatOverride}
        />
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          disabled={isSubmitting || isAnalyzing}
          onClick={() => void submitImport(false)}
          className="w-full sm:w-auto"
        >
          {isSubmitting
            ? vi.importSet.submittingButton
            : vi.importSet.submitButton}
        </Button>
      </div>
    </div>
  );
}
