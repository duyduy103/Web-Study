import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace } from "@/lib/parsing/normalize";
import type { ParsedQuestion } from "@/lib/parsing/types";

const QA_QUESTION_PREFIX =
  /^(?:(?:Câu(?:\s*hỏi)?|Question|Hỏi|Q)\s*(\d{1,4})?\s*[:.)\-]\s*(.+)|(\d{1,4})\s*[.)]\s+(.+))$/i;

const QA_ANSWER_PREFIX =
  /^(?:Trả\s*lời|Đáp\s*án|ĐA|Đ\/A|Đ\.A|Answer|A|TL|Gợi\s*ý(?:\s*trả\s*lời)?)\s*[:=\-]\s*(.+)$/i;

const EXPLANATION_PREFIX =
  /^(?:Giải\s*thích|Hướng\s*dẫn|Ghi\s*chú|Explanation)\s*[:=\-]\s*(.+)$/i;

export function parseQaDocument(text: string): ParsedQuestion[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/^\[\[CORRECT\]\]\s*/i, ""))
    .filter(Boolean);

  const questions: ParsedQuestion[] = [];

  let currentStemParts: string[] = [];
  let currentAnswerParts: string[] = [];
  let currentExplanationParts: string[] = [];
  let currentNumber: number | null = null;
  let prevNumber: number | null = null;
  let currentSourceLine = 1;
  let mode: "none" | "question" | "answer" | "explanation" = "none";

  function flushCurrent() {
    if (currentStemParts.length === 0) {
      return;
    }

    const stem = normalizeInlineWhitespace(currentStemParts.join(" "));
    const answerText =
      currentAnswerParts.length > 0
        ? normalizeInlineWhitespace(currentAnswerParts.join(" "))
        : undefined;
    const explanation =
      currentExplanationParts.length > 0
        ? normalizeInlineWhitespace(currentExplanationParts.join(" "))
        : undefined;

    const warnings: string[] = [];
    if (
      prevNumber !== null &&
      currentNumber !== null &&
      currentNumber > prevNumber + 1
    ) {
      warnings.push(
        `${vi.parsing.warnings.skippedNumberPrefix} ${prevNumber} ${vi.parsing.warnings.skippedNumberMiddle} ${currentNumber}${vi.parsing.warnings.skippedNumberSuffix}`
      );
    }

    if (stem.length < 8) {
      warnings.push(vi.parsing.warnings.shortStem);
    }

    if (!answerText) {
      warnings.push(vi.parsing.warnings.missingAnswer);
    }

    const qNumDisplay = currentNumber ?? questions.length + 1;
    const sourceRef = `Câu ${qNumDisplay} (dòng ${currentSourceLine})`;

    const isCloze = /_{3,}|\.{4,}|\[\s*\.\.\.\s*\]/.test(stem);
    const isTrueFalse =
      answerText !== undefined &&
      /^(đúng|sai|true|false|đ|s)$/i.test(answerText);

    if (isTrueFalse && answerText) {
      const isTrue = /^(đúng|true|đ)$/i.test(answerText);
      questions.push({
        type: "true_false",
        stem,
        choices: [
          { text: vi.setDetails.trueValue, isCorrect: isTrue },
          { text: vi.setDetails.falseValue, isCorrect: !isTrue },
        ],
        explanation,
        confidence: warnings.length === 0 ? 0.92 : 0.45,
        warnings,
        sourceRef,
      });
    } else {
      let confidence = 0.92;
      if (!answerText) {
        confidence = 0.3;
      } else if (warnings.length > 0) {
        confidence = 0.7;
      }

      questions.push({
        type: isCloze ? "cloze" : "short_answer",
        stem,
        answerText,
        explanation,
        confidence,
        warnings,
        sourceRef,
        rawBlockText: answerText ? `${stem}\nTrả lời: ${answerText}` : stem,
      });
    }

    if (currentNumber !== null) {
      prevNumber = currentNumber;
    }
    currentStemParts = [];
    currentAnswerParts = [];
    currentExplanationParts = [];
    currentNumber = null;
    mode = "none";
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bỏ qua các dòng tiêu đề tài liệu ở đầu file nếu chưa vào câu hỏi
    if (
      mode === "none" &&
      !QA_QUESTION_PREFIX.test(line) &&
      lines.some((l) => QA_QUESTION_PREFIX.test(l))
    ) {
      continue;
    }

    const qMatch = line.match(QA_QUESTION_PREFIX);
    if (qMatch) {
      flushCurrent();
      const numStr = qMatch[1] ?? qMatch[3];
      const content = (qMatch[2] ?? qMatch[4] ?? "").trim();
      currentNumber = numStr ? Number(numStr) : questions.length + 1;
      currentSourceLine = i + 1;

      // Trường hợp câu hỏi và trả lời nằm trên cùng 1 dòng: "Câu 1: ...? Trả lời: ..."
      const inlineAnsMatch = content.match(
        /^(.*?\?)\s*(?:Trả\s*lời|Đáp\s*án|ĐA|Answer|A)\s*[:=\-]\s*(.+)$/i
      );
      if (inlineAnsMatch) {
        currentStemParts.push(inlineAnsMatch[1].trim());
        currentAnswerParts.push(inlineAnsMatch[2].trim());
        mode = "answer";
      } else {
        if (content) {
          currentStemParts.push(content);
        }
        mode = "question";
      }
      continue;
    }

    const aMatch = line.match(QA_ANSWER_PREFIX);
    if (aMatch) {
      mode = "answer";
      currentAnswerParts.push(aMatch[1].trim());
      continue;
    }

    const expMatch = line.match(EXPLANATION_PREFIX);
    if (expMatch) {
      mode = "explanation";
      currentExplanationParts.push(expMatch[1].trim());
      continue;
    }

    if (mode === "question") {
      // Nếu dòng trước kết thúc bằng dấu ? và dòng hiện tại không có tiền tố nhưng ngắn gọn,
      // kiểm tra xem tài liệu có dùng tiền tố "Trả lời:" hay không
      const docHasExplicitAnswerPrefix = lines.some((l) =>
        QA_ANSWER_PREFIX.test(l)
      );
      if (
        !docHasExplicitAnswerPrefix &&
        currentStemParts.join(" ").endsWith("?")
      ) {
        mode = "answer";
        currentAnswerParts.push(line);
      } else {
        currentStemParts.push(line);
      }
    } else if (mode === "answer") {
      currentAnswerParts.push(line);
    } else if (mode === "explanation") {
      currentExplanationParts.push(line);
    }
  }

  flushCurrent();

  // Dự phòng: Nếu văn bản hoàn toàn không có tiền tố "Câu 1 / Hỏi:", thử tách theo cặp dòng xen kẽ (Hỏi ? -> Đáp)
  if (questions.length === 0 && lines.length >= 2) {
    for (let i = 0; i < lines.length; i += 2) {
      const qLine = lines[i];
      const aLine = lines[i + 1];
      const warnings: string[] = [];
      if (!aLine) {
        warnings.push(vi.parsing.warnings.missingAnswer);
      }
      questions.push({
        type: "short_answer",
        stem: normalizeInlineWhitespace(qLine),
        answerText: aLine ? normalizeInlineWhitespace(aLine) : undefined,
        confidence: aLine ? 0.78 : 0.3,
        warnings,
        sourceRef: `Dòng ${i + 1}`,
      });
    }
  }

  return questions;
}

