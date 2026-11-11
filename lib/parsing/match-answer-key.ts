import { vi } from "@/lib/i18n/vi";
import type { ParsedQuestion } from "@/lib/parsing/types";

export interface ExtractedAnswerKey {
  questionBodyText: string;
  answerMap: Map<number, string>;
  hasKeySection: boolean;
}

const KEY_HEADER_REGEX =
  /^(?:BẢNG\s*ĐÁP\s*ÁN|ĐÁP\s*ÁN(?:\s*VÀ\s*HƯỚNG\s*DẪN)?|PHẦN\s*ĐÁP\s*ÁN|ANSWER\s*KEY|KEY|ĐÁP\s*ÁN\s*THAM\s*KHẢO)\s*:?\s*$/i;

const INLINE_KEY_PAIR_REGEX =
  /(?:Câu\s*)?(\d{1,4})\s*[-.:=]\s*([A-Da-d])(?![\p{L}\p{N}])/gu;

/**
 * Tách phần thân đề và bảng đáp án ở cuối văn bản (nếu có).
 * Hỗ trợ các dạng:
 * - "1-A 2-C 3-B" hoặc "1.A 2.C 3.B" hoặc "1: A"
 * - Bảng 2 hàng (Hàng Câu: 1 | 2 | 3 / Hàng Đáp án: A | C | B)
 */
export function extractAnswerKeyFromText(text: string): ExtractedAnswerKey {
  const lines = text.split("\n");
  let keyStartIndex = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (KEY_HEADER_REGEX.test(trimmed)) {
      keyStartIndex = i;
      break;
    }
  }

  // Nếu không có tiêu đề tường minh, kiểm tra các dòng cuối xem có phải chuỗi cặp "1-A 2-B 3-C..." không
  if (keyStartIndex === -1) {
    for (let i = Math.max(0, lines.length - 15); i < lines.length; i++) {
      const line = lines[i].trim();
      const matches = [...line.matchAll(INLINE_KEY_PAIR_REGEX)];
      if (matches.length >= 3 && line.length < matches.length * 16) {
        keyStartIndex = i;
        break;
      }
    }
  }

  if (keyStartIndex === -1) {
    return {
      questionBodyText: text,
      answerMap: new Map(),
      hasKeySection: false,
    };
  }

  const bodyLines = lines.slice(0, keyStartIndex);
  const keyLines = lines.slice(keyStartIndex);
  const answerMap = parseAnswerKeyLines(keyLines);

  if (answerMap.size === 0) {
    return {
      questionBodyText: text,
      answerMap: new Map(),
      hasKeySection: false,
    };
  }

  return {
    questionBodyText: bodyLines.join("\n").trim(),
    answerMap,
    hasKeySection: true,
  };
}

