import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { QuestionSnapshot, ReviewQuestionItem } from "@/lib/review/types";
import {
  inlineSaveQuestionZodSchema,
  validateQuestionForReview,
} from "@/lib/review/validation";
import { vi } from "@/lib/i18n/vi";

export type InlineSaveServerResult =
  | {
      status: "saved";
      updatedAt: string;
      reviewedAt: string | null;
      reviewedByHuman: boolean;
      confidence: number;
    }
  | {
      status: "conflict";
      serverUpdatedAt: string;
      latestQuestion?: ReviewQuestionItem;
    };

/**
 * Kiểm tra xung đột updated_at giữa bản client đang giữ và bản trên server (mili-giây)
 */
export function isUpdatedAtConflict(
  expectedUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined
): boolean {
  if (!expectedUpdatedAt || !serverUpdatedAt) {
    return false;
  }
  const t1 = new Date(expectedUpdatedAt).getTime();
  const t2 = new Date(serverUpdatedAt).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) {
    return expectedUpdatedAt !== serverUpdatedAt;
  }
  return Math.floor(t1) !== Math.floor(t2);
}

/**
 * Lưu chỉnh sửa tại dòng (Inline Edit) nguyên tử thông qua RPC save_question_inline.
 * Nếu phát hiện xung đột updated_at (mở 2 tab), trả về status = 'conflict' và không ghi đè.
 */
export async function saveInlineQuestionOnServer(params: {
  supabase: SupabaseClient<Database>;
  setId: string;
  rawPayload: unknown;
}): Promise<InlineSaveServerResult> {
  const parsed = inlineSaveQuestionZodSchema.safeParse(params.rawPayload);
  if (!parsed.success) {
    const firstMsg =
      parsed.error.issues[0]?.message ?? vi.review.editor.errorStatus;
    throw new Error(firstMsg);
  }

  const input = parsed.data;

  const choicesJson: Json = input.choices.map((c, idx) => ({
    text: c.text.trim(),
    is_correct: c.is_correct,
    position: idx,
    ai_generated: c.ai_generated,
  }));

  const { data, error } = await params.supabase.rpc("save_question_inline", {
    p_question_id: input.questionId,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_type: input.type,
    p_stem: input.stem.trim(),
    p_explanation: input.explanation?.trim() || null,
    p_topic: input.topic?.trim() || null,
    p_difficulty: input.difficulty?.trim() || null,
    p_status: input.status,
    p_choices: choicesJson,
    p_answer_text: input.answer_text?.trim() || null,
  });

  if (error) {
    throw new Error(vi.review.editor.errorStatus);
  }

  const rpcResult = data as {
    conflict?: boolean;
    server_updated_at?: string;
    updated_at?: string;
    reviewed_at?: string;
    reviewed_by_human?: boolean;
    confidence?: number;
  } | null;

  if (rpcResult?.conflict) {
    const latest = await fetchSingleReviewQuestion(
      params.supabase,
      params.setId,
      input.questionId
    );
    return {
      status: "conflict",
      serverUpdatedAt: rpcResult.server_updated_at ?? new Date().toISOString(),
      latestQuestion: latest ?? undefined,
    };
  }

  return {
    status: "saved",
    updatedAt: rpcResult?.updated_at ?? new Date().toISOString(),
    reviewedAt: rpcResult?.reviewed_at ?? new Date().toISOString(),
    reviewedByHuman: rpcResult?.reviewed_by_human ?? true,
    confidence: Number(rpcResult?.confidence ?? 1.0),
  };
}

/**
 * Áp dụng nguyên tử một mảng bản chụp câu hỏi (dùng cho Duyệt/Loại, Thao tác hàng loạt và Hoàn tác/Làm lại).
 * Cưỡng bức kiểm tra ở server: không câu nào chuyển sang 'approved' nếu không hợp lệ.
 */
