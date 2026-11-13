"use client";

import * as React from "react";
import Link from "next/link";
import type { BuiltPrintExamPackage } from "@/lib/export/types";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";

interface PrintExamPreviewWorkspaceProps {
  examId: string;
  setId: string | null;
  pkg: BuiltPrintExamPackage;
}

type PreviewTab = "papers" | "answers" | "crossref";

export function PrintExamPreviewWorkspace({
  examId,
  setId,
  pkg,
}: PrintExamPreviewWorkspaceProps) {
  const [activeTab, setActiveTab] = React.useState<PreviewTab>("papers");
  const [selectedVersion, setSelectedVersion] = React.useState<string>("all");

  const versionsToRender = React.useMemo(() => {
    if (selectedVersion === "all") {
      return pkg.versions;
    }
    return pkg.versions.filter((v) => v.versionCode === selectedVersion);
  }, [pkg.versions, selectedVersion]);

  function handlePrintPdf() {
    window.print();
  }

  return (
    <div data-space="workspace" className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Thanh điều hướng và công cụ tải file (ẩn khi in PDF) */}
      <div className="no-print space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {setId ? (
              <Link
                href={`/dashboard/sets/${setId}`}
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                {vi.printExam.previewPage.backToSet}
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="text-xs font-semibold text-teal-700 hover:underline"
              >
                {vi.printExam.previewPage.backToDashboard}
              </Link>
            )}
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {vi.printExam.previewPage.pageTitlePrefix} {pkg.header.examName}
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              {pkg.versions.length} {vi.printExam.versionCountBadgeSuffix} (
              {pkg.versions.map((v) => v.versionCode).join(", ")}) •{" "}
              {pkg.originalQuestions.length} câu hỏi • Thang điểm{" "}
              {pkg.totalPoints} • Seed:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                {pkg.seed}
              </code>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/exams/${examId}/docx?type=papers`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-teal-700 sm:text-sm"
            >
              {vi.printExam.previewPage.downloadAllPapersDocx}
            </a>

            <a
              href={`/api/exams/${examId}/docx?type=answers`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-sm"
            >
              {vi.printExam.previewPage.downloadAnswerKeyDocx}
            </a>

            <Button
              type="button"
              variant="secondary"
              onClick={handlePrintPdf}
              className="min-h-[44px] text-xs font-bold sm:text-sm"
            >
              {vi.printExam.previewPage.printPdfButton}
            </Button>
          </div>
        </div>

        {/* Tải riêng từng mã đề Word (.docx) */}
        {pkg.versions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
            <span className="font-semibold text-slate-600">
              Tải lẻ từng mã đề (.docx):
            </span>
            {pkg.versions.map((ver) => (
              <a
                key={ver.versionCode}
                href={`/api/exams/${examId}/docx?type=papers&version=${ver.versionCode}`}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-mono font-bold text-slate-800 hover:border-teal-400 hover:bg-teal-50"
              >
                {vi.printExam.previewPage.downloadSinglePaperPrefix}{" "}
                {ver.versionCode}
              </a>
            ))}
          </div>
        ) : null}

        {/* Thanh chuyển Tab xem trước */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["papers", vi.printExam.previewPage.tabPapers],
                ["answers", vi.printExam.previewPage.tabAnswerKey],
                ["crossref", vi.printExam.previewPage.tabCrossReference],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`min-h-[40px] cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                  activeTab === tabKey
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "papers" && pkg.versions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedVersion("all")}
                className={`min-h-[36px] cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  selectedVersion === "all"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {vi.printExam.previewPage.filterVersionAll}
              </button>
              {pkg.versions.map((ver) => (
                <button
                  key={ver.versionCode}
                  type="button"
                  onClick={() => setSelectedVersion(ver.versionCode)}
                  className={`min-h-[36px] cursor-pointer rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                    selectedVersion === ver.versionCode
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {ver.versionCode}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* TAB 1: ĐỀ THI & PHIẾU TRẢ LỜI (CHUẨN A4) */}
      {activeTab === "papers" ? (
        <div className="space-y-8 print:space-y-0">
          {versionsToRender.map((ver, verIdx) => {
            const halfCount = Math.ceil(ver.questions.length / 2);
            return (
              <section
                key={ver.versionCode}
                className={`mx-auto max-w-[210mm] rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none ${
                  verIdx > 0 ? "print-page-break" : ""
                }`}
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                }}
              >
                {/* Đầu đề chuẩn A4 */}
                <div className="grid grid-cols-12 items-center gap-4 border-b-2 border-black pb-3">
                  <div className="col-span-8 text-center">
                    {pkg.header.schoolName ? (
                      <p className="text-xs font-bold uppercase tracking-wide">
                        {pkg.header.schoolName}
                      </p>
                    ) : null}
                    <h2 className="mt-0.5 text-base font-bold uppercase sm:text-lg">
                      {pkg.header.examName}
                    </h2>
                    {(pkg.header.subject || pkg.header.className) ? (
                      <p className="mt-0.5 text-sm font-bold">
                        {[
                          pkg.header.subject
                            ? `${vi.printExam.subjectLabel}: ${pkg.header.subject}`
                            : null,
                          pkg.header.className,
                        ]
                          .filter(Boolean)
                          .join(" — ")}
                      </p>
                    ) : null}
                    {pkg.header.durationMinutes ? (
                      <p className="text-xs italic">
                        {vi.printExam.previewPage.durationPrefix}{" "}
                        {pkg.header.durationMinutes}{" "}
                        {vi.printExam.previewPage.minutesUnit}
                      </p>
                    ) : null}
                  </div>

                  <div className="col-span-4 rounded border-2 border-black p-2.5 text-center">
                    <p className="text-base font-extrabold tracking-wider sm:text-lg">
                      {vi.printExam.previewPage.examCodeBoxPrefix}{" "}
                      {ver.versionCode}
                    </p>
                    <p className="mt-0.5 text-[11px] italic">
                      {vi.printExam.previewPage.noMaterialsNotice}
                    </p>
                  </div>
                </div>

                {/* Dòng Họ và tên / Lớp / SBD */}
                <div className="border-b border-black py-2.5 text-sm">
                  {pkg.header.studentInfoLine ||
                    vi.printExam.studentInfoLineDefault}
                </div>

                {/* Danh sách câu hỏi đã đánh số lại 1..N */}
                <div className="mt-4 space-y-3.5 text-[12pt] leading-relaxed">
                  <p className="font-bold uppercase">
                    {vi.printExam.previewPage.sectionQuestionsTitle}
                  </p>

                  {ver.questions.map((q) => (
                    <div
                      key={q.examQuestionId}
                      className="print-avoid-break space-y-1.5"
                    >
                      <p className="whitespace-pre-wrap">
                        <strong className="font-bold">
                          {vi.printExam.previewPage.questionPrefix}{" "}
                          {q.displayNumber} ({q.points}{" "}
                          {vi.printExam.previewPage.pointsSuffix}):
                        </strong>{" "}
                        {q.displayStem}
                      </p>

                      {q.type === "mcq" ? (
                        <div className="grid grid-cols-1 gap-x-6 gap-y-1 pl-4 sm:grid-cols-2">
                          {q.choices.map((ch) => (
                            <div key={ch.choiceId}>
                              <strong className="font-bold">
                                {ch.label}.
                              </strong>{" "}
                              {ch.text}
                            </div>
                          ))}
                        </div>
                      ) : q.type === "true_false" ? (
                        <div className="flex gap-10 pl-4 font-bold">
                          <span>A. {vi.printExam.previewPage.trueLabel}</span>
                          <span>B. {vi.printExam.previewPage.falseLabel}</span>
                        </div>
                      ) : q.type === "short_answer" ? (
                        <div className="space-y-2 pl-4 pt-1">
                          {Array.from({ length: q.shortAnswerLines }).map(
                            (_, lineIdx) => (
                              <div
                                key={lineIdx}
                                className="border-b border-dotted border-black pt-4"
                              />
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <p className="my-5 text-center text-sm font-bold">
                  {vi.printExam.previewPage.endOfPaperNotice}
                </p>

                {/* Phiếu trả lời trắc nghiệm & tự luận ngắn */}
                <div className="print-avoid-break mt-6 border-t-2 border-black pt-4">
                  <h3 className="text-center text-sm font-bold uppercase">
                    {vi.printExam.previewPage.answerSheetTitle} —{" "}
                    {vi.printExam.previewPage.examCodeBoxPrefix}{" "}
                    {ver.versionCode}
                  </h3>
                  <p className="mt-1 text-center text-xs italic">
                    {vi.printExam.previewPage.answerSheetInstruction}
                  </p>

                  <table className="mt-3 w-full border-collapse border border-black text-xs">
                    <thead>
                      <tr className="bg-slate-100 print:bg-transparent">
                        <th className="w-[10%] border border-black py-1.5 text-center font-bold">
                          {vi.printExam.previewPage.answerSheetColQuestion}
                        </th>
                        <th className="w-[40%] border border-black py-1.5 text-center font-bold">
                          {vi.printExam.previewPage.answerSheetColAnswer}
                        </th>
                        <th className="w-[10%] border border-black py-1.5 text-center font-bold">
                          {vi.printExam.previewPage.answerSheetColQuestion}
                        </th>
                        <th className="w-[40%] border border-black py-1.5 text-center font-bold">
                          {vi.printExam.previewPage.answerSheetColAnswer}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: halfCount }).map((_, rIdx) => {
                        const leftQ = ver.questions[rIdx];
                        const rightQ = ver.questions[rIdx + halfCount];

                        function renderCellBubble(
                          item: typeof leftQ | undefined
                        ) {
                          if (!item) return null;
                          if (item.type === "mcq") {
                            return (
                              <div className="flex justify-center gap-4 font-semibold">
                                {item.choices.map((c) => (
                                  <span
                                    key={c.choiceId}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black text-[11px]"
                                  >
                                    {c.label}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          if (item.type === "true_false") {
                            return (
                              <div className="flex justify-center gap-6 font-semibold">
                                <span>
                                  ◯ {vi.printExam.previewPage.trueLabel}
                                </span>
                                <span>
                                  ◯ {vi.printExam.previewPage.falseLabel}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="px-2 text-left text-slate-400">
                              ................................................
                            </div>
                          );
                        }

                        return (
                          <tr key={rIdx}>
                            <td className="border border-black py-1.5 text-center font-bold">
                              {leftQ ? leftQ.displayNumber : ""}
                            </td>
                            <td className="border border-black px-2 py-1.5 text-center">
                              {renderCellBubble(leftQ)}
                            </td>
                            <td className="border border-black py-1.5 text-center font-bold">
                              {rightQ ? rightQ.displayNumber : ""}
                            </td>
                            <td className="border border-black px-2 py-1.5 text-center">
                              {renderCellBubble(rightQ)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {/* TAB 2: ĐÁP ÁN & BIỂU ĐIỂM (TRANG RIÊNG CHO GIÁO VIÊN) */}
      {activeTab === "answers" ? (
        <section
          className="mx-auto max-w-[210mm] space-y-6 rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none"
          style={{
            fontFamily: '"Times New Roman", Times, serif',
          }}
        >
          <div className="border-b-2 border-black pb-3 text-center">
            <h2 className="text-lg font-bold uppercase">
              {vi.printExam.previewPage.answerKeyMainTitle}
            </h2>
            <p className="mt-0.5 text-base font-bold uppercase">
              {pkg.header.examName}
            </p>
            <p className="mt-1 text-xs italic">
              {vi.printExam.previewPage.answerKeySubtitle}
            </p>
          </div>

          <div className="space-y-6">
            {pkg.versions.map((ver) => (
              <div
                key={ver.versionCode}
                className="print-avoid-break rounded-xl border border-black p-4"
              >
                <div className="flex items-center justify-between border-b border-black pb-2">
                  <h3 className="text-base font-extrabold">
                    {vi.printExam.previewPage.examCodeBoxPrefix}{" "}
                    {ver.versionCode}
                  </h3>
                  <span className="text-xs font-bold">
                    Thang điểm: {pkg.totalPoints}{" "}
                    {vi.printExam.previewPage.pointsSuffix}
                  </span>
                </div>

                {/* Bảng lưới đáp án nhanh */}
                <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {ver.questions.map((q) => (
                    <div
                      key={q.examQuestionId}
                      className="rounded border border-slate-300 px-2 py-1 text-center text-xs"
                    >
                      <span className="font-bold">{q.displayNumber}.</span>{" "}
                      <strong className="font-extrabold text-emerald-800 print:text-black">
                        {q.correctAnswerDisplay}
                      </strong>
                    </div>
                  ))}
                </div>

                {/* Giải thích và đáp án tự luận/điền khuyết */}
                <div className="mt-4 space-y-1.5 text-xs">
                  <p className="font-bold italic">
                    {vi.printExam.previewPage.answerKeyDetailTitle}
                  </p>
                  {ver.questions.map((q) => (
                    <div key={q.examQuestionId} className="leading-relaxed">
                      <strong>
                        {vi.printExam.previewPage.questionPrefix}{" "}
                        {q.displayNumber} ({q.points}đ — Gốc #{q.originalNumber}
                        ):
                      </strong>{" "}
                      <span className="font-bold">
                        {q.correctAnswerDisplay}
                      </span>
                      {q.acceptedVariants.length > 0 ? (
                        <span className="italic">
                          {" "}
                          ({vi.printExam.previewPage.acceptedVariantsPrefix}{" "}
                          {q.acceptedVariants.join(", ")})
                        </span>
                      ) : null}
                      {q.explanation ? (
                        <span className="text-slate-700 print:text-black">
                          {" "}
                          — {vi.printExam.previewPage.explanationPrefix}{" "}
                          {q.explanation}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* TAB 3: BẢNG ĐỐI CHIẾU CÂU GỐC ↔ MÃ ĐỀ */}
      {activeTab === "crossref" ? (
        <section
          className="mx-auto max-w-[210mm] space-y-4 rounded-2xl border border-slate-300 bg-white p-6 text-black shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none"
          style={{
            fontFamily: '"Times New Roman", Times, serif',
          }}
        >
          <div className="border-b-2 border-black pb-3 text-center">
            <h2 className="text-lg font-bold uppercase">
              {vi.printExam.previewPage.crossRefTitle}
            </h2>
            <p className="mt-1 text-xs italic">
              {vi.printExam.previewPage.crossRefSubtitle}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-xs">
              <thead>
                <tr className="bg-slate-100 print:bg-transparent">
                  <th className="border border-black px-2 py-2 text-center font-bold">
                    {vi.printExam.previewPage.crossRefOriginalCol}
                  </th>
                  <th className="border border-black px-2 py-2 text-left font-bold">
                    {vi.printExam.previewPage.crossRefStemCol}
                  </th>
                  {pkg.versions.map((ver) => (
                    <th
                      key={ver.versionCode}
                      className="border border-black px-2 py-2 text-center font-bold"
                    >
                      {vi.printExam.previewPage.crossRefVersionColPrefix}{" "}
                      {ver.versionCode}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pkg.crossReference.map((row) => (
                  <tr key={row.examQuestionId} className="print-avoid-break">
                    <td className="border border-black px-2 py-1.5 text-center font-bold">
                      #{row.originalNumber}
                    </td>
                    <td className="border border-black px-2 py-1.5">
                      {row.stemPreview}
                    </td>
                    {pkg.versions.map((ver) => {
                      const cell = row.byVersion[ver.versionCode];
                      return (
                        <td
                          key={ver.versionCode}
                          className="border border-black px-2 py-1.5 text-center font-semibold"
                        >
                          {cell
                            ? `${vi.printExam.previewPage.questionPrefix} ${cell.displayNumber} (${cell.correctAnswerDisplay})`
                            : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

