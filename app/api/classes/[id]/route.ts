import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, isTeacherRole } from "@/lib/auth/roles";
import {
  mapClassRpcError,
  updateClassSettingsSchema,
} from "@/lib/classes/schemas";
import { vi } from "@/lib/i18n/vi";

const classIdSchema = z.string().uuid();

export async function PATCH(
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
    const parsed = updateClassSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstErr =
        parsed.error.issues[0]?.message ?? vi.classes.errors.invalidName;
      return NextResponse.json({ error: firstErr }, { status: 400 });
    }

    if (parsed.data.action === "regenerate_code") {
      const { data, error } = await supabase.rpc("regenerate_class_join_code", {
        p_class_id: validId.data,
      });

      if (error) {
        console.error(
          "[PATCH /api/classes/[id]] regenerate RPC error:",
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
        join_code?: string;
        class?: unknown;
      } | null;

      if (!payload || payload.error) {
        const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR");
        return NextResponse.json(
          { error: mapped.message },
          { status: mapped.status }
        );
      }

      return NextResponse.json({
        joinCode: payload.join_code,
        class: payload.class,
      });
    }

    const archivedParam =
      parsed.data.action === "archive"
        ? true
        : parsed.data.action === "unarchive"
          ? false
          : null;

    const { data, error } = await supabase.rpc("update_class_settings", {
      p_class_id: validId.data,
      p_name: parsed.data.name ?? null,
      p_description: parsed.data.description ?? null,
      p_update_description: parsed.data.description !== undefined,
      p_require_approval: parsed.data.requireApproval ?? null,
      p_is_open: parsed.data.isOpen ?? null,
      p_archived: archivedParam,
    });

    if (error) {
      console.error(
        "[PATCH /api/classes/[id]] update RPC error:",
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
        { error: mapped.message, code: payload?.error ?? "SYSTEM_ERROR" },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ class: payload.class });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { data: deletedRows, error } = await supabase
      .from("classes")
      .delete()
      .eq("id", validId.data)
      .eq("teacher_id", authProfile.user.id)
      .select("id");

    if (error) {
      console.error(
        "[DELETE /api/classes/[id]] delete error:",
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

