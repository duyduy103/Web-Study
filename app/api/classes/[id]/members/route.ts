import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { decideMemberSchema, mapClassRpcError } from "@/lib/classes/schemas";
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

    if (!isTeacherRole(authProfile.role)) {
      return NextResponse.json(
        { error: vi.classes.errors.teacherOnly },
        { status: 403 }
      );
    }

    const { data, error } = await supabase.rpc(
      "get_class_members_for_teacher",
      { p_class_id: validId.data }
    );

    if (error) {
      console.error(
        "[GET /api/classes/[id]/members] RPC error:",
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
      members?: unknown[];
    } | null;

    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ members: payload.members ?? [] });
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
    const parsed = decideMemberSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("decide_class_member", {
      p_class_id: validId.data,
      p_member_user_id: parsed.data.memberUserId,
      p_action: parsed.data.action,
    });

    if (error) {
      console.error(
        "[POST /api/classes/[id]/members] RPC error:",
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
      status?: string;
      max_students?: number;
      is_premium?: boolean;
    } | null;

    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR", {
        maxStudents: payload?.max_students,
        isPremium: payload?.is_premium,
      });
      return NextResponse.json(
        { error: mapped.message, code: payload?.error ?? "SYSTEM_ERROR" },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ status: payload.status });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

