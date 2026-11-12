import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildDeterministicAttemptOrder,
  gradeAttempt,
} from "@/lib/grading";
import type {
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
} from "@/lib/grading/types";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const responseItemSchema = z.object({
  exam_question_id: z.string().uuid(),
  response: z.string().max(2000),
});

const publicExamRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start_attempt"),
    code: z.string().trim().min(4).max(16),
    studentName: z.string().trim().min(1).max(100),
    studentClass: z.string().trim().max(50).optional().nullable(),
    learnerSecret: z.string().trim().min(32).max(128).optional().nullable(),
  }),
  z.object({
    action: z.literal("load_attempt"),
    attemptToken: z.string().trim().min(32).max(128),
  }),
  z.object({
    action: z.literal("save_draft"),
    attemptToken: z.string().trim().min(32).max(128),
    responses: z.array(responseItemSchema).max(300).default([]),
    flaggedQuestions: z.array(z.string().uuid()).max(300).optional(),
  }),
  z.object({
    action: z.literal("submit_attempt"),
    attemptToken: z.string().trim().min(32).max(128),
    responses: z.array(responseItemSchema).max(300).default([]),
    flaggedQuestions: z.array(z.string().uuid()).max(300).optional(),
  }),
]);

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "local";
}

function mapStartAttemptErrorToVietnamese(code: string): string {
  switch (code) {
    case "INVALID_STUDENT_NAME":
      return vi.studentExam.entry.nameRequiredError;
    case "EXAM_NOT_FOUND":
      return vi.studentExam.notFoundDescription;
    case "EXAM_CLOSED":
      return vi.studentExam.closedDescription;
    case "EXAM_NOT_YET_OPEN":
      return vi.studentExam.notYetOpenTitle;
    case "EXAM_EXPIRED_WINDOW":
      return vi.studentExam.expiredWindowTitle;
    case "MAX_ATTEMPTS_REACHED":
      return vi.studentExam.maxAttemptsReachedError;
    default:
      return vi.importSet.errors.saveFailed;
  }
}

