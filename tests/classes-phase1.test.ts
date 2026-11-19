import { describe, it, expect, vi as vitest } from "vitest";
vitest.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import {
  CLASS_JOIN_CODE_ALPHABET,
  CLASS_JOIN_CODE_LENGTH,
  isValidJoinCode,
  normalizeJoinCode,
  sanitizeNextRedirectPath,
  STUDENT_MAX_JOINED_CLASSES,
} from "@/lib/classes/constants";
import {
  createClassSchema,
  decideMemberSchema,
  mapClassRpcError,
  updateClassSettingsSchema,
} from "@/lib/classes/schemas";
import {
  DEFAULT_FREE_LIMITS,
  DEFAULT_PREMIUM_LIMITS,
  evaluateEntitlements,
  normalizePlanLimits,
} from "@/lib/entitlements";
import { generateQrCodeSvg } from "@/lib/grading/qr-and-csv";

describe("Bước 14 - Giai đoạn 1: Lớp học, Thành viên, Vào lớp & An toàn chuyển hướng", () => {
  it("1. Mã lớp 6 ký tự bỏ ký tự dễ nhầm (0/O/1/I) và chuẩn hóa đầu vào", () => {
    expect(CLASS_JOIN_CODE_LENGTH).toBe(6);
    expect(CLASS_JOIN_CODE_ALPHABET).not.toContain("0");
    expect(CLASS_JOIN_CODE_ALPHABET).not.toContain("O");
    expect(CLASS_JOIN_CODE_ALPHABET).not.toContain("1");
    expect(CLASS_JOIN_CODE_ALPHABET).not.toContain("I");

    expect(normalizeJoinCode("  k7m-9p2 ")).toBe("K7M9P2");
    expect(isValidJoinCode("k7m9p2")).toBe(true);
    expect(isValidJoinCode("K7M9P0")).toBe(false); // chứa số 0
    expect(isValidJoinCode("K7M9PO")).toBe(false); // chứa chữ O
    expect(isValidJoinCode("K7M9P1")).toBe(false); // chứa số 1
    expect(isValidJoinCode("K7M9PI")).toBe(false); // chứa chữ I
    expect(isValidJoinCode("ABC")).toBe(false); // quá ngắn
  });

  it("2. Chống open-redirect cho tham số next khi quay lại /join/[mã] sau đăng nhập", () => {
    expect(sanitizeNextRedirectPath("/join/K7M9P2")).toBe("/join/K7M9P2");
    expect(sanitizeNextRedirectPath("/dashboard/classes")).toBe(
      "/dashboard/classes"
    );
    expect(sanitizeNextRedirectPath("https://evil.example/phish")).toBe(
      "/dashboard"
    );
    expect(sanitizeNextRedirectPath("//evil.example/phish")).toBe("/dashboard");
    expect(sanitizeNextRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(sanitizeNextRedirectPath("javascript:alert(1)")).toBe("/dashboard");
    expect(sanitizeNextRedirectPath("/join/K7M9P2\r\nSet-Cookie: a=b")).toBe(
      "/dashboard"
    );
    expect(sanitizeNextRedirectPath(null)).toBe("/dashboard");
  });

  it("3. Giới hạn lớp & sĩ số trong plans.limits và get_entitlements (Free: 1/40, Premium: 10/200)", () => {
    expect(DEFAULT_FREE_LIMITS.max_classes).toBe(1);
    expect(DEFAULT_FREE_LIMITS.max_students_per_class).toBe(40);
    expect(DEFAULT_PREMIUM_LIMITS.max_classes).toBe(10);
    expect(DEFAULT_PREMIUM_LIMITS.max_students_per_class).toBe(200);
    expect(STUDENT_MAX_JOINED_CLASSES).toBe(10);

    const freeEnt = evaluateEntitlements({ subscription: null });
    expect(freeEnt.limits.max_classes).toBe(1);
    expect(freeEnt.limits.max_students_per_class).toBe(40);

    const premEnt = evaluateEntitlements({
      subscription: {
        plan_code: "premium",
        status: "active",
        period_end: null,
      },
    });
    expect(premEnt.limits.max_classes).toBe(10);
    expect(premEnt.limits.max_students_per_class).toBe(200);

    // Nếu plans.limits thiếu khóa max_classes -> fallback an toàn về Free (1 / 40)
    const partial = normalizePlanLimits({ max_sets: 100 }, true, null);
    expect(partial.max_classes).toBe(1);
    expect(partial.max_students_per_class).toBe(40);
  });

  it("4. Ánh xạ lỗi RPC rõ ràng bằng tiếng Việt, nêu đúng con số gói và thông báo chung cho mã sai", () => {
    const freeMaxClass = mapClassRpcError("MAX_CLASSES_REACHED", {
      currentCount: 1,
      maxClasses: 1,
      isPremium: false,
    });
    expect(freeMaxClass.status).toBe(400);
    expect(freeMaxClass.message).toContain("1/1");
    expect(freeMaxClass.message).toContain("10 lớp");
    expect(freeMaxClass.message).toContain("200 học sinh");

    const classFull = mapClassRpcError("CLASS_FULL", {
      maxStudents: 40,
      isPremium: false,
    });
    expect(classFull.message).toContain("40");
    expect(classFull.message).toContain("200");

    const invalidCode = mapClassRpcError("INVALID_CODE");
    expect(invalidCode.status).toBe(400);
    expect(invalidCode.message).toBe("Mã lớp không hợp lệ.");

    const rateLimited = mapClassRpcError("RATE_LIMITED");
    expect(rateLimited.status).toBe(429);

    const studentLimit = mapClassRpcError("STUDENT_MAX_CLASSES_REACHED", {
      maxClasses: 10,
    });
    expect(studentLimit.message).toContain("10");

    expect(mapClassRpcError("TEACHER_ONLY").status).toBe(403);
    expect(mapClassRpcError("MEMBER_REJECTED").status).toBe(403);
    expect(mapClassRpcError("MEMBER_REMOVED").status).toBe(403);
    expect(mapClassRpcError("CLASS_CLOSED").status).toBe(400);
  });

  it("5. Kiểm tra Zod schema lớp học & tái dùng bộ sinh mã QR cho link /join/[mã]", () => {
    expect(
      createClassSchema.safeParse({
        name: "Lớp 9A1 - Lịch sử",
        description: "Ôn tập HK1",
        requireApproval: true,
      }).success
    ).toBe(true);

    expect(createClassSchema.safeParse({ name: "   " }).success).toBe(false);

    expect(
      updateClassSettingsSchema.safeParse({ action: "regenerate_code" }).success
    ).toBe(true);

    expect(
      decideMemberSchema.safeParse({
        memberUserId: "d5499b1a-194e-454b-b47d-0ef2c863a5c0",
        action: "approve",
      }).success
    ).toBe(true);

    const svg = generateQrCodeSvg("https://memoquiz.vn/join/K7M9P2");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
  });

  it("6. Kiểm tra trực tiếp trên DB thật (nếu đã chạy migration 18 và có mạng): lookup_class_by_join_code chống dò mã & plans có max_classes", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: lookupData, error: lookupErr } = await sb.rpc(
      "lookup_class_by_join_code",
      { p_join_code: "ZZZZZZ", p_client_ip: "127.0.0.1" }
    );

    // Bỏ qua nhẹ nhàng nếu sandbox không có mạng hoặc chưa chạy migration 18
    if (
      lookupErr &&
      (String(lookupErr.message).toLowerCase().includes("fetch failed") ||
        lookupErr.code === "PGRST202" ||
        lookupErr.code === "42883")
    ) {
      return;
    }

    expect(lookupErr).toBeNull();
    expect((lookupData as { error?: string })?.error).toBe("INVALID_CODE");

    // Kiểm tra người chưa đăng nhập gọi create_class phải bị chặn ở server
    const { data: unauthCreate } = await sb.rpc("create_class", {
      p_name: "Test Unauth",
    });
    if (unauthCreate && typeof unauthCreate === "object") {
      expect((unauthCreate as { error?: string }).error).toBe("UNAUTHORIZED");
    }
  });
});