export function parseAnswerKeyLines(lines: string[]): Map<number, string> {
  const map = new Map<number, string>();

  // Thử kiểm tra dạng bảng ngang (dòng số câu + dòng chữ cái đáp án kế tiếp)
  for (let i = 0; i < lines.length - 1; i++) {
    const numTokens = lines[i]
      .split(/[\t|;,\s]+/)
      .map((t) => t.replace(/^Câu\s*/i, "").trim())
      .filter(Boolean);
    const ansTokens = lines[i + 1]
      .split(/[\t|;,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (
      numTokens.length >= 2 &&
      numTokens.length === ansTokens.length &&
      numTokens.every((t) => /^\d{1,4}$/.test(t)) &&
      ansTokens.every((t) => /^[A-Da-d]$/.test(t))
    ) {
      for (let k = 0; k < numTokens.length; k++) {
        map.set(Number(numTokens[k]), ansTokens[k].toUpperCase());
      }
    }
  }

  // Quét các cặp "1-A", "1. A", "1: A", "1 A"
  const joined = lines.join("\n");
  for (const match of joined.matchAll(INLINE_KEY_PAIR_REGEX)) {
    const qNum = Number(match[1]);
    const letter = match[2].toUpperCase();
    if (!Number.isNaN(qNum) && qNum > 0) {
      map.set(qNum, letter);
    }
  }

  return map;
}

/**
 * Ghép bảng đáp án cuối đề vào danh sách câu hỏi theo số thứ tự câu.
 * Trả về danh sách câu đã cập nhật kèm cảnh báo toàn cục nếu lệch số lượng.
 */
export function matchAnswerKey(
  questions: Array<{ questionNumber: number; question: ParsedQuestion }>,
  answerMap: Map<number, string>
): { questions: ParsedQuestion[]; globalWarnings: string[] } {
  const globalWarnings: string[] = [];

  if (answerMap.size > 0 && questions.length !== answerMap.size) {
    globalWarnings.push(
      `${vi.parsing.warnings.answerKeyCountMismatchPrefix}${questions.length}${vi.parsing.warnings.answerKeyCountMismatchMiddle}${answerMap.size}${vi.parsing.warnings.answerKeyCountMismatchSuffix}`
    );
  }

  const updatedQuestions = questions.map(({ questionNumber, question }) => {
    const keyLetter = answerMap.get(questionNumber);
    if (!keyLetter) {
      const hasAlreadyCorrect = question.choices?.some((c) => c.isCorrect);
      if (!hasAlreadyCorrect) {
        const warnings = question.warnings.includes(vi.parsing.warnings.missingAnswer)
          ? question.warnings
          : [...question.warnings, vi.parsing.warnings.missingAnswer];
        return {
          ...question,
          confidence: Math.min(question.confidence, 0.35),
          warnings,
        };
      }
      return question;
    }

    const choiceIndex = keyLetter.charCodeAt(0) - "A".charCodeAt(0);
    if (!question.choices || choiceIndex < 0 || choiceIndex >= question.choices.length) {
      const msg = `${vi.parsing.warnings.answerKeyLetterNotFoundPrefix} ${keyLetter} ${vi.parsing.warnings.answerKeyLetterNotFoundSuffix}`;
      const warnings = [
        ...question.warnings.filter((w) => w !== vi.parsing.warnings.missingAnswer),
        msg,
      ];
      return {
        ...question,
        confidence: Math.min(question.confidence, 0.35),
        warnings,
      };
    }

    const updatedChoices = question.choices.map((c, idx) => ({
      ...c,
      isCorrect: idx === choiceIndex,
    }));

    const cleanedWarnings = question.warnings.filter(
      (w) => w !== vi.parsing.warnings.missingAnswer
    );

    const recalculatedConfidence = computeMcqConfidence(
      question.stem,
      updatedChoices,
      cleanedWarnings
    );

    return {
      ...question,
      choices: updatedChoices,
      confidence: recalculatedConfidence,
      warnings: cleanedWarnings,
    };
  });

  return {
    questions: updatedQuestions,
    globalWarnings,
  };
}

export function computeMcqConfidence(
  stem: string,
  choices: Array<{ text: string; isCorrect: boolean }>,
  existingWarnings: string[]
): number {
  let score = 0.95;
  const correctCount = choices.filter((c) => c.isCorrect).length;

  if (correctCount === 0) {
    score -= 0.6;
  } else if (correctCount > 1) {
    score -= 0.5;
  }

  if (choices.length < 2) {
    score -= 0.55;
  } else if (choices.length === 2) {
    score -= 0.25;
  } else if (choices.length !== 4) {
    score -= 0.15;
  }

  if (stem.trim().length < 8) {
    score -= 0.3;
  }

  for (const w of existingWarnings) {
    if (w.startsWith(vi.parsing.warnings.skippedNumberPrefix)) {
      score -= 0.15;
    }
    if (w === vi.parsing.warnings.duplicateChoiceText) {
      score -= 0.25;
    }
  }

  return Number(Math.max(0.1, Math.min(0.98, score)).toFixed(2));
}