async function lockAndGradeAttemptOnServer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attemptToken: string,
  responses: Array<{ exam_question_id: string; response: string }>,
  flaggedQuestions?: string[]
) {
  const { data: lockRaw, error: lockError } = await supabase.rpc(
    "lock_attempt_for_server_grading",
    {
      p_attempt_token: attemptToken,
      p_final_responses: responses as unknown as Json,
      p_flagged_questions: flaggedQuestions ?? null,
    }
  );

  if (lockError || !lockRaw) {
    throw new Error(lockError?.message ?? vi.importSet.errors.saveFailed);
  }

  const lockPayload = lockRaw as unknown as {
    error: string | null;
    questions?: Array<{
      exam_question_id: string;
      question_id: string | null;
      points: number;
      position: number;
      snapshot: ExamQuestionSnapshot;
    }>;
    answers?: Array<{
      exam_question_id: string;
      response: string | null;
    }>;
  };

  if (lockPayload.error && lockPayload.error !== "ATTEMPT_ALREADY_SUBMITTED") {
    throw new Error(mapStartAttemptErrorToVietnamese(lockPayload.error));
  }

  if (!lockPayload.error && Array.isArray(lockPayload.questions)) {
    const questionsWithSnapshots: ExamQuestionWithSnapshot[] =
      lockPayload.questions.map((q) => ({
        examQuestionId: q.exam_question_id,
        questionId: q.question_id,
        points: Number(q.points) || 0,
        position: q.position,
        snapshot: q.snapshot,
      }));

    const responsesByEqId: Record<string, string> = {};
    for (const ans of lockPayload.answers ?? []) {
      if (ans.exam_question_id) {
        responsesByEqId[ans.exam_question_id] = ans.response ?? "";
      }
    }

    const graded = gradeAttempt(questionsWithSnapshots, responsesByEqId);

    const gradedJson = graded.gradedAnswers.map((item) => ({
      exam_question_id: item.examQuestionId,
      response: item.response,
      is_correct: item.isCorrect,
      points_awarded: item.pointsAwarded,
      needs_review: item.needsManualReview,
    }));

    await supabase.rpc("save_server_grading_result", {
      p_attempt_token: attemptToken,
      p_score: graded.score,
      p_needs_manual_review: graded.needsManualReview,
      p_graded_answers: gradedJson as unknown as Json,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = publicExamRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const supabase = await createClient();
    const clientIp = getClientIp(request);

    if (input.action === "start_attempt") {
      const cleanCode = input.code.trim().toUpperCase();
      const { data: allowed } = await supabase.rpc("check_rate_limit", {
        p_key: `join:${clientIp}:${cleanCode}`,
        p_max_hits: 15,
        p_window_seconds: 60,
      });

      if (allowed === false) {
        return NextResponse.json(
          { error: vi.studentExam.rateLimitedError },
          { status: 429 }
        );
      }

      const { data: examRaw } = await supabase.rpc("get_public_exam_by_code", {
        p_code: cleanCode,
      });

      if (!examRaw) {
        return NextResponse.json(
          { error: vi.studentExam.notFoundDescription },
          { status: 404 }
        );
      }

      const examMeta = examRaw as {
        shuffle_questions: boolean;
        shuffle_choices: boolean;
        question_structure: Array<{
          exam_question_id: string;
          choice_ids: string[];
        }>;
      };

      const attemptToken = crypto.randomBytes(24).toString("hex");
      const { questionOrder, choiceOrders } = buildDeterministicAttemptOrder({
        attemptSeed: attemptToken,
        questions: (examMeta.question_structure ?? []).map((q) => ({
          examQuestionId: q.exam_question_id,
          choiceIds: Array.isArray(q.choice_ids) ? q.choice_ids : [],
        })),
        shuffleQuestions: Boolean(examMeta.shuffle_questions),
        shuffleChoices: Boolean(examMeta.shuffle_choices),
      });

      const { data: startRaw, error: startError } = await supabase.rpc(
        "start_public_exam_attempt",
        {
          p_code: cleanCode,
          p_student_name: input.studentName,
          p_student_class: input.studentClass ?? null,
          p_attempt_token: attemptToken,
          p_question_order: questionOrder,
          p_choice_orders: choiceOrders as unknown as Json,
        }
      );

      if (startError || !startRaw) {
        return NextResponse.json(
          { error: startError?.message ?? vi.importSet.errors.saveFailed },
          { status: 500 }
        );
      }

      const startPayload = startRaw as { error: string | null };
      if (startPayload.error) {
        return NextResponse.json(
          { error: mapStartAttemptErrorToVietnamese(startPayload.error) },
          { status: 400 }
        );
      }

      if (input.learnerSecret) {
        const secretHash = crypto
          .createHash("sha256")
          .update(input.learnerSecret.trim())
          .digest("hex");
        await supabase.rpc("link_attempt_to_learner", {
          p_attempt_token: attemptToken,
          p_secret_hash: secretHash,
        });
      }

      const { data: stateRaw } = await supabase.rpc(
        "get_student_attempt_by_token",
        { p_attempt_token: attemptToken }
      );

      return NextResponse.json({
        attemptToken,
        state: stateRaw,
      });
    }

    if (input.action === "load_attempt") {
      const { data: stateRaw } = await supabase.rpc(
        "get_student_attempt_by_token",
        { p_attempt_token: input.attemptToken }
      );

      if (!stateRaw) {
        return NextResponse.json(
          { error: vi.studentExam.notFoundTitle },
          { status: 404 }
        );
      }

      const currentState = stateRaw as {
        attempt: { status: string; deadline_at: string | null };
        server_now: string;
      };

      // Nếu bài đang làm nhưng trên server đã hết giờ -> tự động khóa và chấm điểm ngay
      if (
        currentState.attempt.status === "in_progress" &&
        currentState.attempt.deadline_at &&
        new Date(currentState.server_now).getTime() >
          new Date(currentState.attempt.deadline_at).getTime()
      ) {
        await lockAndGradeAttemptOnServer(supabase, input.attemptToken, []);
        const { data: refreshedRaw } = await supabase.rpc(
          "get_student_attempt_by_token",
          { p_attempt_token: input.attemptToken }
        );
        return NextResponse.json({ state: refreshedRaw });
      }

      return NextResponse.json({ state: stateRaw });
    }

    if (input.action === "save_draft") {
      const { data: saveRaw, error: saveError } = await supabase.rpc(
        "save_student_attempt_draft",
        {
          p_attempt_token: input.attemptToken,
          p_responses: input.responses as unknown as Json,
          p_flagged_questions: input.flaggedQuestions ?? null,
        }
      );

      if (saveError || !saveRaw) {
        return NextResponse.json(
          { error: saveError?.message ?? vi.review.editor.errorStatus },
          { status: 500 }
        );
      }

      const savePayload = saveRaw as {
        error: string | null;
        saved_at?: string;
      };

      if (savePayload.error === "ATTEMPT_TIME_EXPIRED") {
        await lockAndGradeAttemptOnServer(supabase, input.attemptToken, []);
        const { data: refreshedRaw } = await supabase.rpc(
          "get_student_attempt_by_token",
          { p_attempt_token: input.attemptToken }
        );
        return NextResponse.json({
          expiredAndSubmitted: true,
          state: refreshedRaw,
        });
      }

      if (savePayload.error) {
        return NextResponse.json(
          { error: mapStartAttemptErrorToVietnamese(savePayload.error) },
          { status: 400 }
        );
      }

      return NextResponse.json({
        savedAt: savePayload.saved_at ?? new Date().toISOString(),
      });
    }

    // action === "submit_attempt"
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `submit:${clientIp}`,
      p_max_hits: 20,
      p_window_seconds: 60,
    });

    if (allowed === false) {
      return NextResponse.json(
        { error: vi.studentExam.rateLimitedError },
        { status: 429 }
      );
    }

    await lockAndGradeAttemptOnServer(
      supabase,
      input.attemptToken,
      input.responses,
      input.flaggedQuestions
    );

    const { data: finalStateRaw } = await supabase.rpc(
      "get_student_attempt_by_token",
      { p_attempt_token: input.attemptToken }
    );

    return NextResponse.json({
      state: finalStateRaw,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : vi.importSet.errors.saveFailed,
      },
      { status: 500 }
    );
  }
}
