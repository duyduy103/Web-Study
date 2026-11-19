import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import {
  createClassAssignmentSchema,
  deleteClassAssignmentSchema,
  mapAssignmentRpcError,
  updateClassAssignmentSchema,
} from "@/lib/classes/assignments";
import { vi } from "@/lib/i18n/vi";

const classIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const validId = classIdSchema.safeParse(id);
    if (!validId.success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }

    if (isTeacherRole(authProfile.role)) {
      const { data, error } = await supabase.rpc(
        "get_teacher_class_assignments",
        { p_class_id: validId.data }
      );
      if (error) {
        console.error(
          "[GET /api/classes/[id]/assignments] teacher RPC error:",
          error.code,
          error.message
        );
        return NextResponse.json(
          { error: vi.classes.errors.systemError },
          { status: 503 }
        );
      }
      const payload = data as {
        error?: string | null;
        assignments?: unknown[];
        total_active_students?: number;
      } | null;
      if (!payload || payload.error) {
        const mapped = mapAssignmentRpcError(payload?.error ?? "SYSTEM_ERROR");
        return NextResponse.json(
          { error: mapped.message },
          { status: mapped.status }
        );
      }
      return NextResponse.json({
        role: "teacher",
        assignments: payload.assignments ?? [],
        totalActiveStudents: payload.total_active_students ?? 0,
      });
    }

    const { data, error } = await supabase.rpc(
      "get_student_class_assignments",
      { p_class_id: validId.data }
    );
    if (error) {
      console.error(
        "[GET /api/classes/[id]/assignments] student RPC error:",
        error.code,
        error.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }
    const payload = data as {
      error?: string | null;
      assignments?: unknown[];
    } | null;
    if (!payload || payload.error) {
      const mapped = mapAssignmentRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }
    return NextResponse.json({
      role: "student",
      assignments: payload.assignments ?? [],
    });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const validId = classIdSchema.safeParse(id);
    if (!validId.success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }

    if (!isTeacherRole(authProfile.role)) {
      return NextResponse.json(
        { error: vi.classes.errors.teacherOnly },
        { status: 403 }
      );
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = createClassAssignmentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            vi.classes.assignments.errors.invalidTarget,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("create_class_assignment", {
      p_class_id: validId.data,
      p_kind: parsed.data.kind,
      p_exam_id: parsed.data.kind === "exam" ? (parsed.data.examId ?? null) : null,
      p_set_id: parsed.data.kind === "study" ? (parsed.data.setId ?? null) : null,
      p_title: parsed.data.title,
      p_instructions: parsed.data.instructions ?? null,
      p_due_at: parsed.data.dueAt ?? null,
      p_lock_after_due: parsed.data.lockAfterDue,
      p_set_exam_class_only: parsed.data.setExamClassOnly,
    });

    if (error) {
      console.error(
        "[POST /api/classes/[id]/assignments] RPC error:",
        error.code,
        error.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as { error?: string | null; assignment?: unknown } | null;
    if (!payload || payload.error) {
      const mapped = mapAssignmentRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ assignment: payload.assignment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!classIdSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }
    if (!isTeacherRole(authProfile.role)) {
      return NextResponse.json(
        { error: vi.classes.errors.teacherOnly },
        { status: 403 }
      );
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = updateClassAssignmentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            vi.classes.assignments.errors.invalidTitle,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("update_class_assignment", {
      p_assignment_id: parsed.data.assignmentId,
      p_title: parsed.data.title ?? null,
      p_instructions: parsed.data.instructions ?? null,
      p_update_instructions: parsed.data.instructions !== undefined,
      p_due_at: parsed.data.dueAt ?? null,
      p_update_due_at: parsed.data.dueAt !== undefined,
      p_lock_after_due: parsed.data.lockAfterDue ?? null,
      p_closed: parsed.data.closed ?? null,
    });

    if (error) {
      console.error(
        "[PATCH /api/classes/[id]/assignments] RPC error:",
        error.code,
        error.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as { error?: string | null; assignment?: unknown } | null;
    if (!payload || payload.error) {
      const mapped = mapAssignmentRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ assignment: payload.assignment });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const validClassId = classIdSchema.safeParse(id);
    if (!validClassId.success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }
    if (!isTeacherRole(authProfile.role)) {
      return NextResponse.json(
        { error: vi.classes.errors.teacherOnly },
        { status: 403 }
      );
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = deleteClassAssignmentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const { data: deletedRows, error } = await supabase
      .from("class_assignments")
      .delete()
      .eq("id", parsed.data.assignmentId)
      .eq("class_id", validClassId.data)
      .select("id");

    if (error) {
      console.error(
        "[DELETE /api/classes/[id]/assignments] error:",
        error.code,
        error.message
      );
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

