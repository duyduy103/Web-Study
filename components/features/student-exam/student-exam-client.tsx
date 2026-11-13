"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StudentExamResultView,
  type StudentAttemptState,
  type StudentQuestionPayload,
} from "@/components/features/student-exam/student-exam-result-view";

export interface PublicExamMeta {
  id: string;
  code: string;
  title: string;
  duration_min: number | null;
  is_open: boolean;
  show_answers: boolean;
  opens_at: string | null;
  closes_at: string | null;
  max_attempts: number;
  total_points: number;
  question_count: number;
  server_now: string;
}

interface StudentExamClientProps {
  examMeta: PublicExamMeta;
  initialAttemptToken?: string;
}

const CHOICE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function formatCountdown(secondsLeft: number): string {
  const clamped = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function StudentExamClient({
  examMeta,
  initialAttemptToken,
}: StudentExamClientProps) {
  const cleanCode = (examMeta.code || examMeta.id).toUpperCase();
  const tokenStorageKey = `memoquiz_attempt_token_${cleanCode}`;
  const draftStoragePrefix = `memoquiz_attempt_draft_`;

  const [attemptToken, setAttemptToken] = React.useState<string | null>(null);
  const [attemptState, setAttemptState] =
    React.useState<StudentAttemptState | null>(null);
  const [isRestoring, setIsRestoring] = React.useState(true);

  const [studentName, setStudentName] = React.useState("");
  const [studentClass, setStudentClass] = React.useState("");
  const [isStarting, setIsStarting] = React.useState(false);
  const [entryError, setEntryError] = React.useState<string | null>(null);

  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [responsesByEqId, setResponsesByEqId] = React.useState<
    Record<string, string>
  >({});
  const [flaggedEqIds, setFlaggedEqIds] = React.useState<string[]>([]);
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "offline"
  >("idle");
  const [confirmSubmitOpen, setConfirmSubmitOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Độ lệch đồng hồ giữa máy học sinh và server để tính đếm ngược chính xác theo giờ server
  const [serverOffsetMs, setServerOffsetMs] = React.useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = React.useState<number | null>(
    null
  );

  const hydrateAttemptState = React.useCallback(
    (token: string, nextState: StudentAttemptState) => {
      setAttemptToken(token);
      setAttemptState(nextState);

      if (nextState.server_now) {
        setServerOffsetMs(
          new Date(nextState.server_now).getTime() - Date.now()
        );
      }

      const serverRespMap: Record<string, string> = {};
      for (const ans of nextState.answers ?? []) {
        if (ans.exam_question_id && ans.response !== null) {
          serverRespMap[ans.exam_question_id] = ans.response;
        }
      }

      // Hợp nhất với bản nháp localStorage nếu có câu vừa gõ lúc rớt mạng
      try {
        const localRaw = window.localStorage.getItem(
          `${draftStoragePrefix}${token}`
        );
        if (localRaw && nextState.attempt.status === "in_progress") {
          const parsedLocal = JSON.parse(localRaw) as {
            responses?: Record<string, string>;
            flagged?: string[];
          };
          if (parsedLocal.responses) {
            Object.assign(serverRespMap, parsedLocal.responses);
          }
          if (Array.isArray(parsedLocal.flagged)) {
            setFlaggedEqIds(parsedLocal.flagged);
          } else {
            setFlaggedEqIds(nextState.attempt.flagged_questions ?? []);
          }
        } else {
          setFlaggedEqIds(nextState.attempt.flagged_questions ?? []);
        }
      } catch {
        setFlaggedEqIds(nextState.attempt.flagged_questions ?? []);
      }

      setResponsesByEqId(serverRespMap);
    },
    [draftStoragePrefix]
  );

  // Khôi phục lượt làm đang dở nếu có attempt_token trong localStorage
  React.useEffect(() => {
    let active = true;
    async function restoreExistingAttempt() {
      try {
        const savedToken =
          initialAttemptToken ?? window.localStorage.getItem(tokenStorageKey);
        if (!savedToken) {
          if (active) setIsRestoring(false);
          return;
        }

        const res = await fetch("/api/public/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "load_attempt",
            attemptToken: savedToken,
          }),
        });

        if (!res.ok) {
          window.localStorage.removeItem(tokenStorageKey);
          if (active) setIsRestoring(false);
          return;
        }

        const data = (await res.json()) as { state: StudentAttemptState };
        if (active && data.state) {
          hydrateAttemptState(savedToken, data.state);
        }
      } catch {
        // Bỏ qua lỗi mạng khi tự khôi phục
      } finally {
        if (active) setIsRestoring(false);
      }
    }

    void restoreExistingAttempt();
    return () => {
      active = false;
    };
  }, [tokenStorageKey, initialAttemptToken, hydrateAttemptState]);

  // Sắp xếp câu hỏi và các lựa chọn cố định theo question_order & choice_orders của lượt làm
  const orderedQuestions: StudentQuestionPayload[] = React.useMemo(() => {
    if (!attemptState) return [];
    const byId = new Map(
      attemptState.questions.map((q) => [q.exam_question_id, q])
    );
    const order =
      attemptState.attempt.question_order?.length > 0
        ? attemptState.attempt.question_order
        : attemptState.questions.map((q) => q.exam_question_id);

    const choiceOrders = attemptState.attempt.choice_orders ?? {};

    return order
      .map((eqId) => byId.get(eqId))
      .filter((q): q is StudentQuestionPayload => Boolean(q))
      .map((q) => {
        const cOrder = choiceOrders[q.exam_question_id];
        if (!cOrder || cOrder.length === 0) return q;
        const cMap = new Map(q.choices.map((c) => [c.id, c]));
        const orderedChoices = cOrder
          .map((cId) => cMap.get(cId))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        return {
          ...q,
          choices: orderedChoices.length > 0 ? orderedChoices : q.choices,
        };
      });
  }, [attemptState]);

  const handleSubmitExam = React.useCallback(
    async (isAutoExpire = false) => {
      if (!attemptToken || isSubmitting) return;
      setIsSubmitting(true);
      setConfirmSubmitOpen(false);

      const payloadResponses = Object.entries(responsesByEqId).map(
        ([exam_question_id, response]) => ({
          exam_question_id,
          response,
        })
      );

      try {
        const res = await fetch("/api/public/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_attempt",
            attemptToken,
            responses: payloadResponses,
            flaggedQuestions: flaggedEqIds,
          }),
        });

        const data: unknown = await res.json();
        if (res.ok) {
          const payload = data as { state: StudentAttemptState };
          setAttemptState(payload.state);
          try {
            window.localStorage.removeItem(
              `${draftStoragePrefix}${attemptToken}`
            );
          } catch {
            // Bỏ qua
          }
        } else if (!isAutoExpire) {
          const errObj = data as { error?: string };
          setEntryError(errObj.error ?? vi.importSet.errors.saveFailed);
        }
      } catch {
        if (!isAutoExpire) {
          setSaveStatus("offline");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      attemptToken,
      isSubmitting,
      responsesByEqId,
      flaggedEqIds,
      draftStoragePrefix,
    ]
  );

  // Đồng hồ đếm ngược tính theo deadline_at trên server (không bao giờ reset khi tải lại trang)
  React.useEffect(() => {
    if (
      !attemptState ||
      attemptState.attempt.status !== "in_progress" ||
      !attemptState.attempt.deadline_at
    ) {
      setSecondsRemaining(null);
      return;
    }

    const deadlineMs = new Date(attemptState.attempt.deadline_at).getTime();

    function updateTick() {
      const nowOnServerMs = Date.now() + serverOffsetMs;
      const diffSec = Math.ceil((deadlineMs - nowOnServerMs) / 1000);
      setSecondsRemaining(Math.max(0, diffSec));

      if (diffSec <= 0) {
        void handleSubmitExam(true);
      }
    }

    updateTick();
    const timer = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(timer);
  }, [attemptState, serverOffsetMs, handleSubmitExam]);

  // Tự động lưu nháp lên server (debounce 2 giây sau mỗi lần đổi câu trả lời / đánh dấu)
  const syncDraftToServer = React.useCallback(
    async (
      token: string,
      nextResponses: Record<string, string>,
      nextFlagged: string[]
    ) => {
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/public/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft",
            attemptToken: token,
            responses: Object.entries(nextResponses).map(
              ([exam_question_id, response]) => ({
                exam_question_id,
                response,
              })
            ),
            flaggedQuestions: nextFlagged,
          }),
        });

        if (!res.ok) {
          setSaveStatus("offline");
          return;
        }

        const data = (await res.json()) as {
          expiredAndSubmitted?: boolean;
          state?: StudentAttemptState;
        };
        if (data.expiredAndSubmitted && data.state) {
          setAttemptState(data.state);
          return;
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("offline");
      }
    },
    []
  );

  const debounceRef = React.useRef<number | null>(null);

  function updateStudentResponse(examQuestionId: string, value: string) {
    if (!attemptToken) return;
    const nextResponses = {
      ...responsesByEqId,
      [examQuestionId]: value,
    };
    setResponsesByEqId(nextResponses);

    try {
      window.localStorage.setItem(
        `${draftStoragePrefix}${attemptToken}`,
        JSON.stringify({
          responses: nextResponses,
          flagged: flaggedEqIds,
        })
      );
    } catch {
      // Bỏ qua nếu đầy bộ nhớ
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void syncDraftToServer(attemptToken, nextResponses, flaggedEqIds);
    }, 1800);
  }

  function toggleFlagQuestion(examQuestionId: string) {
    if (!attemptToken) return;
    const nextFlagged = flaggedEqIds.includes(examQuestionId)
      ? flaggedEqIds.filter((id) => id !== examQuestionId)
      : [...flaggedEqIds, examQuestionId];
    setFlaggedEqIds(nextFlagged);

    try {
      window.localStorage.setItem(
        `${draftStoragePrefix}${attemptToken}`,
        JSON.stringify({
          responses: responsesByEqId,
          flagged: nextFlagged,
        })
      );
    } catch {
      // Bỏ qua
    }

    void syncDraftToServer(attemptToken, responsesByEqId, nextFlagged);
  }

  async function handleStartExam(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = studentName.trim();
    if (!cleanName) {
      setEntryError(vi.studentExam.entry.nameRequiredError);
      return;
    }

    setIsStarting(true);
    setEntryError(null);

    try {
      let learnerSecret: string | null = null;
      try {
        learnerSecret = window.localStorage.getItem("memoquiz_learner_secret");
      } catch {
        // Bỏ qua
      }

      const res = await fetch("/api/public/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_attempt",
          code: cleanCode,
          studentName: cleanName,
          studentClass: studentClass.trim() || null,
          learnerSecret,
        }),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errObj = data as { error?: string };
        throw new Error(errObj.error ?? vi.importSet.errors.saveFailed);
      }

      const payload = data as {
        attemptToken: string;
        state: StudentAttemptState;
      };

      try {
        window.localStorage.setItem(tokenStorageKey, payload.attemptToken);
      } catch {
        // Bỏ qua
      }

      setCurrentIdx(0);
      hydrateAttemptState(payload.attemptToken, payload.state);
    } catch (err) {
      setEntryError(
        err instanceof Error ? err.message : vi.importSet.errors.saveFailed
      );
    } finally {
      setIsStarting(false);
    }
  }

  if (isRestoring) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-medium text-slate-600">
          {vi.studentExam.entry.resumeNotice}
        </p>
      </div>
    );
  }

  // 1. Màn hình Kết quả sau khi nộp
  if (
    attemptState &&
    (attemptState.attempt.status === "submitted" ||
      attemptState.attempt.status === "expired")
  ) {
    return (
      <StudentExamResultView
        state={attemptState}
        orderedQuestions={orderedQuestions}
        maxAttempts={examMeta.max_attempts}
        onStartNewAttempt={() => {
          try {
            window.localStorage.removeItem(tokenStorageKey);
          } catch {
            // Bỏ qua
          }
          setAttemptToken(null);
          setAttemptState(null);
          setResponsesByEqId({});
          setFlaggedEqIds([]);
        }}
      />
    );
  }

  // 2. Màn hình Làm bài (Mobile-first, mỗi lần 1 câu)
  if (attemptState && attemptState.attempt.status === "in_progress") {
    const activeQuestion =
      orderedQuestions[currentIdx] ?? orderedQuestions[0] ?? null;
    const totalCount = orderedQuestions.length;
    const answeredCount = orderedQuestions.filter(
      (q) => (responsesByEqId[q.exam_question_id] ?? "").trim().length > 0
    ).length;
    const unansweredCount = Math.max(0, totalCount - answeredCount);
    const progressPercent =
      totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 pb-20 sm:px-4 sm:py-6">
        {/* Thanh trạng thái cố định đầu trang */}
        <header className="sticky top-2 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-sm backdrop-blur-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="line-clamp-1 text-sm font-bold text-slate-900 sm:text-base">
                {attemptState.exam.title}
              </h1>
              <p className="text-xs text-slate-600">
                {attemptState.attempt.student_name} •{" "}
                {vi.studentExam.runner.progressAnsweredPrefix} {answeredCount}/
                {totalCount}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {secondsRemaining !== null ? (
                <div
                  role="timer"
                  className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-sm font-extrabold ${
                    secondsRemaining <= 60
                      ? "animate-pulse bg-red-100 text-red-900"
                      : "bg-teal-50 text-teal-900"
                  }`}
                >
                  <span>⏱</span>
                  <span>{formatCountdown(secondsRemaining)}</span>
                </div>
              ) : (
                <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {vi.studentExam.runner.noTimeLimitBadge}
                </span>
              )}

              <Button
                type="button"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setConfirmSubmitOpen(true)}
                className="min-h-[44px] px-4 text-xs font-bold sm:text-sm"
              >
                {isSubmitting
                  ? vi.studentExam.runner.submittingExamButton
                  : vi.studentExam.runner.submitExamButton}
              </Button>
            </div>
          </div>

          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {saveStatus === "saving"
                ? vi.studentExam.runner.autoSavingStatus
                : saveStatus === "saved"
                  ? vi.studentExam.runner.autoSavedStatus
                  : saveStatus === "offline"
                    ? vi.studentExam.runner.offlineSaveWarning
                    : ""}
            </span>
          </div>
        </header>

        {/* Thẻ câu hỏi hiện tại */}
        {activeQuestion ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-teal-600 px-3 py-1 text-xs font-bold text-white sm:text-sm">
                  {vi.studentExam.runner.questionPrefix} {currentIdx + 1}/
                  {totalCount}
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  ({activeQuestion.points} {vi.studentExam.runner.pointsSuffix})
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  toggleFlagQuestion(activeQuestion.exam_question_id)
                }
                className={`min-h-[44px] cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  flaggedEqIds.includes(activeQuestion.exam_question_id)
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {flaggedEqIds.includes(activeQuestion.exam_question_id)
                  ? vi.studentExam.runner.flaggedForReviewButton
                  : vi.studentExam.runner.flagForReviewButton}
              </button>
            </div>

            <div className="my-4 text-base leading-relaxed font-semibold whitespace-pre-wrap text-slate-900 sm:text-lg">
              {activeQuestion.stem}
            </div>

            {/* Vùng trả lời theo 4 loại câu hỏi */}
            {(activeQuestion.type === "mcq" ||
              activeQuestion.type === "true_false") && (
              <div className="space-y-2.5">
                {activeQuestion.choices.map((choice, cIdx) => {
                  const selected =
                    responsesByEqId[activeQuestion.exam_question_id] ===
                    choice.id;
                  const letter =
                    activeQuestion.type === "true_false"
                      ? cIdx === 0
                        ? "Đ"
                        : "S"
                      : (CHOICE_LABELS[cIdx] ?? String(cIdx + 1));

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        updateStudentResponse(
                          activeQuestion.exam_question_id,
                          choice.id
                        )
                      }
                      className={`flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:text-base ${
                        selected
                          ? "border-teal-600 bg-teal-50/90 text-teal-950 ring-2 ring-teal-600/20"
                          : "border-slate-200 bg-white text-slate-800 hover:border-teal-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                          selected
                            ? "bg-teal-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="flex-1">{choice.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeQuestion.type === "cloze" && (
              <div className="space-y-2">
                <Label htmlFor="student-cloze-input">
                  {vi.studentExam.runner.clozeInputLabel}
                </Label>
                <Input
                  id="student-cloze-input"
                  value={
                    responsesByEqId[activeQuestion.exam_question_id] ?? ""
                  }
                  onChange={(e) =>
                    updateStudentResponse(
                      activeQuestion.exam_question_id,
                      e.target.value
                    )
                  }
                  placeholder={vi.studentExam.runner.clozeInputPlaceholder}
                  className="min-h-[48px] text-base"
                  maxLength={500}
                />
              </div>
            )}

            {activeQuestion.type === "short_answer" && (
              <div className="space-y-2">
                <Label htmlFor="student-short-input">
                  {vi.studentExam.runner.shortAnswerInputLabel}
                </Label>
                <textarea
                  id="student-short-input"
                  rows={4}
                  value={
                    responsesByEqId[activeQuestion.exam_question_id] ?? ""
                  }
                  onChange={(e) =>
                    updateStudentResponse(
                      activeQuestion.exam_question_id,
                      e.target.value
                    )
                  }
                  placeholder={
                    vi.studentExam.runner.shortAnswerInputPlaceholder
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600/25 focus-visible:outline-none"
                  maxLength={2000}
                />
              </div>
            )}

            {/* Nút Trước / Sau >= 44px */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="min-h-[46px] flex-1 sm:flex-none"
              >
                {vi.studentExam.runner.prevQuestionButton}
              </Button>

              {currentIdx < totalCount - 1 ? (
                <Button
                  type="button"
                  onClick={() =>
                    setCurrentIdx((i) => Math.min(totalCount - 1, i + 1))
                  }
                  className="min-h-[46px] flex-1 sm:flex-none"
                >
                  {vi.studentExam.runner.nextQuestionButton}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(true)}
                  className="min-h-[46px] flex-1 sm:flex-none"
                >
                  {vi.studentExam.runner.submitExamButton}
                </Button>
              )}
            </div>
          </section>
        ) : null}

        {/* Bảng điều hướng câu hỏi */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
              {vi.studentExam.runner.navigatorTitle}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                {vi.studentExam.runner.legendAnswered}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                {vi.studentExam.runner.legendFlagged}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {orderedQuestions.map((q, idx) => {
              const isCurrent = idx === currentIdx;
              const isAnswered =
                (responsesByEqId[q.exam_question_id] ?? "").trim().length > 0;
              const isFlagged = flaggedEqIds.includes(q.exam_question_id);

              return (
                <button
                  key={q.exam_question_id}
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Câu ${idx + 1}${isAnswered ? ", đã trả lời" : ""}${isFlagged ? ", đã đánh dấu" : ""}`}
                  onClick={() => setCurrentIdx(idx)}
                  className={`relative flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
                    isCurrent
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : isFlagged
                        ? "border-amber-400 bg-amber-50 text-amber-900"
                        : isAnswered
                          ? "border-teal-300 bg-teal-50 text-teal-900"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {idx + 1}
                  {isFlagged ? (
                    <span className="absolute top-0.5 right-1 text-[10px] text-amber-600">
                      ★
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* Modal xác nhận nộp bài */}
        {confirmSubmitOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-base font-bold text-slate-900">
                {vi.studentExam.runner.confirmSubmitTitle}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {unansweredCount > 0
                  ? `${vi.studentExam.runner.confirmSubmitUnansweredPrefix} ${unansweredCount} ${vi.studentExam.runner.confirmSubmitUnansweredSuffix}`
                  : vi.studentExam.runner.confirmSubmitAllAnswered}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmSubmitOpen(false)}
                >
                  {vi.studentExam.runner.continueWorkingButton}
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSubmitExam(false)}
                >
                  {vi.studentExam.runner.confirmSubmitButton}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // 3. Màn hình Vào bài (nhập Họ tên & Lớp)
  const serverNowMs = new Date(examMeta.server_now).getTime();
  const isNotYetOpen =
    examMeta.opens_at !== null &&
    serverNowMs < new Date(examMeta.opens_at).getTime();
  const isPastCloseWindow =
    examMeta.closes_at !== null &&
    serverNowMs > new Date(examMeta.closes_at).getTime();

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-4 py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          {vi.studentExam.entry.badge}
        </span>

        <h1 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
          {examMeta.title}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-xs sm:grid-cols-4">
          <div>
            <span className="text-slate-500">
              {vi.studentExam.entry.questionCountLabel}
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {examMeta.question_count} câu
            </p>
          </div>
          <div>
            <span className="text-slate-500">
              {vi.studentExam.entry.durationLabel}
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {examMeta.duration_min
                ? `${examMeta.duration_min} ${vi.studentExam.entry.minutesUnit}`
                : vi.studentExam.entry.noLimitLabel}
            </p>
          </div>
          <div>
            <span className="text-slate-500">
              {vi.studentExam.entry.totalPointsLabel}
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {examMeta.total_points} điểm
            </p>
          </div>
          <div>
            <span className="text-slate-500">
              {vi.studentExam.entry.maxAttemptsLabel}
            </span>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {examMeta.max_attempts} lượt
            </p>
          </div>
        </div>

        {!examMeta.is_open ? (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-bold">{vi.studentExam.closedTitle}</p>
            <p className="mt-1 text-xs">{vi.studentExam.closedDescription}</p>
          </div>
        ) : isNotYetOpen && examMeta.opens_at ? (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
          >
            <p className="font-bold">{vi.studentExam.notYetOpenTitle}</p>
            <p className="mt-1 text-xs">
              {vi.studentExam.notYetOpenPrefix}{" "}
              <strong>
                {new Date(examMeta.opens_at).toLocaleString("vi-VN")}
              </strong>
            </p>
          </div>
        ) : isPastCloseWindow && examMeta.closes_at ? (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <p className="font-bold">{vi.studentExam.expiredWindowTitle}</p>
            <p className="mt-1 text-xs">
              {vi.studentExam.expiredWindowPrefix}{" "}
              <strong>
                {new Date(examMeta.closes_at).toLocaleString("vi-VN")}
              </strong>
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleStartExam(e)}
            className="mt-5 space-y-4"
          >
            {entryError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
              >
                {entryError}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="student-name">
                {vi.studentExam.entry.studentNameLabel}
              </Label>
              <Input
                id="student-name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder={vi.studentExam.entry.studentNamePlaceholder}
                required
                maxLength={100}
                className="min-h-[48px] text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-class">
                {vi.studentExam.entry.studentClassLabel}
              </Label>
              <Input
                id="student-class"
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                placeholder={vi.studentExam.entry.studentClassPlaceholder}
                maxLength={50}
                className="min-h-[48px] text-base"
              />
            </div>

            <Button
              type="submit"
              disabled={isStarting}
              className="min-h-[48px] w-full text-base font-bold"
            >
              {isStarting
                ? vi.studentExam.entry.startingButton
                : vi.studentExam.entry.startButton}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
