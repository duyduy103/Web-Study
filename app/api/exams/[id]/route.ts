import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";

const patchExamSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle_open"),
    isOpen: z.boolean(),
  }),
  z.object({
    action: z.literal("manual_grade"),
    attemptId: z.string().uuid(),
    examQuestionId: z.string().uuid(),
    pointsAwarded: z.number().min(0).max(1000),
    isCorrect: z.boolean(),
  }),
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: examId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const { data: exam } = await supabase
      .from("exams")
      .select("id, owner_id")
      .eq("id", examId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!exam) {
      return NextResponse.json(
        { error: vi.exams.results.notFoundTitle },
        { status: 404 }
      );
    }

    const body: unknown = await request.json();
    const parsed = patchExamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const input = parsed.data;

    if (input.action === "toggle_open") {
      const { error } = await supabase
        .from("exams")
        .update({ is_open: input.isOpen })
        .eq("id", examId)
        .eq("owner_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ isOpen: input.isOpen });
    }

    // action === "manual_grade"
    const { data: attempt } = await supabase
      .from("attempts")
      .select("id, exam_id")
      .eq("id", input.attemptId)
      .eq("exam_id", examId)
      .maybeSingle();

    if (!attempt) {
      return NextResponse.json(
        { error: vi.exams.results.notFoundTitle },
        { status: 404 }
      );
    }

    const { data: examQuestion } = await supabase
      .from("exam_questions")
      .select("id, question_id, points")
      .eq("id", input.examQuestionId)
      .eq("exam_id", examId)
      .maybeSingle();

    if (!examQuestion) {
      return NextResponse.json(
        { error: vi.exams.results.notFoundTitle },
        { status: 404 }
      );
    }

    const clampedPoints =
      Math.round(
        Math.min(Math.max(0, input.pointsAwarded), Number(examQuestion.points)) *
          100
      ) / 100;

    // Kiểm tra xem đã có dòng attempt_answers cho câu này chưa
    const { data: existingAnswer } = await supabase
      .from("attempt_answers")
      .select("id")
      .eq("attempt_id", attempt.id)
      .eq("exam_question_id", examQuestion.id)
      .maybeSingle();

    if (existingAnswer) {
      const { error: updateAnsErr } = await supabase
        .from("attempt_answers")
        .update({
          points_awarded: clampedPoints,
          is_correct: input.isCorrect,
          needs_review: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingAnswer.id);

      if (updateAnsErr) {
        return NextResponse.json(
          { error: updateAnsErr.message },
          { status: 500 }
        );
      }
    } else {
      const { error: insertAnsErr } = await supabase
        .from("attempt_answers")
        .insert({
          attempt_id: attempt.id,
          exam_question_id: examQuestion.id,
          question_id: examQuestion.question_id,
          response: "",
          points_awarded: clampedPoints,
          is_correct: input.isCorrect,
          needs_review: false,
        });

      if (insertAnsErr) {
        return NextResponse.json(
          { error: insertAnsErr.message },
          { status: 500 }
        );
      }
    }

    // Tính lại tổng điểm và trạng thái chờ chấm của cả lượt làm
    const { data: allAnswers } = await supabase
      .from("attempt_answers")
      .select("points_awarded, needs_review")
      .eq("attempt_id", attempt.id);

    let totalScore = 0;
    let stillNeedsReview = false;
    for (const ans of allAnswers ?? []) {
      totalScore += Number(ans.points_awarded ?? 0);
      if (ans.needs_review) {
        stillNeedsReview = true;
      }
    }

    const roundedScore = Math.round(totalScore * 100) / 100;

    const { error: updateAttemptErr } = await supabase
      .from("attempts")
      .update({
        score: roundedScore,
        needs_manual_review: stillNeedsReview,
      })
      .eq("id", attempt.id);

    if (updateAttemptErr) {
      return NextResponse.json(
        { error: updateAttemptErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      attemptId: attempt.id,
      examQuestionId: examQuestion.id,
      pointsAwarded: clampedPoints,
      isCorrect: input.isCorrect,
      newTotalScore: roundedScore,
      needsManualReview: stillNeedsReview,
    });
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

