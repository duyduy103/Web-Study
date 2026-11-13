import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTeacherRole } from "@/lib/auth/roles";
import {
  buildPrintExamPackage,
  MAX_PRINT_QUESTIONS,
  MAX_PRINT_VERSIONS,
  MIN_PRINT_VERSIONS,
} from "@/lib/export";
import type {
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
} from "@/lib/grading/types";
import type { Json } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

const createPrintExamSchema = z.object({
  setId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(MAX_PRINT_QUESTIONS),
  totalPoints: z.number().min(1).max(1000).default(10),
  versionCount: z
    .number()
    .int()
    .min(MIN_PRINT_VERSIONS)
    .max(MAX_PRINT_VERSIONS)
    .default(4),
  seed: z.string().trim().min(1).max(100),
  shuffleQuestions: z.boolean().default(true),
  shuffleChoices: z.boolean().default(true),
  header: z.object({
    schoolName: z.string().trim().max(150).optional().nullable(),
    examName: z.string().trim().min(1).max(150),
    subject: z.string().trim().max(100).optional().nullable(),
    className: z.string().trim().max(100).optional().nullable(),
    durationMinutes: z.number().int().min(1).max(300).optional().nullable(),
    studentInfoLine: z.string().trim().max(250).optional().nullable(),
  }),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.profile.user;

    const body: unknown = await request.json();
    const parsed = createPrintExamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.exams.create.noApprovedError },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // 1. Kiểm tra quyền sở hữu bộ câu hỏi trên server
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

    // 2. Chỉ lấy câu hỏi đã duyệt (approved)
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
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .slice(0, MAX_PRINT_QUESTIONS);

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

    // 3. Lưu dòng exams với exam_mode = 'print'
    const { data: createdExam, error: examError } = await supabase
      .from("exams")
      .insert({
        owner_id: user.id,
        set_id: input.setId,
        title: input.header.examName,
        code: null,
        duration_min: input.header.durationMinutes ?? null,
        shuffle_questions: input.shuffleQuestions,
        shuffle_choices: input.shuffleChoices,
        is_open: false,
        show_answers: true,
        max_attempts: 1,
        total_points: input.totalPoints,
        exam_mode: "print",
        version_count: input.versionCount,
        seed: input.seed,
        header_info: input.header as unknown as Json,
      })
      .select("id")
      .single();

    if (examError || !createdExam) {
      return NextResponse.json(
        { error: examError?.message ?? vi.importSet.errors.saveFailed },
        { status: 500 }
      );
    }

    // 4. Lưu bản chụp exam_questions tại thời điểm tạo đề
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
      .select("id, question_id, points, position, question_snapshot");

    if (eqError || !insertedEqRows) {
      await supabase.from("exams").delete().eq("id", createdExam.id);
      return NextResponse.json(
        { error: eqError?.message ?? vi.importSet.errors.saveFailed },
        { status: 500 }
      );
    }

    // 5. Sinh 1..8 mã đề xác định theo seed và lưu vào exam_versions
    const questionsWithSnapshot: ExamQuestionWithSnapshot[] =
      insertedEqRows.map((row) => ({
        examQuestionId: row.id,
        questionId: row.question_id,
        points: Number(row.points) || 0,
        position: row.position,
        snapshot: row.question_snapshot as unknown as ExamQuestionSnapshot,
      }));

    const pkg = buildPrintExamPackage({
      header: input.header,
      questions: questionsWithSnapshot,
      versionCount: input.versionCount,
      seed: input.seed,
      shuffleQuestions: input.shuffleQuestions,
      shuffleChoices: input.shuffleChoices,
    });

    const versionRows = pkg.versions.map((ver) => ({
      exam_id: createdExam.id,
      code: ver.versionCode,
      question_order: ver.questionOrder,
      choice_orders: ver.choiceOrders as unknown as Json,
    }));

    const { error: verError } = await supabase
      .from("exam_versions")
      .insert(versionRows);

    if (verError) {
      await supabase.from("exams").delete().eq("id", createdExam.id);
      return NextResponse.json(
        { error: verError.message },
        { status: 500 }
      );
    }

    // 6. Lưu thông tin đầu đề làm mặc định cho giáo viên ở những lần sau
    await supabase
      .from("profiles")
      .update({
        default_print_header: {
          schoolName: input.header.schoolName ?? "",
          subject: input.header.subject ?? "",
          className: input.header.className ?? "",
          durationMinutes: input.header.durationMinutes ?? 45,
          studentInfoLine:
            input.header.studentInfoLine ?? vi.printExam.studentInfoLineDefault,
        } as unknown as Json,
      })
      .eq("id", user.id);

    return NextResponse.json({
      examId: createdExam.id,
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

