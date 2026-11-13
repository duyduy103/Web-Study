import type { SrsCardStateRecord } from "./types";

/**
 * Gộp danh sách thẻ FSRS từ hồ sơ ẩn danh cũ vào hồ sơ tài khoản:
 * - Không bao giờ tạo 2 thẻ trùng question_id.
 * - Nếu cả hai cùng có thẻ cho một question_id, giữ lại bản có last_review mới hơn.
 */
export function mergeCardStatesWithoutDuplicates(
  existingAccountCards: readonly SrsCardStateRecord[],
  anonymousCards: readonly SrsCardStateRecord[]
): SrsCardStateRecord[] {
  const byQuestionId = new Map<string, SrsCardStateRecord>();

  for (const card of existingAccountCards) {
    byQuestionId.set(card.question_id, card);
  }

  for (const anonCard of anonymousCards) {
    const current = byQuestionId.get(anonCard.question_id);
    if (!current) {
      byQuestionId.set(anonCard.question_id, anonCard);
      continue;
    }

    const currentTime = current.last_review
      ? new Date(current.last_review).getTime()
      : 0;
    const anonTime = anonCard.last_review
      ? new Date(anonCard.last_review).getTime()
      : 0;

    if (anonTime > currentTime) {
      byQuestionId.set(anonCard.question_id, anonCard);
    }
  }

  return Array.from(byQuestionId.values());
}

