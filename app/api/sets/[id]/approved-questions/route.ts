import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTeacherRole } from "@/lib/auth/roles";
import { vi } from "@/lib/i18n/vi";

const uuidSchema = z.string().uuid();

/**
 * Trả danh sách câu hỏi đã duyệt thuộc bộ câu hỏi của chính giáo viên
 * để tái dùng form CreateExamModal ngay trong luồng Giao bài cho lớp.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const validId = uuidSchema.safeParse(id);
    if (!validId.success) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: setRow } = await supabase
      .from("question_sets")
      .select("id, title")
      .eq("id", validId.data)
      .eq("owner_id", auth.profile.user.id)
      .maybeSingle();

    if (!setRow) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 404 }
      );
    }

    const { data: questionsData, error } = await supabase
      .from("questions")
      .select(
        "id, type, stem, explanation, source_ref, raw_source_text, topic, difficulty, confidence, status, warnings, ai_generated, reviewed_by_human, reviewed_at, created_at, updated_at"
      )
      .eq("set_id", setRow.id)
      .eq("status", "approved")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const items = (questionsData ?? []).map((q, idx) => ({
      ...q,
      orderNumber: idx + 1,
      choices: [],
      answer_text: null,
    }));

    return NextResponse.json({
      set: setRow,
      questions: items,
    });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

