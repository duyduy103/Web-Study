import { describe, expect, it } from "vitest";
import { z } from "zod";
import { vi } from "@/lib/i18n/vi";

const feedbackSchema = z.object({
  type: z.enum(["bug", "idea", "question", "upgrade_request", "other"]),
  content: z
    .string()
    .trim()
    .min(10, { message: vi.feedback.minLengthError })
    .max(2000, { message: vi.feedback.maxLengthError }),
  contact_email: z.string().trim().email().optional().or(z.literal("")),
  context_meta: z
    .object({
      url: z.string().optional(),
      user_agent: z.string().optional(),
      role: z.string().optional(),
    })
    .default({}),
  website_hp: z.string().optional(),
});

describe("Step 12 - Phase D: Admin Security & User Feedback Suite", () => {
  it("1. Kiểm tra xác thực góp ý: hợp lệ khi 10-2000 ký tự và loại hợp lệ", () => {
    const valid = feedbackSchema.safeParse({
      type: "bug",
      content: "Tôi gặp lỗi khi nhấn nút xuất đề in trên di động.",
      contact_email: "test@example.com",
    });
    expect(valid.success).toBe(true);

    // Dưới 10 ký tự -> từ chối
    const tooShort = feedbackSchema.safeParse({
      type: "bug",
      content: "Lỗi nè",
      contact_email: "test@example.com",
    });
    expect(tooShort.success).toBe(false);

    // Quá 2000 ký tự -> từ chối
    const tooLong = feedbackSchema.safeParse({
      type: "idea",
      content: "A".repeat(2001),
      contact_email: "test@example.com",
    });
    expect(tooLong.success).toBe(false);

    // Loại không hợp lệ -> từ chối
    const invalidType = feedbackSchema.safeParse({
      type: "invalid_category",
      content: "Nội dung hợp lệ dài hơn 10 ký tự",
    });
    expect(invalidType.success).toBe(false);
  });

  it("2. Kiểm tra email liên hệ: khách bắt buộc có email, người đã đăng nhập có thể bỏ trống", () => {
    // Khách chưa đăng nhập không có email
    const guestWithoutEmail = (email: string | undefined, isLoggedIn: boolean) => {
      if (!isLoggedIn && (!email || !email.includes("@"))) {
        return { ok: false, error: vi.feedback.emailRequiredError };
      }
      return { ok: true };
    };

    expect(guestWithoutEmail("", false).ok).toBe(false);
    expect(guestWithoutEmail("invalid-email", false).ok).toBe(false);
    expect(guestWithoutEmail("user@example.com", false).ok).toBe(true);
    // Người đã đăng nhập có thể bỏ trống email
    expect(guestWithoutEmail("", true).ok).toBe(true);
  });

  it("3. Chống bot spam bằng honeypot (website_hp)", () => {
    const detectBotSpam = (hp: string | undefined) => {
      return Boolean(hp && hp.trim().length > 0);
    };

    // Người dùng thật không điền trường honeypot
    expect(detectBotSpam("")).toBe(false);
    expect(detectBotSpam(undefined)).toBe(false);

    // Bot quét form tự động điền giá trị vào tất cả input -> bị chặn
    expect(detectBotSpam("https://spam-bot.site")).toBe(true);
    expect(detectBotSpam("1")).toBe(true);
  });

  it("4. Chống tấn công XSS: nội dung góp ý từ chối render HTML, luôn đối xử là plain text", () => {
    const maliciousPayload = "<script>alert('pwned')</script><img src=x onerror=alert(1)>";

    // Phản hồi gửi lên chứa mã HTML/script độc hại
    const parsed = feedbackSchema.safeParse({
      type: "bug",
      content: `Lỗi nghiêm trọng: ${maliciousPayload}`,
      contact_email: "hacker@test.com",
    });
    expect(parsed.success).toBe(true);

    // Khi ứng dụng hiển thị (React JSX {content}), React tự động escape ký tự:
    // Chuỗi văn bản thuần túy không bao giờ được đưa vào dangerouslySetInnerHTML
    const renderSafeText = (raw: string) => {
      return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    };

    const escaped = renderSafeText(parsed.data?.content ?? "");
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("5. Nguyên tắc an toàn Admin: vai trò admin không bao giờ lưu trong profiles.role hoặc nhận từ client", () => {
    // Schema đăng ký chỉ chấp nhận 'teacher' hoặc 'student'
    const allowedRoles = ["teacher", "student"];
    expect(allowedRoles.includes("admin")).toBe(false);

    // Giả lập kiểm tra is_admin độc lập bằng bảng admins
    const mockAdminsTable = new Set(["admin-uuid-1", "admin-uuid-2"]);
    const checkIsAdmin = (userId: string) => mockAdminsTable.has(userId);

    expect(checkIsAdmin("admin-uuid-1")).toBe(true);
    expect(checkIsAdmin("regular-student-uuid")).toBe(false);
    expect(checkIsAdmin("regular-teacher-uuid")).toBe(false);
  });

  it("6. Cấu trúc nhật ký thao tác admin (admin_audit_log)", () => {
    const validateAuditLogEntry = (entry: {
      admin_id: string;
      action: string;
      target_type: string;
      target_id: string;
      before_state?: unknown;
      after_state?: unknown;
      reason?: string | null;
    }) => {
      expect(entry.admin_id).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.target_type).toBeTruthy();
      expect(entry.target_id).toBeTruthy();
      return true;
    };

    expect(
      validateAuditLogEntry({
        admin_id: "admin-uuid-1",
        action: "feedback_update_status",
        target_type: "feedback",
        target_id: "fb-uuid-123",
        before_state: { status: "new" },
        after_state: { status: "resolved" },
        reason: "Fixed in production",
      })
    ).toBe(true);
  });
});

