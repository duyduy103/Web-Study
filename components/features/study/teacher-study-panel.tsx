"use client";

import * as React from "react";
import Link from "next/link";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { generateQrCodeSvg } from "@/lib/grading/qr-and-csv";

interface TeacherStudyStatsData {
  learner_count: number;
  total_reviews: number;
  average_retention_rate: number;
  question_stats: Array<{
    question_id: string;
    stem: string;
    topic: string | null;
    type: string;
    total_lapses: number;
    leech_learners_count: number;
    again_reviews_count: number;
    total_reviews_count: number;
  }>;
  learners: Array<{
    learner_id: string;
    nickname: string;
    last_studied_at: string;
    cards_learned: number;
    leech_count: number;
  }>;
}

interface TeacherStudyPanelProps {
  setId: string;
  initialStudyEnabled: boolean;
  initialStudyCode: string | null;
  activeTab: "questions" | "study_stats";
  onChangeTab: (tab: "questions" | "study_stats") => void;
}

export function TeacherStudyPanel({
  setId,
  initialStudyEnabled,
  initialStudyCode,
  activeTab,
  onChangeTab,
}: TeacherStudyPanelProps) {
  const [studyEnabled, setStudyEnabled] = React.useState(initialStudyEnabled);
  const [studyCode, setStudyCode] = React.useState<string | null>(
    initialStudyCode
  );
  const [isToggling, setIsToggling] = React.useState(false);
  const [copiedType, setCopiedType] = React.useState<"code" | "link" | null>(
    null
  );

  const [stats, setStats] = React.useState<TeacherStudyStatsData | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(false);

  const configuredBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? ""
  ).replace(/\/+$/, "");
  const studyPath = studyCode ? `/study/${studyCode}` : "";
  const fullStudyUrl =
    studyPath && configuredBaseUrl
      ? `${configuredBaseUrl}${studyPath}`
      : studyPath;

  const qrSvg = React.useMemo(
    () => (fullStudyUrl ? generateQrCodeSvg(fullStudyUrl) : ""),
    [fullStudyUrl]
  );

  React.useEffect(() => {
    if (activeTab === "study_stats") {
      setIsLoadingStats(true);
      fetch(`/api/sets/${setId}/study`)
        .then((res) => res.json())
        .then((data: unknown) => {
          const parsed = data as TeacherStudyStatsData & { error?: string };
          if (!parsed.error) {
            setStats(parsed);
          }
        })
        .catch(() => {
          // Bỏ qua lỗi mạng tạm thời
        })
        .finally(() => {
          setIsLoadingStats(false);
        });
    }
  }, [activeTab, setId]);

  async function handleToggleStudy() {
    setIsToggling(true);
    try {
      const nextVal = !studyEnabled;
      const res = await fetch(`/api/sets/${setId}/study`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyEnabled: nextVal }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          studyEnabled: boolean;
          studyCode: string | null;
        };
        setStudyEnabled(data.studyEnabled);
        setStudyCode(data.studyCode);
      }
    } finally {
      setIsToggling(false);
    }
  }

  function handleCopy(text: string, type: "code" | "link") {
    void navigator.clipboard?.writeText(text);
    setCopiedType(type);
    window.setTimeout(() => setCopiedType(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Khung công tắc Cho phép ôn tập + Mã & QR */}
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/70 via-white to-sky-50/50 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-bold text-slate-900 sm:text-base">
                🧠 {vi.study.teacher.enableToggleLabel}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  studyEnabled
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {studyEnabled
                  ? vi.study.teacher.enabledBadge
                  : vi.study.teacher.disabledBadge}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {vi.study.teacher.shareDescription}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={studyEnabled ? "outline" : "default"}
                disabled={isToggling}
                onClick={() => void handleToggleStudy()}
              >
                {studyEnabled ? "Tắt chế độ ôn tập" : "Bật chế độ ôn tập"}
              </Button>

              {studyEnabled && studyCode ? (
                <>
                  <span className="rounded-xl border border-teal-300 bg-white px-3 py-1.5 font-mono text-sm font-extrabold text-teal-900">
                    {studyCode}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(studyCode, "code")}
                  >
                    {copiedType === "code"
                      ? vi.exams.share.copiedNotice
                      : vi.study.teacher.copyCodeButton}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleCopy(fullStudyUrl, "link")}
                  >
                    {copiedType === "link"
                      ? vi.exams.share.copiedNotice
                      : vi.study.teacher.copyLinkButton}
                  </Button>
                  <Link
                    href={studyPath}
                    target="_blank"
                    className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {vi.study.teacher.openStudyPageButton} ↗
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          {studyEnabled && studyCode && qrSvg ? (
            <div className="flex flex-col items-center self-start rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs md:self-center">
              <div
                className="h-24 w-24"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <span className="mt-1 font-mono text-[11px] font-bold text-slate-700">
                /study/{studyCode}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Thanh chuyển Tab: Duyệt câu hỏi | Thống kê Ôn tập (FSRS) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => onChangeTab("questions")}
          className={`min-h-[44px] cursor-pointer rounded-xl px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
            activeTab === "questions"
              ? "bg-teal-600 text-white shadow-2xs"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          📋 {vi.study.teacher.tabQuestions}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab("study_stats")}
          className={`min-h-[44px] cursor-pointer rounded-xl px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
            activeTab === "study_stats"
              ? "bg-teal-600 text-white shadow-2xs"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          📊 {vi.study.teacher.tabStudyStats}
        </button>
      </div>

      {/* Nội dung Tab Thống kê Ôn tập dành cho giáo viên */}
      {activeTab === "study_stats" ? (
        <section className="space-y-5">
          {isLoadingStats ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              {vi.common.loading}
            </div>
          ) : !stats || stats.learner_count === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              {vi.study.teacher.emptyStats}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-2xl font-bold text-slate-900">
                    {stats.learner_count}
                  </div>
                  <div className="text-xs font-medium text-slate-600">
                    {vi.study.teacher.statsLearnerCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
                  <div className="text-2xl font-bold text-teal-900">
                    {stats.total_reviews}
                  </div>
                  <div className="text-xs font-medium text-teal-800">
                    {vi.study.teacher.statsTotalReviews}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="text-2xl font-bold text-emerald-900">
                    {stats.average_retention_rate}%
                  </div>
                  <div className="text-xs font-medium text-emerald-800">
                    {vi.study.teacher.statsAvgRetention}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
                <h3 className="text-base font-bold text-slate-900">
                  {vi.study.teacher.mostForgottenTitle}
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 pr-3">
                          {vi.study.teacher.colQuestion}
                        </th>
                        <th className="px-3 py-2.5">
                          {vi.study.teacher.colTopic}
                        </th>
                        <th className="px-3 py-2.5">
                          {vi.study.teacher.colTotalLapses}
                        </th>
                        <th className="px-3 py-2.5">
                          {vi.study.teacher.colLeechLearners}
                        </th>
                        <th className="py-2.5 pl-3">
                          {vi.study.teacher.colAgainRate}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.question_stats.slice(0, 20).map((q) => (
                        <tr
                          key={q.question_id}
                          className={
                            q.total_lapses >= 3 ? "bg-red-50/40" : undefined
                          }
                        >
                          <td className="max-w-md py-3 pr-3 font-medium text-slate-900">
                            <p className="line-clamp-2">{q.stem}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">
                            {q.topic ?? "---"}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                q.total_lapses > 0
                                  ? "bg-red-100 text-red-900"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {q.total_lapses}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold text-amber-900">
                            {q.leech_learners_count}
                          </td>
                          <td className="py-3 pl-3 text-xs text-slate-600">
                            {q.again_reviews_count}/{q.total_reviews_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
                <h3 className="text-base font-bold text-slate-900">
                  {vi.study.teacher.learnersListTitle} ({stats.learners.length})
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 pr-3">
                          {vi.study.teacher.colNickname}
                        </th>
                        <th className="px-3 py-2.5">
                          {vi.study.teacher.colCardsLearned}
                        </th>
                        <th className="px-3 py-2.5">
                          {vi.study.teacher.colLeechCount}
                        </th>
                        <th className="py-2.5 pl-3">
                          {vi.study.teacher.colLastStudied}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.learners.map((l) => (
                        <tr key={l.learner_id}>
                          <td className="py-2.5 pr-3 font-semibold text-slate-900">
                            {l.nickname}
                          </td>
                          <td className="px-3 py-2.5 text-teal-800">
                            {l.cards_learned}
                          </td>
                          <td className="px-3 py-2.5 text-amber-800">
                            {l.leech_count}
                          </td>
                          <td className="py-2.5 pl-3 text-xs text-slate-600">
                            {new Date(l.last_studied_at).toLocaleString(
                              "vi-VN"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

