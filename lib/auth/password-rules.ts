import { z } from "zod";
import { vi } from "@/lib/i18n/vi";

/**
 * Danh sách mật khẩu phổ biến thường gặp cần chặn (tự viết, không dùng thư viện ngoài).
 * So sánh không phân biệt hoa thường và loại bỏ ký tự khoảng trắng đầu/cuối.
 */
export const COMMON_PASSWORDS_BLACKLIST: readonly string[] = Object.freeze([
  "1234567890",
  "12345678901",
  "123456789012",
  "0123456789",
  "password123",
  "password1234",
  "password@123",
  "p@ssword123",
  "p@ssw0rd123",
  "pass123456",
  "admin12345",
  "admin@12345",
  "administrator",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou123",
  "welcome1234",
  "letmein1234",
  "memoquiz123",
  "abc12345678",
  "12345678aa",
  "123456789aa",
  "Aa12345678",
  "Aa123456789",
  "Aa1234567890",
  "Password123",
  "Password1234",
  "Admin12345",
]);

export interface PasswordCriteria {
  length: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  notEmail: boolean;
  notCommon: boolean;
}

export type PasswordStrengthLevel = "weak" | "medium" | "strong";

export interface PasswordStrengthResult {
  score: number; // 0 - 100
  level: PasswordStrengthLevel;
  criteria: PasswordCriteria;
}

/**
 * Kiểm tra xem mật khẩu có chứa email hoặc username email không
 */
export function isPasswordContainingEmail(
  password: string,
  email?: string
): boolean {
  if (!email || !password) return false;
  const normalizedPass = password.toLowerCase().trim();
  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedPass === normalizedEmail) return true;

  const localPart = normalizedEmail.split("@")[0] ?? "";
  if (localPart.length >= 3 && normalizedPass.includes(localPart)) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra mật khẩu có nằm trong danh sách quá phổ biến hoặc chuỗi lặp không
 */
export function isCommonPassword(password: string): boolean {
  if (!password) return false;
  const normalized = password.toLowerCase().trim();

  // Kiểm tra blacklist
  for (const common of COMMON_PASSWORDS_BLACKLIST) {
    if (normalized === common.toLowerCase()) {
      return true;
    }
  }

  // Kiểm tra chuỗi lặp toàn bộ 1 ký tự (ví dụ: "AAAAAAAAAA", "1111111111")
  if (/^(.)\1{7,}$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Đánh giá chi tiết từng điều kiện của mật khẩu
 */
export function evaluatePasswordCriteria(
  password: string,
  email?: string
): PasswordCriteria {
  const safePass = password || "";
  return {
    length: safePass.length >= 10,
    hasUpper: /[A-Z]/.test(safePass),
    hasLower: /[a-z]/.test(safePass),
    hasNumber: /[0-9]/.test(safePass),
    notEmail: !isPasswordContainingEmail(safePass, email),
    notCommon: !isCommonPassword(safePass),
  };
}

/**
 * Tính điểm độ mạnh mật khẩu (0 - 100) và cấp độ (yếu, trung bình, mạnh)
 */
export function calculatePasswordStrength(
  password: string,
  email?: string
): PasswordStrengthResult {
  const criteria = evaluatePasswordCriteria(password, email);
  if (!password || password.length === 0) {
    return { score: 0, level: "weak", criteria };
  }

  let score = 0;

  // Điểm độ dài
  if (password.length >= 10) score += 25;
  if (password.length >= 14) score += 15;
  if (password.length >= 18) score += 10;

  // Điểm ký tự
  if (criteria.hasUpper) score += 15;
  if (criteria.hasLower) score += 15;
  if (criteria.hasNumber) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 10; // Có ký tự đặc biệt

  // Phạt điểm nếu vi phạm email hoặc phổ biến
  if (!criteria.notEmail) score = Math.max(0, score - 50);
  if (!criteria.notCommon) score = Math.max(0, score - 60);

  // Giới hạn trong khoảng 0-100
  score = Math.min(100, Math.max(0, score));

  let level: PasswordStrengthLevel = "weak";
  if (score >= 80 && criteria.length && criteria.hasUpper && criteria.hasLower && criteria.hasNumber) {
    level = "strong";
  } else if (score >= 50 && criteria.length) {
    level = "medium";
  }

  return { score, level, criteria };
}

/**
 * Zod refinement kiểm tra tính an toàn của mật khẩu
 */
export const strongPasswordSchema = z
  .string()
  .min(10, { message: vi.auth.validation.passwordMin10 })
  .regex(/[A-Z]/, { message: vi.auth.validation.passwordNeedsUpper })
  .regex(/[a-z]/, { message: vi.auth.validation.passwordNeedsLower })
  .regex(/[0-9]/, { message: vi.auth.validation.passwordNeedsNumber })
  .refine((val) => !isCommonPassword(val), {
    message: vi.auth.validation.passwordTooCommon,
  });

