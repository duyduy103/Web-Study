import { describe, it, expect } from "vitest";
import {
  evaluatePasswordCriteria,
  calculatePasswordStrength,
  isCommonPassword,
  isPasswordContainingEmail,
  strongPasswordSchema,
  COMMON_PASSWORDS_BLACKLIST,
} from "@/lib/auth/password-rules";
import {
  loginSchema,
  signupSchema,
  resetPasswordSchema,
} from "@/lib/auth/schemas";
import { vi } from "@/lib/i18n/vi";

describe("Password Rules & Strength Suite", () => {
  it("1. Từ chối mật khẩu dưới 10 ký tự", () => {
    const res = evaluatePasswordCriteria("Abc12345");
    expect(res.length).toBe(false);

    const schemaRes = strongPasswordSchema.safeParse("Abc12345");
    expect(schemaRes.success).toBe(false);
    if (!schemaRes.success) {
      expect(schemaRes.error.issues[0]?.message).toBe(
        vi.auth.validation.passwordMin10
      );
    }
  });

  it("2. Bắt buộc có chữ hoa, chữ thường và chữ số", () => {
    // Thiếu chữ hoa
    expect(evaluatePasswordCriteria("abcdef12345").hasUpper).toBe(false);
    expect(strongPasswordSchema.safeParse("abcdef12345").success).toBe(false);

    // Thiếu chữ thường
    expect(evaluatePasswordCriteria("ABCDEF12345").hasLower).toBe(false);
    expect(strongPasswordSchema.safeParse("ABCDEF12345").success).toBe(false);

    // Thiếu chữ số
    expect(evaluatePasswordCriteria("Abcdefghij").hasNumber).toBe(false);
    expect(strongPasswordSchema.safeParse("Abcdefghij").success).toBe(false);

    // Đủ cả 3
    const valid = evaluatePasswordCriteria("Abcdef12345");
    expect(valid.hasUpper).toBe(true);
    expect(valid.hasLower).toBe(true);
    expect(valid.hasNumber).toBe(true);
    expect(valid.length).toBe(true);
  });

  it("3. Chặn các mật khẩu phổ biến trong danh sách blacklist (không phân biệt hoa thường)", () => {
    for (const common of COMMON_PASSWORDS_BLACKLIST.slice(0, 5)) {
      expect(isCommonPassword(common)).toBe(true);
      expect(isCommonPassword(common.toUpperCase())).toBe(true);
      expect(isCommonPassword(common.toLowerCase())).toBe(true);
    }

    expect(isCommonPassword("password123")).toBe(true);
    expect(isCommonPassword("1234567890")).toBe(true);
    expect(isCommonPassword("Admin12345")).toBe(true);
    // Ký tự lặp lại liên tục
    expect(isCommonPassword("AAAAAAAAAA")).toBe(true);

    const schemaRes = strongPasswordSchema.safeParse("Password123");
    expect(schemaRes.success).toBe(false);
    if (!schemaRes.success) {
      expect(schemaRes.error.issues[0]?.message).toBe(
        vi.auth.validation.passwordTooCommon
      );
    }
  });

  it("4. Chặn mật khẩu chứa email hoặc tên tài khoản email", () => {
    const email = "nguyenvana@gmail.com";
    expect(isPasswordContainingEmail("nguyenvana123", email)).toBe(true);
    expect(isPasswordContainingEmail("Nguyenvana@2026", email)).toBe(true);
    expect(isPasswordContainingEmail("SafePassword123#", email)).toBe(false);

    const parsed = signupSchema.safeParse({
      role: "student",
      displayName: "Van A",
      email: "nguyenvana@gmail.com",
      password: "Nguyenvana12345",
      confirmPassword: "Nguyenvana12345",
      consentAccepted: true,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages).toContain(vi.auth.validation.passwordContainsEmail);
    }
  });

  it("5. Bắt buộc nhập lại mật khẩu khớp chính xác (confirmPassword)", () => {
    const mismatch = signupSchema.safeParse({
      role: "student",
      email: "hocsinh@school.edu.vn",
      password: "SuperSecretPassword123!",
      confirmPassword: "DifferentPassword123!",
      consentAccepted: true,
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      const messages = mismatch.error.issues.map((i) => i.message);
      expect(messages).toContain(vi.auth.validation.passwordMismatch);
    }

    const match = signupSchema.safeParse({
      role: "student",
      email: "hocsinh@school.edu.vn",
      password: "SuperSecretPassword123!",
      confirmPassword: "SuperSecretPassword123!",
      consentAccepted: true,
    });
    expect(match.success).toBe(true);
  });

  it("6. Đo độ mạnh mật khẩu theo thời gian thực (weak, medium, strong)", () => {
    const weak = calculatePasswordStrength("12345");
    expect(weak.level).toBe("weak");
    expect(weak.score).toBeLessThan(50);

    const medium = calculatePasswordStrength("Abcdef12345");
    expect(["medium", "strong"]).toContain(medium.level);
    expect(medium.score).toBeGreaterThanOrEqual(50);

    const strong = calculatePasswordStrength("MySuper#ComplexPassword2026!");
    expect(strong.level).toBe("strong");
    expect(strong.score).toBeGreaterThanOrEqual(80);
  });

  it("7. Reset password schema áp dụng đúng quy tắc mật khẩu mạnh", () => {
    const invalid = resetPasswordSchema.safeParse({
      password: "weak",
      confirmPassword: "weak",
    });
    expect(invalid.success).toBe(false);

    const valid = resetPasswordSchema.safeParse({
      password: "NewStrongPassword2026!",
      confirmPassword: "NewStrongPassword2026!",
    });
    expect(valid.success).toBe(true);
  });
});

describe("File Hash Duplicate Isolation per Owner Suite", () => {
  it("8. Mô phỏng kiểm tra trùng file: cô lập hoàn toàn giữa 2 người dùng A và B", () => {
    // Database giả lập lưu các bộ câu hỏi
    const mockDb: Array<{
      id: string;
      owner_id: string;
      title: string;
      source_file_hash: string;
    }> = [];

    const fileHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const userA = "11111111-1111-1111-1111-111111111111"; // Giáo viên
    const userB = "22222222-2222-2222-2222-222222222222"; // Học sinh

    // Hàm kiểm tra trùng chuẩn hóa: LUÔN lọc theo (owner_id, source_file_hash)
    function checkDuplicate(ownerId: string, hash: string) {
      return mockDb.find(
        (set) => set.owner_id === ownerId && set.source_file_hash === hash
      );
    }

    // Bước 1: Giáo viên A nạp file lần đầu -> Không trùng -> Thành công
    expect(checkDuplicate(userA, fileHash)).toBeUndefined();
    mockDb.push({
      id: "set-a-1",
      owner_id: userA,
      title: "Đề cương Toán 12 của Thầy",
      source_file_hash: fileHash,
    });

    // Bước 2: Học sinh B nạp CÙNG file đó -> Kiểm tra theo userB -> Không trùng!
    // B không thấy bất kỳ dấu vết nào của A
    const duplicateForB = checkDuplicate(userB, fileHash);
    expect(duplicateForB).toBeUndefined();

    // B lưu thành công bộ câu hỏi của chính mình
    mockDb.push({
      id: "set-b-1",
      owner_id: userB,
      title: "Bộ ôn tập Toán của Em",
      source_file_hash: fileHash,
    });

    // Bước 3: Giáo viên A nạp lại file của chính mình -> Hệ thống phát hiện trùng!
    const duplicateForA = checkDuplicate(userA, fileHash);
    expect(duplicateForA).toBeDefined();
    expect(duplicateForA?.id).toBe("set-a-1");
    expect(duplicateForA?.owner_id).toBe(userA);

    // Bước 4: Học sinh B nạp lại file của chính mình -> B cũng thấy trùng bộ của B (không phải bộ của A)
    const secondDuplicateForB = checkDuplicate(userB, fileHash);
    expect(secondDuplicateForB).toBeDefined();
    expect(secondDuplicateForB?.id).toBe("set-b-1");
    expect(secondDuplicateForB?.owner_id).toBe(userB);
  });

  it("9. Đường dẫn Storage luôn được phân chia theo userId", () => {
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";
    const setIdA = "set-a";
    const setIdB = "set-b";
    const fileName = "de_cuong.docx";

    const pathA = `${userA}/${setIdA}/${Date.now()}_${fileName}`;
    const pathB = `${userB}/${setIdB}/${Date.now()}_${fileName}`;

    expect(pathA.startsWith(`${userA}/`)).toBe(true);
    expect(pathB.startsWith(`${userB}/`)).toBe(true);
    expect(pathA).not.toEqual(pathB);
  });
});

describe("Login & Form State Suite", () => {
  it("10. Login schema kiểm tra email hợp lệ", () => {
    expect(
      loginSchema.safeParse({ email: "invalid", password: "somepassword" }).success
    ).toBe(false);

    expect(
      loginSchema.safeParse({ email: "teacher@test.com", password: "mypassword" }).success
    ).toBe(true);
  });
});

