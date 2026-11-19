import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeJoinCode,
  STUDENT_MAX_JOINED_CLASSES,
} from "@/lib/classes/constants";
import {
  joinClassSchema,
  leaveClassSchema,
  mapClassRpcError,
} from "@/lib/classes/schemas";
import { vi } from "@/lib/i18n/vi";

function getClientIp(request: NextRequest | Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export async function GET(request: NextRequest) {
  try {
    const codeRaw = request.nextUrl.searchParams.get("code") ?? "";
    const normalized = normalizeJoinCode(codeRaw);
    const clientIp = getClientIp(request);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("lookup_class_by_join_code", {
      p_join_code: normalized,
      p_client_ip: clientIp,
    });

    if (error) {
      console.error("[GET /api/classes/join] RPC error:", error.code, error.message);
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as { error?: string | null; class?: unknown } | null;
    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "INVALID_CODE");
      return NextResponse.json(
        { error: mapped.message, code: payload?.error ?? "INVALID_CODE" },
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized, code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = joinClassSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.classes.errors.invalidCode, code: "INVALID_CODE" },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const { data, error } = await supabase.rpc("join_class_by_code", {
      p_join_code: parsed.data.joinCode,
      p_client_ip: clientIp,
      p_max_student_classes: STUDENT_MAX_JOINED_CLASSES,
    });

    if (error) {
      console.error("[POST /api/classes/join] RPC error:", error.code, error.message);
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as {
      error?: string | null;
      status?: "active" | "pending";
      already_member?: boolean;
      class_id?: string;
      class_name?: string;
      max_classes?: number;
      max_students?: number;
    } | null;

    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR", {
        maxClasses: payload?.max_classes,
        maxStudents: payload?.max_students,
      });
      return NextResponse.json(
        { error: mapped.message, code: payload?.error ?? "SYSTEM_ERROR" },
        { status: mapped.status }
      );
    }

    return NextResponse.json({
      status: payload.status,
      alreadyMember: Boolean(payload.already_member),
      classId: payload.class_id,
      className: payload.class_name,
    });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.classes.errors.unauthorized },
        { status: 401 }
      );
    }

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = leaveClassSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.classes.errors.notFound },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("leave_class", {
      p_class_id: parsed.data.classId,
    });

    if (error) {
      console.error("[DELETE /api/classes/join] RPC error:", error.code, error.message);
      return NextResponse.json(
        { error: vi.classes.errors.systemError },
        { status: 503 }
      );
    }

    const payload = data as { error?: string | null; left?: boolean } | null;
    if (!payload || payload.error) {
      const mapped = mapClassRpcError(payload?.error ?? "SYSTEM_ERROR");
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status }
      );
    }

    return NextResponse.json({ left: true });
  } catch {
    return NextResponse.json(
      { error: vi.classes.errors.systemError },
      { status: 500 }
    );
  }
}

