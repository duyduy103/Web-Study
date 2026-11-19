import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import { createClassSchema, mapClassRpcError } from "@/lib/classes/schemas";
import { vi } from "@/lib/i18n/vi";

export async function GET() {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);

    if (!authProfile) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }

    if (isTeacherRole(authProfile.role)) {
      const { data, error } = await supabase.rpc("get_teacher_classes");
      if (error) {
        console.error("[GET /api/classes] RPC error:", error.code, error.message);
        return NextResponse.json(
          { error: vi.classes.errors.systemError },
          { status: 503 }
        );
      }
      const payload = data as { error?: string | null; classes?: unknown[] } | null;
      if (!payload || payload.error) {
        const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR");
        return NextResponse.json({ error: mapped.message }, { status: mapped.status });
      }
      return NextResponse.json({ role: "teacher", classes: payload.classes ?? [] });
    }

    const { data, error } = await supabase.rpc("get_student_classes");
    if (error) {
      console.error("[GET /api/classes] Student RPC error:", error.code, error.message);
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }
    const payload = data as { error?: string | null; classes?: unknown[] } | null;
    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json({ role: "student", classes: payload.classes ?? [] });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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
    const parsed = createClassSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstErr =
        parsed.error.issues[0]?.message ?? vi.classes.errors.invalidName;
      return NextResponse.json({ error: firstErr }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("create_class", {
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? null,
      p_require_approval: parsed.data.requireApproval,
    });

    if (error) {
      console.error("[POST /api/classes] RPC error:", error.code, error.message);
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as {
      error?: string | null;
      class?: unknown;
      current_count?: number;
      max_classes?: number;
      is_premium?: boolean;
    } | null;

    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR", {
        currentCount: payload?.current_count,
        maxClasses: payload?.max_classes,
        isPremium: payload?.is_premium,
      });
      return NextResponse.json(
        {
          error: mapped.message,
          code: payload?.error ?? "SYSTEM_ERROR",
        },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ class: payload.class }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

