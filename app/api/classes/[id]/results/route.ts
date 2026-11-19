import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTeacherRole } from "@/lib/auth/roles";
import { vi } from "@/lib/i18n/vi";
import {
  generateClassGradebookCsv,
  type TeacherClassResultsPayload,
} from "@/lib/classes/results";

const uuidSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: classId } = await context.params;
    if (!uuidSchema.safeParse(classId).success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const assignmentId = url.searchParams.get("assignmentId");
    if (assignmentId && !uuidSchema.safeParse(assignmentId).success) {
      return NextResponse.json(
        { error: vi.classes.assignments.errors.invalidTarget },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("get_teacher_class_results", {
      p_class_id: classId,
    });

    if (error || !data) {
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 500 }
      );
    }

    const payload = data as unknown as TeacherClassResultsPayload;
    if (payload.error) {
      const status =
        payload.error === "TEACHER_ROLE_REQUIRED"
          ? 403
          : payload.error === "CLASS_NOT_FOUND"
            ? 404
            : 400;
      const msg =
        payload.error === "TEACHER_ROLE_REQUIRED"
          ? vi.classes.errors.teacherOnly
          : vi.classes.errors.notFound;
      return NextResponse.json({ error: msg }, { status });
    }

    if (format === "csv") {
      const csv = generateClassGradebookCsv({
        className: payload.class_name,
        students: payload.students,
        assignments: payload.assignments,
        examCells: payload.exam_cells,
        studyCells: payload.study_cells,
        selectedAssignmentId: assignmentId,
      });

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bang-diem-lop-${classId.slice(0, 8)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

