import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  applyQuestionSnapshotsOnServer,
  fetchSingleReviewQuestion,
  saveInlineQuestionOnServer,
} from "@/lib/review/server-service";
import { reviewChoiceZodSchema } from "@/lib/review/validation";
import { vi } from "@/lib/i18n/vi";

const questionSnapshotZodSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["mcq", "true_false", "cloze", "short_answer"]),
  stem: z.string(),
  explanation: z.string().nullable(),
  topic: z.string().nullable(),
  difficulty: z.string().nullable(),
  confidence: z.number().nullable(),
  status: z.enum(["draft", "approved", "archived"]),
  warnings: z.array(z.string()),
  ai_generated: z.boolean(),
  reviewed_by_human: z.boolean(),
  reviewed_at: z.string().nullable(),
  choices: z.array(reviewChoiceZodSchema),
  answer_text: z.string().nullable(),
});

const requestActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_inline"),
    payload: z.unknown(),
  }),
  z.object({
    action: z.literal("apply_snapshots"),
    snapshots: z.array(questionSnapshotZodSchema).min(1).max(300),
    expectedUpdatedAtById: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal("fetch_question"),
    questionId: z.string().uuid(),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: setId } = await context.params;
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

    // Kiểm tra quyền sở hữu bộ câu hỏi ở server (bên cạnh RLS)
    const { data: ownedSet } = await supabase
      .from("question_sets")
      .select("id")
      .eq("id", setId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!ownedSet) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundDescription },
        { status: 403 }
      );
    }

    const rawBody: unknown = await request.json();
    const parsedBody = requestActionSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const body = parsedBody.data;

    if (body.action === "fetch_question") {
      const latestQuestion = await fetchSingleReviewQuestion(
        supabase,
        setId,
        body.questionId
      );
      if (!latestQuestion) {
        return NextResponse.json(
          { error: vi.setDetails.notFoundDescription },
          { status: 404 }
        );
      }
      return NextResponse.json({ question: latestQuestion });
    }

    if (body.action === "save_inline") {
      const result = await saveInlineQuestionOnServer({
        supabase,
        setId,
        rawPayload: body.payload,
      });

      revalidatePath("/dashboard");
      revalidatePath(`/dashboard/sets/${setId}`);

      return NextResponse.json(result);
    }

    // action === "apply_snapshots"
    const applyResult = await applyQuestionSnapshotsOnServer({
      supabase,
      snapshots: body.snapshots,
      expectedUpdatedAtById: body.expectedUpdatedAtById,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/sets/${setId}`);

    return NextResponse.json(applyResult);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.review.editor.errorStatus;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