export async function applyQuestionSnapshotsOnServer(params: {
  supabase: SupabaseClient<Database>;
  snapshots: QuestionSnapshot[];
  expectedUpdatedAtById?: Record<string, string>;
}): Promise<{
  status: "applied" | "conflict";
  updatedAtById: Record<string, string>;
  conflictedIds?: string[];
}> {
  if (params.snapshots.length === 0) {
    return { status: "applied", updatedAtById: {} };
  }

  // 1. Kiểm tra hợp lệ ở server cho mọi câu có trạng thái 'approved'
  for (const snap of params.snapshots) {
    if (snap.status === "approved") {
      const check = validateQuestionForReview({
        type: snap.type,
        stem: snap.stem,
        choices: snap.choices,
        answer_text: snap.answer_text,
      });
      if (!check.valid) {
        throw new Error(
          `${vi.review.validation.cannotApprovePrefix} ${check.errors.join(" ")}`
        );
      }
    }
  }

  // 2. Nếu có truyền expectedUpdatedAtById, kiểm tra xung đột trước khi ghi
  if (
    params.expectedUpdatedAtById &&
    Object.keys(params.expectedUpdatedAtById).length > 0
  ) {
    const ids = params.snapshots.map((s) => s.id);
    const { data: currentRows } = await params.supabase
      .from("questions")
      .select("id, updated_at")
      .in("id", ids);

    const conflictedIds: string[] = [];
    for (const row of currentRows ?? []) {
      const expected = params.expectedUpdatedAtById[row.id];
      if (expected && isUpdatedAtConflict(expected, row.updated_at)) {
        conflictedIds.push(row.id);
      }
    }

    if (conflictedIds.length > 0) {
      return {
        status: "conflict",
        updatedAtById: {},
        conflictedIds,
      };
    }
  }

  // 3. Gọi RPC restore_questions_snapshot để ghi nguyên tử trong 1 transaction
  const payloadJson: Json = params.snapshots.map((s) => ({
    id: s.id,
    type: s.type,
    stem: s.stem.trim(),
    explanation: s.explanation?.trim() || null,
    topic: s.topic?.trim() || null,
    difficulty: s.difficulty?.trim() || null,
    confidence: s.confidence,
    status: s.status,
    warnings: s.warnings,
    ai_generated: s.ai_generated,
    reviewed_by_human: s.reviewed_by_human,
    reviewed_at: s.reviewed_at,
    choices: s.choices.map((c, idx) => ({
      text: c.text.trim(),
      is_correct: c.is_correct,
      position: idx,
      ai_generated: c.ai_generated,
    })),
    answer_text: s.answer_text?.trim() || null,
  }));

  const { data, error } = await params.supabase.rpc(
    "restore_questions_snapshot",
    {
      p_snapshots: payloadJson,
    }
  );

  if (error) {
    throw new Error(vi.review.editor.errorStatus);
  }

  const updatedAtById: Record<string, string> = {};
  if (Array.isArray(data)) {
    for (const item of data) {
      const row = item as { id?: string; updated_at?: string };
      if (row.id && row.updated_at) {
        updatedAtById[row.id] = row.updated_at;
      }
    }
  }

  return {
    status: "applied",
    updatedAtById,
  };
}

export async function fetchSingleReviewQuestion(
  supabase: SupabaseClient<Database>,
  setId: string,
  questionId: string
): Promise<ReviewQuestionItem | null> {
  const { data: q } = await supabase
    .from("questions")
    .select(
      "id, set_id, type, stem, explanation, source_ref, raw_source_text, topic, difficulty, confidence, status, warnings, ai_generated, reviewed_by_human, reviewed_at, created_at, updated_at"
    )
    .eq("id", questionId)
    .eq("set_id", setId)
    .maybeSingle();

  if (!q) {
    return null;
  }

  const [{ data: choicesData }, { data: answerData }] = await Promise.all([
    supabase
      .from("choices")
      .select("id, text, is_correct, position, ai_generated")
      .eq("question_id", questionId)
      .order("position", { ascending: true }),
    supabase
      .from("answers")
      .select("answer_text")
      .eq("question_id", questionId)
      .maybeSingle(),
  ]);

  return {
    id: q.id,
    set_id: q.set_id,
    orderNumber: 1,
    type: q.type,
    stem: q.stem,
    explanation: q.explanation,
    source_ref: q.source_ref,
    raw_source_text: q.raw_source_text,
    topic: q.topic,
    difficulty: q.difficulty,
    confidence: q.confidence,
    status: q.status,
    warnings: Array.isArray(q.warnings) ? q.warnings : [],
    ai_generated: q.ai_generated,
    reviewed_by_human: q.reviewed_by_human,
    reviewed_at: q.reviewed_at,
    created_at: q.created_at,
    updated_at: q.updated_at,
    choices: (choicesData ?? []).map((c, idx) => ({
      id: c.id,
      text: c.text,
      is_correct: c.is_correct,
      position: idx,
      ai_generated: c.ai_generated,
    })),
    answer_text: answerData?.answer_text ?? null,
  };
}

