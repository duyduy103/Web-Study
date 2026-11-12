import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import { generateDistractorsBatchWithAi } from "@/lib/ai/tasks";

const generateRequestSchema = z.object({
  action: z.literal("generate"),
  setId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(30),
});

const undoSnapshotSchema = z.object({
  questionId: z.string().uuid(),
  previousExplanation: z.string().nullable(),
  answerText: z.string().min(1),
});

const undoRequestSchema = z.object({
  action: z.literal("undo"),
  setId: z.string().uuid(),
  snapshots: z.array(undoSnapshotSchema).min(1),
});

const requestBodySchema = z.discriminatedUnion("action", [
  generateRequestSchema,
  undoRequestSchema,
]);

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

    const rawBody: unknown = await request.json();
    const parsedBody = requestBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: vi.ai.callFailed },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;

    // Kiểm tra quyền sở hữu bộ câu hỏi trên server
    const { data: ownedSet } = await supabase
      .from("question_sets")
      .select("id")
      .eq("id", payload.setId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!ownedSet) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundDescription },
        { status: 403 }
      );
    }

    if (payload.action === "undo") {
      for (const snap of payload.snapshots) {
        await supabase
          .from("choices")
          .delete()
          .eq("question_id", snap.questionId);

        await supabase
          .from("questions")
          .update({
            type: "short_answer",
            explanation: snap.previousExplanation,
            ai_generated: false,
          })
          .eq("id", snap.questionId)
          .eq("set_id", payload.setId);

        const { data: existingAns } = await supabase
          .from("answers")
          .select("id")
          .eq("question_id", snap.questionId)
          .maybeSingle();

        if (!existingAns) {
          await supabase.from("answers").insert({
            question_id: snap.questionId,
            answer_text: snap.answerText,
            accepted_variants: [],
          });
        }
      }

      return NextResponse.json({ status: "undone" });
    }

    // Xử lý action === "generate"
    const { data: questions } = await supabase
      .from("questions")
      .select("id, stem, explanation, type")
      .eq("set_id", payload.setId)
      .in("id", payload.questionIds);

    const { data: answers } = await supabase
      .from("answers")
      .select("question_id, answer_text")
      .in("question_id", payload.questionIds);

    const answerMap = new Map(
      (answers ?? []).map((a) => [a.question_id, a.answer_text.trim()])
    );

    const validItems: Array<{
      questionId: string;
      stem: string;
      correctAnswer: string;
      previousExplanation: string | null;
    }> = [];

    const skipped: Array<{
      questionId: string;
      stem: string;
      reason: string;
    }> = [];

    for (const q of questions ?? []) {
      const ans = answerMap.get(q.id);
      if (!ans) {
        skipped.push({
          questionId: q.id,
          stem: q.stem,
          reason: vi.ai.distractors.skippedReasonMissingAnswer,
        });
      } else {
        validItems.push({
          questionId: q.id,
          stem: q.stem,
          correctAnswer: ans,
          previousExplanation: q.explanation,
        });
      }
    }

    if (validItems.length === 0) {
      return NextResponse.json({
        updatedCount: 0,
        skipped,
        undoSnapshots: [],
        cacheHit: true,
      });
    }

    const aiBatch = await generateDistractorsBatchWithAi({
      supabase,
      userId: user.id,
      items: validItems.map((i) => ({
        questionId: i.questionId,
        stem: i.stem,
        correctAnswer: i.correctAnswer,
      })),
    });

    const undoSnapshots = validItems.map((i) => ({
      questionId: i.questionId,
      previousExplanation: i.previousExplanation,
      answerText: i.correctAnswer,
    }));

    for (const out of aiBatch.results) {
      await supabase
        .from("choices")
        .delete()
        .eq("question_id", out.questionId);

      const choiceRows = out.choices.map((c, idx) => ({
        question_id: out.questionId,
        text: c.text,
        is_correct: c.isCorrect,
        position: idx,
        ai_generated: c.aiGenerated,
      }));

      const { error: insertChoicesErr } = await supabase
        .from("choices")
        .insert(choiceRows);

      if (insertChoicesErr) {
        throw new Error(insertChoicesErr.message);
      }

      const { error: updateQErr } = await supabase
        .from("questions")
        .update({
          type: "mcq",
          explanation: out.explanation,
          ai_generated: true,
        })
        .eq("id", out.questionId)
        .eq("set_id", payload.setId);

      if (updateQErr) {
        throw new Error(updateQErr.message);
      }
    }

    return NextResponse.json({
      updatedCount: aiBatch.results.length,
      skipped,
      undoSnapshots,
      cacheHit: aiBatch.cacheHit,
      remainingQuota: aiBatch.remainingQuota,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.ai.callFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

