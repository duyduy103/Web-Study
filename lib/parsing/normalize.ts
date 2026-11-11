/**
 * Chuẩn hóa văn bản đầu vào:
 * - Đưa về bảng mã chuẩn Unicode NFC (đảm bảo tiếng Việt dựng sẵn thống nhất).
 * - Đổi CRLF/CR thành LF.
 * - Loại bỏ ký tự điều khiển vô hình (zero-width space, BOM) và khoảng trắng thừa cuối dòng.
 * - Giữ nguyên nội dung gốc của giáo viên, không tự ý sửa chính tả.
 */
export function normalizeText(raw: string): string {
  if (!raw) {
    return "";
  }

  return raw
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeInlineWhitespace(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

