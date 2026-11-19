export const CLASS_JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLASS_JOIN_CODE_LENGTH = 6;
export const CLASS_JOIN_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;

/** Giới hạn số lớp tối đa một học sinh được tham gia đồng thời (không phụ thuộc gói). */
export const STUDENT_MAX_JOINED_CLASSES = 10;

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isValidJoinCode(raw: string): boolean {
  return CLASS_JOIN_CODE_REGEX.test(normalizeJoinCode(raw));
}

/**
 * Kiểm tra đường dẫn chuyển hướng nội bộ sau đăng nhập/đăng ký để chống open redirect.
 * Chỉ chấp nhận đường dẫn tương đối bắt đầu bằng đúng 1 dấu `/` (không chấp nhận `//`, `/\`, URL ngoài).
 */
export function sanitizeNextRedirectPath(
  rawNext: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!rawNext || typeof rawNext !== "string") {
    return fallback;
  }

  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\") ||
    /[\r\n\0]/.test(trimmed) ||
    trimmed.includes("://")
  ) {
    return fallback;
  }

  return trimmed;
}

