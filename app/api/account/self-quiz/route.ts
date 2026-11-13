import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { buildDeterministicAttemptOrder } from "@/lib/grading";
import type { ExamQuestionSnapshot } from "@/lib/grading/types";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const startSelfQuizSchema = z.object({
  setId: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  questionIds: z.array(z.string().uuid()).min(1).max(200),
  totalPoints: z.number().min(1).max(1000).default(10),
  durationMin: z.number().int().min(1).max(300).nullable().optional(),
  shuffleQuestions: z.boolean().default(true),
  shuffleChoices: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const body: unknown = await request.json();
    const parsed = startSelfQuizSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.exams.create.noApprovedError },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const { user, displayName } = authProfile;

    const { data: setRow } = await supabase
      .from("question_sets")
      .select("id")
      .eq("id", input.setId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!setRow) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 404 }
      );
    }

    const { data: approvedQuestions } = await supabase
      .from("questions")
      .select("id, type, stem, explanation, topic, difficulty, status")
      .eq("set_id", input.setId)
      .eq("status", "approved")
      .in("id", input.questionIds);

    const validQuestions = approvedQuestions ?? [];
    if (validQuestions.length === 0) {
      return NextResponse.json(
        { error: vi.exams.create.noApprovedError },
        { status: 400 }
      );
    }

    const questionById = new Map(validQuestions.map((q) => [q.id, q]));
    const orderedQuestions = input.questionIds
      .map((id) => questionById.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const validIds = orderedQuestions.map((q) => q.id);

    const [{ data: choicesData }, { data: answersData }] = await Promise.all([
      supabase
        .from("choices")
        .select("id, question_id, text, is_correct, position")
        .in("question_id", validIds)
        .order("position", { ascending: true }),
      supabase
        .from("answers")
        .select("question_id, answer_text, accepted_variants")
        .in("question_id", validIds),
    ]);

    const choicesByQ = new Map<
      string,
      Array<{ id: string; text: string; is_correct: boolean; position: number }>
    >();
    for (const c of choicesData ?? []) {
      const list = choicesByQ.get(c.question_id) ?? [];
      list.push({
        id: c.id,
        text: c.text,
        is_correct: c.is_correct,
        position: c.position,
      });
      choicesByQ.set(c.question_id, list);
    }

    const answerByQ = new Map<
      string,
      { answer_text: string; accepted_variants: string[] }
    >();
    for (const a of answersData ?? []) {
      answerByQ.set(a.question_id, {
        answer_text: a.answer_text,
        accepted_variants: Array.isArray(a.accepted_variants)
          ? a.accepted_variants
          : [],
      });
    }

    // Tạo bài tự kiểm tra cá nhân (exam_mode = 'self', không có mã/link công khai)
    const { data: createdExam, error: examError } = await supabase
      .from("exams")
      .insert({
        owner_id: user.id,
        set_id: input.setId,
        title: input.title,
        code: null,
        duration_min: input.durationMin ?? null,
        shuffle_questions: input.shuffleQuestions,
        shuffle_choices: input.shuffleChoices,
        is_open: true,
        show_answers: true,
        max_attempts: 999,
        total_points: input.totalPoints,
        exam_mode: "self",
      })
      .select("id")
      .single();

    if (examError || !createdExam) {
      return NextResponse.json(
        { error: examError?.message ?? vi.importSet.errors.saveFailed },
        { status: 500 }
      );
    }

    const count = orderedQuestions.length;
    const basePoint = Math.floor((input.totalPoints / count) * 100) / 100;
    const remainder =
      Math.round((input.totalPoints - basePoint * count) * 100) / 100;

    const examQuestionRows = orderedQuestions.map((q, index) => {
      const ans = answerByQ.get(q.id);
      const snapshot: ExamQuestionSnapshot = {
        id: q.id,
        type: q.type,
        stem: q.stem,
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty,
        choices: choicesByQ.get(q.id) ?? [],
        answer_text: ans?.answer_text ?? null,
        accepted_variants: ans?.accepted_variants ?? [],
      };

      const points =
        index === count - 1
          ? Math.round((basePoint + remainder) * 100) / 100
          : basePoint;

      return {
        exam_id: createdExam.id,
        question_id: q.id,
        points,
        position: index,
        question_snapshot: snapshot as unknown as Json,
      };
    });

    const { data: insertedEqRows, error: eqError } = await supabase
      .from("exam_questions")
      .insert(examQuestionRows)
      .select("id, question_snapshot");

    if (eqError || !insertedEqRows) {
      await supabase.from("exams").delete().eq("id", createdExam.id);
      return NextResponse.json(
        { error: eqError?.message ?? vi.importSet.errors.saveFailed },
        { status: 500 }
      );
    }

    const attemptToken = crypto.randomBytes(24).toString("hex");
    const { questionOrder, choiceOrders } = buildDeterministicAttemptOrder({
      attemptSeed: attemptToken,
      questions: insertedEqRows.map((eq) => {
        const snap = eq.question_snapshot as unknown as ExamQuestionSnapshot;
        return {
          examQuestionId: eq.id,
          choiceIds: (snap.choices ?? []).map((c) => c.id),
        };
      }),
      shuffleQuestions: input.shuffleQuestions,
      shuffleChoices: input.shuffleChoices,
    });

    const deadlineAt =
      input.durationMin && input.durationMin > 0
        ? new Date(Date.now() + input.durationMin * 60000).toISOString()
        : null;

    const { error: attemptError } = await supabase.from("attempts").insert({
      exam_id: createdExam.id,
      set_id: input.setId,
      student_id: user.id,
      student_name: displayName,
      attempt_token: attemptToken,
      deadline_at: deadlineAt,
      status: "in_progress",
      question_order: questionOrder,
      choice_orders: choiceOrders as unknown as Json,
      flagged_questions: [],
    });

    if (attemptError) {
      await supabase.from("exams").delete().eq("id", createdExam.id);
      return NextResponse.json(
        { error: attemptError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      examId: createdExam.id,
      attemptToken,
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

