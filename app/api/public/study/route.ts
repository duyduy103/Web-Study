import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildDailyStudyQueue,
  computeLearnerStudyAnalytics,
  previewNextIntervals,
  scheduleCardReview,
} from "@/lib/srs";
import {
  generateLearnerRecoveryCode,
  generateLearnerSecret,
  hashLearnerTokenSha256,
  normalizeRecoveryCode,
} from "@/lib/srs/crypto-and-pomodoro";
import type {
  SrsCardStateRecord,
  SrsReviewLogRecord,
} from "@/lib/srs/types";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const cardStateSchema = z.object({
  question_id: z.string().uuid(),
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.string().nullable(),
});

const publicStudyRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_profile"),
    nickname: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("recover_profile"),
    recoveryCode: z.string().trim().min(6).max(32),
  }),
  z.object({
    action: z.literal("load_overview"),
    learnerSecret: z.string().trim().min(32).max(128),
    code: z.string().trim().max(16).optional().nullable(),
    leechOnly: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_settings"),
    learnerSecret: z.string().trim().min(32).max(128),
    setId: z.string().uuid(),
    dailyNewLimit: z.number().int().min(5).max(50),
    leechThreshold: z.number().int().min(2).max(10).default(3),
  }),
  z.object({
    action: z.literal("reveal_choices_hint"),
    learnerSecret: z.string().trim().min(32).max(128),
    code: z.string().trim().min(4).max(16),
    questionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("reveal_answer"),
    learnerSecret: z.string().trim().min(32).max(128),
    code: z.string().trim().min(4).max(16),
    questionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("rate_card"),
    learnerSecret: z.string().trim().min(32).max(128),
    code: z.string().trim().min(4).max(16),
    questionId: z.string().uuid(),
    button: z.enum(["again", "hard", "good", "easy"]),
    currentCardState: cardStateSchema.nullable().optional(),
  }),
  z.object({
    action: z.literal("undo_rate"),
    learnerSecret: z.string().trim().min(32).max(128),
    reviewLogId: z.string().uuid(),
    questionId: z.string().uuid(),
    previousCardState: cardStateSchema.nullable().optional(),
  }),
]);

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "local";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = publicStudyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const supabase = await createClient();
    const clientIp = getClientIp(request);

    if (input.action === "create_profile") {
      const { data: allowed } = await supabase.rpc("check_rate_limit", {
        p_key: `study_create:${clientIp}`,
        p_max_hits: 10,
        p_window_seconds: 60,
      });
      if (allowed === false) {
        return NextResponse.json(
          { error: vi.studentExam.rateLimitedError },
          { status: 429 }
        );
      }

      const learnerSecret = generateLearnerSecret();
      const recovery = generateLearnerRecoveryCode();
      const secretHash = hashLearnerTokenSha256(learnerSecret);
      const recoveryHash = hashLearnerTokenSha256(recovery.normalized);

      const { data: raw, error } = await supabase.rpc(
        "create_anonymous_learner",
        {
          p_nickname: input.nickname,
          p_secret_hash: secretHash,
          p_recovery_code_hash: recoveryHash,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: error?.message ?? vi.importSet.errors.saveFailed },
          { status: 500 }
        );
      }

      const payload = raw as unknown as {
        error: string | null;
        learner?: { id: string; nickname: string; created_at: string };
      };
      if (payload.error || !payload.learner) {
        return NextResponse.json(
          { error: vi.study.profile.nicknameRequiredError },
          { status: 400 }
        );
      }

      return NextResponse.json({
        learner: payload.learner,
        learnerSecret,
        recoveryCode: recovery.formatted,
      });
    }

    if (input.action === "recover_profile") {
      const { data: allowed } = await supabase.rpc("check_rate_limit", {
        p_key: `study_recover:${clientIp}`,
        p_max_hits: 10,
        p_window_seconds: 60,
      });
      if (allowed === false) {
        return NextResponse.json(
          { error: vi.studentExam.rateLimitedError },
          { status: 429 }
        );
      }

      const normalizedCode = normalizeRecoveryCode(input.recoveryCode);
      const recoveryHash = hashLearnerTokenSha256(normalizedCode);
      const newSecret = generateLearnerSecret();
      const newSecretHash = hashLearnerTokenSha256(newSecret);

      const { data: raw, error } = await supabase.rpc(
        "recover_learner_by_code",
        {
          p_recovery_code_hash: recoveryHash,
          p_new_secret_hash: newSecretHash,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: vi.study.profile.invalidRecoveryError },
          { status: 400 }
        );
      }

      const payload = raw as unknown as {
        error: string | null;
        learner?: { id: string; nickname: string; created_at: string };
      };

      if (payload.error || !payload.learner) {
        return NextResponse.json(
          { error: vi.study.profile.invalidRecoveryError },
          { status: 400 }
        );
      }

      return NextResponse.json({
        learner: payload.learner,
        learnerSecret: newSecret,
      });
    }

    const secretHash = hashLearnerTokenSha256(input.learnerSecret);

    if (input.action === "load_overview") {
      const { data: raw, error } = await supabase.rpc(
        "get_learner_study_overview",
        {
          p_secret_hash: secretHash,
          p_code: input.code ? input.code.trim().toUpperCase() : null,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: error?.message ?? vi.review.editor.errorStatus },
          { status: 500 }
        );
      }

      const payload = raw as unknown as {
        error: string | null;
        learner?: { id: string; nickname: string; created_at: string };
        set?: {
          id: string;
          title: string;
          subject: string | null;
          grade: string | null;
          study_code: string;
          study_enabled: boolean;
          daily_new_limit: number;
          leech_threshold: number;
        } | null;
        questions?: Array<{
          id: string;
          type: string;
          stem: string;
          topic: string | null;
          difficulty: string | null;
        }>;
        card_states?: SrsCardStateRecord[];
        review_logs?: SrsReviewLogRecord[];
        enrolled_sets?: unknown[];
        server_now?: string;
      };

      if (payload.error === "UNAUTHORIZED_LEARNER") {
        return NextResponse.json(
          { error: "UNAUTHORIZED_LEARNER" },
          { status: 401 }
        );
      }

      if (payload.error === "STUDY_SET_DISABLED") {
        return NextResponse.json(
          { error: vi.study.overview.disabledDescription, code: "DISABLED" },
          { status: 403 }
        );
      }

      if (payload.error) {
        return NextResponse.json(
          { error: vi.study.overview.notFoundDescription },
          { status: 404 }
        );
      }

      const now = payload.server_now
        ? new Date(payload.server_now)
        : new Date();
      const questions = payload.questions ?? [];
      const cardStates = payload.card_states ?? [];
      const reviewLogs = payload.review_logs ?? [];
      const dailyNewLimit = payload.set?.daily_new_limit ?? 20;
      const leechThreshold = payload.set?.leech_threshold ?? 3;

      const setLogs = payload.set
        ? reviewLogs.filter((l) => l.set_id === payload.set?.id)
        : reviewLogs;

      const queue = buildDailyStudyQueue({
        approvedQuestionIds: questions.map((q) => q.id),
        cardStates,
        reviewLogs: setLogs,
        dailyNewLimit,
        now,
        leechOnlyThreshold: input.leechOnly ? leechThreshold : undefined,
      });

      const analytics = computeLearnerStudyAnalytics({
        cardStates,
        reviewLogs,
        now,
        leechThreshold,
      });

      const stateByQId = new Map(cardStates.map((cs) => [cs.question_id, cs]));
      const intervalsByQuestionId: Record<
        string,
        ReturnType<typeof previewNextIntervals>
      > = {};
      for (const qId of queue.queueQuestionIds) {
        intervalsByQuestionId[qId] = previewNextIntervals(
          stateByQId.get(qId),
          now
        );
      }

      return NextResponse.json({
        learner: payload.learner,
        set: payload.set,
        questions,
        cardStates,
        enrolledSets: payload.enrolled_sets ?? [],
        queue,
        analytics,
        intervalsByQuestionId,
        serverNow: now.toISOString(),
      });
    }

    if (input.action === "update_settings") {
      const { data: raw, error } = await supabase.rpc(
        "update_learner_study_settings",
        {
          p_secret_hash: secretHash,
          p_set_id: input.setId,
          p_daily_new_limit: input.dailyNewLimit,
          p_leech_threshold: input.leechThreshold,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: vi.review.editor.errorStatus },
          { status: 500 }
        );
      }

      return NextResponse.json(raw);
    }

    if (
      input.action === "reveal_choices_hint" ||
      input.action === "reveal_answer"
    ) {
      const mode =
        input.action === "reveal_choices_hint" ? "choices_hint" : "answer";
      const { data: raw, error } = await supabase.rpc(
        "reveal_study_card_hint_or_answer",
        {
          p_secret_hash: secretHash,
          p_code: input.code.trim().toUpperCase(),
          p_question_id: input.questionId,
          p_mode: mode,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: vi.review.editor.errorStatus },
          { status: 500 }
        );
      }

      const payload = raw as unknown as { error: string | null };
      if (payload.error) {
        return NextResponse.json(
          { error: vi.study.overview.disabledDescription },
          { status: 403 }
        );
      }

      return NextResponse.json(raw);
    }

    if (input.action === "rate_card") {
      const now = new Date();
      const scheduled = scheduleCardReview({
        questionId: input.questionId,
        currentState: input.currentCardState ?? null,
        button: input.button,
        now,
      });

      const { data: raw, error } = await supabase.rpc(
        "record_learner_card_review",
        {
          p_secret_hash: secretHash,
          p_code: input.code.trim().toUpperCase(),
          p_question_id: input.questionId,
          p_rating: scheduled.reviewLog.rating,
          p_state_before: scheduled.reviewLog.state_before,
          p_elapsed_days: scheduled.reviewLog.elapsed_days,
          p_scheduled_days: scheduled.reviewLog.scheduled_days,
          p_due: scheduled.nextCardState.due,
          p_stability: scheduled.nextCardState.stability,
          p_difficulty: scheduled.nextCardState.difficulty,
          p_learning_steps: scheduled.nextCardState.learning_steps,
          p_reps: scheduled.nextCardState.reps,
          p_lapses: scheduled.nextCardState.lapses,
          p_next_state: scheduled.nextCardState.state,
          p_reviewed_at: scheduled.reviewLog.reviewed_at,
        }
      );

      if (error || !raw) {
        return NextResponse.json(
          { error: error?.message ?? vi.review.editor.errorStatus },
          { status: 500 }
        );
      }

      const payload = raw as unknown as {
        error: string | null;
        review_log_id?: string;
        previous_card_state?: SrsCardStateRecord | null;
      };

      if (payload.error) {
        return NextResponse.json(
          { error: vi.study.overview.disabledDescription },
          { status: 403 }
        );
      }

      return NextResponse.json({
        nextCardState: scheduled.nextCardState,
        reviewLog: {
          ...scheduled.reviewLog,
          id: payload.review_log_id,
        },
        reviewLogId: payload.review_log_id,
        previousCardState: payload.previous_card_state ?? null,
        nextIntervals: previewNextIntervals(scheduled.nextCardState, now),
      });
    }

    // action === "undo_rate"
    const { data: raw, error } = await supabase.rpc("undo_learner_card_review", {
      p_secret_hash: secretHash,
      p_review_log_id: input.reviewLogId,
      p_question_id: input.questionId,
      p_previous_card_state: (input.previousCardState ?? null) as unknown as Json,
    });

    if (error || !raw) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 500 }
      );
    }

    return NextResponse.json(raw);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : vi.review.editor.errorStatus,
      },
      { status: 500 }
    );
  }
}

