import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildDeterministicAttemptOrder } from "@/lib/grading";
import { mapAssignmentRpcError } from "@/lib/classes/assignments";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const uuidSchema = z.string().uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await context.params;
    if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(assignmentId).success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }

    // 1. Lấy cấu trúc ID câu hỏi/lựa chọn (không có nội dung/đáp án) và kiểm tra tư cách active
    const { data: structRaw, error: structErr } = await supabase.rpc(
      "get_class_exam_structure_for_member",
      { p_assignment_id: assignmentId }
    );

    if (structErr || !structRaw) {
      console.error(
        "[POST start-exam] structure RPC error:",
        structErr?.code,
        structErr?.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const structPayload = structRaw as {
      error?: string | null;
      exam?: {
        id: string;
        shuffle_questions: boolean;
        shuffle_choices: boolean;
      };
      question_structure?: Array<{
        exam_question_id: string;
        position: number;
        choice_ids: string[];
      }>;
    };

    if (structPayload.error || !structPayload.exam) {
      const mapped = mapAssignmentRpcError(
        structPayload.error ?? "NOT_FOUND"
      );
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    const attemptToken = crypto.randomBytes(24).toString("hex");
    const orderResult = buildDeterministicAttemptOrder({
      attemptSeed: attemptToken,
      questions: (structPayload.question_structure ?? []).map((item) => ({
        examQuestionId: item.exam_question_id,
        choiceIds: Array.isArray(item.choice_ids) ? item.choice_ids : [],
      })),
      shuffleQuestions: Boolean(structPayload.exam.shuffle_questions),
      shuffleChoices: Boolean(structPayload.exam.shuffle_choices),
    });

    // 2. Bắt đầu (hoặc tiếp tục) lượt làm bài gắn student_id = user.id và assignment_id
    const { data: startRaw, error: startErr } = await supabase.rpc(
      "start_class_exam_attempt",
      {
        p_assignment_id: assignmentId,
        p_attempt_token: attemptToken,
        p_question_order: orderResult.questionOrder,
        p_choice_orders: orderResult.choiceOrders as unknown as Json,
      }
    );

    if (startErr || !startRaw) {
      console.error(
        "[POST start-exam] start RPC error:",
        startErr?.code,
        startErr?.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const startPayload = startRaw as {
      error?: string | null;
      resumed?: boolean;
      attempt_id?: string;
      attempt_token?: string;
      deadline_at?: string | null;
    };

    if (startPayload.error || !startPayload.attempt_token) {
      const mapped = mapAssignmentRpcError(
        startPayload.error ?? "SYSTEM_ERROR"
      );
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json({
      attemptId: startPayload.attempt_id,
      attemptToken: startPayload.attempt_token,
      resumed: Boolean(startPayload.resumed),
      deadlineAt: startPayload.deadline_at ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}
