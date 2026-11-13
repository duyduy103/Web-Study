import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTeacherRole } from "@/lib/auth/roles";
import { generateExamJoinCode } from "@/lib/grading";
import { vi } from "@/lib/i18n/vi";

const patchStudySetSchema = z.object({
  studyEnabled: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: setId } = await context.params;
    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await supabase.rpc("get_teacher_set_study_stats", {
      p_set_id: setId,
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? vi.review.editor.errorStatus },
        { status: 500 }
      );
    }

    const payload = data as { error: string | null };
    if (payload.error === "FORBIDDEN") {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 403 }
      );
    }

    return NextResponse.json(data);
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

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: setId } = await context.params;
    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.profile.user;

    const body: unknown = await request.json();
    const parsed = patchStudySetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const { data: setRow } = await supabase
      .from("question_sets")
      .select("id, study_code, study_enabled")
      .eq("id", setId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!setRow) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 404 }
      );
    }

    let studyCode = setRow.study_code;
    if (!studyCode && parsed.data.studyEnabled) {
      studyCode = generateExamJoinCode();
      for (let i = 0; i < 5; i += 1) {
        const { data: dup } = await supabase
          .from("question_sets")
          .select("id")
          .eq("study_code", studyCode)
          .maybeSingle();
        if (!dup) break;
        studyCode = generateExamJoinCode();
      }
    }

    const { error: updateErr } = await supabase
      .from("question_sets")
      .update({
        study_enabled: parsed.data.studyEnabled,
        study_code: studyCode,
      })
      .eq("id", setId)
      .eq("owner_id", user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      studyEnabled: parsed.data.studyEnabled,
      studyCode,
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

