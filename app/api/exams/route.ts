import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateExamJoinCode } from "@/lib/grading";
import type { ExamQuestionSnapshot } from "@/lib/grading/types";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const createExamSchema = z.object({
  setId: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  questionIds: z.array(z.string().uuid()).min(1).max(300),
  totalPoints: z.number().min(1).max(1000).default(10),
  durationMin: z.number().int().min(1).max(300).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(50).default(1),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  shuffleQuestions: z.boolean().default(true),
  shuffleChoices: z.boolean().default(true),
  showAnswers: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
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

    const body: unknown = await request.json();
    const parsed = createExamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.exams.create.noApprovedError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    if (input.opensAt && input.closesAt) {
      if (new Date(input.closesAt).getTime() <= new Date(input.opensAt).getTime()) {
        return NextResponse.json(
          { error: vi.exams.create.invalidTimeWindowError },
          { status: 400 }
        );
      }
    }

    // Kiểm tra quyền sở hữu bộ câu hỏi
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

    // Chỉ lấy những câu hỏi thuộc bộ này và đã ở trạng thái approved
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

    // Giữ đúng thứ tự questionIds giáo viên đã chọn
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

    // Sinh mã 6 ký tự duy nhất (thử tối đa 5 lần nếu trùng)
    let code = generateExamJoinCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: existing } = await supabase
        .from("exams")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateExamJoinCode();
    }

    const { data: createdExam, error: examError } = await supabase
      .from("exams")
      .insert({
        owner_id: user.id,
        set_id: input.setId,
        title: input.title,
        code,
        duration_min: input.durationMin ?? null,
        shuffle_questions: input.shuffleQuestions,
        shuffle_choices: input.shuffleChoices,
        is_open: true,
        show_answers: input.showAnswers,
        opens_at: input.opensAt ?? null,
        closes_at: input.closesAt ?? null,
        max_attempts: input.maxAttempts,
        total_points: input.totalPoints,
      })
      .select("id, code")
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

    const { error: eqError } = await supabase
      .from("exam_questions")
      .insert(examQuestionRows);

    if (eqError) {
      await supabase.from("exams").delete().eq("id", createdExam.id);
      return NextResponse.json(
        { error: eqError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      examId: createdExam.id,
      code: createdExam.code ?? code,
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

